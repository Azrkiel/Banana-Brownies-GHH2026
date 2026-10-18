"""Signer-held-out isolated/CTC metrics and confusion reports (no browser changes)."""
import argparse
import json
import math
from collections import defaultdict
from pathlib import Path
import numpy as np
import torch
from torch.utils.data import DataLoader
from .calibrate import expected_calibration_error
from .dataset_v2 import CHARACTERS, LandmarkDataset, collate, load_records
from .models import build_model


def edit_distance(a, b):
    previous = list(range(len(b)+1))
    for i, left in enumerate(a, 1):
        current = [i]
        for j, right in enumerate(b, 1):
            current.append(min(previous[j]+1, current[-1]+1, previous[j-1]+(left != right)))
        previous = current
    return previous[-1]


def greedy_ctc(logits, length=None):
    ids = logits[:length].argmax(-1).tolist()
    return [c for i,c in enumerate(ids) if c != 0 and (i == 0 or ids[i-1] != c)]


def _logadd(*values):
    m = max(values)
    return m if m == -math.inf else m + math.log(sum(math.exp(v-m) for v in values))


def prefix_beam_search(logits, beam_width=10):
    beam = {(): (0., -math.inf)}
    for frame in logits.log_softmax(-1).tolist():
        next_beam = defaultdict(lambda: (-math.inf, -math.inf))
        for prefix, (blank, nonblank) in beam.items():
            old_blank, old_nonblank = next_beam[prefix]
            next_beam[prefix] = (_logadd(old_blank, blank+frame[0], nonblank+frame[0]), old_nonblank)
            for char in range(1, len(frame)):
                if prefix and char == prefix[-1]:
                    pb,pn = next_beam[prefix]
                    next_beam[prefix] = (pb, _logadd(pn, nonblank+frame[char]))
                    score = blank+frame[char]
                else:
                    score = _logadd(blank, nonblank)+frame[char]
                extended = prefix+(char,)
                pb,pn = next_beam[extended]
                next_beam[extended] = (pb, _logadd(pn, score))
        beam = dict(sorted(next_beam.items(), key=lambda item:_logadd(*item[1]), reverse=True)[:beam_width])
    return list(max(beam, key=lambda prefix:_logadd(*beam[prefix])))


def isolated_metrics(logits, targets):
    predicted = logits.argmax(-1)
    classes = logits.shape[-1]
    matrix = torch.bincount(targets*classes+predicted, minlength=classes*classes).reshape(classes, classes).float()
    support, guesses = matrix.sum(1), matrix.sum(0)
    recall = matrix.diag()/support.clamp_min(1)
    f1 = 2*matrix.diag()/(support+guesses).clamp_min(1)
    active = support > 0
    idle = targets == 0
    return dict(n=len(targets), top1=float(predicted.eq(targets).float().mean()),
        top5=float(logits.topk(min(5,classes),-1).indices.eq(targets[:,None]).any(-1).float().mean()),
        macro_top1=float(recall[active].mean()), macro_f1=float(f1[active].mean()),
        ece=expected_calibration_error(logits,targets),
        idle_false_positive_rate=float(predicted[idle].ne(0).float().mean()) if idle.any() else None,
        idle_n=int(idle.sum())), matrix


def sequence_metrics(logits, references, lengths, beam_width=10):
    result = {'n':len(references)}
    isolated = [(i,ref[0]) for i,ref in enumerate(references) if len(ref)==1]
    for name, decode in [('greedy', lambda z:greedy_ctc(z)), ('beam', lambda z:prefix_beam_search(z,beam_width))]:
        predictions = [decode(z[:int(n)]) for z,n in zip(logits,lengths)]
        chars = sum(len(r) for r in references)
        char_errors = sum(edit_distance(r,p) for r,p in zip(references,predictions))
        words = word_errors = 0
        for reference, prediction in zip(references,predictions):
            r = ''.join(CHARACTERS[c] for c in reference).split()
            p = ''.join(CHARACTERS[c] for c in prediction).split()
            words += len(r); word_errors += edit_distance(r,p)
        result[name+'_cer'] = char_errors/max(chars,1)
        result[name+'_wer'] = word_errors/max(words,1)
        result[name+'_isolated_character_top1'] = (sum(predictions[i]==[target] for i,target in isolated)/len(isolated) if isolated else None)
        result[name+'_dynamic_jz_top1'] = {c: (sum(predictions[i]==[target] for i,target in isolated if CHARACTERS[target]==c)/sum(CHARACTERS[target]==c for _,target in isolated)
            if any(CHARACTERS[target]==c for _,target in isolated) else None) for c in ('J','Z')}
    result['isolated_character_n'] = len(isolated)
    return result


@torch.no_grad()
def collect_outputs(model, dataset, batch_size=128, device='cpu'):
    model.eval()
    logits, targets, lengths, target_lengths, inputs = [], [], [], [], []
    for x,n,y,ny in DataLoader(dataset, batch_size=batch_size, shuffle=False, collate_fn=collate):
        logits.extend(model(x.to(device),n.to(device))['logits'].cpu().unbind(0))
        inputs.extend(x.unbind(0)); targets.append(y); lengths.append(n)
        if ny is not None:
            target_lengths.append(ny)
    if dataset.stage == 'b_fingerspelling':
        z = torch.nn.utils.rnn.pad_sequence(logits,batch_first=True)
    else:
        z = torch.stack(logits)
    return z, torch.cat(targets), torch.cat(lengths), torch.cat(target_lengths) if target_lengths else None, inputs


def evaluate(model, dataset, out_dir=None, batch_size=128, device='cpu'):
    logits,y,lengths,ny,inputs = collect_outputs(model,dataset,batch_size,device)
    if dataset.stage == 'b_fingerspelling':
        report = sequence_metrics(logits,dataset.targets,lengths)
        pairs = []
    else:
        report,matrix = isolated_metrics(logits,y)
        groups = {'hand_count':[], 'dataset_source':[], 'recording_domain':[]}
        for x,row in zip(inputs,dataset.rows):
            groups['hand_count'].append('two_hand' if ((x[:,172]>0)&(x[:,173]>0)).float().mean() > .3 else 'one_or_no_hand')
            groups['dataset_source'].append(row['dataset_id'])
            groups['recording_domain'].append(row.get('domain') or ('webcam' if row['dataset_id']=='own' else 'unspecified'))
        report['strata'] = {}
        for group, values in groups.items():
            report['strata'][group] = {}
            for value in sorted(set(values)):
                indices = torch.tensor([i for i,v in enumerate(values) if v==value])
                report['strata'][group][value] = isolated_metrics(logits[indices],y[indices])[0]
        pairs = sorted([dict(actual=dataset.labels[i],predicted=dataset.labels[j],count=int(matrix[i,j]))
                        for i,j in matrix.nonzero().tolist() if i != j], key=lambda p:(-p['count'],p['actual'],p['predicted']))[:50]
        report['confusion_pairs'] = pairs
    if out_dir:
        out = Path(out_dir); out.mkdir(parents=True,exist_ok=True)
        (out/'confusion_report.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n',encoding='utf-8')
        lines = ['# Top confusion pairs', '', '| Actual | Predicted | Count |', '| --- | --- | --- |']
        lines += [f"| {p['actual']} | {p['predicted']} | {p['count']} |" for p in pairs]
        (out/'confusion_top50_pairs.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    return report


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--checkpoint',type=Path,required=True)
    p.add_argument('--manifest',type=Path,required=True)
    p.add_argument('--shards',type=Path)
    p.add_argument('--split',choices=['val','test'],default='test')
    p.add_argument('--license-tier',choices=['commercial','research'],default='commercial')
    p.add_argument('--out-dir',type=Path)
    a=p.parse_args()
    ckpt=torch.load(a.checkpoint,map_location='cpu',weights_only=True)
    cfg=ckpt['config']
    if cfg['license_tier']=='research' and a.license_tier!='research':
        p.error('Research weights require explicit --license-tier research')
    rows,tier,_=load_records(a.manifest,cfg['stage'],a.license_tier,'all' if a.license_tier=='research' else 'commercial_safe',a.shards)
    if tier != cfg['license_tier']:
        p.error('Evaluation tier must match checkpoint provenance')
    dataset=LandmarkDataset(rows,a.split,cfg['stage'],labels=ckpt['labels'])
    model=build_model(cfg['arch'],cfg['stage'],cfg['num_classes'],**cfg['model_kwargs'])
    model.load_state_dict(ckpt['model'])
    print(json.dumps(evaluate(model,dataset,a.out_dir or a.checkpoint.parent),indent=2))


if __name__=='__main__':
    main()
