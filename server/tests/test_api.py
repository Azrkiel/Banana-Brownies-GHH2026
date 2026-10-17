import asyncio

import jwt
from fastapi.testclient import TestClient

from app import gloss, main

client = TestClient(main.app)
SECRET = "devsecret-devsecret-devsecret-1234"


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["ok"] is True


def test_token_has_room_grant(monkeypatch):
    monkeypatch.setenv("LIVEKIT_API_KEY", "devkey")
    monkeypatch.setenv("LIVEKIT_API_SECRET", SECRET)
    monkeypatch.setenv("LIVEKIT_URL", "wss://example.livekit.cloud")
    r = client.post("/api/token", json={"room": "demo-room", "name": "Liv", "role": "signer"})
    assert r.status_code == 200
    claims = jwt.decode(r.json()["token"], SECRET, algorithms=["HS256"])
    assert claims["video"]["room"] == "demo-room"
    assert claims["video"]["roomJoin"] is True


def test_token_rejects_bad_room():
    r = client.post("/api/token", json={"room": "Demo Room!", "name": "Liv", "role": "signer"})
    assert r.status_code == 422


def test_gloss_failure_returns_502(monkeypatch):
    async def boom(_req):
        raise asyncio.TimeoutError()

    monkeypatch.setattr(gloss, "translate", boom)
    r = client.post("/api/gloss", json={"signs": [{"gloss": "HELLO", "p": 0.9}]})
    assert r.status_code == 502


def test_tts_rejects_bad_voice_id():
    r = client.post("/api/tts", json={"text": "Hello", "voice_id": "../../etc"})
    assert r.status_code == 422


def test_events_without_db_is_204(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    r = client.post("/api/events", json={"signs": [], "utterances": []})
    assert r.status_code == 204
