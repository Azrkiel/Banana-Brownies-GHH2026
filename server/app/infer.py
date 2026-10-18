"""Opt-in, bounded landmark-only CPU inference. No tensor runtime loads at startup."""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool

router = APIRouter()
_gate = asyncio.Semaphore(1)
_session = None
_metadata = None
WINDOW_BYTES = 32 * 174 * 2


def load_session():
    global _session, _metadata
    if _session is not None:
        return _session, _metadata
    directory = Path(os.environ.get("INFER_MODEL_DIR", str(Path(os.environ.get("WEB_DIR", "web/public")) / "models")))
    try:
        metadata = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
        name = metadata["c1_model_url"]
        if (metadata["version"] != 2 or metadata["schema"] != "holistic_v2_32x174"
                or metadata.get("deployable") is not True or metadata["idle_index"] != 0
                or metadata["embedding_dim"] != 192 or metadata["labels"][0] != "_idle"
                or not isinstance(name, str) or Path(name).name != name or not name.endswith(".onnx")):
            raise ValueError("Unverified model manifest")
        path = directory / name
        if path.stat().st_size != metadata["c1_size_bytes"] or path.stat().st_size > 4_000_000:
            raise ValueError("Model size mismatch")
        if hashlib.sha256(path.read_bytes()).hexdigest() != metadata["c1_sha256"]:
            raise ValueError("Model integrity failure")
        import onnxruntime as ort
        options = ort.SessionOptions()
        options.intra_op_num_threads = 1
        options.inter_op_num_threads = 1
        options.enable_cpu_mem_arena = False
        options.enable_mem_pattern = False
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_BASIC
        session = ort.InferenceSession(str(path), sess_options=options, providers=["CPUExecutionProvider"])
        if [item.name for item in session.get_inputs()] != ["features"]:
            raise ValueError("Unexpected model inputs")
        _session, _metadata = session, metadata
        return session, metadata
    except Exception as error:
        raise HTTPException(503, "Verified landmark model is not installed") from error


def infer_window(body: bytes, expected_hash: str):
    import numpy as np
    features = np.frombuffer(body, dtype="<f2").astype(np.float32).reshape(1, 32, 174)
    if not np.isfinite(features).all() or np.abs(features).max() > 20:
        raise HTTPException(422, "Expected finite XY174 landmarks within the supported range")
    if not np.isin(features[:, :, 172:], (0, 1)).all():
        raise HTTPException(422, "Hand presence flags must be binary")
    session, metadata = load_session()
    if expected_hash != metadata["c1_sha256"]:
        raise HTTPException(409, "Browser and server model versions differ")
    started = time.perf_counter()
    try:
        logits, embedding, activity = session.run(["logits", "embedding", "handActivityProb"], {"features": features})
        temperature = 1.0 if metadata.get("temperature_baked") else metadata["temperature"]
        scores = logits[0] / temperature
        probabilities = np.exp(scores - scores.max())
        probabilities /= probabilities.sum()
        if embedding.shape != (1, 192) or not np.isfinite(embedding).all() or not np.isfinite(probabilities).all():
            raise ValueError("Invalid model outputs")
        top = np.argsort(-probabilities)[:3]
        return {"topK": [{"gloss": metadata["labels"][int(i)], "prob": float(probabilities[i])} for i in top],
                "embedding": embedding[0].tolist(), "handActivityProb": float(activity.reshape(-1)[0]),
                "latencyMs": (time.perf_counter() - started) * 1000}
    except Exception as error:
        raise HTTPException(503, "Landmark inference failed") from error


@router.post("/api/infer")
async def infer_route(request: Request):
    if os.environ.get("INFER_ENABLED") != "1":
        raise HTTPException(503, "Optional landmark inference is disabled")
    if request.headers.get("x-landmark-consent") != "true":
        raise HTTPException(403, "Explicit landmark-sharing consent is required")
    if request.headers.get("content-type", "").split(";")[0].strip() != "application/octet-stream":
        raise HTTPException(415, "Send only a little-endian float16 landmark window")
    declared = request.headers.get("content-length")
    if declared is not None and declared != str(WINDOW_BYTES):
        raise HTTPException(413, "Expected exactly 11136 landmark bytes")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > WINDOW_BYTES:
            raise HTTPException(413, "Landmark window is too large")
    if len(body) != WINDOW_BYTES:
        raise HTTPException(422, "Expected exactly 32 by 174 float16 landmarks")
    try:
        await asyncio.wait_for(_gate.acquire(), timeout=.05)
    except asyncio.TimeoutError:
        raise HTTPException(503, "Landmark inference is busy")
    try:
        return await run_in_threadpool(infer_window, bytes(body), request.headers.get("x-model-sha256", ""))
    finally:
        _gate.release()
