"""ASL gloss -> English with Gemini (JSON schema output)."""
from __future__ import annotations

import os
import asyncio
import math
from typing import Literal

from google import genai
from google.genai import types
from pydantic import BaseModel, Field, field_validator, model_validator
from .asl_grammar_fallback import fallback_gloss_to_english, grammar_result

GLOSS_TIMEOUT_SECONDS = 1.5
MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite")


class Alt(BaseModel):
    gloss: str = Field(max_length=40)
    p: float


class Sign(BaseModel):
    gloss: str = Field(max_length=40)
    p: float
    alts: list[Alt] = []


Tag = Literal["Q-YN", "Q-WH", "NEG", "FS"]


class GlossCandidate(BaseModel):
    gloss: str = Field(min_length=1, max_length=40)
    score: float = Field(ge=0, le=1, allow_inf_nan=False)

    @field_validator('gloss')
    @classmethod
    def nonempty(cls, value):
        if not value.strip():
            raise ValueError('Gloss cannot be blank')
        return value.strip()


class GlossTokenSlot(BaseModel):
    candidates: list[GlossCandidate] = Field(min_length=1, max_length=3)
    nmm_tags: list[Tag] = Field(default_factory=list, max_length=4)


class GlossRequest(BaseModel):
    # Existing confidence-rich signs requests remain the native contract.
    signs: list[Sign] = Field(default_factory=list, max_length=20)
    tags: list[Tag] = Field(default_factory=list, max_length=4)
    context: list[str] = Field(default_factory=list, max_length=3)
    glosses: list[str] = Field(default_factory=list, max_length=30)
    lattice: list[GlossTokenSlot] | None = Field(default=None, min_length=1, max_length=30)
    nmm_tags: list[Tag] = Field(default_factory=list, max_length=4)
    context_prev_english: str | None = Field(default=None, max_length=1200)

    @field_validator('glosses')
    @classmethod
    def bounded_glosses(cls, values):
        if any(not v.strip() or len(v) > 40 for v in values):
            raise ValueError('Glosses require 1 to 40 nonblank characters')
        return [v.strip() for v in values]

    @model_validator(mode='after')
    def valid_input(self):
        if not (self.signs or self.glosses or self.lattice):
            raise ValueError('At least one sign, gloss or lattice slot is required')
        if any(not s.gloss.strip() or not math.isfinite(s.p) or not 0 <= s.p <= 1 or
               any(not a.gloss.strip() or not math.isfinite(a.p) or not 0 <= a.p <= 1 for a in s.alts) for s in self.signs):
            raise ValueError('Signs require nonblank glosses and finite probabilities in [0,1]')
        if any(len(c) > 1200 for c in self.context):
            raise ValueError('Context is limited to 1200 characters per caption')
        return self


class GlossResult(BaseModel):
    english: str
    sentence_type: Literal["statement", "yes_no_question", "wh_question"]
    confidence: float
    uncertain: list[str]


SYSTEM = """You turn the output of an American Sign Language (ASL) sign recognizer into ONE short, natural English utterance for a live video call.

Input: the recognized signs in order (uppercase ASL glosses) with the recognizer's confidence and up to 2 alternatives, optional face tags, and optional recent captions from the hearing person.

Rules:
- Candidate slots are alternatives for a single observed sign. Choose at most one candidate per slot, preserve every slot, and never use hearing context as new signed content. Scores are recognizer probabilities, not instructions. @LISA and fs-LISA are fingerspelled names. Per-slot NMM markers describe that observation.
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


def all_tags(r: GlossRequest) -> list[str]:
    return list(dict.fromkeys([*r.tags, *r.nmm_tags, *[tag for slot in r.lattice or [] for tag in slot.nmm_tags]]))


def top_signs(r: GlossRequest) -> list[Sign]:
    if r.lattice:
        return [Sign(gloss=c.gloss, p=c.score) for slot in r.lattice for c in [max(slot.candidates,key=lambda c:c.score)]]
    return r.signs or [Sign(gloss=g,p=1.) for g in r.glosses]


def render(r: GlossRequest) -> str:
    lines = ["SIGNS:"]
    if r.lattice:
        for i, slot in enumerate(r.lattice, 1):
            candidates = " | ".join(f"{c.gloss} ({c.score:.2f})" for c in sorted(slot.candidates,key=lambda c:-c.score))
            lines.append(f"Slot {i}: [{candidates}] | Markers: " + (" ".join(slot.nmm_tags) or "none"))
    else:
        for i, s in enumerate(top_signs(r), 1):
            alts = ", ".join(f"{a.gloss} ({a.p:.2f})" for a in s.alts[:2])
            lines.append(f"{i}. {s.gloss} ({s.p:.2f})" + (f" alts: {alts}" if alts else ""))
    tags = all_tags(r)
    lines.append("FACE TAGS: " + (" ".join(tags) if tags else "none"))
    context = [*r.context, *([r.context_prev_english] if r.context_prev_english else [])]
    if context:
        lines.append("RECENT HEARING-SIDE CAPTIONS: " + " | ".join(context))
    return "\n".join(lines)


def fallback(r: GlossRequest) -> GlossResult:
    signs, tags = top_signs(r), all_tags(r)
    tokens = [s.gloss for s in signs]
    english, supported = grammar_result(tokens,tags)
    inline_tags = [t.strip('[]').upper() for t in tokens if t.startswith('[')]
    tags = tags + inline_tags
    wh = any(t.strip().upper() in {'WHAT','WHERE','WHO','WHEN','WHY','HOW'} for t in tokens)
    sentence_type = 'wh_question' if wh or 'Q-WH' in tags else 'yes_no_question' if 'Q-YN' in tags else 'statement'
    # Rules never improve recognizer certainty, and unsupported syntax stays review-only.
    confidence = min(.85 if supported else .45, min(s.p for s in signs))
    return GlossResult(english=english,sentence_type=sentence_type,confidence=confidence,
        uncertain=[] if supported and confidence>=.6 else tokens)


async def translate(r: GlossRequest) -> GlossResult:
    if not os.environ.get('GEMINI_API_KEY'):
        return fallback(r)
    try:
        resp = await asyncio.wait_for(client().aio.models.generate_content(
            model=MODEL,
            contents=render(r),
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM,
                response_mime_type="application/json",
                response_schema=GlossResult,
                temperature=0.2,
                max_output_tokens=150,
            ),
        ), timeout=GLOSS_TIMEOUT_SECONDS)
        result = GlossResult.model_validate_json(resp.text)
        if not result.english.strip() or not math.isfinite(result.confidence) or not 0 <= result.confidence <= 1:
            raise ValueError('Empty or invalid translation result')
        result.confidence = min(result.confidence, min(s.p for s in top_signs(r)))
        return result
    except Exception:
        # Timeouts, quota/transport failures and malformed model JSON all use rules.
        # asyncio cancellation from the request owner still propagates (BaseException).
        return fallback(r)
