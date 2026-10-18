# Model v2 Human QA

## Phase 1 / Tasks 1.3-1.4 - Physical webcam and two-person call

**Missing prerequisite:** Automated tests used mocked MediaPipe detectors and canvas contexts. A person signing on the target laptops and a second call participant are required to verify real model accuracy, overlay alignment and runtime FPS.

From the repository root, prepare ignored local runtime assets and start the web app:

```powershell
python web/scripts/setup_assets.py
npm --prefix web run dev -- --host 127.0.0.1
```

**Target paths and expected output:** The asset script prepares `web/public/models/hand_landmarker.task`, `web/public/models/pose_landmarker_lite.task`, `web/public/models/face_landmarker.task` and local WASM runtime files. These generated runtime assets remain ignored. At the printed local URL, inspect `#/bench` and `#/record`: both hands should have green/blue skeletons aligned with the mirrored preview, and pose anchors should follow nose/shoulders. Record bench FPS with face enabled/disabled on target hardware (goals: >=24 FPS GPU, >=18 FPS CPU). In `#/call`, join a test room with another participant, enable signer recognition, verify 0/1/2-hand status and overlay, and confirm a known shared/personal sign still yields a reviewed suggestion and reaches the other participant when sent. Live calls require the normal local server/provider setup.

No recording or dataset file is required as a QA artifact. Report observed browser/hardware, FPS, alignment and recognition results; automated tests do not establish these measurements.

**Resume automated verification:**

```powershell
npm --prefix web run fixtures
python -m pytest -q ml/tests/test_parity.py
npm --prefix web test
npm --prefix web run lint
npm --prefix web run build
```

Phase 1 code checks have passed. This QA note does not authorize starting Phase 2 or deployment.
