"""Retrain the browser word model from recordings made on the #/train-words page.

Reads data/words/*.json (ignored by Git), prints a held-out evaluation report, then
writes a CANDIDATE browser forest. Nothing here touches web/public: compare the report,
run the parity check, and copy the candidate over the shipped model by hand.
Run with ml/requirements-export.txt in a separate Python virtual environment.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import pickle
import re
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import StratifiedKFold

from export_words import forest_to_browser
from fetch_legacy_assets import ASSETS, ROOT

FRAMES, PER_FRAME = 30, 42
DIMS = FRAMES * PER_FRAME
PREPROCESSING = "mirrored-one-hand-wrist-relative-xy"
LABEL_RE = re.compile(r"[A-Z][A-Z ]{0,39}")  # used with fullmatch; same as parseWordForest
MIN_FRAMES = 24
MIN_SCORE, MIN_MARGIN = 0.6, 0.15  # live acceptance gate in wordModel.ts
LEGACY_SIGNER = "legacy"
DEFAULT_DIR = ROOT / "data/words"
SHIPPED = ROOT / "web/public/trained-words.json"


class Samples:
    """Parallel arrays: features (n, 1260) float64, label strings, signers, framesWithHand."""

    def __init__(self, features: np.ndarray, labels: list[str], signers: list[str], frames: list[int]) -> None:
        self.features, self.labels, self.signers, self.frames = features, labels, signers, frames

    def __len__(self) -> int:
        return len(self.labels)

    def select(self, mask: np.ndarray) -> Samples:
        keep = [i for i in range(len(self)) if mask[i]]
        return Samples(self.features[keep], [self.labels[i] for i in keep],
                       [self.signers[i] for i in keep], [self.frames[i] for i in keep])


def is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def load_sample_file(path: Path) -> Samples:
    """Strictly validate one recording file; errors name the file and sample index."""
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise ValueError(f"{path}: cannot read JSON ({error})") from error
    if not isinstance(doc, dict):
        raise ValueError(f"{path}: top level must be an object")
    expected = {"kind": "signline-word-samples", "version": 1, "preprocessing": PREPROCESSING,
                "frames": FRAMES, "featuresPerFrame": PER_FRAME}
    for key, value in expected.items():
        got = doc.get(key)
        if got != value or isinstance(got, bool):
            raise ValueError(f"{path}: {key} must be {value!r}, got {got!r}")
    signer = doc.get("signer")
    if not isinstance(signer, str) or not signer.strip():
        raise ValueError(f"{path}: signer must be a non-empty string")
    samples = doc.get("samples")
    if not isinstance(samples, list) or not samples:
        raise ValueError(f"{path}: samples must be a non-empty list")
    rows, labels, frames = [], [], []
    for index, sample in enumerate(samples):
        where = f"{path}: sample {index}"
        if not isinstance(sample, dict):
            raise ValueError(f"{where}: must be an object")
        label = sample.get("label")
        if not isinstance(label, str) or not LABEL_RE.fullmatch(label):
            raise ValueError(f"{where}: label {label!r} must match {LABEL_RE.pattern}")
        features = sample.get("features")
        if not isinstance(features, list) or len(features) != DIMS:
            raise ValueError(f"{where}: features must be a list of {DIMS} numbers")
        if not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in features):
            raise ValueError(f"{where}: features must all be finite numbers")
        count = sample.get("framesWithHand")
        if not is_int(count) or not 0 <= count <= FRAMES:
            raise ValueError(f"{where}: framesWithHand must be an integer in 0..{FRAMES}, got {count!r}")
        rows.append(features)
        labels.append(label)
        frames.append(count)
    return Samples(np.asarray(rows, dtype=np.float64), labels, [signer.strip()] * len(labels), frames)


def collect_files(paths: list[Path], skip: set[Path]) -> list[Path]:
    """Files as given; directories expand to their *.json (minus candidates/outputs)."""
    found: dict[Path, Path] = {}
    for path in paths:
        if path.is_dir():
            for child in sorted(path.glob("*.json")):
                resolved = child.resolve()
                if resolved not in skip and not child.name.endswith(".candidate.json"):
                    found[resolved] = child
        elif path.is_file():
            found[path.resolve()] = path
        else:
            raise FileNotFoundError(f"{path}: no such file or directory")
    return sorted(found.values(), key=lambda p: (p.name, str(p)))


def load_legacy(root: Path = ROOT) -> tuple[Samples, bytes]:
    """The pickle is executable: unpickle only after the SHA256 matches the recovered asset."""
    path = root / "data/legacy/word_data.pickle"
    if not path.is_file():
        raise FileNotFoundError(f"{path} missing; run ml/fetch_legacy_assets.py first")
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != ASSETS["word_data.pickle"]:
        raise ValueError("Recording checksum differs from the recovered source")
    data = pickle.loads(raw)
    features = np.asarray(data["data"], dtype=np.float64)
    labels = [str(label) for label in data["labels"]]
    if features.ndim != 2 or features.shape[1] != DIMS or len(labels) != len(features) or not np.isfinite(features).all():
        raise ValueError("Unexpected legacy recording layout")
    bad = sorted({label for label in labels if not LABEL_RE.fullmatch(label)})
    if bad:
        raise ValueError(f"Legacy labels fail the label pattern: {bad}")
    return Samples(features, labels, [LEGACY_SIGNER] * len(labels), [FRAMES] * len(labels)), raw


# --- evaluation ------------------------------------------------------------------------------

def gate(proba: np.ndarray, frames: list[int]) -> np.ndarray:
    """Live acceptance gate from predictWord: frames, top score and margin over the runner-up."""
    order = np.sort(proba, axis=1)
    return (np.asarray(frames) >= MIN_FRAMES) & (order[:, -1] >= MIN_SCORE) & (order[:, -1] - order[:, -2] >= MIN_MARGIN)


def metrics(truth: np.ndarray, proba: np.ndarray, frames: list[int], labels: list[str]) -> dict[str, Any]:
    """truth: label indices; proba columns follow `labels`. Ties go to the lower index like the browser."""
    predicted = proba.argmax(axis=1)
    accepted = gate(proba, frames)
    right = predicted == truth
    confusion = np.zeros((len(labels), len(labels)), dtype=int)
    for t, p in zip(truth, predicted):
        confusion[t, p] += 1
    n, n_acc = len(truth), int(accepted.sum())
    return {
        "samples": n, "accuracy": float(right.mean()) if n else None,
        "accepted": n_acc, "acceptedPct": n_acc / n if n else None,
        "acceptedAccuracy": float(right[accepted].mean()) if n_acc else None,
        "labels": labels, "confusion": confusion.tolist(),
    }


def fit_proba(train_x: np.ndarray, train_y: np.ndarray, test_x: np.ndarray, classes: int, trees: int, seed: int) -> np.ndarray:
    """Probabilities in the full label space even if a label is absent from the training split."""
    model = RandomForestClassifier(n_estimators=trees, random_state=seed, n_jobs=-1)
    model.fit(train_x.astype(np.float32), train_y)
    proba = np.zeros((len(test_x), classes))
    proba[:, model.classes_] = model.predict_proba(test_x.astype(np.float32))
    return proba


def cross_validate(data: Samples, labels: list[str], k: int, trees: int, seed: int) -> dict[str, Any]:
    y = np.asarray([labels.index(label) for label in data.labels])
    proba = np.zeros((len(y), len(labels)))
    for train, test in StratifiedKFold(k, shuffle=True, random_state=seed).split(data.features, y):
        proba[test] = fit_proba(data.features[train], y[train], data.features[test], len(labels), trees, seed)
    return {"folds": k, **metrics(y, proba, data.frames, labels)}


def leave_one_signer_out(data: Samples, labels: list[str], trees: int, seed: int) -> dict[str, Any]:
    y = np.asarray([labels.index(label) for label in data.labels])
    signers = np.asarray(data.signers)
    proba = np.zeros((len(y), len(labels)))
    held = np.zeros(len(y), dtype=bool)
    per_signer: dict[str, Any] = {}
    for signer in sorted(set(data.signers)):
        test = signers == signer
        if len(set(y[~test])) < 2:
            per_signer[signer] = None  # nothing meaningful to train on
            continue
        proba[test] = fit_proba(data.features[~test], y[~test], data.features[test], len(labels), trees, seed)
        held |= test
        sub = metrics(y[test], proba[test], [f for f, t in zip(data.frames, test) if t], labels)
        sub["unseenLabels"] = [labels[i] for i in sorted(set(y[test]) - set(y[~test]))]
        per_signer[signer] = sub
    pooled = metrics(y[held], proba[held], [f for f, h in zip(data.frames, held) if h], labels) if held.any() else None
    return {"perSigner": per_signer, "pooled": pooled}


# --- browser forest (mirror of wordProbabilities in web/src/lib/wordModel.ts) -----------------

def check_browser_forest(model: Any) -> None:
    """Every constraint parseWordForest enforces; raises ValueError on the first violation."""
    def fail(message: str) -> None:
        raise ValueError(f"Browser forest invalid: {message}")
    if not isinstance(model, dict) or model.get("version") != 1 or model.get("frames") != FRAMES or \
            model.get("featuresPerFrame") != PER_FRAME or model.get("preprocessing") != PREPROCESSING:
        fail("header")
    labels, trees = model.get("labels"), model.get("trees")
    if not isinstance(labels, list) or not 2 <= len(labels) <= 64 or \
            not all(isinstance(l, str) and LABEL_RE.fullmatch(l) for l in labels) or len(set(labels)) != len(labels):
        fail("labels")
    if not isinstance(trees, list) or not 1 <= len(trees) <= 1000:
        fail("tree count")
    for t, tree in enumerate(trees):
        if not isinstance(tree, list) or not 1 <= len(tree) <= 10000:
            fail(f"tree {t} size")
        for i, node in enumerate(tree):
            if not isinstance(node, dict) or isinstance(node.get("threshold"), bool) or \
                    not isinstance(node.get("threshold"), (int, float)) or \
                    not math.isfinite(node["threshold"]) or not isinstance(node.get("votes"), list):
                fail(f"tree {t} node {i}")
            if node.get("left") == -1 and node.get("right") == -1:
                votes = node["votes"]
                if len(votes) != len(labels) or not all(math.isfinite(v) and v >= 0 for v in votes) or sum(votes) <= 0:
                    fail(f"tree {t} node {i} votes")
            else:
                feature = node.get("feature")
                if not is_int(feature) or not 0 <= feature < DIMS:
                    fail(f"tree {t} node {i} feature")
                for child in (node.get("left"), node.get("right")):
                    if not is_int(child) or not i < child < len(tree):
                        fail(f"tree {t} node {i} edge")


def forest_probabilities(model: dict[str, Any], features: np.ndarray) -> np.ndarray:
    """Browser-equivalent traversal: float32 input, `<=` against the double threshold."""
    x = np.asarray(features, dtype=np.float32).astype(np.float64)
    classes = len(model["labels"])
    result = np.zeros((len(x), classes))
    rows = np.arange(len(x))
    for tree in model["trees"]:
        left = np.asarray([n["left"] for n in tree])
        right = np.asarray([n["right"] for n in tree])
        feature = np.asarray([max(n["feature"], 0) for n in tree])
        threshold = np.asarray([n["threshold"] for n in tree])
        votes = np.asarray([n["votes"] if n["votes"] else [0.0] * classes for n in tree])
        votes = votes / np.maximum(votes.sum(axis=1, keepdims=True), 1e-300)
        node = np.zeros(len(x), dtype=int)
        while True:
            active = left[node] != -1
            if not active.any():
                break
            step = np.where(x[rows, feature[node]] <= threshold[node], left[node], right[node])
            node = np.where(active, step, node)
        result += votes[node] / len(model["trees"])
    return result


def evaluate_baseline(path: Path, data: Samples) -> dict[str, Any] | None:
    """Score a shipped/other browser forest on `data`, restricted to labels in its vocabulary."""
    model = json.loads(path.read_text(encoding="utf-8"))
    check_browser_forest(model)
    labels = list(model["labels"])
    mask = np.asarray([label in labels for label in data.labels])
    if not mask.any():
        return None
    inside = data.select(mask)
    truth = np.asarray([labels.index(label) for label in inside.labels])
    return {"path": str(path), "outOfVocabulary": int((~mask).sum()),
            **metrics(truth, forest_probabilities(model, inside.features), inside.frames, labels)}


# --- report ----------------------------------------------------------------------------------

def pct(value: float | None) -> str:
    return "n/a" if value is None else f"{100 * value:.1f}%"


def format_eval(title: str, result: dict[str, Any] | None) -> list[str]:
    if result is None:
        return [f"{title}: not available"]
    lines = [f"{title}: n={result['samples']}  accuracy={pct(result['accuracy'])}  "
             f"gate-accepted={pct(result['acceptedPct'])} ({result['accepted']})  "
             f"accuracy-when-accepted={pct(result['acceptedAccuracy'])}"]
    labels = result["labels"]
    if len(labels) <= 16:
        width = max(len(label) for label in labels)
        lines.append(f"  confusion (row=true, col=predicted){'':<{width}}" + " ".join(f"{i:>3}" for i in range(len(labels))))
        for i, row in enumerate(result["confusion"]):
            lines.append(f"  [{i:>2}] {labels[i]:<{width}}  " + " ".join(f"{v:>3}" for v in row))
    return lines


def format_report(report: dict[str, Any]) -> str:
    out = ["== Data ==", f"samples kept: {report['samples']}  (dropped, under {MIN_FRAMES} frames with a hand: {report['dropped']})"]
    out.append("per label:  " + ", ".join(f"{k}={v}" for k, v in report["perLabel"].items()))
    out.append("per signer: " + ", ".join(f"{k}={v}" for k, v in report["perSigner"].items()))
    out += ["", "== Stratified cross-validation (same sessions as training: optimistic) =="]
    out += format_eval(f"{report['cv']['folds']}-fold", report["cv"]) if report["cv"] else ["skipped: a label has fewer than 2 samples"]
    out += ["", "== Leave-one-signer-out (the honest new-person number) =="]
    loso = report["leaveOneSignerOut"]
    if loso is None:
        out.append("skipped: needs at least 2 signers")
    else:
        for signer, result in loso["perSigner"].items():
            out += format_eval(f"held out {signer!r}", result)
            if result and result["unseenLabels"]:
                out.append(f"  labels unseen in training: {', '.join(result['unseenLabels'])}")
        out += format_eval("pooled", loso["pooled"])
    out += ["", "== Shipped model on the same new recordings (labels in its vocabulary only) =="]
    base = report["baseline"]
    if base is None:
        out.append("not available (no new samples with a label in its vocabulary)")
    else:
        out.append(f"model: {base['path']}  (samples with out-of-vocabulary labels skipped: {base['outOfVocabulary']})")
        out += format_eval("shipped", base)
    return "\n".join(out)


def to_plain(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: to_plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_plain(v) for v in value]
    if isinstance(value, np.generic):
        return value.item()
    return value


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="*", type=Path, help="recording files or directories of *.json (default: data/words)")
    parser.add_argument("--legacy", action="store_true", help="also use the 105 recovered samples (checksum-verified)")
    parser.add_argument("--trees", type=int, default=100)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--min-per-label", type=int, default=10)
    parser.add_argument("--baseline", type=Path, default=SHIPPED, help="browser forest to compare against")
    parser.add_argument("--out", type=Path, default=DEFAULT_DIR / "trained-words.candidate.json")
    parser.add_argument("--parity-out", type=Path, help="local parity fixture {features, probabilities} for verify-word-parity.ts")
    parser.add_argument("--report-out", type=Path, help="also save the evaluation report as JSON")
    args = parser.parse_args()
    if not 1 <= args.trees <= 1000:
        parser.error("--trees must be 1..1000")

    skip = {p.resolve() for p in (args.out, args.parity_out, args.report_out) if p}
    paths = args.paths or [DEFAULT_DIR]
    if not args.paths and args.legacy and not DEFAULT_DIR.is_dir():
        paths = []
    files = collect_files(paths, skip)
    if not files and not args.legacy:
        parser.error("no recording files found; record on #/train-words or pass --legacy")
    parts = [load_sample_file(path) for path in files]
    digest = hashlib.sha256()
    for path in files:
        digest.update(path.read_bytes())
    new = Samples(np.concatenate([p.features for p in parts]) if parts else np.empty((0, DIMS)),
                  [l for p in parts for l in p.labels], [s for p in parts for s in p.signers],
                  [f for p in parts for f in p.frames])
    if args.legacy and LEGACY_SIGNER in new.signers:
        parser.error(f"signer name {LEGACY_SIGNER!r} is reserved for --legacy samples")
    legacy_count = 0
    data = new
    if args.legacy:
        legacy, legacy_raw = load_legacy()
        digest.update(legacy_raw)
        legacy_count = len(legacy)
        data = Samples(np.concatenate([new.features, legacy.features]), new.labels + legacy.labels,
                       new.signers + legacy.signers, new.frames + legacy.frames)
    low = np.asarray(data.frames) < MIN_FRAMES
    dropped = int(low.sum())
    print(f"Loaded {len(files)} file(s), {len(data)} samples" + (f" (incl. {legacy_count} legacy)" if legacy_count else "") +
          f"; dropped {dropped} with framesWithHand < {MIN_FRAMES}")
    data = data.select(~low)
    new_mask = np.asarray([s != LEGACY_SIGNER for s in data.signers], dtype=bool)

    labels = sorted(set(data.labels))
    counts = {label: data.labels.count(label) for label in labels}
    if len(labels) < 2:
        parser.error(f"need at least 2 labels, found {len(labels)}")
    short = {label: n for label, n in counts.items() if n < args.min_per_label}
    if short:
        parser.error(f"labels below --min-per-label={args.min_per_label}: {short}")
    signers = sorted(set(data.signers))
    per_signer = {s: data.signers.count(s) for s in signers}

    k = min(5, min(counts.values()))
    report: dict[str, Any] = {
        "samples": len(data), "dropped": dropped, "perLabel": counts, "perSigner": per_signer,
        "cv": cross_validate(data, labels, k, args.trees, args.seed) if k >= 2 else None,
        "leaveOneSignerOut": leave_one_signer_out(data, labels, args.trees, args.seed) if len(signers) >= 2 else None,
        "baseline": None,
    }
    if args.baseline.is_file() and new_mask.any():
        report["baseline"] = evaluate_baseline(args.baseline, data.select(new_mask))
    print()
    print(format_report(report))
    print()
    if args.report_out:
        args.report_out.parent.mkdir(parents=True, exist_ok=True)
        args.report_out.write_text(json.dumps(to_plain(report), indent=1, allow_nan=False) + "\n")

    features = data.features.astype(np.float32)
    model = RandomForestClassifier(n_estimators=args.trees, random_state=args.seed, n_jobs=-1)
    model.fit(features, np.asarray(data.labels))
    result = forest_to_browser(model, source_commit=None, source_sha256=digest.hexdigest())
    result["trainedOn"] = {"samples": len(data), "signers": len(signers), "perLabel": counts}  # counts only: the model may be public
    check_browser_forest(result)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, separators=(",", ":"), allow_nan=False) + "\n")
    if args.parity_out:
        fixture = {"features": features.tolist(), "probabilities": model.predict_proba(features).tolist()}
        args.parity_out.parent.mkdir(parents=True, exist_ok=True)
        args.parity_out.write_text(json.dumps(fixture, separators=(",", ":"), allow_nan=False))
    print(f"Wrote candidate with {len(result['trees'])} trees and {len(result['labels'])} labels to {args.out}")
    print("Not installed: compare the report, verify parity, then copy it over web/public/trained-words.json yourself.")


if __name__ == "__main__":
    main()
