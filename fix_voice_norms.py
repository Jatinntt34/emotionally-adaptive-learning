"""
fix_voice_norms.py
==================
Recomputes normalization stats from the AUGMENTED dataset
(exactly as the model was trained on) and saves them.

Also verifies the model works correctly with these stats.
"""
import os, json, warnings, glob
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
warnings.filterwarnings("ignore")

import numpy as np
import librosa
import tensorflow as tf
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
from tensorflow.keras.utils import to_categorical
from tqdm import tqdm

SR        = 22050
DURATION  = 3
N_MFCC    = 40
N_FEATURES= 80

RAVDESS_DIR = "audio models and  dataset/datasets/ravdess"
TESS_DIR    = "audio models and  dataset/datasets/tess"
MODEL_OUT   = "audio models and  dataset/models/voice_model.h5"
TFJS_DIR    = "audio models and  dataset/models/tfjs_voice"

RAVDESS_EMOTION_MAP = {
    1:"neutral", 2:"calm", 3:"happy", 4:"sad",
    5:"angry",   6:"fear", 7:"disgust",
}
TESS_EMOTION_MAP = {
    "angry":"angry","disgust":"disgust","fear":"fear",
    "happy":"happy","ps":"surprise","sad":"sad","neutral":"neutral",
}

def extract_features(audio):
    min_len = SR // 2
    if len(audio) < min_len:
        audio = np.pad(audio, (0, min_len - len(audio)), mode="constant")
    n_fft      = min(512, len(audio))
    hop_length = n_fft // 4
    mfcc = librosa.feature.mfcc(
        y=audio.astype(np.float32), sr=SR,
        n_mfcc=N_MFCC, n_fft=n_fft, hop_length=hop_length,
    )
    return np.concatenate([np.mean(mfcc, axis=1), np.std(mfcc, axis=1)])

def augment_audio(audio):
    """Returns original + 2 augmented versions (same as training)."""
    variants = [audio]
    # noise
    noise = audio + 0.005 * np.random.randn(len(audio)).astype(np.float32)
    variants.append(noise.astype(np.float32))
    # pitch shift
    n_steps = np.random.choice([-2, -1, 1, 2])
    try:
        pitched = librosa.effects.pitch_shift(audio, sr=SR, n_steps=n_steps)
        variants.append(pitched)
    except Exception:
        variants.append(audio)
    return variants

print("=" * 60)
print("FIX VOICE NORMALIZATION STATS")
print("=" * 60)

# Fix random seed so augmentation is reproducible
np.random.seed(42)

print("\nLoading model ...")
model = tf.keras.models.load_model(MODEL_OUT, compile=False)
model.compile(optimizer="adam", loss="categorical_crossentropy", metrics=["accuracy"])
print(f"  Loaded ({os.path.getsize(MODEL_OUT)//1024//1024} MB)")

print("\nExtracting features WITH augmentation (matches training) ...")
records = []

ravdess_wavs = sorted(glob.glob(f"{RAVDESS_DIR}/**/*.wav", recursive=True))
for path in tqdm(ravdess_wavs, desc="RAVDESS"):
    try:
        parts = os.path.basename(path).split("-")
        emo   = RAVDESS_EMOTION_MAP.get(int(parts[2]))
        if emo:
            a, _ = librosa.load(path, sr=SR, duration=DURATION)
            for v in augment_audio(a):
                records.append({"features": extract_features(v), "emotion": emo})
    except Exception:
        pass

tess_wavs = sorted(glob.glob(f"{TESS_DIR}/**/*.wav", recursive=True))
for path in tqdm(tess_wavs, desc="TESS"):
    try:
        raw_emo = os.path.basename(path).split("_")[-1].replace(".wav","").lower()
        emo = TESS_EMOTION_MAP.get(raw_emo)
        if emo:
            a, _ = librosa.load(path, sr=SR, duration=DURATION)
            for v in augment_audio(a):
                records.append({"features": extract_features(v), "emotion": emo})
    except Exception:
        pass

print(f"  Total: {len(records)} augmented samples")

X    = np.array([r["features"] for r in records], dtype=np.float32)
y_raw= np.array([r["emotion"]  for r in records])

encoder  = LabelEncoder()
y_enc    = encoder.fit_transform(y_raw)
EMOTIONS = list(encoder.classes_)
NUM_CLASSES = len(EMOTIONS)
print(f"  Emotions ({NUM_CLASSES}): {EMOTIONS}")

# Normalization stats from AUGMENTED data (matches training)
X_mean = X.mean(axis=0)
X_std  = X.std(axis=0) + 1e-8
X_norm = (X - X_mean) / X_std

y_cat = to_categorical(y_enc, num_classes=NUM_CLASSES)

_, X_tmp, _, y_tmp, _, idx_tmp = train_test_split(
    X_norm, y_cat, y_enc, test_size=0.2, random_state=42, stratify=y_enc
)
X_val, X_test, y_val, y_test = train_test_split(
    X_tmp, y_tmp, test_size=0.5, random_state=42, stratify=idx_tmp
)
X_test = X_test.reshape(-1, N_FEATURES, 1)

print("\n=== EVALUATION ===")
loss, acc = model.evaluate(X_test, y_test, verbose=0)
print(f"  Test Accuracy: {acc*100:.2f}%")

y_pred = model.predict(X_test, verbose=0)
print(classification_report(np.argmax(y_test, axis=1), np.argmax(y_pred, axis=1), target_names=EMOTIONS))

# Save corrected norm stats
os.makedirs(TFJS_DIR, exist_ok=True)
config = {
    "emotions":       EMOTIONS,
    "num_classes":    NUM_CLASSES,
    "input_features": N_FEATURES,
    "accuracy":       float(acc),
    "datasets":       ["RAVDESS", "TESS"],
    "samples":        len(records),
    "sr":             SR,
    "n_mfcc":         N_MFCC,
    "duration":       DURATION,
    "feature_mean":   X_mean.tolist(),
    "feature_std":    X_std.tolist(),
}
with open(f"{TFJS_DIR}/config.json", "w") as f:
    json.dump(config, f, indent=2)
np.save(f"{TFJS_DIR}/emotions.npy",     np.array(EMOTIONS))
np.save(f"{TFJS_DIR}/feature_mean.npy", X_mean)
np.save(f"{TFJS_DIR}/feature_std.npy",  X_std)
print(f"  Saved corrected stats -> {TFJS_DIR}/")

print("\n=== SANITY CHECK ===")
silence = np.zeros(SR * 3, dtype=np.float32)
f_s     = (extract_features(silence) - X_mean) / X_std
p_s     = model.predict(f_s.reshape(1, N_FEATURES, 1), verbose=0)[0]
print(f"  Silence -> max conf: {p_s.max()*100:.1f}%  (should be < 25% if model works)")

print("\n  Real file check (first 8 RAVDESS):")
for path in ravdess_wavs[:8]:
    try:
        a, _  = librosa.load(path, sr=SR, duration=DURATION)
        f     = (extract_features(a) - X_mean) / X_std
        p     = model.predict(f.reshape(1, N_FEATURES, 1), verbose=0)[0]
        true  = RAVDESS_EMOTION_MAP.get(int(os.path.basename(path).split("-")[2]), "?")
        pred  = EMOTIONS[np.argmax(p)]
        conf  = p.max() * 100
        ok    = "CORRECT" if true == pred else "WRONG  "
        print(f"    [{ok}]  true={true:8s}  pred={pred:8s}  ({conf:.1f}%)")
    except Exception as e:
        print(f"    SKIP: {e}")

print("\n" + "=" * 60)
print(f"  DONE!  Accuracy: {acc*100:.2f}%  |  Emotions: {EMOTIONS}")
print("  Restart api.py to load the retrained model.")
print("=" * 60)
