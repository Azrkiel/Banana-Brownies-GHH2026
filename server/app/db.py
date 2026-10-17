"""Tiger Data (TimescaleDB) writer + stats. Everything is a no-op when DATABASE_URL is unset."""
from __future__ import annotations

import os

import asyncpg

_pool: asyncpg.Pool | None = None


async def pool() -> asyncpg.Pool | None:
    global _pool
    url = os.environ.get("DATABASE_URL")
    if not url:
        return None
    if _pool is None:
        _pool = await asyncpg.create_pool(url, min_size=1, max_size=4, command_timeout=5)
    return _pool


SIGN_SQL = """INSERT INTO sign_events
 (ts, session_id, gloss, confidence, accepted, alt1, alt1_p, classify_ms, model_version)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)"""
UTT_SQL = """INSERT INTO utterance_events
 (ts, session_id, n_signs, gloss_seq, english, sentence_type, source, edited,
  gloss_ms, tts_ttfb_ms, end_to_end_ms)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)"""


async def insert_events(signs: list, utterances: list) -> None:
    p = await pool()
    if p is None or (not signs and not utterances):
        return
    async with p.acquire() as c:
        if signs:
            await c.executemany(SIGN_SQL, [
                (s.ts, s.session_id, s.gloss, s.confidence, s.accepted, s.alt1, s.alt1_p,
                 s.classify_ms, s.model_version) for s in signs])
        if utterances:
            await c.executemany(UTT_SQL, [
                (u.ts, u.session_id, u.n_signs, u.gloss_seq, u.english, u.sentence_type, u.source,
                 u.edited, u.gloss_ms, u.tts_ttfb_ms, u.end_to_end_ms) for u in utterances])


STATS_SQL = """
SELECT count(*) AS utterances,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY end_to_end_ms) AS e2e_p50,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY end_to_end_ms) AS e2e_p95,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY gloss_ms)      AS gloss_p50,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY tts_ttfb_ms)   AS tts_p50,
       avg((source = 'rules')::int)                                AS fallback_rate
FROM utterance_events WHERE ts > now() - interval '15 minutes'"""
TREND_SQL = """SELECT bucket, utterances, avg_e2e_ms, max_e2e_ms
FROM latency_1m WHERE bucket > now() - interval '30 minutes' ORDER BY bucket"""
SIGNS_SQL = """SELECT gloss, count(*) AS n, avg(confidence) AS avg_conf, avg(accepted::int) AS accept_rate
FROM sign_events WHERE ts > now() - interval '30 minutes' GROUP BY gloss ORDER BY accept_rate ASC LIMIT 8"""


async def stats() -> dict:
    p = await pool()
    if p is None:
        return {"configured": False}
    async with p.acquire() as c:
        summary = dict(await c.fetchrow(STATS_SQL))
        trend = [dict(r) for r in await c.fetch(TREND_SQL)]
        signs = [dict(r) for r in await c.fetch(SIGNS_SQL)]
    for row in trend:
        row["bucket"] = row["bucket"].isoformat()
    return {"configured": True, "summary": summary, "trend": trend, "weakest_signs": signs}
