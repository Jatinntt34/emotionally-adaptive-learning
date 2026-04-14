import cv2
import os
os.environ["TF_USE_LEGACY_KERAS"] = "1"
import tensorflow as tf
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input
import numpy as np
import os

# --- Configuration (Make sure these match your trained model) ---
IMG_SIZE = 128  # The image size your model was trained on
EMOTIONS = ['angry', 'disgust', 'fear', 'happy', 'neutral', 'sad', 'surprise'] # The order of emotions used during training
MODEL_PATH = 'models/emotion_model.h5' # Path to your downloaded model file
HAARCASCADE_PATH = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml' # Path to your downloaded Haar Cascade XML file

# --- Load the trained model ---
try:
    model = tf.keras.models.load_model(MODEL_PATH)
    print(f"Successfully loaded emotion model from {MODEL_PATH}")
except Exception as e:
    print(f"Error loading emotion model: {e}")
    print(f"Please ensure '{MODEL_PATH}' is in the same directory as this script.")
    exit()

# --- Load Haar Cascade for face detection ---
try:
    face_cascade = cv2.CascadeClassifier(HAARCASCADE_PATH)
    if face_cascade.empty():
        raise IOError(f"Could not load Haar Cascade XML file from {HAARCASCADE_PATH}")
    print(f"Successfully loaded Haar Cascade from {HAARCASCADE_PATH}")
except IOError as e:
    print(f"Error loading Haar Cascade: {e}")
    print(f"Please ensure '{HAARCASCADE_PATH}' is in the same directory as this script.")
    exit()

# --- Function to preprocess and predict ---
def predict_emotion(face_img):
    # Resize to model input size
    face_img = cv2.resize(face_img, (IMG_SIZE, IMG_SIZE))
    # Convert BGR (OpenCV default) to RGB (TensorFlow expected)
    if len(face_img.shape) == 3:
        face_img = cv2.cvtColor(face_img, cv2.COLOR_BGR2RGB)

    img_array = tf.keras.preprocessing.image.img_to_array(face_img)
    img_array = np.expand_dims(img_array, axis=0) # Add batch dimension
    img_array = preprocess_input(img_array) # Native MobileNetV2 normalization [-1, 1]

    predictions = model.predict(img_array, verbose=0)[0]
    predicted_class_index = np.argmax(predictions)
    predicted_emotion = EMOTIONS[predicted_class_index]
    confidence = predictions[predicted_class_index] * 100

    return predicted_emotion, confidence, predictions

# --- Main function for real-time detection ---
def main():
    cap = cv2.VideoCapture(0) # 0 for default webcam

    if not cap.isOpened():
        print("Error: Could not open webcam.")
        return

    print("Webcam opened successfully. Press 'q' to quit.")

    while True:
        ret, frame = cap.read()
        if not ret:
            print("Failed to grab frame, trying again...")
            break

        gray_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # Detect faces
        faces = face_cascade.detectMultiScale(gray_frame, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))

        for (x, y, w, h) in faces:
            face_roi = frame[y:y+h, x:x+w]
            
            if face_roi.size == 0:
                continue # Skip if ROI is empty

            emotion, confidence, all_predictions = predict_emotion(face_roi)

            # Draw rectangle around face
            cv2.rectangle(frame, (x, y), (x+w, y+h), (255, 0, 0), 2)

            # Display emotion and confidence
            text = f"{emotion}: {confidence:.2f}%"
            cv2.putText(frame, text, (x, y-10), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 0, 0), 2, cv2.LINE_AA)
            
            # Display all probabilities for detected face (optional, for debugging/visualization)
            y_offset = y + h + 20
            for i, (emo, prob) in enumerate(zip(EMOTIONS, all_predictions)):
                prob_text = f"{emo}: {prob*100:.2f}%"
                cv2.putText(frame, prob_text, (x, y_offset + i*20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 1, cv2.LINE_AA)


        # Display the resulting frame
        cv2.imshow('Real-time Emotion Detector', frame)

        # Break the loop on 'q' key press
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == '__main__':
    main()

