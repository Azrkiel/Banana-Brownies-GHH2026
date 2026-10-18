"""Single-file commercial browser bundles; smoke artifacts never become deployable."""
import argparse
import hashlib
import json
import tempfile
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch
from torch.nn import functional as F
from .models import build_model


class BrowserModel(torch.nn.Module):
    """Expose the trained attentive representation without changing checkpoint keys."""
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, features):
        model = self.model
        mask = torch.ones(features.shape[:2], dtype=torch.bool, device=features.device) if model.ctc else features.abs().sum(-1) > 0
        z = model.stem(features * mask.unsqueeze(-1), mask)
        for block in model.blocks:
            z = block(z, mask)
        result = model.head(z, mask)
        if model.ctc:
            pooled = (z * mask.unsqueeze(-1)).sum(1) / mask.sum(1, keepdim=True).clamp_min(1)
            activity = mask.float().mean(1)
            # Stage B Mini may be 128-wide; only C1 embeddings calibrate personal signs.
            pooled = F.pad(pooled, (0, 192 - pooled.shape[-1]))
        else:
            weights = model.head.attention(z).squeeze(-1).masked_fill(~mask, -1e4).softmax(-1) * mask
            weights = weights / weights.sum(-1, keepdim=True).clamp_min(1e-8)
            pooled = (z * weights.unsqueeze(-1)).sum(1)
            pooled = torch.where(mask.any(1, keepdim=True), pooled, model.head.empty_embedding[None])
            activity = result['hand_activity_logit'].sigmoid()
        return result['logits'], F.normalize(pooled, dim=-1), activity


def inline_model(source, target):
    model = onnx.shape_inference.infer_shapes(onnx.load(source, load_external_data=True))
    onnx.external_data_helper.convert_model_from_external_data(model)
    onnx.save_model(model, target, save_as_external_data=False)
    onnx.checker.check_model(onnx.load(target))
    return model


def export_one(checkpoint, target, stage, quantize='uint8', smoke_test=False):
    ckpt = torch.load(checkpoint, map_location='cpu', weights_only=True)
    cfg = ckpt['config']
    if cfg['license_tier'] != 'commercial' or cfg['stage'] != stage:
        raise ValueError('Only matching commercial Stage C1/B checkpoints are permitted')
    if cfg['arch'] != 'conformer' or not ckpt.get('calibrated'):
        raise ValueError('Browser export requires a calibrated Conformer checkpoint')
    # Existing training configs identify smoke data by its ignored synthetic directory.
    synthetic = 'synthetic' in Path(cfg['manifest']).parts
    if synthetic and not smoke_test:
        raise ValueError('Synthetic checkpoint requires --smoke-test; never ship smoke weights')
    model = build_model(cfg['arch'], stage, cfg['num_classes'], **cfg['model_kwargs'])
    model.load_state_dict(ckpt['model'])
    wrapper = BrowserModel(model.cpu().eval()).eval()
    ctc = stage == 'b_fingerspelling'
    width = model.stem.proj.out_features
    if (not ctc and width != 192) or (ctc and width > 192):
        raise ValueError('C1 requires width192; Stage B Mini supports width up to192')
    dim, time = (90, 96) if ctc else (174, 32)
    rng = np.random.default_rng(42)
    sample = torch.from_numpy(rng.normal(0, .25, (1, time, dim)).astype('float32'))
    if not ctc:
        sample[:, :, 172:] = 1
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        raw, quantized = Path(tmp)/'raw.onnx', Path(tmp)/'quantized.onnx'
        torch.onnx.export(wrapper, (sample,), str(raw), opset_version=17, dynamo=False,
                          do_constant_folding=True, external_data=False,
                          input_names=['features'], output_names=['logits', 'embedding', 'handActivityProb'],
                          dynamic_axes={'features': {1: 'time'}, 'logits': {1: 'time'}} if ctc else None)
        if quantize == 'uint8':
            from onnxruntime.quantization import quantize_dynamic, QuantType
            quantize_dynamic(str(raw), str(quantized), weight_type=QuantType.QUInt8,
                             op_types_to_quantize=['MatMul', 'Gemm', 'Conv'])
        else:
            # Weight-only FP16 keeps computation/masks in float32 on WASM/CPU.
            converted = onnx.load(raw)
            casts = []
            for value in list(converted.graph.initializer):
                if value.data_type != onnx.TensorProto.FLOAT:
                    continue
                array = onnx.numpy_helper.to_array(value)
                # Real CTC heads can amplify FP16 rounding beyond probability
                # parity. Keep output weights, biases and normalization vectors
                # in FP32; the large encoder matrices still use FP16 storage.
                ctc_sensitive = ctc and (array.ndim < 2 or array.shape in {
                    (width, cfg['num_classes']), (cfg['num_classes'], width)})
                if array.size < 32 or ctc_sensitive:
                    continue
                original = value.name
                half = onnx.numpy_helper.from_array(array.astype(np.float16), original + '_fp16')
                converted.graph.initializer.remove(value)
                converted.graph.initializer.append(half)
                casts.append(onnx.helper.make_node('Cast', [half.name], [original], to=onnx.TensorProto.FLOAT))
            nodes = list(converted.graph.node)
            del converted.graph.node[:]
            converted.graph.node.extend(casts + nodes)
            onnx.save_model(converted, quantized, save_as_external_data=False)
        inline_model(quantized, target)
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    session = ort.InferenceSession(str(target), sess_options=options, providers=['CPUExecutionProvider'])
    max_error = 0.
    for index in range(100):
        n = (64, 96, 128)[index % 3] if ctc else 32
        x = rng.normal(0, .25, (1, n, dim)).astype('float32')
        if not ctc:
            x[:, :, 172:] = 1
        if index % 10 == 0:
            x[:, n//2:] = 0  # missing observations and full idle are part of parity
        if index == 0:
            x[:] = 0
        with torch.no_grad():
            tensor = torch.from_numpy(x)
            original = model(tensor, torch.full((1,), n, dtype=torch.long))['logits']
            np.testing.assert_allclose(wrapper(tensor)[0].numpy(), original.numpy(), atol=1e-6, rtol=1e-6)
            expected = original.softmax(-1).numpy()
        actual, embedding, activity = session.run(None, {'features': x})
        actual = np.exp(actual - actual.max(-1, keepdims=True))
        actual /= actual.sum(-1, keepdims=True)
        max_error = max(max_error, float(np.abs(actual - expected).max()))
        if not np.isfinite(embedding).all() or not np.isfinite(activity).all():
            raise ValueError('Nonfinite browser output')
    if max_error >= 1e-3:
        target.unlink()
        raise ValueError(f'Probability divergence {max_error} >= 1e-3; retry --quantize fp16')
    budget = 5_000_000 if smoke_test else (2_000_000 if ctc else 4_000_000)
    size = target.stat().st_size
    if size > budget:
        target.unlink()
        raise ValueError(f'Size {size} exceeds {budget}; smaller trained architecture required')
    return dict(url=target.name, sha256=hashlib.sha256(target.read_bytes()).hexdigest(),
                size_bytes=size, labels=ckpt['labels'], schema='aslfr90' if ctc else 'holistic_v2_32x174',
                probability_max_error=max_error, parity_clips=100, synthetic=synthetic)


def _export_bundle(c1, b, out_dir, quantize='uint8', smoke_test=False):
    out = Path(out_dir)
    if smoke_test and 'public' in out.resolve().parts:
        raise ValueError('Smoke exports must stay outside public/')
    torch.set_num_threads(2)
    c = export_one(c1, out/'sign_c1_250.onnx', 'c1_commercial_250', quantize, smoke_test)
    spelling = export_one(b, out/'sign_b_fingerspell.onnx', 'b_fingerspelling', quantize, smoke_test)
    if c['labels'][0] != '_idle':
        raise ValueError('C1 index zero must be _idle')
    manifest = dict(version=2, schema='holistic_v2_32x174', deployable=not (smoke_test or c['synthetic'] or spelling['synthetic']),
                    c1_model_url=c['url'], c1_sha256=c['sha256'], c1_size_bytes=c['size_bytes'],
                    b_model_url=spelling['url'], b_sha256=spelling['sha256'], b_size_bytes=spelling['size_bytes'],
                    temperature=1., temperature_baked=True, labels=c['labels'], b_labels=spelling['labels'],
                    b_schema='aslfr90', idle_index=0, embedding_dim=192, quantization=quantize,
                    verification={'c1': c, 'b': spelling})
    (out/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
    return manifest


def export_bundle(c1, b, out_dir, quantize='uint8', smoke_test=False):
    import shutil
    out = Path(out_dir)
    if smoke_test and 'public' in (part.lower() for part in out.resolve().parts):
        raise ValueError('Smoke exports must stay outside public/')
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=out.parent) as temporary:
        manifest = _export_bundle(c1, b, Path(temporary), quantize, smoke_test)
        out.mkdir(parents=True, exist_ok=True)
        for filename in ('sign_c1_250.onnx', 'sign_b_fingerspell.onnx', 'manifest.json'):
            shutil.copyfile(Path(temporary)/filename, out/filename)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--c1-checkpoint', type=Path, required=True)
    parser.add_argument('--b-checkpoint', type=Path, required=True)
    parser.add_argument('--out-dir', type=Path, default=Path('web/public/models'))
    parser.add_argument('--quantize', choices=['uint8', 'fp16'], default='uint8')
    parser.add_argument('--smoke-test', action='store_true')
    parser.add_argument('--license-tier', choices=['commercial'], default='commercial')
    args = parser.parse_args()
    print(json.dumps(export_bundle(args.c1_checkpoint, args.b_checkpoint, args.out_dir, args.quantize, args.smoke_test), indent=2))


if __name__ == '__main__':
    main()
