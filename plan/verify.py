#!/usr/bin/env python3
"""Blueprint runner: picks the next task, runs a task's "Done when" checks, and guards the ledger.

Usage (from the repo root). Add `--lane <name>` to next/wait to stay inside one lane (parallel agents):
  python plan/verify.py next             which AGENT task to do now (first eligible ledger row)
  python plan/verify.py wait [minutes]   git pull every 60 s until a task is eligible (default 30 min)
  python plan/verify.py lanes            one line per lane: progress and what it is doing/waiting on
  python plan/verify.py check 1.B2 ...   run those tasks' "Done when" blocks; exit 1 if any fails
  python plan/verify.py done 1.B2        run the checks; on PASS set the ledger row to DONE/NEEDS-HUMAN
  python plan/verify.py ledger           re-run checks for every DONE/NEEDS-HUMAN row; exit 1 on any FAIL
  python plan/verify.py status           counts per status + the human queue

Each task card (plan/tasks/<ID>.md) has one ```sh verify block. It runs under bash from the repo root with
`set -euo pipefail` and the helpers in PRELUDE. Env: SERVER_PY, ML_PY (venv pythons), TMP (fresh temp dir).
Standard library only.
"""
from __future__ import annotations

import datetime as dt
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLAN = ROOT / "plan.md"
TASKS = ROOT / "plan" / "tasks"
START, END = "<!-- LEDGER:START -->", "<!-- LEDGER:END -->"
SATISFIED = {"DONE", "NEEDS-HUMAN", "VERIFIED"}
OPEN = {"TODO", "PARTIAL"}

PRELUDE = r'''set -euo pipefail
fail() { echo "FAIL: $*" >&2; exit 1; }
need() { [ -f "$1" ] || fail "missing file $1"; }
has() { need "$1"; grep -Eq -- "$2" "$1" || fail "pattern not found in $1: $2"; }
lacks() { need "$1"; if grep -Eq -- "$2" "$1"; then fail "forbidden pattern in $1: $2"; fi; }
lacks_dir() { local hits; hits=$(grep -rEn -- "$2" "$1" || true)
  if [ -n "$hits" ]; then echo "$hits" | head -5; fail "forbidden pattern under $1: $2"; fi; }
exports() { local f=$1; shift; need "$f"; for n in "$@"; do
  grep -Eq "export (default )?(async )?(function|const|class|type|interface|let) $n\b" "$f" || fail "missing export $n in $f"; done; }
pydefs() { local f=$1; shift; need "$f"; for n in "$@"; do
  grep -Eq "^\s*(async )?(def|class) $n\b|^$n\s*[:=]" "$f" || fail "missing def/class $n in $f"; done; }
testnames() { local f=$1; shift; need "$f"; for n in "$@"; do grep -Fq -- "$n" "$f" || fail "missing test '$n' in $f"; done; }
nostubs() { for f in "$@"; do need "$f"; if grep -nEi "TODO|FIXME|not implemented|unimplemented|NotImplementedError" "$f"; then fail "stub marker in $f"; fi; done; }
vitest() { (cd web && npx vitest run "$@") || fail "vitest $*"; }
webtest() { (cd web && npx vitest run) || fail "web tests"; }
webbuild() { (cd web && npm run build) || fail "web build (tsc -b && vite build)"; }
'''


def venv_python(rel: str) -> str:
    for cand in (ROOT / rel / "bin" / "python", ROOT / rel / "Scripts" / "python.exe"):
        if cand.exists():
            return cand.as_posix()
    return Path(sys.executable).as_posix()


def find_bash() -> str:
    if os.name == "nt":  # prefer Git Bash; System32\bash.exe is WSL and sees a different filesystem
        for cand in (r"C:\Program Files\Git\bin\bash.exe", r"C:\Program Files (x86)\Git\bin\bash.exe"):
            if Path(cand).exists():
                return cand
    found = shutil.which("bash")
    if not found:
        sys.exit("bash not found (on Windows install Git for Windows)")
    return found


def cell_id(cell: str) -> str:
    m = re.search(r"\[([^\]]+)\]", cell)
    return (m.group(1) if m else cell).strip()


def read_ledger() -> tuple[list[str], list[dict], int, int]:
    lines = PLAN.read_text(encoding="utf-8").split("\n")
    s = next(i for i, l in enumerate(lines) if l.strip() == START)
    e = next(i for i, l in enumerate(lines) if l.strip() == END)
    rows, lane = [], "?"
    for i in range(s + 1, e):
        m = re.match(r"#+\s*Lane\s+(\w+)", lines[i].strip())
        if m:
            lane = m.group(1).lower()
            continue
        cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
        if len(cells) < 6 or cells[0] in ("ID", "") or set(cells[0]) <= set("-: "):
            continue
        deps = [] if cells[3] in ("—", "-", "") else [d.strip() for d in cells[3].split(",")]
        rows.append({"line": i, "lane": lane, "id": cell_id(cells[0]), "task": cells[1], "owner": cells[2],
                     "deps": deps, "status": cells[4].split()[0].strip("*"), "cells": cells})
    return lines, rows, s, e


def verify_block(task_id: str) -> str | None:
    card = TASKS / f"{task_id}.md"
    if not card.exists():
        return None
    m = re.search(r"```sh verify\n(.*?)```", card.read_text(encoding="utf-8"), re.S)
    return m.group(1) if m else None


def run_check(task_id: str) -> bool:
    block = verify_block(task_id)
    if block is None:
        print(f"[{task_id}] no verify block (human task or missing card) -> nothing to run")
        return False
    with tempfile.TemporaryDirectory(prefix=f"verify-{task_id}-") as tmp:
        script = Path(tmp) / "check.sh"
        script.write_text(PRELUDE + block, encoding="utf-8", newline="\n")
        env = dict(os.environ, SERVER_PY=venv_python("server/.venv"), ML_PY=venv_python("ml/.venv"),
                   TMP=(Path(tmp) / "work").as_posix())
        (Path(tmp) / "work").mkdir()
        try:
            p = subprocess.run([find_bash(), script.as_posix()], cwd=ROOT, env=env, capture_output=True,
                               text=True, encoding="utf-8", errors="replace", timeout=1800)
        except subprocess.TimeoutExpired:
            print(f"[{task_id}] FAIL (timeout)")
            return False
    if p.returncode == 0:
        print(f"[{task_id}] PASS")
        return True
    out = (p.stdout + p.stderr).strip().split("\n")
    print(f"[{task_id}] FAIL (exit {p.returncode}) — last lines:")
    print("\n".join("    " + l for l in out[-40:]))
    return False


def pick(rows: list[dict], lane: str | None) -> tuple[dict | None, list[str], list[dict]]:
    """First eligible AGENT row (in ledger order, optionally within one lane), the dependency waits, open rows."""
    status = {r["id"]: r["status"] for r in rows}
    lanes = {r["id"]: r["lane"] for r in rows}
    mine = [r for r in rows if r["owner"].startswith("AGENT") and (lane is None or r["lane"] == lane)]
    waits = []
    for r in mine:
        if r["status"] not in OPEN:
            continue
        unmet = [d for d in r["deps"] if status.get(d) not in SATISFIED]
        if not unmet:
            return r, waits, []
        waits.append(f"{r['id']} waits on " + ", ".join(f"{d} ({lanes.get(d, '?')} lane, {status.get(d, '?')})"
                                                          for d in unmet))
    return None, waits, [r for r in mine if r["status"] not in SATISFIED]


def next_task(rows: list[dict], lane: str | None) -> int:
    r, waits, left = pick(rows, lane)
    scope = f"lane {lane}" if lane else "all lanes"
    if r:
        print(f"NEXT ({scope}): {r['id']} — {r['task']}  [{r['status']}]")
        print(f"Read plan/tasks/{r['id']}.md, do its Steps, then: python plan/verify.py done {r['id']}")
        return 0
    if left:
        print(f"WAITING ({scope}): agent work remains but every open task waits on another lane. NOT finished.")
        for w in waits:
            print("  " + w)
        for r2 in left:
            if r2["status"] == "BLOCKED":
                print(f"  {r2['id']} BLOCKED: {r2['cells'][5]}")
        print(f"Run: python plan/verify.py wait{' --lane ' + lane if lane else ''}")
        return 2
    print(f"NO AGENT TASKS LEFT ({scope}). Every AGENT row is DONE or NEEDS-HUMAN.")
    status_report(rows if lane is None else [x for x in rows if x["lane"] == lane])
    return 0


def wait_for(lane: str | None, minutes: int) -> int:
    """Pull every 60 s until this lane has an eligible task (other lanes finish their dependencies)."""
    import time
    deadline = time.time() + minutes * 60
    while True:
        subprocess.run(["git", "pull", "--rebase", "--autostash", "-q"], cwd=ROOT)
        _, rows, _, _ = read_ledger()
        r, _, left = pick(rows, lane)
        if r or not left:
            return next_task(rows, lane)
        if time.time() > deadline:
            print(f"still waiting after {minutes} min:")
            return next_task(rows, lane)
        time.sleep(60)


def lanes_report(rows: list[dict]) -> None:
    names = [l for l in dict.fromkeys(r["lane"] for r in rows) if l != "human"]
    for name in names:
        lr = [r for r in rows if r["lane"] == name]
        done = sum(r["status"] in SATISFIED for r in lr)
        r, waits, left = pick(rows, name)
        state = f"next {r['id']}" if r else ("waiting: " + waits[0] if left and waits else
                                            "blocked" if left else "finished")
        print(f"{name:<7} {done}/{len(lr)} done · {state}")


def status_report(rows: list[dict]) -> None:
    counts: dict[str, int] = {}
    for r in rows:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    print("Ledger: " + " · ".join(f"{k} {v}" for k, v in sorted(counts.items())))
    human = [r for r in rows if r["status"] in ("NEEDS-HUMAN", "HUMAN")]
    if human:
        print("Human queue:")
        for r in human:
            print(f"  {r['id']} [{r['status']}] {r['task']}")


def mark_done(task_id: str) -> None:
    lines, rows, _, _ = read_ledger()
    row = next((r for r in rows if r["id"] == task_id), None)
    if row is None:
        sys.exit(f"{task_id} is not in the ledger")
    if not row["owner"].startswith("AGENT"):
        sys.exit(f"{task_id} is a HUMAN task; only a person marks it")
    if not run_check(task_id):
        sys.exit(f"{task_id} not marked: checks failed. Fix the code (never the checks) and rerun.")
    sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True,
                         text=True).stdout.strip() or "?"
    new = "NEEDS-HUMAN" if "HUMAN" in row["owner"] else "DONE"
    cells = row["cells"]
    cells[4] = new
    cells[5] = f"verify PASS {dt.date.today().isoformat()} on {sha}+"
    lines[row["line"]] = "| " + " | ".join(cells) + " |"
    PLAN.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"ledger: {task_id} -> {new}. Commit plan.md with the task's code.")


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    cmd, args = sys.argv[1], sys.argv[2:]
    lane = None
    if "--lane" in args:
        i = args.index("--lane")
        lane = args[i + 1].lower()
        del args[i:i + 2]
    _, rows, _, _ = read_ledger()
    known = {r["lane"] for r in rows}
    if lane and lane not in known:
        sys.exit(f"unknown lane {lane!r}; lanes: {', '.join(sorted(known - {'human'}))}")
    if cmd == "next":
        sys.exit(next_task(rows, lane))
    elif cmd == "wait":
        sys.exit(wait_for(lane, int(args[0]) if args else 30))
    elif cmd == "lanes":
        lanes_report(rows)
    elif cmd == "check":
        ok = [run_check(t) for t in args]
        sys.exit(0 if ok and all(ok) else 1)
    elif cmd == "done" and len(args) == 1:
        mark_done(args[0])
    elif cmd == "ledger":
        bad = [r["id"] for r in rows if r["status"] in SATISFIED and not run_check(r["id"])]
        if bad:
            print("LEDGER LIES: marked done but failing -> " + ", ".join(bad) + ". Set them back to PARTIAL.")
            sys.exit(1)
        print("ledger consistent")
    elif cmd == "status":
        status_report(rows)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
