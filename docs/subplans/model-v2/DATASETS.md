# ASL Dataset Discovery, Verification & Strategy (`DATASETS.md`)

**Verification Date:** October 18, 2026  
**Scope:** Primary-source audit of publicly available American Sign Language (ASL) video and pre-extracted landmark datasets across six categories: (a) Isolated signs, (b) Fingerspelling, (c) Continuous/sentence-level signing, (d) Pre-extracted landmarks/keypoints, (e) Conversational/dialogue & interpreted ASL, and (f) Sign dictionaries, community-sourced collections, Kaggle competitions, and Hugging Face hubs.

---

## 1. Master Dataset Comparison Table

All links below were verified against primary sources (official project pages, arXiv papers, GitHub repositories, Microsoft Download Center, Kaggle, and Hugging Face) on **2026-10-18**.

| Dataset Name | Category | Modality | Classes / Vocab | Clips / Seq | Signers | Hours | Size (GB) | Exact License | Commercial Safe? | Access Method | Fit (Iso / FS / Cont / 2H) |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- | :---: | :--- | :---: |
| **[Google GISLR (asl-signs)](https://www.google.com/search?q=https%3A%2F%2Fwww.kaggle.com%2Fcompetitions%2Fasl-signs%2Fdata)** | (a), (d), (f) | Pre-extracted MediaPipe Holistic Parquet | 250 signs | 94,477 | 21 | ~65 h | 39.6 GB | `CC BY 4.0` | **YES** | Kaggle CLI (login + rules accept) | **5 / 1 / 2 / 5** |
| **[Google ASLFR (asl-fingerspelling)](https://www.google.com/search?q=https%3A%2F%2Fwww.kaggle.com%2Fcompetitions%2Fasl-fingerspelling%2Fdata)** | (b), (d), (f) | Pre-extracted MediaPipe Holistic Parquet | 59 chars (A–Z, 0–9, punct) | 67,287 | ~100 | ~120 h | 46.5 GB *(12.4 GB `.npy`)* | `CC BY 4.0` | **YES** | Kaggle CLI (or `darraghdog` `.npy` mirror) | **1 / 5 / 3 / 4** |
| **[FSboard (Full Release)](https://www.google.com/search?q=https%3A%2F%2Farxiv.org%2Fabs%2F2407.15806)** | (b), (d), (f) | RGB Video + MediaPipe Holistic | 59 chars (3.2M chars) | 151,000 | 147 | 266 h | ~250 GB | `CC BY 4.0` | **YES** | Google Research / Kaggle subset | **1 / 5 / 3 / 4** |
| **[ASL Citizen (v1.0)](https://www.google.com/search?q=https%3A%2F%2Fwww.microsoft.com%2Fen-us%2Fresearch%2Fproject%2Fasl-citizen%2F)** | (a), (f) | RGB MP4 Video (Webcam) | 2,731 signs | 83,399 | 52 | ~60 h | 42.8 GB | `Microsoft Research Data License` | **NO** (Research Only) | Direct `wget` from Microsoft Download Center | **5 / 1 / 2 / 5** |
| **[PopSign ASL (v1.0 \& v2.1)](https://www.google.com/search?q=https%3A%2F%2Fsigndata.cc.gatech.edu%2Fview%2Fdatasets%2Fpopsign_v1_0%2Findex.html)** | (a), (f) | RGB MP4 Video (Smartphone) | 250 (v1.0) / 563 (v2.1) | 200,686 (v1.0) | 47 | 128 h | 1,100 GB | `CC BY 4.0` | **YES** | Direct Open Access (`signdata.cc.gatech.edu`) | **5 / 1 / 1 / 5** |
| **[How2Sign + How2Sign Holistic](https://www.google.com/search?q=https%3A%2F%2Fhuggingface.co%2Fdatasets%2FPSewmuthu%2FHow2Sign_Holistic)** | (c), (d), (e) | RGB + 3D Pose + MediaPipe Holistic `.npy` | ~16,000 words | 36,783 sentences | 11 | 79–83 h | 33.8 GB (`.npy` on HF) | `CC BY-NC 4.0` *(HF wrapper MIT)* | **NO** (Non-Commercial) | Direct HF CLI (`PSewmuthu/How2Sign_Holistic`) | **2 / 2 / 5 / 5** |
| **[ChicagoFSWild \& Wild+](https://www.google.com/search?q=https%3A%2F%2Fttic.edu%2Flivescu%2FChicagoFSWild.htm)** | (b) | Cropped JPEG frame sequences + BBox | 31 chars | 7,304 / 55,232 | 160 / 260 | 2 h / 14 h | 14 GB / 82 GB | Custom Academic Research Notice | **NO** (Research Only) | Direct HTTP `.tgz` download | **1 / 4 / 3 / 3** |
| **[WLASL + Voxel51 HF Mirror](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2Fdxli94%2FWLASL)** | (a), (f) | RGB MP4 Video + OpenPose/TGCN splits | 2,000 signs | 21,083 *(11,980 live)* | 119 | ~14 h | 5.5 GB (HF mirror) | `C-UDA-1.0` | **NO** (Academic Only) | HF `Voxel51/WLASL` or `yt-dlp` scraper | **3 / 1 / 1 / 4** |
| **[Sem-Lex Benchmark](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2Fleekezar%2FSemLex)** | (a), (f) | RGB MP4 Video | 3,149 signs | 91,148 (84k clean) | 41 | ~65 h | ~45 GB | Code `Apache-2.0`; Data ToU Form | **NO** (Research Only) | Gated ToU Agreement Form on GitHub | **4 / 1 / 1 / 4** |
| **[MS-ASL](https://www.google.com/search?q=https%3A%2F%2Fwww.microsoft.com%2Fen-us%2Fresearch%2Fproject%2Fms-asl%2F)** | (a) | YouTube URLs + BBox JSON | 1,000 signs | 25,513 *(~50% dead)* | 222 | 24.6 h | ~12 GB | `C-UDA-1.0` | **NO** (Academic Only) | JSON download + YouTube scraper | **2 / 1 / 1 / 3** |
| **[DailyMoth-70h (ssvp\_slt)](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2Ffacebookresearch%2Fssvp_slt)** | (c), (e) | Cropped 224×224 MP4 (blurred/unblurred) | 19,694 words | 48,386 clips | 1 | 75.8 h | ~45 GB | `CC BY-NC 4.0` | **NO** (Non-Commercial) | Direct script in Meta `ssvp_slt` GitHub | **1 / 2 / 4 / 3** |
| **[OpenASL](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FchevalierNoir%2FOpenASL)** | (c), (e) | TSV + BBox JSON + YouTube scraper | 33,000 words | 98,417 sentences | ~220 | 288 h | ~150 GB | `CC BY-NC-ND 4.0` | **NO** (No Derivatives) | GitHub TSV + `yt-dlp` (`prep/download.py`) | **1 / 2 / 4 / 3** |
| **[YouTube-ASL](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2Fgoogle-research%2Fgoogle-research%2Fblob%2Fmaster%2Fyoutube_asl%2FREADME.md)** | (c), (e) | YouTube Video IDs Only | 60,000 words | 610,193 captions | >2,500 | 984 h | ~800 GB | `CC BY 4.0` (IDs) / YouTube ToS | **NO** (YouTube ToS) | Video ID list + custom `yt-dlp` crawler | **1 / 2 / 4 / 3** |
| **[BU ASLLRP (ASLLVD \& NCSLGR)](https://www.google.com/search?q=https%3A%2F%2Fwww.bu.edu%2Fasllrp%2Fav%2Fdai-asllvd.html)** | (a), (c), (e), (f) | Multi-view RGB `.mov` + SignStream XML/XLSX | 3,314 signs / 1,920 cont | 9,794 iso / 3,050 cont | 6 iso / 4 cont | ~10 h | ~18 GB | `BU ASLLRP Terms` (Research Only) | **NO** (Research Only) | Direct HTTP via BU / Rutgers DAI | **3 / 2 / 4 / 4** |
| **[ASL-LEX 2.0](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FASL-LEX%2Fasl-lex)** | (f) | Lexical/Phonological CSV + Ref Video | 2,723 signs | 2,723 | 1 | ~1.5 h | 0.05 GB | `CC BY-NC 4.0` | **NO** (Non-Commercial) | Direct GitHub / Web CSV download | **4 / 1 / 1 / 4** |
| **[Kaggle ASL Alphabet](https://www.google.com/search?q=https%3A%2F%2Fwww.kaggle.com%2Fdatasets%2Fgrassknoted%2Fasl-alphabet)** | (b), (f) | Static 200×200 RGB Images | 29 classes (A–Z, spc, del) | 87,000 images | 1 | N/A | 1.1 GB | `GPL 2.0` | **NO** (Viral GPL 2.0) | Kaggle CLI (`grassknoted/asl-alphabet`) | **1 / 2 / 1 / 1** |

---

## 2. Per-Dataset Verification Profiles

### 2.1 Google – Isolated Sign Language Recognition (`kaggle-gislr` / PopSign v1.0 Subset)
- **Owner / Institution:** Google Research, Georgia Institute of Technology, and Deaf Professional Arts Network (DPAN).
- **Primary URL:** [https://www.kaggle.com/competitions/asl-signs/data](https://www.google.com/search?q=https%3A%2F%2Fwww.kaggle.com%2Fcompetitions%2Fasl-signs%2Fdata) (Checked `2026-10-18`, link works).
- **Download URL / Command:** `kaggle competitions download -c asl-signs`
- **Content Type & Scale:** Pre-extracted MediaPipe Holistic landmarks for **isolated signs**; **250 classes** (MacArthur-Bates Communicative Development Inventories everyday concepts); **94,477 clips**; **21 distinct Deaf signers**; ~65 hours total (~1–2 seconds/clip at 30 fps); extracted from 1944×2592 portrait Pixel 4a smartphone videos.
- **Annotation Type:** Single sign gloss per clip (`train.csv` columns: `path, participant_id, sequence_id, sign`; `sign_to_prediction_index_map.json`).
- **License & Usage Terms:** **`CC BY 4.0` (Creative Commons Attribution 4.0 International)** (verified via PopSign v1.0 official data card at [signdata.cc.gatech.edu](https://www.google.com/search?q=https%3A%2F%2Fsigndata.cc.gatech.edu%2Fview%2Fdatasets%2Fpopsign_v1_0%2Findex.html) and `plan/context.md:19`). Commercial use, redistribution, and derivative models are **explicitly permitted** with attribution.
- **Access Method:** Requires a free Kaggle account, clicking "I Understand and Accept" on the competition rules page once, and running the Kaggle CLI with `~/.kaggle/kaggle.json`. Self-contained archive (zero dead links).
- **Download Size & Format:** **39.6 GB** compressed `.zip` (~57 GB uncompressed) containing 94,477 Apache Parquet files (`543` rows per frame: `468` face, `33` pose, `21` left_hand, `21` right_hand with `x, y, z`). Note: Does not fit on a 20 GB local disk if unzipped, **but `ml/gislr_to_features.py` streams directly from the `.zip` without extracting**, and it is pre-mounted for free inside Kaggle Notebooks at `/kaggle/input/asl-signs` (0 GB local storage needed).
- **Known Problems:**
  1. Parquet files omit video width/height (`w, h`); because videos were shot in portrait (~3:4 aspect ratio, `w/h ≈ 0.75`), `x` coordinates must be scaled by `0.75` before computing Euclidean distances against landscape `640×480` (`w/h = 1.333`) webcam frames.
  2. Missing core conversational pronouns/interrogatives (`ME`, `YOU`, `NAME`, `WHAT`, `DEAF`, `MEET`, `AGAIN`), which are not in the 250-word CDI toddler list.
  3. Frames where a hand is not detected contain `NaN` rows.
- **Signer Diversity:** 21 paid, consenting fluent Deaf signers recruited by DPAN (parent PopSign v1.0 has 34 right-handed and 13 left-handed signers across 47 signers, spanning diverse ages and geographic regions).
- **Fit Scores (1–5):**
  - **Isolated Signs: 5/5** — Clean labels, 378 clips/sign average, and pre-extracted MediaPipe landmarks matching our browser runtime.
  - **Fingerspelling: 1/5** — Contains lexical signs only, no alphabet sequences.
  - **Continuous Signing: 2/5** — Single signs only, though useful for synthetic multi-sign concatenation pretraining.
  - **Two-Hand Landmarks: 5/5** — Includes full `left_hand` (21×3), `right_hand` (21×3), and `pose` (33×3) coordinates per frame.

### 2.2 Google – American Sign Language Fingerspelling Recognition (`kaggle-aslfr` / FSboard Subset)
- **Owner / Institution:** Google Research, Georgia Tech, Rochester Institute of Technology (RIT), Tulane University, and DPAN ([Georg et al., arXiv:2407.15806](https://www.google.com/search?q=https%3A%2F%2Farxiv.org%2Fhtml%2F2407.15806v1)).
- **Primary URL:** [https://www.kaggle.com/competitions/asl-fingerspelling/data](https://www.google.com/search?q=https%3A%2F%2Fwww.kaggle.com%2Fcompetitions%2Fasl-fingerspelling%2Fdata) (Checked `2026-10-18`, link works).
- **Download URL / Command:**
  - Official Parquet: `kaggle competitions download -c asl-fingerspelling`
  - Preprocessed Compact NumPy Mirror (from 1st-place solution repo [ChristofHenkel/kaggle-asl-fingerspelling-1st-place-solution](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FChristofHenkel%2Fkaggle-asl-fingerspelling-1st-place-solution)): `kaggle datasets download -d darraghdog/asl-fingerspelling-preprocessing-train-dataset`
- **Content Type & Scale:** Pre-extracted MediaPipe Holistic landmarks for **continuous fingerspelling of words and phrases** (names, street addresses, phone numbers, URLs, and 500 MacKenzie phrases); **59 character classes** (`a-z`, `0-9`, space, and symbols); **67,287 sequences** in the Kaggle release (**151,000 sequences / 3.2M characters / 266 hours / 147 Deaf signers** in the full [FSboard](https://www.google.com/search?q=https%3A%2F%2Farxiv.org%2Fhtml%2F2407.15806v1) paper); 30 fps.
- **Annotation Type:** Character-level string sequence (`phrase` column in `train.csv` and `supplemental_metadata.csv`) plus `participant_id`.
- **License & Usage Terms:** **`CC BY 4.0` (Creative Commons Attribution 4.0 International)** (verified in [arXiv:2407.15806v1](https://www.google.com/search?q=https%3A%2F%2Farxiv.org%2Fhtml%2F2407.15806v1) abstract: *"We publicly release FSboard at this link under a CC BY 4.0 license"*). Commercial use, redistribution, and derivative models are **allowed** with attribution.
- **Access Method:** Kaggle CLI after accepting competition rules, or direct Kaggle dataset download of the preprocessed `.npy` shards (`darraghdog/asl-fingerspelling-preprocessing-train-dataset`, no competition rule click required). Zero dead links.
- **Download Size & Format:** Official competition archive is **46.5 GB** (sharded multi-sequence Parquet files where each file holds ~1,000 sequences); the hand/lip-filtered `.npy` mirror (`darraghdog`) is **12.4 GB**, which **fits on typical free-tier storage** (e.g., Google Colab / Kaggle 20 GB disk).
- **Known Problems:**
  1. Recorded one-handed while holding or propping a Pixel 4a smartphone, creating occasional steep downward camera angles and button-press transitions at clip starts/ends.
  2. Some noisy timestamp boundaries from the recording app (cleaned via 3-round ByT5 bootstrapping in FSboard, with residual boundary noise in ~5–10% of clips).
- **Signer Diversity:** 147 paid, consenting Deaf signers recruited via DPAN; human-annotated Monk Skin Tone ratings cover mid-range tones well (slightly fewer at extreme lightest/darkest ends); 64.4% feminine-presenting, 35.6% masculine-presenting ([FSboard §3.4](https://www.google.com/search?q=https%3A%2F%2Farxiv.org%2Fhtml%2F2407.15806v1)).
- **Fit Scores (1–5):**
  - **Isolated Signs: 1/5** — Fingerspelling and numbers only.
  - **Fingerspelling: 5/5** — Largest fingerspelling dataset in existence by >10×, covering A–Z (including dynamic J/Z), numbers 0–9, double-letter bounces, and co-articulated names/words.
  - **Continuous Signing: 3/5** — Continuous character sequences teach temporal CTC/seq2seq alignment, though not lexical ASL sentences.
  - **Two-Hand Landmarks: 4/5** — Provides full 543-point MediaPipe Holistic landmarks (ASL fingerspelling is 1-handed, with left/right hand dominance captured across signers).

### 2.3 ASL Citizen (Version 1.0)
- **Owner / Institution:** Microsoft Research, Boston University, University of Washington, and RIT ([Desai et al., NeurIPS 2023, arXiv:2304.05934](https://www.google.com/search?q=https%3A%2F%2Farxiv.org%2Fhtml%2F2304.05934)).
- **Primary URL:** [https://www.microsoft.com/en-us/research/project/asl-citizen/](https://www.google.com/search?q=https%3A%2F%2Fwww.microsoft.com%2Fen-us%2Fresearch%2Fproject%2Fasl-citizen%2F) (Checked `2026-10-18`, link works).
- **Download URL:**
  - Direct CLI: `wget https://download.microsoft.com/download/b/8/8/b88c0bae-e6c1-43e1-8726-98cf5af36ca4/ASL_Citizen.zip`
  - Web Portal: [https://www.microsoft.com/en-us/download/details.aspx?id=105253](https://www.google.com/search?q=https%3A%2F%2Fwww.microsoft.com%2Fen-us%2Fdownload%2Fdetails.aspx%3Fid%3D105253)
  - Baseline Code & Checkpoints: [https://github.com/microsoft/ASL-citizen-code](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2Fmicrosoft%2FASL-citizen-code) (`MIT License`)
- **Content Type & Scale:** Crowdsourced **isolated sign videos** filmed on home webcams; **2,731 sign classes** (mapped 1:1 to ASL-LEX 2.0); **83,399 videos** (~30.5 videos/sign); **52 Deaf and hard-of-hearing signers**; ~60 hours; typically `640×480` @ 30 fps.
- **Annotation Type:** Gloss + standardized `ASL-LEX` EntryID + `participant_id` + pre-defined signer-independent splits (`train`: 40,154 videos / 35 signers; `val`: 10,304 videos / 6 signers; `test`: 32,941 videos / 11 signers).
- **License & Usage Terms:** **`Microsoft Research Data License Agreement (Research Use Only)`** ([datasheet](https://www.google.com/search?q=https%3A%2F%2Fwww.microsoft.com%2Fen-us%2Fresearch%2Fproject%2Fasl-citizen%2Fdatasheet%2F) and [project page](https://www.google.com/search?q=https%3A%2F%2Fwww.microsoft.com%2Fen-us%2Fresearch%2Fproject%2Fasl-citizen%2F): *"Yes, the dataset will be published under a license that permits use for research purposes... If you are interested in commercial use, please contact ASL_Citizen@microsoft.com"*). Note that while the arXiv paper text is CC BY 4.0 and the GitHub code is MIT, the **video dataset itself is Research-Only** and explicitly prohibits developing technology that purports to replace human interpreters.
- **Access Method:** Direct unauthenticated `wget` from `download.microsoft.com` (zero login, zero forms, 100% self-contained, zero dead links).
- **Download Size & Format:** **42.8 GB** `ASL_Citizen.zip` + **5.0 KB** `Demographics.zip`. Requires ~45 GB during landmark extraction; once converted to `32 × 174` `float32` tensors (`83,399 × 32 × 174 × 4` bytes), the cached feature file is only **1.86 GB**, which easily fits on free-tier storage.
- **Known Problems:**
  1. Raw videos only (requires ~4–6 hours on an 8-core machine or GPU to run MediaPipe Holistic/Hand+Pose extraction once).
  2. Self-recorded padding varies at clip start/end (handled automatically by `clipFeatures()` hand-presence trimming in `web/src/lib/features.ts:80-82`).
  3. 593 videos have background blurring applied by Microsoft to redact third parties or personal items.
- **Signer Diversity:** 52 fluent signers (49 Deaf, 3 hard of hearing; 32 female, 20 male; ages 20–72, mean 36.2 yrs; 16 U.S. states; mean 30 years of ASL experience). Handedness is not explicitly tabulated per clip (`UNVERIFIED` per-clip handedness metadata, handled automatically by our `canonicalize()` motion rule).
- **Fit Scores (1–5):**
  - **Isolated Signs: 5/5** — Gold-standard webcam isolated sign dataset (2,731 signs, IRB-consented, unseen-signer splits, 63.1% Top-1 / 86.1% Top-5 / 90.9% Top-10 baseline).
  - **Fingerspelling: 1/5** — Lexical dictionary signs only.
  - **Continuous Signing: 2/5** — Isolated signs only; datasheet explicitly notes continuous signing requires additional modeling for coarticulation.
  - **Two-Hand Landmarks: 5/5** — Landscape webcam framing captures full upper body and both hands clearly for MediaPipe extraction.

### 2.4 How2Sign & How2Sign Holistic (`how2sign-holistic`)
- **Owner / Institution:** Universitat Politècnica de Catalunya (UPC), Carnegie Mellon University, Meta AI, and Boston University ([Duarte et al., CVPR 2021](https://www.google.com/search?q=https%3A%2F%2Fhow2sign.github.io%2F)); MediaPipe Holistic `.npy` dataset curated by `PSewmuthu` on Hugging Face.
- **Primary URL:** [https://how2sign.github.io/](https://www.google.com/search?q=https%3A%2F%2Fhow2sign.github.io%2F) (Checked `2026-10-18`, link works).
- **Download URLs:**
  - Pre-extracted MediaPipe Holistic Landmarks (Hugging Face): [https://huggingface.co/datasets/PSewmuthu/How2Sign\_Holistic](https://www.google.com/search?q=https%3A%2F%2Fhuggingface.co%2Fdatasets%2FPSewmuthu%2FHow2Sign_Holistic) (`33.8 GB`)
  - Official B-F-H 2D Keypoints & RGB Clips: [https://how2sign.github.io/](https://www.google.com/search?q=https%3A%2F%2Fhow2sign.github.io%2F) (Frontal 2D Keypoints: Train `21 GB`, Val `1.2 GB`, Test `1.6 GB`; Frontal RGB Clips: Train `31 GB`, Val `1.7 GB`, Test `2.2 GB`; Re-aligned English CSVs: `~6.3 MB`).
- **Content Type & Scale:** **Continuous sentence-level ASL** instructional videos (parallel to the spoken English How2 dataset) with **pre-extracted MediaPipe Holistic landmarks**; **36,783 sentence clips** (~16,000 English vocabulary words); **11 fluent signers**; **79–83 hours**; recorded at `1280×720` @ 30 fps in a multiview green-screen studio.
- **Annotation Type:** Sentence-level English translations with manually re-aligned start/end timestamps (`how2sign_realigned_train.csv`, `val.csv`, `test.csv`). Note: Full manual gloss annotations are not included in the public CSVs ([2026 Survey Table 5](https://www.google.com/search?q=https%3A%2F%2Farxiv.org%2Fhtml%2F2606.19352v1)).
- **License & Usage Terms:** **`CC BY-NC 4.0` (Creative Commons Attribution-NonCommercial 4.0 International)** on the [official How2Sign website](https://www.google.com/search?q=https%3A%2F%2Fhow2sign.github.io%2F) (*"This dataset is publicly available for research purposes only... You may NOT use the material for commercial purposes"*). Note: Although the Hugging Face card (`PSewmuthu/How2Sign_Holistic`) lists `mit`, the underlying data is bound by How2Sign's `CC BY-NC 4.0` license.
- **Access Method:** Direct download via Hugging Face CLI (`hf download PSewmuthu/How2Sign_Holistic --repo-type dataset`) or direct script/links on `how2sign.github.io`. No form approval wait; zero dead links.
- **Download Size & Format:** **33.8 GB** on Hugging Face (`.npy` files for both `frontal/` and `side/` views; downloading only `frontal/` + `metadata/` via `hf download --include "metadata/*" --include "*/frontal/*"` requires **~16.9 GB**, fitting within a 20 GB budget).
- **Known Problems:**
  1. Only **11 signers** in a uniform green-screen studio (models trained solely on How2Sign overfit to these 11 body proportions).
  2. Lacks frame-level gloss labels in the main splits, requiring either pseudo-gloss labeling (using our Stage C isolated sign classifier as a teacher) or direct gloss-free/CTC sequence training.
- **Signer Diversity:** 11 fluent/native ASL signers (demographic breakdown partially reported in paper; low count limits demographic breadth).
- **Fit Scores (1–5):**
  - **Isolated Signs: 2/5** — Unsegmented sentences without frame-exact gloss boundaries.
  - **Fingerspelling: 2/5** — Contains incidental fingerspelling embedded in sentences, not isolated for character training.
  - **Continuous Signing: 5/5** — Best accessible continuous ASL dataset with clean re-aligned sentence boundaries and pre-extracted MediaPipe Holistic landmarks.
  - **Two-Hand Landmarks: 5/5** — High-resolution frontal studio capture provides occlusion-free two-hand, pose, and face landmarks.

### 2.5 PopSign ASL (v1.0 & v2.1 Full Video Corpus)
- **Owner / Institution:** Georgia Institute of Technology & DPAN ([Starner et al., NeurIPS 2023](https://www.google.com/search?q=https%3A%2F%2Fproceedings.neurips.cc%2Fpaper_files%2Fpaper%2F2023%2Ffile%2F00dada608b8db212ea7d9d92b24c68de-Paper-Datasets_and_Benchmarks.pdf)).
- **Primary URL:** [https://signdata.cc.gatech.edu/view/datasets/popsign\_v1\_0/index.html](https://www.google.com/search?q=https%3A%2F%2Fsigndata.cc.gatech.edu%2Fview%2Fdatasets%2Fpopsign_v1_0%2Findex.html) (Checked `2026-10-18`, v1.0 page works; v2.1 sign list indexed on sidebar).
- **Content Type & Scale:** **Isolated sign smartphone videos**; v1.0 has **250 signs**, **200,686 total videos** (165,198 validated game videos + variant videos), **47 signers**, **128 hours**; v2.1 expands vocabulary by 313 signs to **563 signs**.
- **License & Usage Terms:** **`CC BY 4.0`** (Commercial use, redistribution, and derivative models **allowed**).
- **Access Method & Size:** Open access via `signdata.cc.gatech.edu`, **1.1 TB** raw MP4 video. Because `kaggle-gislr` already provides pre-extracted MediaPipe landmarks for 94,477 PopSign v1.0 clips in 39.6 GB, only download PopSign v2.1 videos if expanding the commercial-safe vocabulary from 250 to 563 signs.
- **Fit Scores (Iso / FS / Cont / 2H):** **5 / 1 / 1 / 5** — Commercial-safe CC BY 4.0 isolated sign corpus with explicit handedness reporting (34 right-handed, 13 left-handed signers).

### 2.6 ChicagoFSWild & ChicagoFSWild+
- **Owner / Institution:** TTI-Chicago and University of Chicago ([Shi et al., SLT 2018 / ICCV 2019](https://www.google.com/search?q=https%3A%2F%2Fttic.edu%2Flivescu%2FChicagoFSWild.htm)).
- **Primary URL:** [https://ttic.edu/livescu/ChicagoFSWild.htm](https://www.google.com/search?q=https%3A%2F%2Fttic.edu%2Flivescu%2FChicagoFSWild.htm) (Checked `2026-10-18`, link works).
- **Download URLs:** `https://dl.ttic.edu/ChicagoFSWild.tgz` (**14 GB**) and `https://dl.ttic.edu/ChicagoFSWildPlus.tgz` (**82 GB**).
- **Content Type & Scale:** In-the-wild **continuous fingerspelling clips** cropped from online ASL videos; `ChicagoFSWild` has **7,304 sequences** across **160 signers** (~2 hours, avg 5.5 chars/clip); `ChicagoFSWild+` has **55,232 sequences** across **260 signers** (~14 hours); **31 character classes**; average resolution `640×360`.
- **Annotation Type:** Processed character strings (`label_proc`), raw annotator transcripts (`label_raw`), signer ID, train/dev/test partition, hand bounding boxes (`HandAnnotation.csv`), and **explicit hand dominance** (`ChicagoFSWild`: 6,782 right-handed, 522 left-handed, 121 two-handed; `ChicagoFSWild+`: 86.9% right-handed, 10.6% left-handed, 2.5% other).
- **License & Usage Terms:** Custom academic release notice on TTIC page (*"released publicly in the interest of improving digital interfaces for signers... and computer vision research"*); commercial status `UNVERIFIED` / restricted (Google's FSboard paper explicitly notes they could not evaluate on ChicagoFSWild+ due to licensing restrictions). Treat as **Research-Only**.
- **Access Method & Size:** Direct HTTP `.tgz` download (`14 GB` base fits on free tier; `82 GB` Plus requires ~100 GB). Self-contained JPEG frames (no YouTube link rot).
- **Known Problems:** Low web video resolution and motion blur during rapid in-sentence fingerspelling; human annotator CER is 13.9%–17.3% when viewed without surrounding sentence context.
- **Fit Scores (Iso / FS / Cont / 2H):** **1 / 4 / 3 / 3** — Excellent secondary benchmark and Plan B fallback for Stage B fingerspelling on landscape webcams.

### 2.7 WLASL (Word-Level ASL) & Voxel51 Hugging Face Mirror
- **Owner / Institution:** Australian National University & Data61-CSIRO ([Li et al., WACV 2020](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2Fdxli94%2FWLASL)).
- **Primary URL:** [https://github.com/dxli94/WLASL](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2Fdxli94%2FWLASL) and Hugging Face Mirror: [https://huggingface.co/datasets/Voxel51/WLASL](https://www.google.com/search?q=https%3A%2F%2Fhuggingface.co%2Fdatasets%2FVoxel51%2FWLASL) (Checked `2026-10-18`, both links work).
- **Content Type & Scale:** **Isolated sign videos** scraped from 20 ASL dictionary/tutorial websites and YouTube; **2,000 sign classes** (subsets `WLASL100`, `WLASL300`, `WLASL1000`, `WLASL2000`); originally **21,083 clips** across **119 signers** (~14 hours at 25 fps), of which **11,980 clips (56.8%)** survive in the self-contained **5.5 GB** `Voxel51/WLASL` Hugging Face dataset.
- **Annotation Type:** Gloss (`WLASL_v0.3.json`), YOLOv3 bounding box, start/end frames, `signer_id`, and `variation_id` (dialect).
- **License & Usage Terms:** **`C-UDA-1.0` (Computational Use of Data Agreement v1.0)** — Strictly academic and computational use only; **no commercial use allowed** (`README.md`: *"All the WLASL data is intended for academic and computational use only. No commercial usage is allowed"*).
- **Known Problems:**
  1. **Severe Link Rot:** ~43.2% of original video URLs are dead; requesting missing videos via the author's Google Form (`docs.google.com/forms/d/e/1FAIpQLSc3yHyAranhpkC9ur_Z-Gu5gS5M0WnKtHV07Vo6eL6nZHzruw/viewform`) takes 7+ days or goes unanswered. Use `Voxel51/WLASL` (5.5 GB) if needed immediately.
  2. **Signer Overlap in Default Splits:** As proved in the [ASL Citizen paper (§5.2)](https://www.google.com/search?q=https%3A%2F%2Farxiv.org%2Fhtml%2F2304.05934), WLASL's default splits leak signers between train and test; when evaluated on truly unseen signers, WLASL-2000 I3D top-1 accuracy collapses from `32.48%` to **`8.49%`**.
  3. Scraped without explicit contributor consent.
- **Fit Scores (Iso / FS / Cont / 2H):** **3 / 1 / 1 / 4** — Useful only as a lightweight (`5.5 GB`) research Plan B if ASL Citizen cannot be downloaded.

### 2.8 The Sem-Lex Benchmark
- **Owner / Institution:** USC, Boston University, Gallaudet University, SDSU ([Kezar et al., ASSETS 2023](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2Fleekezar%2FSemLex)).
- **Primary URL:** [https://github.com/leekezar/SemLex](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2Fleekezar%2FSemLex) (Checked `2026-10-18`, link works).
- **Content Type & Scale:** **Isolated sign videos**; **3,149 ASL signs**; **91,148 videos** (84k+ in cleaned benchmark); **41 Deaf signers**; aligned with ASL-LEX 2.0 phonological properties and ASL SignBank. Can be combined with ASL Citizen for **174k total videos**.
- **License & Access Method:** Repository code is `Apache-2.0`, but downloading the video data requires completing a manual Terms of Use Agreement Form linked on the GitHub README (Research Use Only). Pre-extracted pose files are listed as *"available soon"* on the repo.
- **Fit Scores (Iso / FS / Cont / 2H):** **4 / 1 / 1 / 4** — High-quality research expansion to ASL Citizen, but blocked by manual form approval and raw video extraction.

### 2.9 MS-ASL (Microsoft American Sign Language Dataset)
- **Owner / Institution:** Microsoft Research ([Vaezi Joze \& Koller, BMVC 2019](https://www.google.com/search?q=https%3A%2F%2Fwww.microsoft.com%2Fen-us%2Fresearch%2Fproject%2Fms-asl%2F)).
- **Primary URL:** [https://www.microsoft.com/en-us/research/project/ms-asl/](https://www.google.com/search?q=https%3A%2F%2Fwww.microsoft.com%2Fen-us%2Fresearch%2Fproject%2Fms-asl%2F) and [https://microsoft.github.io/data-for-society/dataset?d=MS-ASL-American-Sign-Language-Dataset](https://www.google.com/search?q=https%3A%2F%2Fmicrosoft.github.io%2Fdata-for-society%2Fdataset%3Fd%3DMS-ASL-American-Sign-Language-Dataset) (Checked `2026-10-18`, links work).
- **Content Type & Scale:** **Isolated sign annotations** on public YouTube videos; **1,000 classes** (`MS-ASL100/200/500/1000`); **25,513 samples**; **222 signers**; **24h 39m**; signer-independent splits.
- **License & Access Method:** **`C-UDA-1.0`** (Non-commercial research only). Ships only JSON URLs/timestamps; ~45–50% of the 2018 YouTube videos are now deleted, private, or geo-blocked.
- **Fit Scores (Iso / FS / Cont / 2H):** **2 / 1 / 1 / 3** — Superseded by Microsoft's own direct-download `ASL Citizen` dataset; do not waste compute scraping broken MS-ASL links.

### 2.10 DailyMoth-70h (`facebookresearch/ssvp_slt`)
- **Owner / Institution:** Meta FAIR, University of Copenhagen, UC Berkeley, and The Daily Moth ([Rust et al., August 2024, arXiv:2402.09611v2](https://www.google.com/search?q=https%3A%2F%2Farxiv.org%2Fhtml%2F2402.09611v2)).
- **Primary URL:** [https://github.com/facebookresearch/ssvp\_slt](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2Ffacebookresearch%2Fssvp_slt) (Checked `2026-10-18`, link works).
- **Content Type & Scale:** **Continuous ASL news signing** obtained under license from [The Daily Moth](https://www.google.com/search?q=https%3A%2F%2Fwww.dailymoth.com%2F); **48,386 segmented clips** (`75.8 hours`, mean `5.6 s` and `8.6 words` per clip) from **1 native Deaf signer** (white, male, early middle-aged); **19,694 English vocabulary words**; cropped `224×224` @ 24–30 fps (both face-blurred and unblurred versions provided, with burned-in captions blurred out).
- **License & Access Method:** **`CC BY-NC 4.0`** (Non-commercial research only). Self-contained download via `facebookresearch/ssvp_slt` (~45 GB).
- **Fit Scores (Iso / FS / Cont / 2H):** **1 / 2 / 4 / 3** — Clean, self-contained continuous ASL-to-English parallel corpus (28.8 BLEU-4 SOTA), ideal for testing sequence translation heads, though single-signer composition requires multi-signer pretraining elsewhere.

### 2.11 OpenASL
- **Owner / Institution:** TTI-Chicago and University of Chicago ([Shi et al., EMNLP 2022](https://www.google.com/search?q=https%3A%2F%2Faclanthology.org%2F2022.emnlp-main.427%2F); repo updated July 22, 2025 to use `yt-dlp`).
- **Primary URL:** [https://github.com/chevalierNoir/OpenASL](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FchevalierNoir%2FOpenASL) (Checked `2026-10-18`, link works).
- **Content Type & Scale:** **Continuous open-domain ASL** mined from YouTube (DailyMoth, Sign1News, NAD); **98,417 sentence clips** (`288 hours`); **~220 signers** (83% right-handed, 17% left-handed); **33,000 English vocabulary words**; includes person bounding boxes (`data/bbox-v1.0.json`).
- **License & Access Method:** **`CC BY-NC-ND 4.0` (Attribution-NonCommercial-NoDerivatives 4.0)**. Requires running `python prep/download.py --tsv data/openasl-v1.0.tsv` with `yt-dlp` (~150 GB; ~15–20% link rot). Because `ND` prohibits distributing derivative works, use OpenASL strictly for internal benchmarking, never for distributed weights.
- **Fit Scores (Iso / FS / Cont / 2H):** **1 / 2 / 4 / 3** — Large multi-signer continuous corpus, but restricted by `CC BY-NC-ND 4.0` and YouTube scraping.

### 2.12 YouTube-ASL & YouTube-SL-25
- **Owner / Institution:** Google Research ([Uthus, Tanzer, Georg, NeurIPS 2023, arXiv:2306.15162](https://www.google.com/search?q=https%3A%2F%2Farxiv.org%2Fabs%2F2306.15162); [YouTube-SL-25, July 2024, arXiv:2407.11144](https://www.google.com/search?q=https%3A%2F%2Farxiv.org%2Fhtml%2F2407.11144v1)).
- **Primary URL:** [https://github.com/google-research/google-research/blob/master/youtube\_asl/README.md](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2Fgoogle-research%2Fgoogle-research%2Fblob%2Fmaster%2Fyoutube_asl%2FREADME.md) (Checked `2026-10-18`, link works).
- **Content Type & Scale:** **984 hours** of continuous open-domain ASL across **11,093 YouTube videos**, **610,193 English captions**, **>2,500 signers**, **60,000 words**.
- **License & Access Method:** Metadata list is `CC BY 4.0`, but **only raw YouTube video IDs are released** (no video files, timestamps, or pre-extracted landmarks). Scraping 11,093 videos (~800 GB) violates YouTube ToS in commercial contexts, hits severe rate limits/link rot, and requires massive compute (64 A100 GPUs for 2 weeks in [Rust et al. 2024](https://www.google.com/search?q=https%3A%2F%2Farxiv.org%2Fhtml%2F2402.09611v2)).
- **Fit Scores (Iso / FS / Cont / 2H):** **1 / 2 / 4 / 3** — Impractical for single-GPU / low-cost training; use `How2Sign Holistic` (`PSewmuthu/How2Sign_Holistic`) instead.

### 2.13 Boston University ASLLRP: ASLLVD & NCSLGR / SignStream 3
- **Owner / Institution:** Boston University, Rutgers University, and UT Arlington ([Neidle et al., 2012–2026](https://www.google.com/search?q=https%3A%2F%2Fwww.bu.edu%2Fasllrp%2Fav%2Fdai-asllvd.html)).
- **Primary URL:** [https://www.bu.edu/asllrp/av/dai-asllvd.html](https://www.google.com/search?q=https%3A%2F%2Fwww.bu.edu%2Fasllrp%2Fav%2Fdai-asllvd.html) and [https://www.bu.edu/asllrp/signstream/3/](https://www.google.com/search?q=https%3A%2F%2Fwww.bu.edu%2Fasllrp%2Fsignstream%2F3%2F) (Checked `2026-10-18`, links work).
- **Content Type & Scale:**
  - **ASLLVD (Isolated):** **9,794 tokens** across **3,314 lexical signs** (2,793 monomorphemic) filmed with **6 native ASL signers** at 60 fps (`640×480` front, side, face close-up, plus `1600×1200` @ 30 fps).
  - **NCSLGR / SignStream 3 (Continuous & Conversational):** **3,050 continuous utterances** (**27,378 sign tokens**) across **4 native signers** with fine-grained linguistic tiers for start/end handshapes, compound morphemes, and **non-manual grammatical markers** (`Q-YN` brow raise, `Q-WH` brow furrow, `NEG` headshake).
- **License & Usage Terms:** **BU ASLLRP Terms of Use** — Research and education only; **no commercial use, no redistribution, and no patents/copyrights based on the material**.
- **Fit Scores (Iso / FS / Cont / 2H):** **3 / 2 / 4 / 4** — Too few signers (4–6) to train a general visual backbone, but the linguistic annotations in NCSLGR are ideal for validating our Stage D non-manual grammatical marker rules (`web/src/lib/nmm.ts`).

### 2.14 Related Resources: Sign Dictionaries, Community Collections & Static Alphabet Sets
1. **[ASL-LEX 2.0](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FASL-LEX%2Fasl-lex) (`https://asl-lex.org/`):** Checked `2026-10-18` (Works). `CC BY-NC 4.0`. Contains **2,723 signs** with canonical `EntryID`s, subjective frequency ratings, iconicity, lexical class, and phonological parameters (handshape, location, movement, 1-handed vs. 2-handed symmetry). **Fit: 4 / 1 / 1 / 4** — Essential Rosetta Stone for vocabulary merging and phonological validation.
2. **[Kaggle ASL Alphabet (grassknoted/asl-alphabet)](https://www.google.com/search?q=https%3A%2F%2Fwww.kaggle.com%2Fdatasets%2Fgrassknoted%2Fasl-alphabet):** Checked `2026-10-18` (Works). `GPL 2.0`. **87,000 static `200×200` RGB images** across 29 classes (`A–Z`, `SPACE`, `DELETE`, `NOTHING`), **1.1 GB**. **Fit: 1 / 2 / 1 / 1** — **Do NOT use for primary training:** static images cannot represent dynamic letters `J` and `Z`, have near-zero signer diversity, and carry a viral `GPL 2.0` license.
3. **[ASL-Homework-RGBD](https://www.google.com/search?q=https%3A%2F%2Faclanthology.org%2F2022.signlang-1.11%2F) (RIT, Hassan et al. 2022):** Checked `2026-10-18`. `CC BY-NC-ND 4.0`. 935 continuous homework videos from 45 fluent and non-fluent signers. Restricted (`ND`) and requires author request; not recommended over How2Sign Holistic.
4. **Online ASL Video Dictionaries ([Lifeprint / ASLU](https://www.google.com/search?q=https%3A%2F%2Fwww.lifeprint.com%2F), [Handspeak](https://www.google.com/search?q=https%3A%2F%2Fwww.handspeak.com%2F), [Signing Savvy](https://www.google.com/search?q=https%3A%2F%2Fwww.signingsavvy.com%2Ftermsofservice)):** Checked `2026-10-18` (Links work). All three are copyrighted educational reference sites whose Terms of Service **prohibit automated scraping, bulk downloading, or machine-learning dataset redistribution**. Use them strictly for **human visual reference** when verifying sign forms (as noted in `docs/setup-checklist.md:54-56`), never for automated scraping.

---

## 3. Unverified Leads (Do NOT Recommend or Use)

Per project rules, the following datasets were encountered in literature or secondary hubs (`SignLanguage-Dataset-Hub`, `arXiv:2606.19352v1`) but lacked an accessible primary download page, had broken/offline distribution servers, or had unverified ASL content as of `2026-10-18`. **Do not use these in any phase:**

1. **`ASL-Skeleton3D` & `ASL-Phono` (de Amorim & Zanchettin, arXiv:2201.02065, 2022):** Derived 3D skeletons from ASLLVD (9,747 samples, 6 signers), but no active, verified direct download repository or license separate from BU ASLLRP's non-redistribution terms could be confirmed.
2. **`3D-LEX v1.0` (ResearchGate 2024):** Mentions 3D lexicons for ASL and NGT, but no public direct-download repository URL or open license was verifiable.
3. **`ASLing` (Ananthanarayana et al., FG 2021):** 1,284 crowdsourced ASL clips from 7 signers; marked `Available: ✗` in the [2026 UW Survey (Table 19)](https://www.google.com/search?q=https%3A%2F%2Farxiv.org%2Fhtml%2F2606.19352v1).
4. **`RWTH-BOSTON-50`, `RWTH-BOSTON-104`, & `RWTH-BOSTON-400` (Dreuw et al., 2007–2008):** Tiny early lab datasets (3–5 signers, 201–843 sentences, low resolution); `RWTH-BOSTON-400` is unavailable (`✗` in 2026 Survey Table 19) and superseded by BU ASLLRP / How2Sign.
5. **`Purdue RVL-SLLL` (Martínez et al., 2002) & `CopyCat` (Zafrulla et al., 2010):** Unavailable online (`Contact Author` / `✗` in 2026 Survey Tables 16 & 19).

---

## 4. Recommended Dataset Strategy & Ranked Shortlist by Stage

### 4.1 Ranked Shortlist by Stage

| Stage | Rank #1 Primary Dataset (Recommended) | Rank #2 Supplement / Expansion | Plan B Fallback (If Primary Unavailable) |
| :--- | :--- | :--- | :--- |
| **Stage A: Two-Hand + Holistic Tracking** | **First-Party Recorder Fixtures (`web/scripts/fake-sessions.ts` + `#/record`)** & **Kaggle GISLR Sample** | — | Synthetic 7-case parity suite (`web/scripts/export-fixtures.ts` → `ml/tests/fixtures/parity.json`, 0 MB network needed). |
| **Stage B: Fingerspelling (A–Z, 0–9 & Words)** | **1. Kaggle Google ASLFR (`asl-fingerspelling` / `darraghdog` `.npy` mirror)** — 67,287 sequences, 59 chars, ~100 signers, pre-extracted MediaPipe landmarks, `CC BY 4.0` (**Commercial-Safe**). | **2. First-Party `#/record` Letter Holds + Dynamic J/Z Clips** — 3–5 signers × 10 reps for domain calibration. | **Plan B:** **ChicagoFSWild (`14 GB` direct `.tgz`)** — No Kaggle login needed; extract MediaPipe landmarks locally (`Research-Only`). |
| **Stage C: Large-Vocabulary Isolated Signs** | **1. Tier C1 (Commercial Core, 250+ signs): Kaggle GISLR (`asl-signs`)** — 94,477 pre-extracted MediaPipe Holistic clips, 250 signs, 21 Deaf signers, `CC BY 4.0` + consented `#/record` clips for `ME, YOU, NAME, WHAT, _idle`. | **2. Tier C2 (Research Lexicon, 1,000–2,731 signs): ASL Citizen v1.0** — 83,399 webcam videos, 2,731 signs, 52 signers, direct `wget` (`42.8 GB`), merged with GISLR via `ASL-LEX 2.0` IDs (**Research-Only**). | **Plan B (Commercial):** Stream extra signs from **PopSign v2.1** (`signdata.cc.gatech.edu`, `CC BY 4.0`).<br>**Plan B (Research):** **Voxel51/WLASL** on Hugging Face (`5.5 GB`, 11,980 clips). |
| **Stage D: Continuous Signing & Gloss Translation** | **1. Synthetic Multi-Sign Concatenation of GISLR / ASL Citizen** (with smooth cubic-spline inter-sign transition interpolation + `_idle` padding, `CC BY 4.0` for GISLR) **+ How2Sign Holistic (`PSewmuthu/How2Sign_Holistic`)** (`33.8 GB` pre-extracted `.npy` on HF, 36,783 sentences, `CC BY-NC 4.0`). | **2. DailyMoth-70h (`ssvp_slt`)** & **BU NCSLGR** — For SLT text-decoder tuning and non-manual marker (`Q-YN`, `Q-WH`, `NEG`) rule validation. | **Plan B:** Train the CTC / boundary-segmenter head exclusively on **synthetically concatenated GISLR + first-party continuous sequences** (100% commercial-safe, zero extra download). |
| **Stage E: Real-Time In-Call Performance** | **Held-Out Real Webcam Evaluation Suite (`data/eval_webcam/`)** recorded on target laptops (`640×480 @ 30fps`) across varied lighting, distances, and skin tones. | **ASL Citizen Unseen Test Split (11 signers)** — Natural home webcam footage. | Synthetic browser benchmark harness (`web/scripts/check-camera-startup.mjs` + Web Worker latency benchmark). |

### 4.2 How to Combine Datasets: Vocabulary Merging, Label Normalization & Signer-Independent Splits

When combining **Kaggle GISLR (250 signs)**, **ASL Citizen (2,731 signs)**, and **First-Party Recordings (`ME, YOU, NAME, WHAT, _idle`)** in Phase 2 (`ml/datasets/vocab_merge.py`):

1. **Canonical Namespace via `ASL-LEX 2.0` `EntryID`:**
   - ASL Citizen's 2,731 glosses already use `ASL-LEX 2.0` identifiers (e.g., `HELLO`, `THANK_YOU`, `MORNING`).
   - Map all 250 lowercase smashed GISLR labels (`thankyou` → `THANKYOU`, `callonphone` → `CALL_ON_PHONE`, `minemy` → `MY`, `weus` → `WE`, `hesheit` → `IX_3P`, `gopotty` → `TOILET`) to their exact `ASL-LEX 2.0` `EntryID` via a deterministic lookup table (`ml/datasets/label_map.json`).
   - **Phonological Verification Check:** Before merging a GISLR class and an ASL Citizen class that share an English word (homonyms like `CLOSE` [near vs. shut] or `RUN` [jog vs. faucet]), cross-check `ASL-LEX 2.0`'s `Handshape` and `MajorLocation` columns and verify one sample clip per dataset. If the two datasets signed different lexical variants (as ASL Citizen's paper did when finding 1,075 exact matches with WLASL), keep them as distinct variant IDs (`CLOSE_1`, `CLOSE_2`) during visual classification and collapse them to the same English word only in the downstream language layer (`signLabels.ts` / `/api/gloss`).
2. **Handling Duplicates & Class Imbalance:**
   - GISLR has ~378 clips/sign (`94,477 / 250`), whereas ASL Citizen has ~30.5 clips/sign (`83,399 / 2,731`).
   - When training a combined model, cap GISLR to at most `--max-per-sign 150` per epoch or use **class-balanced focal / square-root sampling** (`w_c = 1 / sqrt(N_c)`) so the 250 GISLR classes do not drown out the 2,481 ASL Citizen-only classes.
3. **Strict Signer-Independent Splitting (`GroupKFold` by Prefixed `signer_id`):**
   - Prefix every signer ID with its dataset namespace (`gislr:26734`, `asl_citizen:P12`, `aslfr:104`, `own:signer-01`).
   - **Never allow any clip from a validation or test signer into the training set.**
   - Preserve ASL Citizen's official unseen-signer split (`35 train / 6 val / 11 test` signers) and FSboard's official unseen-signer split (`117 train / 15 val / 15 test` signers). For GISLR (21 signers), hold out 3 signers (`every 7th signer`) for validation and 3 signers for test.

### 4.3 Total Storage and Compute Budget (Cheapest Workable Configuration)

Because we prioritize datasets that **already ship pre-extracted MediaPipe Holistic landmarks** (`kaggle-gislr`, `kaggle-aslfr`, `How2Sign_Holistic`), we save hundreds of GPU-hours of video decoding:

| Configuration | Datasets Used | Peak Disk Needed | Cached Feature Size (`X.f32`) | Preprocessing Time (8-core CPU) | Training Time (1× RTX 3060 12GB or Free Colab T4) | Total Cloud Cost |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Config 1: Commercial Default (Stages A + B + C1 + D-Synthetic)** | `kaggle-gislr` (streamed from 39.6 GB zip) + `kaggle-aslfr` (`darraghdog` 12.4 GB `.npy` mirror) + `own` recordings | **55 GB** *(or **< 15 GB** if converted inside a free Kaggle Notebook)* | **3.2 GB** (`2.1 GB` GISLR + `1.1 GB` ASLFR) | **~35 mins** (reading Parquet/NPY only, zero video decoding) | **~1.5 hours** (`40 epochs` GISLR CNN/Conformer + `30 epochs` ASLFR CTC) | **$0.00** (Runs on local RTX 3060 or free Kaggle/Colab T4) |
| **Config 2: Full Research Scale (Adds Stage C2 2,731 Signs + Stage D How2Sign)** | Config 1 + `ASL Citizen` (42.8 GB MP4 streamed in chunks) + `How2Sign_Holistic` frontal (`16.9 GB` `.npy`) | **75 GB** (deleting raw MP4 chunks after landmark extraction) | **7.8 GB** total (`+1.9 GB` ASL Citizen + `2.7 GB` How2Sign) | **~5.5 hours** (MediaPipe extraction on 83k ASL Citizen videos; 20 mins for How2Sign `.npy`) | **~4.5 hours** (`60 epochs` 2,731-class backbone + `40 epochs` continuous CTC head) | **$0.00 – $3.50** (Local RTX 3060 or ~6 hrs on a $0.50/hr spot L4/A10G GPU) |

---

## 5. Licensing Risk Summary

| Dataset | Exact License | Commercial Deployment Allowed? | Can Redistribute Raw Data? | Can Ship Trained Model Weights Publicly? | Verdict for SignLine |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Kaggle GISLR (`asl-signs`)** | `CC BY 4.0` | **YES** | Yes (with attribution) | **YES** (with attribution) | **SAFE TO SHIP (Default Commercial Model)** |
| **Kaggle ASLFR / FSboard** | `CC BY 4.0` | **YES** | Yes (with attribution) | **YES** (with attribution) | **SAFE TO SHIP (Default Fingerspelling Model)** |
| **PopSign v1.0 & v2.1** | `CC BY 4.0` | **YES** | Yes (with attribution) | **YES** (with attribution) | **SAFE TO SHIP (Commercial Expansion)** |
| **First-Party `#/record` Clips** | `MIT` (Consented) | **YES** | Keep raw landmarks private | **YES** | **SAFE TO SHIP** |
| **ASL Citizen v1.0** | `MSR Data License` | **NO** (without written MSR permission) | No | Research-only weights | **RESEARCH TIER ONLY** |
| **How2Sign / How2Sign Holistic** | `CC BY-NC 4.0` | **NO** | Yes (Non-Commercial) | Research-only weights | **RESEARCH TIER ONLY** |
| **DailyMoth-70h (`ssvp_slt`)** | `CC BY-NC 4.0` | **NO** | Yes (Non-Commercial) | Research-only weights | **RESEARCH TIER ONLY** |
| **ASL-LEX 2.0** | `CC BY-NC 4.0` | **NO** (for media/content) | Yes (Non-Commercial) | Used only for gloss ID mapping | **SAFE FOR ID MAPPING / RESEARCH** |
| **ChicagoFSWild / Wild+** | Custom Academic | **NO** (`UNVERIFIED` commercial) | No | Research-only weights | **RESEARCH TIER ONLY** |
| **WLASL / MS-ASL** | `C-UDA-1.0` | **NO** | No | No commercial weights | **RESEARCH FALLBACK ONLY** |
| **OpenASL** | `CC BY-NC-ND 4.0` | **NO** | No | **NO** (`NoDerivatives`) | **DO NOT SHIP WEIGHTS** |
| **Kaggle ASL Alphabet** | `GPL 2.0` | Copyleft viral risk | Yes (under GPL 2.0) | Viral GPL 2.0 ambiguity | **DO NOT USE** |

---

## 6. Plain-Spoken Reality Check: What Is Realistically Needed for Conversation-Level ASL?

Per the prompt's instruction (*"state plainly which data exists for continuous signing, how limited it is, and what that means for the accuracy we can expect. Do not oversell."*):

1. **What Continuous ASL Data Actually Exists Today:**
   - Across the entire research field as of October 2026 ([Ni et al., arXiv:2606.19352v1](https://www.google.com/search?q=https%3A%2F%2Farxiv.org%2Fhtml%2F2606.19352v1)), only **four** sizable continuous ASL corpora exist: **How2Sign** (79 hours, 11 signers, studio green screen), **DailyMoth-70h** (75.8 hours, 1 signer, news broadcasts), **OpenASL** (288 hours, ~220 signers, YouTube news/vlogs under `CC BY-NC-ND 4.0`), and **YouTube-ASL** (984 hours, >2,500 signers, distributed only as raw YouTube video IDs).
   - Compare this to spoken English ASR (Whisper was trained on **680,000+ hours**) or LLM translation: continuous ASL has **~1,000× less labeled parallel data**, and **none** of the large continuous ASL datasets (`How2Sign`, `OpenASL`, `YouTube-ASL`, `DailyMoth-70h`) include frame-aligned manual gloss annotations across their full splits.
2. **Why Unconstrained Continuous ASL Is Structurally Harder Than Concatenated Isolated Signs:**
   - **Coarticulation & Movement Epenthesis:** In fluent conversation, the end handshape/location of sign $i$ blends directly into the start of sign $i+1$ without returning to a rest position. Models trained only on isolated dictionary clips suffer a 40–60% accuracy drop when fed unsegmented fluent signing.
   - **Depicting Verbs, Classifiers & Spatial Indexing:** Signers establish referents in 3D signing space (pointing to a locus for "my brother" or "the car") and inflect verbs directionally across that space. Fixed gloss vocabularies cannot represent productive spatial classifiers.
   - **Non-Manual Grammar:** Eyebrows, eye gaze, head tilt/shake, torso shift (role shift), and mouth morphemes carry essential syntax (negation, conditionals, topicalization, questions).
3. **What Accuracy We Can Realistically Expect (Without Overselling):**
   - **Published State-of-the-Art Ceiling:** Even when Meta FAIR ([Rust et al., August 2024](https://www.google.com/search?q=https%3A%2F%2Farxiv.org%2Fhtml%2F2402.09611v2)) pretrained a Vision Transformer (`SignHiera`) on 1,000 hours of `YouTube-ASL` + `How2Sign` using **64 A100 GPUs for two weeks** and fine-tuned a 248M-parameter `T5` model, the best gloss-free translation score on `How2Sign` was **15.5 BLEU-4** (and Google's `YouTube-ASL`pose-to-T5 baseline achieved **12.39 BLEU-4**). At 15.5 BLEU-4, the model frequently gets the general topic right but hallucinates or swaps content verbs (e.g., translating *"load your still for distillation of lavender essential oil"* as *"feed the trail for draining clean for laborer oil"*).
   - **What Works Reliably in Our Product (Stages A–C + Constrained Stage D):**
     - **Fingerspelled names, words, and short phrases (Stage B):** **88%+ isolated letter accuracy** and **11%–18% CER** on continuous fingerspelling is genuinely achievable in real time from landmarks.
     - **Isolated & Paused-Sequence Signing (Stage C + Stage D Constrained):** Recognizing sequences of **250 to 1,000+ known signs** when the signer signs clearly with brief (~200–350 ms) pauses or rhythmic phrasing between signs—combined with eyebrow/headshake grammar tags (`Q-YN`, `Q-WH`, `NEG`) and **Top-3 lattice rescoring via Gemini `/api/gloss`**—realistically achieves **80%–85% Top-1 (92%+ Top-5) on the 250-sign core vocabulary** and **60%–65% Top-1 (85%+ Top-5) on the 1,000–2,731-sign extended vocabulary**.
     - **UI Honesty:** Because open-domain fluent signing cannot be translated at interpreter-grade accuracy by any current model, SignLine's UI must surface interactive **Top-3 candidate chips**, **confidence gating**, and a 1-click **"That was wrong" retraction button**, positioning the feature as an **assisted sign-to-caption communication tool**, never a replacement for a certified human ASL interpreter.
