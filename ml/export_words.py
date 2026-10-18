"""Export the recovered, trusted random forest to a browser-readable model.

The original recordings remain in ignored data/legacy, never in the web bundle.
Run with ml/requirements-export.txt in a separate Python virtual environment.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pickle
import warnings
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.exceptions import InconsistentVersionWarning

from fetch_legacy_assets import ASSETS, COMMIT, ROOT


def forest_to_browser(model: Any, *, source_commit: str | None, source_sha256: str) -> dict[str, Any]:
    """Convert a fitted single-output sklearn RandomForestClassifier to the browser JSON forest."""
    if model.n_features_in_ != 30 * 42 or model.n_outputs_ != 1:
        raise ValueError("Expected a single-output 30-frame, 42-feature word model")
    trees = []
    for estimator in model.estimators_:
        tree = estimator.tree_
        nodes = []
        for index in range(tree.node_count):
            leaf = tree.children_left[index] == -1
            values = tree.value[index][0]
            votes = (values / values.sum()).tolist() if leaf else []
            nodes.append({
                "left": int(tree.children_left[index]), "right": int(tree.children_right[index]),
                "feature": int(tree.feature[index]), "threshold": float(tree.threshold[index]),
                "votes": votes,
            })
        trees.append(nodes)
    return {
        "version": 1, "frames": 30, "featuresPerFrame": 42,
        "labels": [str(label) for label in model.classes_], "trees": trees,
        "sourceCommit": source_commit, "sourceSha256": source_sha256,
        "preprocessing": "mirrored-one-hand-wrist-relative-xy",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, default=ROOT / "data/legacy/word_model.p")
    parser.add_argument("--expected-sha256", default=ASSETS["word_model.p"])
    parser.add_argument("--out", type=Path, default=ROOT / "web/public/trained-words.json")
    parser.add_argument("--parity-out", type=Path, help="Optional local-only parity fixture from the recovered recordings")
    args = parser.parse_args()
    raw = args.model.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != args.expected_sha256:
        raise ValueError("Model checksum differs from the specified trusted source")
    # A pickle is executable. Load only the checksum-verified, user-supplied model;
    # never accept model uploads or deserialize it in the web/API application.
    with warnings.catch_warnings():
        warnings.simplefilter("error", InconsistentVersionWarning)
        model = pickle.loads(raw)["model"]
    result = forest_to_browser(
        model, source_commit=COMMIT if digest == ASSETS["word_model.p"] else None, source_sha256=digest)
    trees = result["trees"]
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, separators=(",", ":"), allow_nan=False) + "\n")
    if args.parity_out:
        data_path = ROOT / "data/legacy/word_data.pickle"
        data_raw = data_path.read_bytes()
        if hashlib.sha256(data_raw).hexdigest() != ASSETS["word_data.pickle"]:
            raise ValueError("Recording checksum differs from the recovered source")
        data = pickle.loads(data_raw)
        features = np.asarray(data["data"], dtype=np.float32)
        fixture = {"features": features.tolist(), "probabilities": model.predict_proba(features).tolist()}
        args.parity_out.parent.mkdir(parents=True, exist_ok=True)
        args.parity_out.write_text(json.dumps(fixture, separators=(",", ":"), allow_nan=False))
    print(f"Exported {len(trees)} trees and {len(result['labels'])} labels to {args.out}")


if __name__ == "__main__":
    main()
