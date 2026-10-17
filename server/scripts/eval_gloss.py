"""Run 12 glosses through Gemini; print English + latency. Usage: PYTHONPATH=. python scripts/eval_gloss.py"""
import asyncio
import time

from dotenv import load_dotenv

load_dotenv()
from app.gloss import GlossRequest, translate  # noqa: E402

CASES = [
    (["HELLO", "ME", "NAME", "fs-KEV"], []), (["YOU", "NAME", "WHAT"], ["Q-WH"]), (["ME", "HUNGRY"], []),
    (["YOU", "HUNGRY"], ["Q-YN"]), (["ME", "HUNGRY"], ["NEG"]), (["PIZZA", "WHERE"], ["Q-WH"]), (["GO", "NOW"], []),
    (["TOMORROW", "ME", "GO", "STORE"], []), (["PLEASE", "WAIT"], []), (["THANKYOU", "BYE"], []), (["YES"], []),
    (["LATER", "WATER"], []),
]


async def main() -> None:
    times = []
    for glosses, tags in CASES:
        req = GlossRequest(signs=[{"gloss": g, "p": 0.9} for g in glosses], tags=tags)
        t0 = time.perf_counter()
        out = await translate(req)
        ms = (time.perf_counter() - t0) * 1000
        times.append(ms)
        print(f"{ms:6.0f} ms  {' '.join(glosses):30s} -> {out.english}  [{out.sentence_type} {out.confidence:.2f}]")
    times.sort()
    print(f"p50 {times[len(times) // 2]:.0f} ms   max {times[-1]:.0f} ms")


asyncio.run(main())
