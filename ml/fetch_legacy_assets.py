"""Recover the original model and recordings into ignored data/legacy.

Uses the retained Git objects first, then the same immutable public GitHub commit.
Only downloads bytes: this command never unpickles or executes the assets.
"""
from __future__ import annotations

import hashlib
import subprocess
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMMIT = "405afe03bae60eac7313f8d58dfa426b9d301862"
ASSETS = {
    "word_model.p": "54e8d3fc22b9d2a452e332300348ad67ce1fea74b90517f2458bcc0f5b7cdb78",
    "word_data.pickle": "f072883f48933c7faaf3fa3d373668eaa1d578c709a7538b77c3e002531731df",
}


def verified(raw: bytes, filename: str) -> bool:
    return hashlib.sha256(raw).hexdigest() == ASSETS[filename]


def main() -> None:
    destination = ROOT / "data" / "legacy"
    destination.mkdir(parents=True, exist_ok=True)
    for filename in ASSETS:
        target = destination / filename
        if target.exists():
            if not verified(target.read_bytes(), filename):
                raise ValueError(f"{target} has local changes; refusing to overwrite it")
            print(f"Verified existing {filename}")
            continue
        result = subprocess.run(["git", "show", f"{COMMIT}:{filename}"], cwd=ROOT, capture_output=True)
        if result.returncode == 0:
            raw = result.stdout
        else:
            url = f"https://raw.githubusercontent.com/Azrkiel/Banana-Brownies-GHH2026/{COMMIT}/{filename}"
            with urllib.request.urlopen(url, timeout=60) as response:
                raw = response.read()
        if not verified(raw, filename):
            raise ValueError(f"Checksum mismatch for {filename}")
        with target.open("xb") as output:
            output.write(raw)
        print(f"Recovered and verified {filename}")


if __name__ == "__main__":
    main()
