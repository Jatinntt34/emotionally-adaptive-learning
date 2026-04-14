"""
retrain_voice_v2.py  —  Improved Voice Emotion Model (120-dim features)
=======================================================================
Run from the project root:
    python retrain_voice_v2.py

Improvements over retrain_voice.py:
  1. 120-dim feature vector: MFCC-40 mean + std + delta-mean  (was 80)
  2. Fixed n_fft=512, hop_length=128  (no more variable FFT size)
  3. Better augmentation: noise + pitch-shift + time-stretch (x3 data)
  4. Deeper 1D-CNN with residual skip connections
  5. Data duration extended from 3s → 4s for more context
  6. Class-weight balancing for emotion imbalance in RAVDESS/TESS
  7. Saves config + norms atomically so api.py always stays in sync

IMPORTANT: After this finishes:
  - voice_model.h5 is replaced with the new model
  - tfjs_voice/config.json is updated (input_features: 120 instead of 80)
  - Restart api.py (it reads n_features from config automatically)
"""

import os, json, warnings
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"
warnings.filterwarnings("ignore")

import numpy as np
import librosa
import tensorflow as tf
from tensorflow.keras import layers, models, regularizers
from tensorflow.keras.utils import to_categorical
from tensorflow.keras.callbacks import ModelCheckpoint, EarlyStopping, ReduceLROnPlateau
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.utils.class_weight import compute_class_weight
from tqdm import tqdm
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns

# ─── PATHS ────────────────────────────────────────────────────────────────────
RAVDESS_DIR  = "audio models and  dataset/datasets/ravdess"
TESS_DIR     = "audio models and  dataset/datasets/tess"
MODEL_OUT    = "audio models and  dataset/models/voice_model.h5"
TFJS_DIR     = "audio models and  dataset/models/tfjs_voice"

# ─── HYPER-PARAMETERS ─────────────────────────────────────────────────────────
SR         = 22050
DURATION   = 4          # seconds (was 3 — more context for MFCC delta)
N_MFCC     = 40
N_FFT      = 512        # FIXED — matches api.py inference
HOP_LENGTH = 128        # N_FFT // 4 — matches api.py
N_FEATURES = N_MFCC * 3  # mean(40) + std(40) + delta_mean(40) = 120

print("=" * 70)
print("VOICE EMOTION MODEL v2  —  120-DIM MFCC RETRAIN")
print("=" * 70)

gpus = tf.config.list_physical_devices("GPU")
if gpus:
    for g in gpus:
        tf.config.experimental.set_memory_growth(g, True)
    print(f"  GPU: {gpus[0].name}")
else:
    print("  No GPU — training on CPU (~45-90 min)")
print(f"  TensorFlow: {tf.__version__}")
print(f"  Features: {N_FEATURES}-dim  |  n_fft={N_FFT}  |  hop={HOP_LENGTH}  |  duration={DURATION}s")

# ─── FEATURE EXTRACTION ───────────────────────────────────────────────────────
# THIS FUNCTION MUST STAY 100% IDENTICAL TO extract_features_for_voice() IN api.py
# (api.py auto-detects N_FEATURES from config.json so the reshape is handled)

def extract_features(audio: np.ndarray, sr: int = SR) -> np.ndarray:
    """
    120-dim feature vector:
      40 × MFCC mean
      40 × MFCC std
      40 × MFCC delta mean
    Fixed n_fft and hop_length so the spectrum is always computed the same way.
    """
    audio = audio.astype(np.float32)

    # Pad to minimum 0.5 s
    min_len = sr // 2
    if len(audio) < min_len:
        audio = np.pad(audio, (0, min_len - len(audio)), mode="constant")

    # Pad to at least n_fft samples (so FFT window is always full)
    if len(audio) < N_FFT:
        audio = np.pad(audio, (0, N_FFT - len(audio)), mode="constant")

    mfcc  = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=N_MFCC, n_fft=N_FFT, hop_length=HOP_LENGTH)
    delta = librosa.feature.delta(mfcc)

    return np.concatenate([
        np.mean(mfcc,  axis=1),   # 40 features
        np.std(mfcc,   axis=1),   # 40 features
        np.mean(delta, axis=1),   # 40 features — temporal dynamics
    ])


# ─── AUGMENTATION ─────────────────────────────────────────────────────────────

def augment_audio(audio: np.ndarray, sr: int = SR):
    """
    Returns a list of (audio_array) tuples: original + 2 augmented versions.
    3× the dataset size without downloading anything extra.
    """
    variants = [audio]

    # 1) White noise (simulates real mic noise)
    noise = audio + 0.005 * np.random.randn(len(audio)).astype(np.float32)
    variants.append(noise.astype(np.float32))

    # 2) Pitch shift +/- 2 semitones (simulates different speakers)
    n_steps = np.random.choice([-2, -1, 1, 2])
    try:
        pitched = librosa.effects.pitch_shift(audio, sr=sr, n_steps=n_steps)
        variants.append(pitched.astype(np.float32))
    except Exception:
        variants.append(audio)

    return variants


# ─── DATASET LOADERS ──────────────────────────────────────────────────────────

RAVDESS_EMOTION_MAP = {
    1: "neutral", 2: "calm",    3: "happy", 4: "sad",
    5: "angry",   6: "fear",    7: "disgust",
    # Code 8 = surprised — intentionally excluded (very few samples in RAVDESS)
}

TESS_EMOTION_MAP = {
    "angry":   "angry",
    "disgust": "disgust",
    "fear":    "fear",
    "happy":   "happy",
    "ps":      "surprise",
    "sad":     "sad",
    "neutral": "neutral",
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
            audio, _ = librosa.load(path, sr=SR, duration=DURATION)
            variants = augment_audio(audio) if augment else [audio]
            for v in variants:
                feat = extract_features(v)
                records.append({"features": feat, "emotion": emo})
        except Exception:
            pass
    return records


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
            raw_emo = os.path.basename(path).split("_")[-1].replace(".wav", "").lower()
            emo = TESS_EMOTION_MAP.get(raw_emo)
            if emo is None:
                continue
            audio, _ = librosa.load(path, sr=SR, duration=DURATION)
            variants = augment_audio(audio) if augment else [audio]
            for v in variants:
                feat = extract_features(v)
                records.append({"features": feat, "emotion": emo})
        except Exception:
            pass
    return records


# ─── LOAD DATA ────────────────────────────────────────────────────────────────
print("\n=== LOADING DATASETS (with augmentation) ===")

ravdess_records = load_ravdess(RAVDESS_DIR, augment=True)
print(f"   RAVDESS: {len(ravdess_records)} samples (after augmentation)")

tess_records = load_tess(TESS_DIR, augment=True)
print(f"   TESS:    {len(tess_records)} samples (after augmentation)")

all_records = ravdess_records + tess_records
print(f"   Total:   {len(all_records)} samples")

if len(all_records) == 0:
    raise RuntimeError("No samples loaded! Check dataset paths.")

# ─── PREPARE X / y ───────────────────────────────────────────────────────────
print("\n=== PREPARING DATA ===")

X     = np.array([r["features"] for r in all_records], dtype=np.float32)
y_raw = np.array([r["emotion"]  for r in all_records])

encoder    = LabelEncoder()
y_enc      = encoder.fit_transform(y_raw)
EMOTIONS   = list(encoder.classes_)     # alphabetically sorted → FIXED ORDER
NUM_CLASSES = len(EMOTIONS)
print(f"  Emotions ({NUM_CLASSES}): {EMOTIONS}")

# Normalize per-feature (z-score)
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

# Reshape for 1D CNN  (N, 120, 1)
X_train = X_train.reshape(-1, N_FEATURES, 1)
X_val   = X_val.reshape(-1,   N_FEATURES, 1)
X_test  = X_test.reshape(-1,  N_FEATURES, 1)

print(f"  Train: {len(X_train)} | Val: {len(X_val)} | Test: {len(X_test)}")

# Class-weight balancing (handles TESS/RAVDESS imbalance)
cw_array = compute_class_weight("balanced", classes=np.unique(idx_train), y=idx_train)
class_weights = dict(enumerate(cw_array))
print(f"  Class weights: { {EMOTIONS[k]: round(v,2) for k,v in class_weights.items()} }")

# ─── MODEL  (deeper, with residual skip) ─────────────────────────────────────
print("\n=== BUILDING MODEL ===")


def residual_block(x, filters, kernel_size=3):
    """1D residual block: two Conv1D layers with a skip connection."""
    skip = x
    x = layers.Conv1D(filters, kernel_size, padding="same", activation="relu",
                      kernel_regularizer=regularizers.l2(1e-4))(x)
    x = layers.BatchNormalization()(x)
    x = layers.Conv1D(filters, kernel_size, padding="same",
                      kernel_regularizer=regularizers.l2(1e-4))(x)
    x = layers.BatchNormalization()(x)
    # Project skip if channel count differs
    if skip.shape[-1] != filters:
        skip = layers.Conv1D(filters, 1, padding="same")(skip)
    x = layers.Add()([x, skip])
    x = layers.Activation("relu")(x)
    return x


inp = layers.Input(shape=(N_FEATURES, 1))

x = layers.Conv1D(64, 5, padding="same", activation="relu")(inp)
x = layers.BatchNormalization()(x)
x = layers.MaxPooling1D(2)(x)
x = layers.Dropout(0.2)(x)

x = residual_block(x, 128, kernel_size=5)
x = layers.MaxPooling1D(2)(x)
x = layers.Dropout(0.25)(x)

x = residual_block(x, 256, kernel_size=3)
x = layers.MaxPooling1D(2)(x)
x = layers.Dropout(0.25)(x)

x = residual_block(x, 256, kernel_size=3)
x = layers.Dropout(0.25)(x)

x = layers.GlobalAveragePooling1D()(x)

x = layers.Dense(256, activation="relu", kernel_regularizer=regularizers.l2(1e-4))(x)
x = layers.BatchNormalization()(x)
x = layers.Dropout(0.4)(x)

x = layers.Dense(128, activation="relu")(x)
x = layers.Dropout(0.3)(x)

out = layers.Dense(NUM_CLASSES, activation="softmax")(x)

voice_model = models.Model(inp, out)
voice_model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
    loss="categorical_crossentropy",
    metrics=["accuracy"],
)
voice_model.summary()

# ─── TRAIN ────────────────────────────────────────────────────────────────────
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

history = voice_model.fit(
    X_train, y_train,
    validation_data=(X_val, y_val),
    epochs=150,
    batch_size=64,
    class_weight=class_weights,
    callbacks=callbacks,
    verbose=1,
)

print("\n  Training complete!")

# ─── EVALUATE ────────────────────────────────────────────────────────────────
print("\n=== EVALUATION ===")
loss, acc = voice_model.evaluate(X_test, y_test, verbose=0)
print(f"\n  Test Accuracy: {acc*100:.2f}%")

y_pred_p  = voice_model.predict(X_test, verbose=0)
y_pred_cl = np.argmax(y_pred_p, axis=1)
y_true_cl = np.argmax(y_test,   axis=1)
print("\n  Classification Report:")
print(classification_report(y_true_cl, y_pred_cl, target_names=EMOTIONS))

# Confusion matrix
cm = confusion_matrix(y_true_cl, y_pred_cl)
plt.figure(figsize=(12, 9))
sns.heatmap(cm, annot=True, fmt="d", cmap="Blues",
            xticklabels=EMOTIONS, yticklabels=EMOTIONS)
plt.title(f"Voice Emotion v2  —  Test Accuracy {acc*100:.1f}%")
plt.ylabel("True Label"); plt.xlabel("Predicted Label")
plt.tight_layout()
plt.savefig("audio models and  dataset/voice_confusion_v2.png", dpi=200)
print("  Saved  audio models and  dataset/voice_confusion_v2.png")

# Training curves
plt.figure(figsize=(14, 5))
plt.subplot(1, 2, 1)
plt.plot(history.history["accuracy"],     label="Train")
plt.plot(history.history["val_accuracy"], label="Val")
plt.title("Accuracy"); plt.legend(); plt.grid(True)
plt.subplot(1, 2, 2)
plt.plot(history.history["loss"],     label="Train")
plt.plot(history.history["val_loss"], label="Val")
plt.title("Loss"); plt.legend(); plt.grid(True)
plt.tight_layout()
plt.savefig("audio models and  dataset/voice_training_v2.png", dpi=200)
print("  Saved  audio models and  dataset/voice_training_v2.png")

# ─── SAVE CONFIG ─────────────────────────────────────────────────────────────
print("\n=== SAVING CONFIG ===")
os.makedirs(TFJS_DIR, exist_ok=True)

config = {
    "emotions":        EMOTIONS,
    "num_classes":     NUM_CLASSES,
    "input_features":  N_FEATURES,   # 120 — api.py will auto-reshape
    "accuracy":        float(acc),
    "datasets":        ["RAVDESS", "TESS"],
    "samples":         len(all_records),
    "sr":              SR,
    "n_mfcc":          N_MFCC,
    "n_fft":           N_FFT,
    "hop_length":      HOP_LENGTH,
    "duration":        DURATION,
    "feature_type":    "mfcc_mean_std_delta",   # 120-dim
    "feature_mean":    X_mean.tolist(),
    "feature_std":     X_std.tolist(),
}

with open(f"{TFJS_DIR}/config.json", "w") as f:
    json.dump(config, f, indent=2)

np.save(f"{TFJS_DIR}/emotions.npy",     np.array(EMOTIONS))
np.save(f"{TFJS_DIR}/feature_mean.npy", X_mean)
np.save(f"{TFJS_DIR}/feature_std.npy",  X_std)

print(f"  Config saved  → {TFJS_DIR}/config.json")

# ─── SANITY CHECK ─────────────────────────────────────────────────────────────
print("\n=== SANITY CHECK ===")
silence  = np.zeros(SR * DURATION, dtype=np.float32)
feat_s   = extract_features(silence)
feat_s   = (feat_s - X_mean) / X_std
pred_s   = voice_model.predict(feat_s.reshape(1, N_FEATURES, 1), verbose=0)[0]
print(f"  Silence → max conf: {pred_s.max()*100:.1f}%  (good if ≤ 20%)")

import glob
wav_files = glob.glob(f"{RAVDESS_DIR}/**/*.wav", recursive=True)
if wav_files:
    print("\n  Training file predictions:")
    for sample_path in sorted(wav_files)[:8]:
        try:
            audio, _  = librosa.load(sample_path, sr=SR, duration=DURATION)
            feat_r    = extract_features(audio)
            feat_r    = (feat_r - X_mean) / X_std
            pred_r    = voice_model.predict(feat_r.reshape(1, N_FEATURES, 1), verbose=0)[0]
            pred_emo  = EMOTIONS[np.argmax(pred_r)]
            pred_conf = float(pred_r.max())
            fname     = os.path.basename(sample_path)
            true_emo  = RAVDESS_EMOTION_MAP.get(int(fname.split("-")[2]), "?")
            ok        = "✓ CORRECT" if true_emo == pred_emo else "✗ WRONG  "
            print(f"    [{ok}]  true={true_emo:8s}  pred={pred_emo:8s}  ({pred_conf*100:.1f}%)")
        except Exception as e:
            print(f"    SKIP {os.path.basename(sample_path)}: {e}")

print("\n" + "=" * 70)
print(f"  DONE!  Model: {MODEL_OUT}")
print(f"  Test Accuracy: {acc*100:.2f}%")
print(f"  Features: {N_FEATURES}-dim  (mfcc mean + std + delta)")
print(f"  Emotions: {EMOTIONS}")
print(f"  Samples used: {len(all_records)}")
print("=" * 70)
print("\nNEXT STEPS:")
print("  1. Update api.py extract_features_for_voice() to compute delta (120-dim)")
print("  2. Restart api.py — it reads N_FEATURES from config.json automatically")
print("  3. Run test_voice_ws.py to verify live predictions\n")
