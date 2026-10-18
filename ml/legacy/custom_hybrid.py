import os
import pickle
import cv2
import mediapipe as mp
import numpy as np
from collections import deque, Counter
import time
import math
from sklearn.ensemble import RandomForestClassifier

# ==========================================
# SKETCHBOOK & REALISTIC NATURE PALETTE (BGR)
# ==========================================
PAPER_BG = (225, 238, 245)       # Creamy notebook paper off-white
RULED_LINE = (235, 215, 195)     # Light cyan/blue horizontal ruled lines
MARGIN_RED = (120, 110, 225)     # Margin pinkish-red
INK_BLACK = (30, 35, 35)         # Dark charcoal ink
PENCIL_GRAY = (100, 105, 110)    # Graphite gray
HIGHLIGHTER_YELLOW = (150, 245, 255) # Bright marker yellow

# Realistic Nature Colors
BARK_BROWN = (30, 45, 60)
LEAF_GREEN_1 = (40, 95, 30)
LEAF_GREEN_2 = (60, 120, 45)
VEIN_COLOR = (20, 60, 15)
CARDINAL_RED = (35, 40, 180)
BLUEJAY_BLUE = (190, 110, 50)
GOLDFINCH_YELLOW = (20, 180, 220)

FONT_SERIF = cv2.FONT_HERSHEY_TRIPLEX 
FONT_SANS = cv2.FONT_HERSHEY_SIMPLEX  

# ==========================================
# 1. LOAD MODELS & DATASETS
# ==========================================
print("\n[1/3] Loading Custom Word Model...")
WORD_MODEL_FILE = './word_model.p'
WORD_DATA_FILE = './word_data.pickle'

if os.path.exists(WORD_DATA_FILE):
    with open(WORD_DATA_FILE, 'rb') as f:
        saved_db = pickle.load(f)
    word_dataset = saved_db.get('data', [])
    word_labels = saved_db.get('labels', [])
else:
    word_dataset, word_labels = [], []

if os.path.exists(WORD_MODEL_FILE):
    with open(WORD_MODEL_FILE, 'rb') as f:
        word_model_dict = pickle.load(f)
    word_model = word_model_dict['model']
else:
    word_model = None

print("[2/3] Loading Alphabet Model...")
ALPHABET_MODEL_FILE = './model.p'
with open(ALPHABET_MODEL_FILE, 'rb') as f:
    alpha_model_dict = pickle.load(f)
alphabet_model = alpha_model_dict['model']

# ==========================================
# 2. SETUP MEDIAPIPE & CAMERA
# ==========================================
print("[3/3] Starting Camera & MediaPipe...")
mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils

custom_landmark_style = mp_drawing.DrawingSpec(color=INK_BLACK, thickness=1, circle_radius=2)
custom_connection_style = mp_drawing.DrawingSpec(color=PENCIL_GRAY, thickness=2)

hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=1,
    min_detection_confidence=0.6,
    min_tracking_confidence=0.6
)

cap = None
for idx in [0, 1]:
    temp_cap = cv2.VideoCapture(idx, cv2.CAP_AVFOUNDATION)
    if temp_cap.isOpened():
        ret, test_frame = temp_cap.read()
        if ret and test_frame is not None:
            cap = temp_cap
            break
        temp_cap.release()

if cap is None:
    print("Error: Could not access camera.")
    exit()

# ==========================================
# DRAWING HELPERS (NOTEBOOK & NATURE)
# ==========================================
def draw_notebook_paper(img, x1, y1, x2, y2):
    cv2.rectangle(img, (x1, y1), (x2, y2), PAPER_BG, -1)
    for y in range(y1 + 25, y2, 25):
        cv2.line(img, (x1, y), (x2, y), RULED_LINE, 1)
    margin_x = x1 + 50
    cv2.line(img, (margin_x, y1), (margin_x, y2), MARGIN_RED, 1)
    cv2.line(img, (margin_x + 5, y1), (margin_x + 5, y2), MARGIN_RED, 1)

def draw_realistic_leaf(img, center, angle, length, color):
    """Draws an angled, almond-shaped leaf with a central vein."""
    width = length // 3
    cv2.ellipse(img, center, (length, width), angle, 0, 360, color, -1)
    cv2.ellipse(img, center, (length, width), angle, 0, 360, VEIN_COLOR, 1)
    # Calculate vein endpoints using trigonometry
    rad = math.radians(angle)
    x1 = int(center[0] - length * math.cos(rad))
    y1 = int(center[1] - length * math.sin(rad))
    x2 = int(center[0] + length * math.cos(rad))
    y2 = int(center[1] + length * math.sin(rad))
    cv2.line(img, (x1, y1), (x2, y2), VEIN_COLOR, 1)

def draw_realistic_birds_and_branches(img, w, h):
    # --- Top Left Branch & Cardinal ---
    cv2.line(img, (0, 60), (120, 85), BARK_BROWN, 4)
    cv2.line(img, (50, 70), (90, 50), BARK_BROWN, 2)
    # Leaves
    draw_realistic_leaf(img, (40, 50), -30, 12, LEAF_GREEN_1)
    draw_realistic_leaf(img, (80, 40), -45, 15, LEAF_GREEN_2)
    draw_realistic_leaf(img, (110, 95), 20, 14, LEAF_GREEN_1)
    # Cardinal
    cx, cy = 90, 72
    cv2.ellipse(img, (cx, cy), (14, 25), -20, 0, 360, CARDINAL_RED, -1) # Body
    cv2.circle(img, (cx, cy - 18), 9, CARDINAL_RED, -1) # Head
    cv2.ellipse(img, (cx - 2, cy - 25), (4, 9), 10, 0, 360, CARDINAL_RED, -1) # Crest
    cv2.line(img, (cx - 3, cy + 20), (cx - 15, cy + 32), INK_BLACK, 2) # Tail
    cv2.circle(img, (cx - 3, cy - 19), 1, INK_BLACK, -1) # Eye
    cv2.circle(img, (cx + 5, cy - 19), 2, (10, 120, 195), -1) # Beak

    # --- Right Side Branch & Blue Jay ---
    cv2.line(img, (w, 140), (w - 110, 160), BARK_BROWN, 5)
    cv2.line(img, (w - 30, 145), (w - 80, 120), BARK_BROWN, 3)
    # Leaves
    draw_realistic_leaf(img, (w - 20, 120), 40, 16, LEAF_GREEN_1)
    draw_realistic_leaf(img, (w - 60, 105), 30, 14, LEAF_GREEN_2)
    draw_realistic_leaf(img, (w - 100, 175), -20, 15, LEAF_GREEN_1)
    # Blue Jay
    bjx, bjy = w - 80, 145
    cv2.ellipse(img, (bjx, bjy), (13, 23), 25, 0, 360, BLUEJAY_BLUE, -1) # Body
    cv2.circle(img, (bjx, bjy - 16), 8, BLUEJAY_BLUE, -1) # Head
    cv2.ellipse(img, (bjx + 1, bjy - 22), (3, 8), -15, 0, 360, BLUEJAY_BLUE, -1) # Crest
    cv2.ellipse(img, (bjx + 6, bjy + 2), (8, 14), 45, 0, 360, PAPER_BG, -1) # Belly
    cv2.line(img, (bjx + 5, bjy + 18), (bjx + 16, bjy + 30), INK_BLACK, 2) # Tail
    cv2.circle(img, (bjx + 3, bjy - 17), 1, INK_BLACK, -1) # Eye
    cv2.circle(img, (bjx - 4, bjy - 16), 2, INK_BLACK, -1) # Beak

    # --- Bottom Right Twig & Goldfinch ---
    cv2.line(img, (w, h - 80), (w - 90, h - 100), BARK_BROWN, 3)
    draw_realistic_leaf(img, (w - 40, h - 115), 45, 12, LEAF_GREEN_2)
    # Goldfinch
    gx, gy = w - 60, h - 110
    cv2.ellipse(img, (gx, gy), (11, 18), 35, 0, 360, GOLDFINCH_YELLOW, -1) # Body
    cv2.circle(img, (gx, gy - 12), 7, GOLDFINCH_YELLOW, -1) # Head
    cv2.ellipse(img, (gx + 4, gy + 3), (7, 12), -25, 0, 360, INK_BLACK, -1) # Wing
    cv2.line(img, (gx + 4, gy + 14), (gx + 12, gy + 22), INK_BLACK, 2) # Tail
    cv2.circle(img, (gx + 2, gy - 13), 1, INK_BLACK, -1) # Eye
    cv2.circle(img, (gx - 3, gy - 12), 2, (10, 120, 195), -1) # Beak

def draw_pencil_underline(img, pt1, pt2):
    cv2.line(img, pt1, pt2, PENCIL_GRAY, 2)
    cv2.line(img, (pt1[0], pt1[1]+2), (pt2[0]-5, pt2[1]+1), INK_BLACK, 1)

# ==========================================
# 3. MAIN HYBRID LOOP
# ==========================================
typed_sentence = ""
app_state = "LIVE" 
is_recording_inference = False
frames_buffer = []
current_prediction = "None"

prediction_window = deque(maxlen=7)
current_candidate = ""
candidate_start_time = None
HOLD_CONFIRM_SECONDS = 0.8  

target_new_word = ""
training_samples_done = 0
SEQUENCES_PER_WORD = 3  

print("\n--- 'SIGN LINE' SKETCHBOOK NATURE SYSTEM ---")

while True:
    ret, frame = cap.read()
    if not ret: continue
    
    frame = cv2.flip(frame, 1)
    H, W, _ = frame.shape
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    
    results = hands.process(rgb)

    # ---------------------------------------------------------
    # STATE: LIVE INFERENCE
    # ---------------------------------------------------------
    if app_state == "LIVE":
        draw_notebook_paper(frame, 0, 0, W, 85)
        
        # Render the realistic branches, leaves, and birds over the notebook
        draw_realistic_birds_and_branches(frame, W, H)

        cv2.putText(frame, "Sign Line", (70, 45), FONT_SERIF, 1.2, INK_BLACK, 2)
        draw_pencil_underline(frame, (70, 52), (240, 52))

        cv2.putText(frame, "Press [t] to Train", (W - 190, 45), FONT_SANS, 0.6, INK_BLACK, 1)
        draw_pencil_underline(frame, (W - 190, 52), (W - 35, 52))
        cv2.putText(frame, "Spelling (Hold) | Words (Space)", (70, 75), FONT_SANS, 0.5, PENCIL_GRAY, 1)

        if is_recording_inference:
            cv2.rectangle(frame, (60, 95), (450, 135), (200, 180, 255), -1) # Pink highlight
            cv2.putText(frame, f"RECORDING WORD... [{len(frames_buffer)}/30]", (70, 120), FONT_SERIF, 0.8, INK_BLACK, 1)
            
            frame_features = []
            if results.multi_hand_landmarks:
                hand_landmarks = results.multi_hand_landmarks[0]
                mp_drawing.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS, custom_landmark_style, custom_connection_style)
                base_x, base_y = hand_landmarks.landmark[0].x, hand_landmarks.landmark[0].y
                for lm in hand_landmarks.landmark:
                    frame_features.extend([lm.x - base_x, lm.y - base_y])
            else:
                frame_features = [0.0] * 42 
                
            frames_buffer.append(frame_features)
            
            if len(frames_buffer) >= 30:
                is_recording_inference = False
                if word_model is not None:
                    input_data = np.array(frames_buffer).flatten().reshape(1, -1)
                    probs = word_model.predict_proba(input_data)[0]
                    top_idx = np.argmax(probs)
                    confidence = probs[top_idx]
                    if confidence > 0.6:
                        word = word_model.classes_[top_idx]
                        current_prediction = f"{word} ({int(confidence*100)}%)"
                        typed_sentence += f" {word} " 
                    else:
                        current_prediction = "Uncertain"
                candidate_start_time = time.time() + 0.5 

        else:
            active_letter = ""
            if results.multi_hand_landmarks:
                hand_landmarks = results.multi_hand_landmarks[0]
                mp_drawing.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS, custom_landmark_style, custom_connection_style)
                x_, y_ = [lm.x for lm in hand_landmarks.landmark], [lm.y for lm in hand_landmarks.landmark]
                min_x, min_y = min(x_), min(y_)
                
                data_aux = []
                if alphabet_model.n_features_in_ == 63:
                    z_ = [lm.z for lm in hand_landmarks.landmark]
                    min_z = min(z_)
                    for lm in hand_landmarks.landmark: data_aux.extend([lm.x - min_x, lm.y - min_y, lm.z - min_z])
                else:
                    for lm in hand_landmarks.landmark: data_aux.extend([lm.x - min_x, lm.y - min_y])

                if len(data_aux) == alphabet_model.n_features_in_:
                    probs = alphabet_model.predict_proba([np.asarray(data_aux)])[0]
                    top_idx = np.argmax(probs)
                    raw_char = str(alphabet_model.classes_[top_idx]).strip()

                    if raw_char.lower() not in ["space", "del", "delete", "nothing", "none"]:
                        prediction_window.append(raw_char)
                    if len(prediction_window) > 0:
                        active_letter = Counter(prediction_window).most_common(1)[0][0]
                        if active_letter == current_candidate:
                            if candidate_start_time is not None:
                                elapsed = time.time() - candidate_start_time
                                bar_width = int((elapsed / HOLD_CONFIRM_SECONDS) * 150)
                                cv2.rectangle(frame, (70, 95), (70 + min(bar_width, 150), 105), HIGHLIGHTER_YELLOW, -1)
                                if elapsed >= HOLD_CONFIRM_SECONDS:
                                    typed_sentence += active_letter
                                    candidate_start_time = time.time() + 0.8 
                        else:
                            current_candidate = active_letter
                            candidate_start_time = time.time()

                        x1, y1 = max(0, int(min(x_) * W) - 20), max(0, int(min(y_) * H) - 20)
                        cv2.rectangle(frame, (x1, y1), (min(W, int(max(x_) * W) + 20), min(H, int(max(y_) * H) + 20)), INK_BLACK, 1)
                        cv2.putText(frame, active_letter, (x1, max(35, y1 - 10)), FONT_SERIF, 1.1, INK_BLACK, 2)
            else:
                current_candidate, candidate_start_time = "", None

    # ---------------------------------------------------------
    # STATE: TRAINING IDLE & RECORD
    # ---------------------------------------------------------
    elif app_state == "TRAIN_IDLE":
        draw_notebook_paper(frame, 0, 0, W, 100)
        draw_realistic_birds_and_branches(frame, W, H)
        cv2.putText(frame, f"Training Mode: '{target_new_word}' ({training_samples_done}/{SEQUENCES_PER_WORD})", (70, 45), FONT_SERIF, 0.9, INK_BLACK, 1)
        draw_pencil_underline(frame, (70, 52), (W - 70, 52))
        cv2.putText(frame, "Press [SPACE] to record sample | 'q' to cancel", (70, 80), FONT_SANS, 0.55, INK_BLACK, 1)

    elif app_state == "TRAIN_RECORD":
        frame_features = []
        if results.multi_hand_landmarks:
            hand_landmarks = results.multi_hand_landmarks[0]
            mp_drawing.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS, custom_landmark_style, custom_connection_style)
            base_x, base_y = hand_landmarks.landmark[0].x, hand_landmarks.landmark[0].y
            for lm in hand_landmarks.landmark: frame_features.extend([lm.x - base_x, lm.y - base_y])
        else:
            frame_features = [0.0] * 42 

        frames_buffer.append(frame_features)
        
        draw_notebook_paper(frame, 0, 0, W, 85)
        draw_realistic_birds_and_branches(frame, W, H)
        cv2.rectangle(frame, (60, 20), (450, 60), HIGHLIGHTER_YELLOW, -1)
        cv2.putText(frame, f"RECORDING '{target_new_word}' [{len(frames_buffer)}/30]", (70, 48), FONT_SERIF, 0.8, INK_BLACK, 1)

        if len(frames_buffer) >= 30:
            word_dataset.append(np.array(frames_buffer).flatten())
            word_labels.append(target_new_word)
            training_samples_done += 1
            
            if training_samples_done >= SEQUENCES_PER_WORD:
                with open(WORD_DATA_FILE, 'wb') as f: pickle.dump({'data': word_dataset, 'labels': word_labels}, f)
                clf = RandomForestClassifier(n_estimators=100, random_state=42)
                clf.fit(np.asarray(word_dataset), np.asarray(word_labels))
                with open(WORD_MODEL_FILE, 'wb') as f: pickle.dump({'model': clf}, f)
                word_model = clf 
                app_state = "LIVE"
            else:
                app_state = "TRAIN_IDLE"

    # ----------------------------------------
    # SHARED UI (BOTTOM BANNER)
    # ----------------------------------------
    draw_notebook_paper(frame, 0, H - 75, W, H)
    cv2.putText(frame, typed_sentence, (70, H - 30), FONT_SERIF, 0.8, INK_BLACK, 1)
    
    cv2.imshow("Sign Line Sketchbook ASL System", frame)
    
    key = cv2.waitKey(1) & 0xFF
    if key == ord('q'): 
        if app_state != "LIVE": app_state = "LIVE"
        else: break
    elif key == ord('t') and app_state == "LIVE": 
        target_new_word = input("\n[TRAINING] Type new word & press Enter: ").strip().upper()
        if target_new_word:
            training_samples_done = 0
            app_state = "TRAIN_IDLE"
    elif key == 32: 
        if app_state == "LIVE" and not is_recording_inference:
            is_recording_inference = True
            frames_buffer = []
            prediction_window.clear()
        elif app_state == "TRAIN_IDLE":
            app_state = "TRAIN_RECORD"
            frames_buffer = []
    elif key == 13 and app_state == "LIVE": typed_sentence += " "
    elif key in (8, 127) and app_state == "LIVE": typed_sentence = typed_sentence[:-1]
    elif key == ord('c') and app_state == "LIVE": typed_sentence = ""

cap.release()
cv2.destroyAllWindows()
