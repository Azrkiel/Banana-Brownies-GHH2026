# Recovered signer word model

The signer call uses the saved random forest from commit
`405afe03bae60eac7313f8d58dfa426b9d301862`. It recognizes only **DEMO, FOOD,
GOODBYE, HELLO, LISA, MY, NAME**. This is a small custom vocabulary, not continuous
ASL recognition. The dataset contains 105 samples, 15 per word; no held-out
accuracy has been established.

## Use it in the app

1. Run `npm --prefix web run setup:assets`, then start the API and web app using
   the root README. The hand model and WASM files must be available locally.
2. Join as **Signer**, complete the camera check, and join the conversation.
3. Under **Your trained signs**, choose **Enable sign recognition**.
4. Choose **Capture a sign** and sign one trained word over about one second,
   keeping one hand in the local preview.
5. Review the suggestion. **Add … to caption** puts it into your editable draft.
   Choose **Send** to share it. Nothing is sent or spoken automatically.

The app shares the call camera and never requests a microphone for this feature.
It mirrors each image before hand detection, then uses 30 frames of wrist-relative
x/y coordinates for 21 hand points, matching the recovered trainer's 1260-feature
layout. It requires at least 24 frames with a valid hand, a top model score of
0.6 and a 0.15 lead over the next label before offering a suggestion. These are
review gates, not measured accuracy targets. Uncertain samples leave typing
available. Stopping recognition closes its model but leaves the call camera on;
disconnect/navigation also cancels pending model loads and captures.

The numeric forest is shipped in `web/public/trained-words.json`; no Python,
pickle loading, backend inference, recording upload or retraining is needed in
the browser. Raw recordings are not included in the web bundle.

## Original training files

`legacy/train_words.py`, `legacy/custom_hybrid.py` and `legacy/requirements.txt`
are exact copies from the recovery commit. They are historical OpenCV desktop
programs, not browser modules. They use a Mac camera API and old MediaPipe APIs.
The archived requirements specify sklearn 1.2.0, but the saved model was produced
by **sklearn 1.9.1**. Use the separate exporter environment below to read it;
do not install the archived requirements into the API venv.

From the repository root, run:

```sh
python3 ml/fetch_legacy_assets.py
```

This recovers checksum-verified `word_model.p` and `word_data.pickle` into ignored
`data/legacy/`. It first reads retained Git history, then falls back to the same
immutable GitHub commit. It refuses to overwrite locally changed files. Raw
recordings remain out of new commits. If running an archived desktop program,
use `data/legacy` as its working directory so its relative output paths stay there.

The old `pretrained_asl` entry was only a Git reference, with no submodule URL or
alphabet `model.p`. Alphabet recognition is not included; the word model works
independently of that missing alphabet model.

## Reproduce the browser export

On macOS/Linux, from the repository root:

```sh
python3 -m venv ml/.venv
ml/.venv/bin/python -m pip install -r ml/requirements-export.txt
python3 ml/fetch_legacy_assets.py
ml/.venv/bin/python ml/export_words.py --parity-out data/legacy/word-parity.json
web/node_modules/.bin/tsx web/scripts/verify-word-parity.ts
```

On Windows PowerShell:

```powershell
py -3.12 -m venv ml/.venv
.\ml\.venv\Scripts\python.exe -m pip install -r ml\requirements-export.txt
.\ml\.venv\Scripts\python.exe ml\fetch_legacy_assets.py
.\ml\.venv\Scripts\python.exe ml\export_words.py --parity-out data\legacy\word-parity.json
.\web\node_modules\.bin\tsx.cmd web\scripts\verify-word-parity.ts
```

The exporter checks the original model's SHA256 before unpickling and rejects
sklearn version mismatches. Only load trusted models. For a replacement model
trained by you, explicitly supply its checksum with `--expected-sha256`. The
browser and API never accept pickle uploads.

The browser export matched sklearn probabilities on all 105 original samples
to floating-point precision. This proves inference parity, not recognition
accuracy on a new signer. The browser uses a newer MediaPipe detector than the
original recorder; real-camera checks with the trained signer remain necessary.
Browser lifecycle checks use synthetic camera/landmark inputs and a mocked
LiveKit connection. The canonical ONNX/GISLR roadmap remains separate.

## Retrain on new recordings

Record on the `#/train-words` page (one signer per file, 10+ samples per word, each
word signed over about one second with one hand in view). Save the downloads into
`data/words/` (ignored by Git). Then, from the repository root:

```powershell
# Windows PowerShell (one-time setup as above: ml\.venv + requirements-export.txt)
.\ml\.venv\Scripts\python.exe ml\train_words.py data\words --parity-out data\word-parity.json
.\web\node_modules\.bin\tsx.cmd web\scripts\verify-word-parity.ts data\word-parity.json data\words\trained-words.candidate.json
```

```sh
# macOS/Linux
ml/.venv/bin/python ml/train_words.py data/words --parity-out data/word-parity.json
web/node_modules/.bin/tsx web/scripts/verify-word-parity.ts data/word-parity.json data/words/trained-words.candidate.json
```

Useful flags: `--legacy` adds the 105 recovered samples (checksum-verified; run
`fetch_legacy_assets.py` first), `--trees`, `--seed`, `--min-per-label` (default 10),
`--baseline <model.json>`, `--report-out <file.json>`. Samples with fewer than 24
hand frames are dropped.

The trainer prints its report before fitting: sample counts, stratified
cross-validation (optimistic), leave-one-signer-out (the honest number for a new
person, needs 2+ signers), the share of samples the live gate would accept and the
accuracy among those, and the currently shipped model scored on the same new
recordings. Read it, and confirm the parity check prints `PASS`. Only then, if the
candidate beats the shipped model, copy it over by hand:

```powershell
Copy-Item data\words\trained-words.candidate.json web\public\trained-words.json
```

The trainer never writes to `web/public`. The candidate records only sample counts
(no signer names) in `trainedOn`, and `sourceSha256` hashes the input files. The
recordings and candidate stay out of commits.
