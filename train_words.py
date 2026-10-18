import os
import pickle
import cv2
import mediapipe as mp
import numpy as np
from sklearn.ensemble import RandomForestClassifier

# --- THE STREAMLINED HACKATHON LIST ---
# Only training exactly what you need for the pitch!
TARGET_WORDS = ['HELLO', 'MY', 'NAME', 'LISA', 'DEMO']

SEQUENCES_PER_WORD = 15  # 15 clean samples per word
FRAMES_PER_GESTURE = 30  # ~1 second of motion

mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles

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
            print(f"Connected to Mac camera at index {idx}!")
            break
        temp_cap.release()

if cap is None:
    print("Error: Could not access camera.")
    exit()

# Load existing progress so you never lose work
DATA_FILE = './word_data.pickle'
if os.path.exists(DATA_FILE):
    with open(DATA_FILE, 'rb') as f:
        saved_db = pickle.load(f)
    dataset = saved_db.get('data', [])
    labels = saved_db.get('labels', [])
    print(f"Loaded existing dataset with {len(dataset)} samples.")
else:
    dataset = []
    labels = []

trigger_record = False
def mouse_click(event, x, y, flags, param):
    global trigger_record
    if event == cv2.EVENT_LBUTTONDOWN:
        trigger_record = True

cv2.namedWindow("Word Recorder")
cv2.setMouseCallback("Word Recorder", mouse_click)

print("\n--- CUSTOM ASL MODEL TRAINER ---")
print("Target Word List:", TARGET_WORDS)
print("Tap [SPACE] to record. Press [q] to save & pause.\n")

for word in TARGET_WORDS:
    existing_count = labels.count(word)
    if existing_count >= SEQUENCES_PER_WORD:
        print(f"Word '{word}' already completed ({existing_count}/{SEQUENCES_PER_WORD}). Skipping.")
        continue

    print(f"\n==========================================")
    print(f"Current Target: '{word}' (Remaining: {SEQUENCES_PER_WORD - existing_count})")
    print(f"==========================================")

    while labels.count(word) < SEQUENCES_PER_WORD:
        seq_idx = labels.count(word)

        # 1. Idle state: wait for click or spacebar
        trigger_record = False
        while not trigger_record:
            ret, frame = cap.read()
            if not ret: continue
            frame = cv2.flip(frame, 1)

            cv2.rectangle(frame, (0, 0), (frame.shape[1], 85), (30, 30, 30), -1)
            cv2.putText(frame, f"Word: {word} ({seq_idx + 1}/{SEQUENCES_PER_WORD})", (20, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2, cv2.LINE_AA)
            cv2.putText(frame, "Press [SPACE] to record | 'q' to pause", (20, 68), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 200, 255), 2, cv2.LINE_AA)

            cv2.imshow("Word Recorder", frame)
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                cap.release()
                cv2.destroyAllWindows()
                print("\nProgress saved! Run script again when you want to continue.")
                exit()
            elif key == 32:
                trigger_record = True

        # 2. Recording state: 30 continuous frames
        sequence_landmarks = []
        while len(sequence_landmarks) < FRAMES_PER_GESTURE:
            ret, frame = cap.read()
            if not ret: continue

            frame = cv2.flip(frame, 1)
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = hands.process(frame_rgb)

            frame_features = []
            if results.multi_hand_landmarks:
                hand_landmarks = results.multi_hand_landmarks[0]
                mp_drawing.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS,
                                          mp_drawing_styles.get_default_hand_landmarks_style(),
                                          mp_drawing_styles.get_default_hand_connections_style())

                base_x = hand_landmarks.landmark[0].x
                base_y = hand_landmarks.landmark[0].y
                for lm in hand_landmarks.landmark:
                    frame_features.extend([lm.x - base_x, lm.y - base_y])
            else:
                frame_features = [0.0] * 42

            sequence_landmarks.append(frame_features)

            cv2.rectangle(frame, (0, 0), (frame.shape[1], 85), (0, 100, 0), -1)
            cv2.putText(frame, f"RECORDING '{word}' [{len(sequence_landmarks)}/{FRAMES_PER_GESTURE}]", (20, 52), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 0), 2, cv2.LINE_AA)

            cv2.imshow("Word Recorder", frame)
            cv2.waitKey(1)

        dataset.append(np.array(sequence_landmarks).flatten())
        labels.append(word)

        # Immediate persistent save after every sample
        with open(DATA_FILE, 'wb') as f:
            pickle.dump({'data': dataset, 'labels': labels}, f)

cap.release()
cv2.destroyAllWindows()

# Train model when finished
print("\nTraining Random Forest classifier on all recorded words...")
clf = RandomForestClassifier(n_estimators=100, random_state=42)
clf.fit(np.asarray(dataset), np.asarray(labels))

with open('./word_model.p', 'wb') as f:
    pickle.dump({'model': clf}, f)

print("SUCCESS: Full word model saved as './word_model.p'!")
