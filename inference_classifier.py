import pickle
import cv2
import mediapipe as mp
import numpy as np

# Load trained model
with open('model.p', 'rb') as f:
    model_dict = pickle.load(f)
model = model_dict['model']

# Detect and open available Mac webcam (index 0 or 1)
cap = None
for idx in [0, 1]:
    temp_cap = cv2.VideoCapture(idx, cv2.CAP_AVFOUNDATION)
    if temp_cap.isOpened():
        ret, test_frame = temp_cap.read()
        if ret and test_frame is not None:
            cap = temp_cap
            print(f"Successfully connected to Mac camera at index {idx}!")
            break
        temp_cap.release()

if cap is None:
    print("Error: Could not access the webcam.")
    print("Please verify camera access in: System Settings > Privacy & Security > Camera")
    exit()

mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles

hands = mp_hands.Hands(static_image_mode=False, min_detection_confidence=0.3)

print("Starting video stream... Hold your hand up or press 'q' to quit.")

while True:
    data_aux = []
    x_ = []
    y_ = []

    ret, frame = cap.read()
    if not ret or frame is None:
        continue

    H, W, _ = frame.shape
    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    results = hands.process(frame_rgb)
    if results.multi_hand_landmarks:
        hand_landmarks = results.multi_hand_landmarks[0]

        mp_drawing.draw_landmarks(
            frame,
            hand_landmarks,
            mp_hands.HAND_CONNECTIONS,
            mp_drawing_styles.get_default_hand_landmarks_style(),
            mp_drawing_styles.get_default_hand_connections_style()
        )

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

        x1 = max(0, int(min(x_) * W) - 10)
        y1 = max(0, int(min(y_) * H) - 10)
        x2 = min(W, int(max(x_) * W) + 10)
        y2 = min(H, int(max(y_) * H) + 10)

        if len(data_aux) == 42:
            prediction = model.predict([np.asarray(data_aux)])
            predicted_character = str(prediction[0])

            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 0), 4)
            cv2.putText(
                frame,
                predicted_character,
                (x1, y1 - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                1.3,
                (0, 0, 0),
                3,
                cv2.LINE_AA
            )

    cv2.imshow('Sign Language Detector', frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
