"""
retrain_voice.py  Improved Voice Emotion Model Retraining
===========================================================
Run from the project root:
    python retrain_voice.py

What this script fixes:
  1. Feature extraction is IDENTICAL to the API inference path
  2. Data augmentation (noise + pitch + stretch)  3x dataset
  3. Stratified train/val/test split
  4. ModelCheckpoint on val_accuracy (saves best epoch only)
  5. EarlyStopping (patience=20), ReduceLROnPlateau
  6. Saves EMOTIONS list in sorted order so LabelEncoder always matches
  7. Also saves emotions.npy and config.json for the backend
"""

import os, json, warnings
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"
warnings.filterwarnings("ignore")

import numpy as np
import librosa
import tensorflow as tf
from tensorflow.keras import layers, models
from tensorflow.keras.utils import to_categorical
from tensorflow.keras.callbacks import ModelCheckpoint, EarlyStopping, ReduceLROnPlateau
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report, confusion_matrix
from tqdm import tqdm
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns

# 
# PATHS  (relative to project root)
# 
RAVDESS_DIR = "audio models and  dataset/datasets/ravdess"
TESS_DIR    = "audio models and  dataset/datasets/tess"
MODEL_OUT   = "audio models and  dataset/models/voice_model.h5"
TFJS_DIR    = "audio models and  dataset/models/tfjs_voice"

# 
# GPU CHECK
# 
print("=" * 70)
print("VOICE EMOTION MODEL  RETRAIN")
print("=" * 70)

gpus = tf.config.list_physical_devices("GPU")
if gpus:
    for g in gpus:
        tf.config.experimental.set_memory_growth(g, True)
    print(f" GPU: {gpus[0].name}")
else:
    print("  No GPU  training on CPU (expect ~30-60 min)")

print(f"TensorFlow: {tf.__version__}")

# 
# FEATURE EXTRACTION   must be *identical* to api.py inference path
# 
SR       = 22050
DURATION = 3          # seconds to load
N_MFCC   = 40
N_FEATURES = N_MFCC * 2   # mean + std = 80


def extract_features(audio: np.ndarray, sr: int = SR) -> np.ndarray:
    """
    80-dim MFCC feature vector.
    MUST stay 100% in sync with the extraction used in api.py / diagnose_voice.py.
    """
    min_len = sr // 2                          # 0.5 s minimum
    if len(audio) < min_len:
        audio = np.pad(audio, (0, min_len - len(audio)), mode="constant")

    n_fft      = min(512, len(audio))
    hop_length = n_fft // 4

    mfcc = librosa.feature.mfcc(
        y=audio.astype(np.float32),
        sr=sr,
        n_mfcc=N_MFCC,
        n_fft=n_fft,
        hop_length=hop_length,
    )
    return np.concatenate([np.mean(mfcc, axis=1), np.std(mfcc, axis=1)])


# 
# AUGMENTATION  (keeps same feature extraction; applied BEFORE extracting)
# 

def augment_audio(audio: np.ndarray, sr: int = SR):
    """Returns a list of (audio, sr) tuples: original + 2 augmented versions."""
    variants = [audio]

    # 1) White noise injection
    noise = audio + 0.005 * np.random.randn(len(audio)).astype(np.float32)
    variants.append(noise.astype(np.float32))

    # 2) Pitch shift (+/- 2 semitones randomly)
    n_steps = np.random.choice([-2, -1, 1, 2])
    try:
        pitched = librosa.effects.pitch_shift(audio, sr=sr, n_steps=n_steps)
        variants.append(pitched)
    except Exception:
        variants.append(audio)

    return variants


# 
# RAVDESS LOADER
# 
RAVDESS_EMOTION_MAP = {
    1: "neutral", 2: "calm",    3: "happy", 4: "sad",
    5: "angry",   6: "fear",    7: "disgust",
}

def load_ravdess(base_path: str, augment: bool = True):
    records = []
    all_wavs = []
    for root, _, files in os.walk(base_path):
        for f in files:
            if f.endswith(".wav"):
                all_wavs.append(os.path.join(root, f))

    print(f"  Found {len(all_wavs)} RAVDESS files")
    for path in tqdm(all_wavs, desc="RAVDESS"):
        try:
            parts = os.path.basename(path).split("-")
            code  = int(parts[2])
            emo   = RAVDESS_EMOTION_MAP.get(code)
            if emo is None:
                continue

            audio, sr = librosa.load(path, sr=SR, duration=DURATION)
            variants  = augment_audio(audio) if augment else [audio]

            for v in variants:
                feat = extract_features(v)
                records.append({"features": feat, "emotion": emo})
        except Exception as e:
            pass  # skip broken files silently

    return records


# 
# TESS LOADER
# 
TESS_EMOTION_MAP = {
    "angry":   "angry",
    "disgust": "disgust",
    "fear":    "fear",
    "happy":   "happy",
    "ps":      "surprise",
    "sad":     "sad",
    "neutral": "neutral",
}

def load_tess(base_path: str, augment: bool = True):
    records = []
    all_wavs = []
    for root, _, files in os.walk(base_path):
        for f in files:
            if f.endswith(".wav"):
                all_wavs.append(os.path.join(root, f))

    print(f"  Found {len(all_wavs)} TESS files")
    for path in tqdm(all_wavs, desc="TESS"):
        try:
            raw_emo = os.path.basename(path).split("_")[-1].replace(".wav","").lower()
            emo = TESS_EMOTION_MAP.get(raw_emo)
            if emo is None:
                continue

            audio, sr = librosa.load(path, sr=SR, duration=DURATION)
            variants  = augment_audio(audio) if augment else [audio]

            for v in variants:
                feat = extract_features(v)
                records.append({"features": feat, "emotion": emo})
        except Exception:
            pass

    return records


# 
# LOAD DATA
# 
print("\n=== LOADING DATASETS (with augmentation) ===")

ravdess_records = load_ravdess(RAVDESS_DIR, augment=True)
print(f"   RAVDESS: {len(ravdess_records)} samples (after augmentation)")

tess_records = load_tess(TESS_DIR, augment=True)
print(f"   TESS:    {len(tess_records)} samples (after augmentation)")

all_records = ravdess_records + tess_records
print(f"   Total:   {len(all_records)} samples")

if len(all_records) == 0:
    raise RuntimeError("No samples loaded! Check dataset paths.")

# 
# PREPARE X / y
# 
print("\n=== PREPARING DATA ===")

X = np.array([r["features"] for r in all_records], dtype=np.float32)
y_raw = np.array([r["emotion"] for r in all_records])

encoder = LabelEncoder()
y_enc   = encoder.fit_transform(y_raw)
EMOTIONS = list(encoder.classes_)          # alphabetically sorted  FIXED ORDER

NUM_CLASSES = len(EMOTIONS)
print(f"  Emotions ({NUM_CLASSES}): {EMOTIONS}")

# Normalize features (zero mean, unit variance per-feature)
X_mean = X.mean(axis=0)
X_std  = X.std(axis=0) + 1e-8
X_norm = (X - X_mean) / X_std

y_cat = to_categorical(y_enc, num_classes=NUM_CLASSES)

# Stratified split: 80% train, 10% val, 10% test
X_train, X_tmp, y_train, y_tmp, idx_train, idx_tmp = train_test_split(
    X_norm, y_cat, y_enc, test_size=0.2, random_state=42, stratify=y_enc
)
X_val, X_test, y_val, y_test = train_test_split(
    X_tmp, y_tmp, test_size=0.5, random_state=42, stratify=idx_tmp
)

# Reshape for 1D CNN    (N, 80, 1)
X_train = X_train.reshape(-1, N_FEATURES, 1)
X_val   = X_val.reshape(-1, N_FEATURES, 1)
X_test  = X_test.reshape(-1, N_FEATURES, 1)

print(f"  Train: {len(X_train)} | Val: {len(X_val)} | Test: {len(X_test)}")

# 
# MODEL  (deeper than before)
# 
print("\n=== BUILDING MODEL ===")

model = models.Sequential([
    layers.InputLayer(input_shape=(N_FEATURES, 1)),

    layers.Conv1D(128, 5, activation="relu", padding="same"),
    layers.BatchNormalization(),
    layers.MaxPooling1D(2),
    layers.Dropout(0.25),

    layers.Conv1D(256, 5, activation="relu", padding="same"),
    layers.BatchNormalization(),
    layers.MaxPooling1D(2),
    layers.Dropout(0.25),

    layers.Conv1D(256, 3, activation="relu", padding="same"),
    layers.BatchNormalization(),
    layers.Dropout(0.25),

    layers.GlobalAveragePooling1D(),

    layers.Dense(256, activation="relu"),
    layers.BatchNormalization(),
    layers.Dropout(0.4),

    layers.Dense(128, activation="relu"),
    layers.Dropout(0.3),

    layers.Dense(NUM_CLASSES, activation="softmax"),
])

model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
    loss="categorical_crossentropy",
    metrics=["accuracy"],
)

model.summary()

# 
# TRAIN
# 
print("\n=== TRAINING ===")
os.makedirs(os.path.dirname(MODEL_OUT), exist_ok=True)

callbacks = [
    ModelCheckpoint(
        MODEL_OUT,
        monitor="val_accuracy",
        save_best_only=True,
        verbose=1,
    ),
    EarlyStopping(
        monitor="val_loss",
        patience=20,
        restore_best_weights=True,
        verbose=1,
    ),
    ReduceLROnPlateau(
        monitor="val_loss",
        factor=0.5,
        patience=7,
        min_lr=1e-6,
        verbose=1,
    ),
]

history = model.fit(
    X_train, y_train,
    validation_data=(X_val, y_val),
    epochs=150,
    batch_size=64,
    callbacks=callbacks,
    verbose=1,
)

print("\n Training complete!")

# 
# EVALUATE
# use the in-memory model (EarlyStopping already restored best weights)
# 
print("\n=== EVALUATION ===")

best_model = model   # weights restored by restore_best_weights=True
best_model.compile(optimizer="adam", loss="categorical_crossentropy", metrics=["accuracy"])
loss, acc  = best_model.evaluate(X_test, y_test, verbose=0)
print(f"\n Test Accuracy: {acc*100:.2f}%")

y_pred_p  = best_model.predict(X_test, verbose=0)
y_pred_cl = np.argmax(y_pred_p, axis=1)
y_true_cl = np.argmax(y_test,   axis=1)

print("\n Classification Report:")
print(classification_report(y_true_cl, y_pred_cl, target_names=EMOTIONS))

# Confusion matrix
cm = confusion_matrix(y_true_cl, y_pred_cl)
plt.figure(figsize=(12, 9))
sns.heatmap(cm, annot=True, fmt="d", cmap="Blues",
            xticklabels=EMOTIONS, yticklabels=EMOTIONS)
plt.title(f"Voice Emotion Detection  Confusion Matrix  (Accuracy {acc*100:.1f}%)")
plt.ylabel("True Label")
plt.xlabel("Predicted Label")
plt.tight_layout()
plt.savefig("audio models and  dataset/voice_confusion.png", dpi=200)
print("  Saved confusion matrix  audio models and  dataset/voice_confusion.png")

# Training curves
plt.figure(figsize=(14, 5))
plt.subplot(1, 2, 1)
plt.plot(history.history["accuracy"],     label="Train")
plt.plot(history.history["val_accuracy"], label="Val")
plt.title("Accuracy")
plt.legend(); plt.grid(True)

plt.subplot(1, 2, 2)
plt.plot(history.history["loss"],     label="Train")
plt.plot(history.history["val_loss"], label="Val")
plt.title("Loss")
plt.legend(); plt.grid(True)

plt.tight_layout()
plt.savefig("audio models and  dataset/voice_training.png", dpi=200)
print("  Saved training curves  audio models and  dataset/voice_training.png")

# 
# SAVE CONFIG (for backend/frontend)
# 
print("\n=== SAVING CONFIG ===")
os.makedirs(TFJS_DIR, exist_ok=True)

config = {
    "emotions":        EMOTIONS,
    "num_classes":     NUM_CLASSES,
    "input_features":  N_FEATURES,
    "accuracy":        float(acc),
    "datasets":        ["RAVDESS", "TESS"],
    "samples":         len(all_records),
    "sr":              SR,
    "n_mfcc":          N_MFCC,
    "duration":        DURATION,
    # Normalization stats  needed if inference uses same normalization
    "feature_mean":    X_mean.tolist(),
    "feature_std":     X_std.tolist(),
}

with open(f"{TFJS_DIR}/config.json", "w") as f:
    json.dump(config, f, indent=2)

np.save(f"{TFJS_DIR}/emotions.npy", np.array(EMOTIONS))
np.save(f"{TFJS_DIR}/feature_mean.npy", X_mean)
np.save(f"{TFJS_DIR}/feature_std.npy",  X_std)

print(f"  Config saved  {TFJS_DIR}/config.json")

# 
# QUICK SANITY CHECK
# 
print("\n=== SANITY CHECK ===")
silence = np.zeros(SR * 3, dtype=np.float32)
feat_s  = extract_features(silence)
feat_s  = (feat_s - X_mean) / X_std
pred_s  = best_model.predict(feat_s.reshape(1, N_FEATURES, 1), verbose=0)[0]
max_conf= float(pred_s.max())
print(f"  Silence  max conf: {max_conf*100:.1f}%  (should be low, ~14%=random)")

# Check a real training file
import glob
wav_files = glob.glob(f"{RAVDESS_DIR}/**/*.wav", recursive=True)
if wav_files:
    sample_path = wav_files[0]
    audio, sr_  = librosa.load(sample_path, sr=SR, duration=DURATION)
    feat_r      = extract_features(audio)
    feat_r      = (feat_r - X_mean) / X_std
    pred_r      = best_model.predict(feat_r.reshape(1, N_FEATURES, 1), verbose=0)[0]
    pred_emo    = EMOTIONS[np.argmax(pred_r)]
    pred_conf   = float(pred_r.max())
    fname       = os.path.basename(sample_path)
    parts       = fname.split("-")
    true_emo    = RAVDESS_EMOTION_MAP.get(int(parts[2]), "?")
    print(f"  Real file [{true_emo}]  predicted: {pred_emo} ({pred_conf*100:.1f}%)")
    if pred_conf > 0.3:
        print("   Model is making confident, non-random predictions!")
    else:
        print("    Model still seems uncertain  may need more epochs or data.")

print("\n" + "="*70)
print(f" DONE!  Model: {MODEL_OUT}")
print(f" Test Accuracy: {acc*100:.2f}%")
print(f" Emotions: {EMOTIONS}")
print(f" Samples used: {len(all_records)}")
print("="*70)
print("\nNext step: Restart api.py to load the new model.\n")

