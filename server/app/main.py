"""SignLine API. Every vendor key stays here; the browser only calls /api/*."""
from __future__ import annotations

import asyncio
import json
import os
import uuid
from datetime import datetime
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from google.genai import errors as genai_errors
from livekit import api as lk
from pydantic import BaseModel, Field, ValidationError

load_dotenv()

from . import db, gloss  # noqa: E402  (imported after .env is loaded)
from .gloss import GlossRequest, GlossCandidate, GlossTokenSlot  # noqa: E402,F401

from .infer import router as infer_router

app = FastAPI(title="SignLine API")
app.include_router(infer_router)
# A static frontend on another origin (e.g. GitHub Pages) needs CORS; local dev uses the Vite proxy.
if origins := [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]:
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"],
                       allow_headers=["Content-Type", "X-Landmark-Consent", "X-Model-SHA256"])
ELEVEN = "https://api.elevenlabs.io"


def env(name: str) -> str:
    value = os.environ.get(name, "")
    if not value:
        raise HTTPException(503, f"{name} is not configured on the server")
    return value


@app.get("/api/health")
def health():
    keys = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "GEMINI_API_KEY", "ELEVENLABS_API_KEY", "DATABASE_URL"]
    return {"ok": True, "configured": {k: bool(os.environ.get(k)) for k in keys}}


class TokenReq(BaseModel):
    room: str = Field(pattern=r"^[a-z0-9-]{3,32}$")
    name: str = Field(min_length=1, max_length=40)
    role: Literal["signer", "hearing"]


@app.post("/api/token")
def token(r: TokenReq):
    identity = f"{r.role}-{uuid.uuid4().hex[:8]}"  # opaque identity, display name separate
    grants = lk.VideoGrants(room_join=True, room=r.room, can_publish=True,
                            can_subscribe=True, can_publish_data=True)
    jwt_token = (lk.AccessToken(env("LIVEKIT_API_KEY"), env("LIVEKIT_API_SECRET"))
                 .with_identity(identity).with_name(r.name)
                 .with_metadata(json.dumps({"role": r.role}))
                 .with_grants(grants).to_jwt())
    return {"token": jwt_token, "url": env("LIVEKIT_URL"), "identity": identity}


@app.post("/api/gloss", response_model=gloss.GlossResult)
async def gloss_route(r: GlossRequest):
    try:
        return await asyncio.wait_for(gloss.translate(r), timeout=2.5)
    except asyncio.TimeoutError:
        raise HTTPException(502, "gloss timeout")
    except genai_errors.APIError as e:  # 429 quota, 5xx, bad model name
        raise HTTPException(502, f"gemini error {getattr(e, 'code', '?')}")
    except (ValidationError, ValueError):  # model returned text that is not our schema
        raise HTTPException(502, "gemini returned invalid JSON")


class TtsReq(BaseModel):
    text: str = Field(min_length=1, max_length=400)
    voice_id: str = Field(pattern=r"^[A-Za-z0-9]{8,40}$")


@app.post("/api/tts")
async def tts(r: TtsReq):
    client = httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=3.0))
    req = client.build_request(
        "POST", f"{ELEVEN}/v1/text-to-speech/{r.voice_id}/stream",
        params={"output_format": "mp3_44100_128"},
        headers={"xi-api-key": env("ELEVENLABS_API_KEY")},
        json={"text": r.text, "model_id": os.environ.get("ELEVEN_MODEL", "eleven_flash_v2_5")},
    )
    upstream = await client.send(req, stream=True)
    if upstream.status_code != 200:
        detail = (await upstream.aread()).decode(errors="ignore")[:200]
        await upstream.aclose()
        await client.aclose()
        status = 429 if upstream.status_code == 429 else 502
        raise HTTPException(status, f"elevenlabs {upstream.status_code}: {detail}")

    async def body():
        try:
            async for chunk in upstream.aiter_bytes():
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    return StreamingResponse(body(), media_type="audio/mpeg")


_voices: list[dict] | None = None


@app.get("/api/voices")
async def voices():
    global _voices
    if _voices is None:
        async with httpx.AsyncClient(timeout=5) as c:
            res = await c.get(f"{ELEVEN}/v1/voices", headers={"xi-api-key": env("ELEVENLABS_API_KEY")})
        if res.status_code != 200:
            raise HTTPException(502, f"elevenlabs voices {res.status_code}")
        all_voices = res.json().get("voices", [])
        premade = [v for v in all_voices if v.get("category") == "premade"] or all_voices
        _voices = [{"id": v["voice_id"], "name": v["name"], "labels": v.get("labels") or {}}
                   for v in premade[:8]]
    return _voices


@app.post("/api/scribe-token")
async def scribe_token():
    async with httpx.AsyncClient(timeout=5) as c:
        res = await c.post(f"{ELEVEN}/v1/single-use-token/realtime_scribe",
                           headers={"xi-api-key": env("ELEVENLABS_API_KEY")})
    if res.status_code != 200:
        raise HTTPException(502, f"scribe token {res.status_code}")
    return {"token": res.json()["token"]}


class SignEvent(BaseModel):
    ts: datetime
    session_id: str
    gloss: str
    confidence: float
    accepted: bool
    alt1: str | None = None
    alt1_p: float | None = None
    classify_ms: float
    model_version: str


class UtteranceEvent(BaseModel):
    ts: datetime
    session_id: str
    n_signs: int
    gloss_seq: str
    english: str
    sentence_type: str
    source: Literal["gemini", "rules"]
    edited: bool
    gloss_ms: float
    tts_ttfb_ms: float | None = None
    end_to_end_ms: float | None = None


class Events(BaseModel):
    signs: list[SignEvent] = []
    utterances: list[UtteranceEvent] = []


@app.post("/api/events", status_code=204)
async def events(e: Events):
    await db.insert_events(e.signs, e.utterances)
    return Response(status_code=204)


@app.get("/api/stats")
async def stats():
    return await db.stats()


# The Fly image serves the built web app from the same origin. Mounted last so /api/* routes win.
if (web_dir := os.environ.get("WEB_DIR")) and os.path.isdir(web_dir):
    class SPAFiles(StaticFiles):
        """Unknown non-API page paths (e.g. /welcome) load the app; /api/* and missing files keep their JSON 404."""

        async def get_response(self, path, scope):
            try:
                return await super().get_response(path, scope)
            except StarletteHTTPException as exc:
                last = path.rsplit("/", 1)[-1]
                if exc.status_code != 404 or path.startswith("api") or "." in last:
                    raise
                return await super().get_response("index.html", scope)

    app.mount("/", SPAFiles(directory=web_dir, html=True), name="web")
