import os
import pickle
import string
import mediapipe as mp
import cv2

mp_hands = mp.solutions.hands
hands = mp_hands.Hands(static_image_mode=True, min_detection_confidence=0.3)

# Confirmed path to Kaggle dataset
DATA_DIR = '/Users/lisaou/.cache/kagglehub/datasets/grassknoted/asl-alphabet/versions/1/asl_alphabet_train/asl_alphabet_train'

data = []
labels = []

# All 26 letters: ['A', 'B', 'C', ..., 'Z']
selected_classes = list(string.ascii_uppercase)

print("Starting dataset processing for all 26 letters...")

for dir_ in selected_classes:
    dir_path = os.path.join(DATA_DIR, dir_)
    if not os.path.isdir(dir_path):
        print(f"Directory not found: {dir_path}")
        continue

    images = [img for img in os.listdir(dir_path) if not img.startswith('.')]
    print(f"Processing letter '{dir_}' ({len(images[:100])} images)...")

    for img_path in images[:100]:
        data_aux = []
        x_ = []
        y_ = []

        full_img_path = os.path.join(dir_path, img_path)
        img = cv2.imread(full_img_path)
        if img is None:
            continue

        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        results = hands.process(img_rgb)

        if results.multi_hand_landmarks:
            for hand_landmarks in results.multi_hand_landmarks:
                for i in range(len(hand_landmarks.landmark)):
                    x = hand_landmarks.landmark[i].x
                    y = hand_landmarks.landmark[i].y
                    x_.append(x)
                    y_.append(y)

                for i in range(len(hand_landmarks.landmark)):
                    x = hand_landmarks.landmark[i].x
                    y = hand_landmarks.landmark[i].y
                    data_aux.append(x - min(x_))
                    data_aux.append(y - min(y_))

            if len(data_aux) == 42:
                data.append(data_aux)
                labels.append(dir_)

print(f"Total valid samples collected across 26 letters: {len(data)}")

with open('data.pickle', 'wb') as f:
    pickle.dump({'data': data, 'labels': labels}, f)

print("Done! 'data.pickle' has been created successfully.")