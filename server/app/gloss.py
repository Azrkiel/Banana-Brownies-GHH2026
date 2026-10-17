"""ASL gloss -> English with Gemini (JSON schema output)."""
from __future__ import annotations

import os
from typing import Literal

from google import genai
from google.genai import types
from pydantic import BaseModel, Field

MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite")


class Alt(BaseModel):
    gloss: str = Field(max_length=40)
    p: float


class Sign(BaseModel):
    gloss: str = Field(max_length=40)
    p: float
    alts: list[Alt] = []


class GlossRequest(BaseModel):
    signs: list[Sign] = Field(min_length=1, max_length=20)
    tags: list[Literal["Q-YN", "Q-WH", "NEG"]] = []
    context: list[str] = Field(default=[], max_length=3)


class GlossResult(BaseModel):
    english: str
    sentence_type: Literal["statement", "yes_no_question", "wh_question"]
    confidence: float
    uncertain: list[str]


SYSTEM = """You turn the output of an American Sign Language (ASL) sign recognizer into ONE short, natural English utterance for a live video call.

Input: the recognized signs in order (uppercase ASL glosses) with the recognizer's confidence and up to 2 alternatives, optional face tags, and optional recent captions from the hearing person.

Rules:
- ASL word order differs from English. Time signs come first (TOMORROW ME GO STORE = "I'm going to the store tomorrow."). Topic-comment order is common. ASL leaves out is/am/are and articles; add them.
- ME = I/me. YOU = you. THANKYOU = thank you. A token like fs-KEV is a fingerspelled name: write it in Title Case ("Kev").
- A WH-sign (WHAT, WHERE, WHO, WHY, HOW) at the end makes a question: YOU NAME WHAT = "What's your name?"
- Tag Q-YN = raised eyebrows = yes/no question. Tag Q-WH = WH-question. Tag NEG = headshake = negate the main verb.
- If a low-confidence sign has an alternative that fits the sentence much better, you may use the alternative. Put every English word you are unsure about in "uncertain".
- Never add facts, names, places, feelings, or intensity that the signs do not contain. Prefer a short sentence over a guess.
- A single greeting stays short: HELLO = "Hello!", THANKYOU = "Thank you!", BYE = "Bye!"
- confidence = your 0-1 estimate that the English says what the signer meant. Use below 0.6 when the signs do not form a sensible sentence.

Examples:
HELLO ME NAME fs-KEV -> {"english":"Hello! My name is Kev.","sentence_type":"statement","confidence":0.95,"uncertain":[]}
YOU NAME WHAT -> {"english":"What's your name?","sentence_type":"wh_question","confidence":0.95,"uncertain":[]}
ME HUNGRY -> {"english":"I'm hungry.","sentence_type":"statement","confidence":0.95,"uncertain":[]}
YOU HUNGRY [Q-YN] -> {"english":"Are you hungry?","sentence_type":"yes_no_question","confidence":0.9,"uncertain":[]}
ME HUNGRY [NEG] -> {"english":"I'm not hungry.","sentence_type":"statement","confidence":0.9,"uncertain":[]}
PIZZA WHERE -> {"english":"Where can we get pizza?","sentence_type":"wh_question","confidence":0.85,"uncertain":["can we get"]}
GO NOW -> {"english":"Let's go now!","sentence_type":"statement","confidence":0.85,"uncertain":[]}
TOMORROW ME GO STORE -> {"english":"I'm going to the store tomorrow.","sentence_type":"statement","confidence":0.9,"uncertain":[]}
WATER STORE BYE -> {"english":"Water, store, bye?","sentence_type":"statement","confidence":0.3,"uncertain":["water","store"]}"""

_client: genai.Client | None = None


def client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    return _client


def render(r: GlossRequest) -> str:
    lines = ["SIGNS:"]
    for i, s in enumerate(r.signs, 1):
        alts = ", ".join(f"{a.gloss} ({a.p:.2f})" for a in s.alts[:2])
        lines.append(f"{i}. {s.gloss} ({s.p:.2f})" + (f" alts: {alts}" if alts else ""))
    lines.append("FACE TAGS: " + (" ".join(r.tags) if r.tags else "none"))
    if r.context:
        lines.append("RECENT HEARING-SIDE CAPTIONS: " + " | ".join(r.context))
    return "\n".join(lines)


async def translate(r: GlossRequest) -> GlossResult:
    resp = await client().aio.models.generate_content(
        model=MODEL,
        contents=render(r),
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM,
            response_mime_type="application/json",
            response_schema=GlossResult,
            temperature=0.2,
            max_output_tokens=150,
        ),
    )
    return GlossResult.model_validate_json(resp.text)
