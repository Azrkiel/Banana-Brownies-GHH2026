"""Landmark-only endpoint contracts; no model/runtime is needed at API startup."""
import sys
from types import SimpleNamespace
import numpy as np
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app import infer

client = TestClient(app)
HASH = "a" * 64
HEADERS = {"content-type": "application/octet-stream", "x-landmark-consent": "true", "x-model-sha256": HASH}


@pytest.fixture
def enabled(monkeypatch):
    monkeypatch.setenv("INFER_ENABLED", "1")
    monkeypatch.setattr(infer, "_session", None)
    monkeypatch.setattr(infer, "_metadata", None)


def payload(value=0.1):
    x = np.full((32,174), value, dtype="<f2")
    x[:,172:] = 1
    return x.tobytes()


def test_disabled_and_explicit_consent(monkeypatch):
    monkeypatch.delenv("INFER_ENABLED", raising=False)
    assert client.post("/api/infer", content=payload(), headers=HEADERS).status_code == 503
    monkeypatch.setenv("INFER_ENABLED", "1")
    assert client.post("/api/infer", content=payload(), headers={"content-type":"application/octet-stream"}).status_code == 403


@pytest.mark.parametrize("body,headers,status", [
    (b"pixels", {"content-type":"image/jpeg","x-landmark-consent":"true"},415),
    (b"{}", {"content-type":"application/json","x-landmark-consent":"true"},415),
    (b"x" * (infer.WINDOW_BYTES+1),HEADERS,413),
    (b"x" * 10,HEADERS,413),
])
def test_rejects_wrong_payloads_before_loading(enabled, monkeypatch, body, headers, status):
    monkeypatch.setattr(infer,"load_session",lambda: pytest.fail("must not load a model"))
    assert client.post("/api/infer",content=body,headers=headers).status_code == status


@pytest.mark.parametrize("value", [float("nan"),float("inf"),21.])
def test_rejects_nonfinite_and_unbounded_landmarks(enabled, monkeypatch, value):
    monkeypatch.setattr(infer,"load_session",lambda: pytest.fail("must not load a model"))
    assert client.post("/api/infer", content=payload(value),headers=HEADERS).status_code == 422


def test_lazy_cpu_predictions_and_model_identity(enabled, monkeypatch):
    calls = []
    def run(names, inputs):
        calls.append(inputs["features"])
        return np.array([[0.,2.,1.]],np.float32), np.ones((1,192),np.float32)/np.sqrt(192), np.array([.9],np.float32)
    monkeypatch.setattr(infer,"load_session",lambda: (SimpleNamespace(run=run), {"c1_sha256":HASH,"labels":["_idle","HELLO","BOOK"],"temperature_baked":True}))
    response = client.post("/api/infer",content=payload(),headers=HEADERS)
    assert response.status_code == 200
    assert response.json()["topK"][0]["gloss"] == "HELLO"
    assert len(response.json()["embedding"]) == 192
    assert calls[0].shape == (1,32,174) and calls[0].dtype == np.float32
    assert client.post("/api/infer",content=payload(),headers={**HEADERS,"x-model-sha256":"different"}).status_code == 409
    assert len(calls) == 1


def test_missing_or_smoke_model_never_served(enabled, tmp_path, monkeypatch):
    monkeypatch.setenv("INFER_MODEL_DIR",str(tmp_path))
    assert client.post("/api/infer",content=payload(),headers=HEADERS).status_code == 503
    (tmp_path/"manifest.json").write_text('{"version":2,"deployable":false,"c1_model_url":"x.onnx","schema":"holistic_v2_32x174"}')
    assert client.post("/api/infer",content=payload(),headers=HEADERS).status_code == 503
