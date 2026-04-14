import numpy as np
import librosa
import os
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
import tensorflow as tf

MODEL_PATH = "audio models and  dataset/models/voice_model.h5"
import json
with open("audio models and  dataset/models/tfjs_voice/config.json", 'r') as f:
    config = json.load(f)
EMOTIONS = config['emotions']
model = tf.keras.models.load_model(MODEL_PATH, compile=False)
print(f"EMOTIONS: {EMOTIONS}")

def extract(audio, sr=22050):
    min_length = sr // 2
    if len(audio) < min_length:
        audio = np.pad(audio, (0, min_length - len(audio)), mode='constant')
    n_fft = min(512, len(audio))
    hop_length = n_fft // 4
    mfcc = librosa.feature.mfcc(y=audio.astype(float), sr=sr, n_mfcc=40, n_fft=n_fft, hop_length=hop_length)
    return np.concatenate([np.mean(mfcc, axis=1), np.std(mfcc, axis=1)])

def pred(audio, sr=22050, label=""):
    f = extract(audio, sr)
    p = model.predict(f.reshape(1, 80, 1), verbose=0)[0]
    i = np.argmax(p)
    print(f"  {label}: {EMOTIONS[i]} ({p[i]*100:.1f}%) | {[f'{x:.3f}' for x in p]}")

print("\n--- SILENCE ---")
pred(np.zeros(22050*3, dtype=np.float32), label="zeros")

print("\n--- LOW NOISE (mic bg) ---")
pred(np.random.normal(0, 0.01, 22050*3).astype(np.float32), label="noise0.01")

print("\n--- MEDIUM NOISE ---")
pred(np.random.normal(0, 0.05, 22050*3).astype(np.float32), label="noise0.05")

print("\n--- SAMPLE RATE TEST ---")
t = np.linspace(0, 3, 44100*3, dtype=np.float32)
tone = 0.3 * np.sin(2*np.pi*440*t)
pred(tone, sr=22050, label="44100Hz_as_22050")
pred(tone, sr=44100, label="44100Hz_as_44100")

# Check if training files exist
ravdess = "audio models and  dataset/datasets/ravdess"
if os.path.exists(ravdess):
    print("\n--- REAL TRAINING FILES ---")
    emap = {1:'neutral',2:'calm',3:'happy',4:'sad',5:'angry',6:'fear',7:'disgust'}
    c = 0
    for root,_,files in os.walk(ravdess):
        for f in sorted(files):
            if f.endswith('.wav') and c < 6:
                a, s = librosa.load(os.path.join(root,f), sr=22050, duration=3)
                e = emap.get(int(f.split('-')[2]), '?')
                pred(a, s, f"[true={e}] {f}")
                c += 1
else:
    print(f"\nNo training data at {ravdess}")
