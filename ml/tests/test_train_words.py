"""Stdlib unittest checks for ml/train_words.py (run: python -m unittest discover -s ml/tests -v)."""
from __future__ import annotations

import contextlib
import copy
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import train_words as tw  # noqa: E402

LABELS = ["ALPHA", "BETA", "GAMMA"]


def make_doc(signer: str, seed: int, per_label: int = 12) -> dict:
    rng = np.random.default_rng(seed)
    samples = []
    for k, label in enumerate(LABELS):
        for _ in range(per_label):
            features = rng.normal(0, 0.05, tw.DIMS)
            features[k * 10:k * 10 + 10] += 1.0  # separable by label
            samples.append({"label": label, "features": features.tolist(), "framesWithHand": 30,
                            "modelPrediction": {"label": label, "score": 0.9, "margin": 0.5, "accepted": True}})
    return {"version": 1, "kind": "signline-word-samples", "preprocessing": tw.PREPROCESSING,
            "frames": 30, "featuresPerFrame": 42, "signer": signer, "recordedAt": "2026-01-01T00:00:00Z",
            "modelSha256": None, "samples": samples}


class LoaderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def write(self, doc: object, name: str = "a.json") -> Path:
        path = self.dir / name
        path.write_text(json.dumps(doc), encoding="utf-8")
        return path

    def test_good_file(self) -> None:
        data = tw.load_sample_file(self.write(make_doc("ann", 1)))
        self.assertEqual(data.features.shape, (36, tw.DIMS))
        self.assertEqual(set(data.signers), {"ann"})

    def test_bad_files(self) -> None:
        def mutate(change):
            doc = make_doc("ann", 1, 2)
            change(doc)
            return doc
        cases = {
            "kind": lambda d: d.update(kind="other"),
            "version": lambda d: d.update(version=2),
            "preprocessing": lambda d: d.update(preprocessing="raw"),
            "frames": lambda d: d.update(frames=31),
            "featuresPerFrame": lambda d: d.update(featuresPerFrame=21),
            "signer": lambda d: d.update(signer=""),
            "label": lambda d: d["samples"][3].update(label="hello"),
            "features must be a list": lambda d: d["samples"][3].update(features=[0.0] * 10),
            "finite": lambda d: d["samples"][3]["features"].__setitem__(5, float("nan")),
            "framesWithHand": lambda d: d["samples"][3].update(framesWithHand=1.5),
        }
        for needle, change in cases.items():
            with self.subTest(needle):
                path = self.write(mutate(change), "bad.json")
                with self.assertRaises(ValueError) as caught:
                    tw.load_sample_file(path)
                self.assertIn(needle, str(caught.exception))
                self.assertIn("bad.json", str(caught.exception))
                if needle in {"label", "features must be a list", "finite", "framesWithHand"}:
                    self.assertIn("sample 3", str(caught.exception))

    def test_range_and_bool(self) -> None:
        for value in (31, -1, True):
            doc = make_doc("ann", 1, 2)
            doc["samples"][0]["framesWithHand"] = value
            with self.assertRaises(ValueError):
                tw.load_sample_file(self.write(doc))
        doc = make_doc("ann", 1, 2)
        doc["samples"][0]["features"][0] = True
        with self.assertRaises(ValueError):
            tw.load_sample_file(self.write(doc))

    def test_not_json(self) -> None:
        path = self.dir / "x.json"
        path.write_text("{nope", encoding="utf-8")
        with self.assertRaises(ValueError):
            tw.load_sample_file(path)

    def test_collect_skips_candidate(self) -> None:
        self.write(make_doc("ann", 1, 1), "one.json")
        self.write({}, "trained-words.candidate.json")
        self.assertEqual([p.name for p in tw.collect_files([self.dir], set())], ["one.json"])


class TrainTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = tempfile.TemporaryDirectory()
        cls.dir = Path(cls.tmp.name)
        (cls.dir / "in").mkdir()
        for seed, signer in ((1, "ann"), (2, "bob")):
            (cls.dir / "in" / f"{signer}.json").write_text(json.dumps(make_doc(signer, seed)), encoding="utf-8")
        # a recording with too few hand frames must be dropped
        low = make_doc("cy", 3, 1)
        low["samples"][0]["framesWithHand"] = 10
        (cls.dir / "in" / "cy.json").write_text(json.dumps(low), encoding="utf-8")
        cls.out = cls.dir / "in" / "trained-words.candidate.json"
        cls.parity = cls.dir / "parity.json"
        cls.report = cls.dir / "report.json"

    @classmethod
    def tearDownClass(cls) -> None:
        cls.tmp.cleanup()

    def run_main(self, *extra: str) -> str:
        argv = ["train_words.py", str(self.dir / "in"), "--trees", "15", "--min-per-label", "10",
                "--out", str(self.out), "--parity-out", str(self.parity), "--report-out", str(self.report),
                "--baseline", str(self.dir / "missing.json"), *extra]
        buffer = io.StringIO()
        old = sys.argv
        sys.argv = argv
        try:
            with contextlib.redirect_stdout(buffer):
                tw.main()
        finally:
            sys.argv = old
        return buffer.getvalue()

    def test_end_to_end(self) -> None:
        text = self.run_main()
        self.assertIn("dropped 1", text)
        self.assertIn("Leave-one-signer-out", text)
        model = json.loads(self.out.read_text())
        tw.check_browser_forest(model)
        self.assertEqual(model["labels"], LABELS)
        self.assertEqual(model["trainedOn"]["signers"], 3)
        self.assertNotIn("ann", json.dumps(model["trainedOn"]))
        self.assertIsNone(model["sourceCommit"])
        report = json.loads(self.report.read_text())
        self.assertGreaterEqual(report["cv"]["accuracy"], 0.95)
        self.assertGreaterEqual(report["leaveOneSignerOut"]["pooled"]["accuracy"], 0.95)

    def test_numpy_traversal_matches_sklearn(self) -> None:
        self.run_main()
        model = json.loads(self.out.read_text())
        fixture = json.loads(self.parity.read_text())
        actual = tw.forest_probabilities(model, np.asarray(fixture["features"]))
        np.testing.assert_allclose(actual, np.asarray(fixture["probabilities"]), rtol=0, atol=1e-12)

    def test_baseline_evaluation(self) -> None:
        self.run_main()
        data = tw.load_sample_file(self.dir / "in" / "ann.json")
        result = tw.evaluate_baseline(self.out, data)
        self.assertIsNotNone(result)
        self.assertEqual(result["samples"], 36)
        self.assertGreaterEqual(result["accuracy"], 0.95)

    def test_validator_rejects_bad_forest(self) -> None:
        self.run_main()
        good = json.loads(self.out.read_text())
        internal = next(i for i, n in enumerate(good["trees"][0]) if n["left"] != -1)
        cases = [
            lambda m: m["labels"].__setitem__(0, "bad label!"),
            lambda m: m.update(labels=m["labels"][:1]),
            lambda m: m["trees"][0][internal].update(left=0),  # backward edge
            lambda m: m["trees"][0][-1].update(votes=[0.0, 0.0, 0.0]),
            lambda m: m.update(trees=[]),
        ]
        for change in cases:
            model = copy.deepcopy(good)
            change(model)
            with self.assertRaises(ValueError):
                tw.check_browser_forest(model)

    def test_min_per_label_and_label_count(self) -> None:
        with self.assertRaises(SystemExit), contextlib.redirect_stderr(io.StringIO()):
            self.run_main("--min-per-label", "100")


if __name__ == "__main__":
    unittest.main()
