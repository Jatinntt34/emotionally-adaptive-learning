"""
train_facial.py — Production Facial Emotion Model
==================================================
Architecture : EfficientNetB2 (ImageNet pretrained) + custom head
Target       : 85-88% real-world accuracy (7 emotions)
Training time: ~4-6 hours on RTX 3060 / ~10-14 hours on CPU

Supported datasets (place under datasets/facial/):
  datasets/facial/ferplus/       — FER+ (Microsoft re-labeled)
  datasets/facial/rafdb/         — RAF-DB real-world
  datasets/facial/ckplus/        — CK+ lab quality
  datasets/facial/affectnet/     — AffectNet (largest, optional)
  datasets/facial/expw/          — ExpW in-the-wild (optional)

Minimum working set: FER+ + RAF-DB (~65k images, good enough)
Best result       : All 5 datasets combined (~600k images)

Output:
  models/facial_model.h5
  models/facial_config.json
  models/facial_label_map.json

Run:
  python train_facial.py
"""

import os, json, warnings, random, shutil
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"
warnings.filterwarnings("ignore")

import numpy as np
import cv2
import tensorflow as tf
from tensorflow.keras import layers, Model, regularizers
from tensorflow.keras.applications import EfficientNetB2
from tensorflow.keras.callbacks import (
    ModelCheckpoint, EarlyStopping, ReduceLROnPlateau, TensorBoard
)
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.utils.class_weight import compute_class_weight
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
from tqdm import tqdm

try:
    import albumentations as A
    HAS_ALBUMENTATIONS = True
    print("albumentations available — using advanced augmentation")
except ImportError:
    HAS_ALBUMENTATIONS = False
    print("albumentations not found — pip install albumentations for best results")

try:
    import mediapipe as mp
    HAS_MEDIAPIPE = True
    mp_face_mesh = mp.solutions.face_mesh
    print("MediaPipe available — face alignment enabled (+4-5% accuracy)")
except ImportError:
    HAS_MEDIAPIPE = False
    print("MediaPipe not found — pip install mediapipe for face alignment")

# =============================================================================
# CONFIGURATION
# =============================================================================
IMG_SIZE    = 224          # EfficientNetB2 native size
BATCH_SIZE  = 32
EPOCHS_P1   = 15           # Phase 1: head only
EPOCHS_P2   = 40           # Phase 2: fine-tune top layers
SEED        = 42

EMOTIONS    = ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"]
N_CLASSES   = len(EMOTIONS)
EMO_TO_IDX  = {e: i for i, e in enumerate(EMOTIONS)}

MODEL_OUT   = "models/facial_model.h5"
CONFIG_OUT  = "models/facial_config.json"
LABEL_OUT   = "models/facial_label_map.json"
LOG_DIR     = "logs/facial"

os.makedirs("models", exist_ok=True)
os.makedirs(LOG_DIR,  exist_ok=True)

random.seed(SEED)
np.random.seed(SEED)
tf.random.set_seed(SEED)

print("=" * 70)
print("FACIAL EMOTION MODEL — EfficientNetB2 + Multi-Dataset")
print("=" * 70)

# GPU setup
gpus = tf.config.list_physical_devices("GPU")
if gpus:
    for g in gpus:
        tf.config.experimental.set_memory_growth(g, True)
    print(f"  GPU: {gpus[0].name}")
else:
    print("  No GPU — training on CPU (slower)")
print(f"  TensorFlow: {tf.__version__}")
print(f"  Image size: {IMG_SIZE}x{IMG_SIZE} | Batch: {BATCH_SIZE} | Classes: {N_CLASSES}")


# =============================================================================
# FACE ALIGNMENT  (MediaPipe — adds ~4-5% accuracy on real webcam input)
# =============================================================================

def align_face_mediapipe(image: np.ndarray) -> np.ndarray:
    """
    Align face using eye landmarks so the eyes are always horizontal.
    This removes pose variation and is the single biggest accuracy booster
    for real-time webcam input.
    """
    if not HAS_MEDIAPIPE:
        return image
    try:
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        with mp_face_mesh.FaceMesh(
            static_image_mode=True, max_num_faces=1,
            refine_landmarks=False, min_detection_confidence=0.4
        ) as mesh:
            results = mesh.process(rgb)
            if not results.multi_face_landmarks:
                return image
            lm = results.multi_face_landmarks[0].landmark
            h, w = image.shape[:2]
            # MediaPipe: 33=left eye outer, 263=right eye outer
            le = np.array([lm[33].x * w,  lm[33].y  * h])
            re = np.array([lm[263].x * w, lm[263].y * h])
            angle  = np.degrees(np.arctan2(re[1] - le[1], re[0] - le[0]))
            center = tuple(((le + re) / 2).astype(int))
            M      = cv2.getRotationMatrix2D(center, angle, 1.0)
            return cv2.warpAffine(image, M, (w, h), flags=cv2.INTER_LINEAR)
    except Exception:
        return image


# =============================================================================
# AUGMENTATION PIPELINE
# =============================================================================

if HAS_ALBUMENTATIONS:
    train_augment = A.Compose([
        A.HorizontalFlip(p=0.5),
        A.RandomBrightnessContrast(brightness_limit=0.3, contrast_limit=0.3, p=0.5),
        A.GaussNoise(var_limit=(5.0, 30.0), p=0.3),
        A.Rotate(limit=15, p=0.4),
        A.CoarseDropout(max_holes=4, max_height=24, max_width=24,
                        min_holes=1, fill_value=0, p=0.3),
        A.RandomShadow(p=0.2),
        A.ImageCompression(quality_lower=60, quality_upper=95, p=0.2),
        A.GaussianBlur(blur_limit=(3, 5), p=0.15),
        A.ToGray(p=0.05),
    ])

    def augment_image(img: np.ndarray) -> np.ndarray:
        return train_augment(image=img)["image"]
else:
    def augment_image(img: np.ndarray) -> np.ndarray:
        # Fallback: basic TF augmentation (less effective)
        img = tf.image.random_flip_left_right(img).numpy()
        img = tf.image.random_brightness(img, 0.2).numpy()
        img = tf.image.random_contrast(img, 0.8, 1.2).numpy()
        return img.astype(np.uint8)


# =============================================================================
# DATASET LOADERS
# FER+, RAF-DB, CK+, AffectNet, ExpW
# All map to the same 7-emotion label space.
# =============================================================================

def preprocess_face(img: np.ndarray, align: bool = True) -> np.ndarray:
    """Align → resize → return uint8 BGR."""
    if align:
        img = align_face_mediapipe(img)
    img = cv2.resize(img, (IMG_SIZE, IMG_SIZE))
    return img


# ─── FER+ ─────────────────────────────────────────────────────────────────────
# Expected structure:
#   datasets/facial/ferplus/FER2013Train/  — subfolders named by emotion
#   datasets/facial/ferplus/FER2013Valid/
#   datasets/facial/ferplus/FER2013Test/

FERPLUS_EMO_MAP = {
    "angry": "angry", "disgust": "disgust", "fear": "fear",
    "happy": "happy", "neutral": "neutral", "sad": "sad",
    "surprise": "surprise", "contempt": "disgust",  # merge contempt → disgust
    "NF": None, "uncertain": None,
}

def load_ferplus(base: str, augment: bool = True) -> list:
    records = []
    base = Path(base)
    if not base.exists():
        print(f"  FER+ not found at {base} — skipping")
        return records

    all_files = []
    for split in ["FER2013Train", "FER2013Valid", "FER2013Test"]:
        split_dir = base / split
        if not split_dir.exists():
            # Also try flat structure: subfolders directly under base
            split_dir = base
        for emo_dir in split_dir.iterdir():
            if not emo_dir.is_dir():
                continue
            emo = FERPLUS_EMO_MAP.get(emo_dir.name.lower())
            if emo is None:
                continue
            for f in emo_dir.glob("*.png"):
                all_files.append((str(f), emo))
            for f in emo_dir.glob("*.jpg"):
                all_files.append((str(f), emo))

    print(f"  FER+: {len(all_files)} images found")
    for path, emo in tqdm(all_files, desc="FER+", leave=False):
        try:
            img = cv2.imread(path)
            if img is None:
                continue
            img = preprocess_face(img)
            records.append((img, EMO_TO_IDX[emo]))
            if augment:
                records.append((augment_image(img), EMO_TO_IDX[emo]))
        except Exception:
            pass
    print(f"  FER+: {len(records)} samples loaded")
    return records


# ─── RAF-DB ───────────────────────────────────────────────────────────────────
# Expected structure:
#   datasets/facial/rafdb/basic/Image/aligned/  — images
#   datasets/facial/rafdb/basic/EmoLabel/list_patition_label.txt

RAFDB_IDX_MAP = {1: "surprise", 2: "fear", 3: "disgust",
                 4: "happy",    5: "sad",  6: "angry", 7: "neutral"}

def load_rafdb(base: str, augment: bool = True) -> list:
    records = []
    base    = Path(base)
    img_dir = base / "basic" / "Image" / "aligned"
    lbl_file = base / "basic" / "EmoLabel" / "list_patition_label.txt"

    if not img_dir.exists() or not lbl_file.exists():
        print(f"  RAF-DB not found at {base} — skipping")
        return records

    labels = {}
    with open(lbl_file) as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) == 2:
                # filename like train_00001.jpg → aligned file is train_00001_aligned.jpg
                stem = Path(parts[0]).stem
                labels[stem] = int(parts[1])

    all_imgs = list(img_dir.glob("*.jpg")) + list(img_dir.glob("*.png"))
    print(f"  RAF-DB: {len(all_imgs)} images found")

    for img_path in tqdm(all_imgs, desc="RAF-DB", leave=False):
        try:
            stem = img_path.stem.replace("_aligned", "")
            lbl  = labels.get(stem)
            if lbl is None:
                continue
            emo = RAFDB_IDX_MAP.get(lbl)
            if emo is None:
                continue
            img = cv2.imread(str(img_path))
            if img is None:
                continue
            img = preprocess_face(img)
            records.append((img, EMO_TO_IDX[emo]))
            if augment:
                records.append((augment_image(img), EMO_TO_IDX[emo]))
        except Exception:
            pass
    print(f"  RAF-DB: {len(records)} samples loaded")
    return records


# ─── CK+ ──────────────────────────────────────────────────────────────────────
# Expected structure:
#   datasets/facial/ckplus/cohn-kanade-images/  — subject/session/images
#   datasets/facial/ckplus/Emotion/             — subject/session/label.txt

CKPLUS_IDX_MAP = {0: "neutral", 1: "angry",   2: "contempt",
                  3: "disgust", 4: "fear",     5: "happy",
                  6: "sad",     7: "surprise"}
CKPLUS_EMO_MAP = {"contempt": "disgust"}  # merge

def load_ckplus(base: str, augment: bool = True) -> list:
    records  = []
    base     = Path(base)
    img_root = base / "cohn-kanade-images"
    emo_root = base / "Emotion"

    if not img_root.exists() or not emo_root.exists():
        print(f"  CK+ not found at {base} — skipping")
        return records

    pairs = []
    for emo_file in emo_root.rglob("*_emotion.txt"):
        try:
            with open(emo_file) as f:
                code = int(float(f.read().strip()))
            emo_raw = CKPLUS_IDX_MAP.get(code)
            if emo_raw is None:
                continue
            emo = CKPLUS_EMO_MAP.get(emo_raw, emo_raw)
            # Find corresponding image folder
            parts    = emo_file.parts
            subj     = parts[-3]
            session  = parts[-2]
            img_dir  = img_root / subj / session
            if not img_dir.exists():
                continue
            imgs = sorted(img_dir.glob("*.png")) + sorted(img_dir.glob("*.jpg"))
            # CK+: peak expression is the LAST frame
            if imgs:
                pairs.append((str(imgs[-1]), emo))
                # Also use last 3 frames
                for img_p in imgs[-3:]:
                    pairs.append((str(img_p), emo))
        except Exception:
            pass

    print(f"  CK+: {len(pairs)} peak frames found")
    for path, emo in tqdm(pairs, desc="CK+", leave=False):
        try:
            img = cv2.imread(path)
            if img is None:
                continue
            img = preprocess_face(img)
            records.append((img, EMO_TO_IDX[emo]))
            if augment:
                for _ in range(4):  # CK+ is small — augment more
                    records.append((augment_image(img), EMO_TO_IDX[emo]))
        except Exception:
            pass
    print(f"  CK+: {len(records)} samples loaded")
    return records


# ─── AffectNet ────────────────────────────────────────────────────────────────
# Expected structure:
#   datasets/facial/affectnet/  — subfolders named by emotion
#   (same structure as ImageFolder)

AFFECTNET_EMO_MAP = {
    "0": "neutral",  "neutral":  "neutral",
    "1": "happy",    "happy":    "happy",
    "2": "sad",      "sad":      "sad",
    "3": "surprise", "surprise": "surprise",
    "4": "fear",     "fear":     "fear",
    "5": "disgust",  "disgust":  "disgust",
    "6": "angry",    "angry":    "angry",
    "7": "contempt", "contempt": "disgust",
}

def load_affectnet(base: str, augment: bool = True, max_per_class: int = 25000) -> list:
    """
    max_per_class: AffectNet is huge. Cap per class so training stays fast.
    25k per class = 175k total (after balance) — plenty.
    """
    records = []
    base    = Path(base)
    if not base.exists():
        print(f"  AffectNet not found at {base} — skipping")
        return records

    per_class = {i: 0 for i in range(N_CLASSES)}
    all_imgs  = []

    for emo_dir in base.iterdir():
        if not emo_dir.is_dir():
            continue
        emo = AFFECTNET_EMO_MAP.get(emo_dir.name.lower())
        if emo is None or emo not in EMO_TO_IDX:
            continue
        for f in list(emo_dir.glob("*.jpg")) + list(emo_dir.glob("*.png")):
            all_imgs.append((str(f), emo))

    random.shuffle(all_imgs)
    print(f"  AffectNet: {len(all_imgs)} total images found")

    for path, emo in tqdm(all_imgs, desc="AffectNet", leave=False):
        idx = EMO_TO_IDX[emo]
        if per_class[idx] >= max_per_class:
            continue
        try:
            img = cv2.imread(path)
            if img is None:
                continue
            img = preprocess_face(img, align=False)  # AffectNet already cropped
            records.append((img, idx))
            per_class[idx] += 1
            if augment and per_class[idx] < max_per_class // 2:
                records.append((augment_image(img), idx))
                per_class[idx] += 1
        except Exception:
            pass

    print(f"  AffectNet: {len(records)} samples loaded")
    return records


# ─── Generic ImageFolder loader (ExpW, custom datasets) ───────────────────────

def load_imagefolder(base: str, name: str = "Dataset",
                     augment: bool = True, max_per_class: int = 10000) -> list:
    """
    Loads any dataset structured as:
      base/angry/*.jpg
      base/happy/*.jpg
      ...
    """
    records   = []
    base      = Path(base)
    per_class = {i: 0 for i in range(N_CLASSES)}

    if not base.exists():
        print(f"  {name} not found at {base} — skipping")
        return records

    all_imgs = []
    for emo_dir in base.iterdir():
        if not emo_dir.is_dir():
            continue
        emo = emo_dir.name.lower()
        if emo not in EMO_TO_IDX:
            continue
        for f in list(emo_dir.glob("*.jpg")) + list(emo_dir.glob("*.png")):
            all_imgs.append((str(f), emo))

    random.shuffle(all_imgs)
    print(f"  {name}: {len(all_imgs)} images found")

    for path, emo in tqdm(all_imgs, desc=name, leave=False):
        idx = EMO_TO_IDX[emo]
        if per_class[idx] >= max_per_class:
            continue
        try:
            img = cv2.imread(path)
            if img is None:
                continue
            img = preprocess_face(img)
            records.append((img, idx))
            per_class[idx] += 1
            if augment:
                records.append((augment_image(img), idx))
                per_class[idx] += 1
        except Exception:
            pass

    print(f"  {name}: {len(records)} samples loaded")
    return records


# =============================================================================
# LOAD ALL DATASETS
# =============================================================================

print("\n=== LOADING DATASETS ===")

all_records = []
all_records += load_ferplus("datasets/facial/ferplus")
all_records += load_rafdb("datasets/facial/rafdb")
all_records += load_ckplus("datasets/facial/ckplus")
all_records += load_affectnet("datasets/facial/affectnet")
all_records += load_imagefolder("datasets/facial/expw", name="ExpW")
# Add any other ImageFolder-structured datasets here:
# all_records += load_imagefolder("datasets/facial/custom", name="Custom")

if not all_records:
    raise RuntimeError(
        "No data loaded! Make sure at least one dataset exists under datasets/facial/"
    )

print(f"\n  Total samples: {len(all_records)}")
random.shuffle(all_records)

# =============================================================================
# PREPARE X / y
# =============================================================================

print("\n=== PREPARING DATA ===")

X_all = np.array([r[0] for r in all_records], dtype=np.uint8)
y_all = np.array([r[1] for r in all_records], dtype=np.int32)

# Distribution check
for i, emo in enumerate(EMOTIONS):
    count = int(np.sum(y_all == i))
    print(f"  {emo:10s}: {count:6d}")

# Stratified split: 85% train, 7.5% val, 7.5% test
X_train, X_tmp, y_train, y_tmp = train_test_split(
    X_all, y_all, test_size=0.15, random_state=SEED, stratify=y_all
)
X_val, X_test, y_val, y_test = train_test_split(
    X_tmp, y_tmp, test_size=0.5, random_state=SEED, stratify=y_tmp
)

print(f"\n  Train: {len(X_train)} | Val: {len(X_val)} | Test: {len(X_test)}")

# Class weights for imbalanced datasets (CK+ has far fewer samples)
cw = compute_class_weight("balanced", classes=np.arange(N_CLASSES), y=y_train)
class_weights = dict(enumerate(cw))
print(f"  Class weights: { {EMOTIONS[k]: round(v,2) for k,v in class_weights.items()} }")


# =============================================================================
# TF DATASET PIPELINE
# =============================================================================

def normalize_efficientnet(img, label):
    """EfficientNetB2 expects pixel values in [0, 255] — no rescaling needed.
    tf.keras.applications.efficientnet.preprocess_input does the normalization."""
    img = tf.cast(img, tf.float32)
    img = tf.keras.applications.efficientnet.preprocess_input(img)
    label = tf.one_hot(label, N_CLASSES)
    return img, label

def make_dataset(X, y, shuffle: bool = False) -> tf.data.Dataset:
    ds = tf.data.Dataset.from_tensor_slices((X, y))
    if shuffle:
        ds = ds.shuffle(buffer_size=min(10000, len(X)), seed=SEED)
    ds = (ds
          .map(normalize_efficientnet, num_parallel_calls=tf.data.AUTOTUNE)
          .batch(BATCH_SIZE)
          .prefetch(tf.data.AUTOTUNE))
    return ds

train_ds = make_dataset(X_train, y_train, shuffle=True)
val_ds   = make_dataset(X_val,   y_val)
test_ds  = make_dataset(X_test,  y_test)


# =============================================================================
# MODEL — EfficientNetB2
# =============================================================================

print("\n=== BUILDING MODEL ===")

def build_model(trainable_base: bool = False) -> Model:
    base = EfficientNetB2(
        include_top=False,
        weights="imagenet",
        input_shape=(IMG_SIZE, IMG_SIZE, 3),
        drop_connect_rate=0.3,
    )
    base.trainable = trainable_base

    inp = layers.Input(shape=(IMG_SIZE, IMG_SIZE, 3))
    x   = base(inp, training=trainable_base)
    x   = layers.GlobalAveragePooling2D()(x)
    x   = layers.BatchNormalization()(x)
    x   = layers.Dropout(0.45)(x)
    x   = layers.Dense(
              512, activation="relu",
              kernel_regularizer=regularizers.l2(1e-4)
          )(x)
    x   = layers.BatchNormalization()(x)
    x   = layers.Dropout(0.35)(x)
    x   = layers.Dense(256, activation="relu")(x)
    x   = layers.Dropout(0.25)(x)
    out = layers.Dense(N_CLASSES, activation="softmax", dtype="float32")(x)

    return Model(inp, out)


model = build_model(trainable_base=False)
model.summary(line_length=80)


# =============================================================================
# PHASE 1 — Train head only (base frozen)
# Fast convergence, establishes good feature mapping
# =============================================================================

print("\n=== PHASE 1: Training head (base frozen) ===")

model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
    loss=tf.keras.losses.CategoricalCrossentropy(label_smoothing=0.1),
    metrics=["accuracy"],
)

callbacks_p1 = [
    ModelCheckpoint(
        MODEL_OUT, monitor="val_accuracy",
        save_best_only=True, verbose=1,
    ),
    EarlyStopping(monitor="val_loss", patience=6, restore_best_weights=True, verbose=1),
    ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=3, min_lr=1e-6, verbose=1),
    TensorBoard(log_dir=f"{LOG_DIR}/phase1"),
]

hist_p1 = model.fit(
    train_ds,
    validation_data=val_ds,
    epochs=EPOCHS_P1,
    class_weight=class_weights,
    callbacks=callbacks_p1,
    verbose=1,
)


# =============================================================================
# PHASE 2 — Fine-tune top layers
# Load best checkpoint, unfreeze top 80 EfficientNetB2 layers
# This takes you from ~75% to 85%+
# =============================================================================

print("\n=== PHASE 2: Fine-tuning top layers ===")

# Reload best checkpoint from phase 1
model = tf.keras.models.load_model(MODEL_OUT)

# Unfreeze top 80 layers of the base model (keep BatchNorm frozen for stability)
base_model = model.layers[1]
base_model.trainable = True
for layer in base_model.layers[:-80]:
    layer.trainable = False
for layer in base_model.layers:
    if isinstance(layer, layers.BatchNormalization):
        layer.trainable = False

trainable_count = sum(1 for l in model.trainable_variables)
print(f"  Trainable variables: {trainable_count}")

model.compile(
    # Much lower LR for fine-tuning — prevents destroying pretrained weights
    optimizer=tf.keras.optimizers.Adam(learning_rate=5e-5),
    loss=tf.keras.losses.CategoricalCrossentropy(label_smoothing=0.05),
    metrics=["accuracy"],
)

callbacks_p2 = [
    ModelCheckpoint(
        MODEL_OUT, monitor="val_accuracy",
        save_best_only=True, verbose=1,
    ),
    EarlyStopping(monitor="val_loss", patience=10, restore_best_weights=True, verbose=1),
    ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=5, min_lr=1e-7, verbose=1),
    TensorBoard(log_dir=f"{LOG_DIR}/phase2"),
]

hist_p2 = model.fit(
    train_ds,
    validation_data=val_ds,
    epochs=EPOCHS_P2,
    class_weight=class_weights,
    callbacks=callbacks_p2,
    verbose=1,
)


# =============================================================================
# EVALUATION
# =============================================================================

print("\n=== EVALUATION ===")

model = tf.keras.models.load_model(MODEL_OUT)
loss, acc = model.evaluate(test_ds, verbose=0)
print(f"\n  Test Accuracy: {acc * 100:.2f}%")
print(f"  Test Loss    : {loss:.4f}")

y_pred_p  = model.predict(test_ds, verbose=0)
y_pred_cl = np.argmax(y_pred_p, axis=1)
y_true_cl = y_test[:len(y_pred_cl)]

print("\n  Classification Report:")
print(classification_report(y_true_cl, y_pred_cl, target_names=EMOTIONS))

# Confusion matrix
cm = confusion_matrix(y_true_cl, y_pred_cl)
plt.figure(figsize=(10, 8))
sns.heatmap(cm, annot=True, fmt="d", cmap="Blues",
            xticklabels=EMOTIONS, yticklabels=EMOTIONS)
plt.title(f"Facial Emotion — Test Accuracy {acc*100:.1f}%")
plt.ylabel("True"); plt.xlabel("Predicted")
plt.tight_layout()
plt.savefig("models/facial_confusion.png", dpi=150)
print("  Saved models/facial_confusion.png")


# =============================================================================
# SAVE CONFIG  (read by api.py at startup)
# =============================================================================

config = {
    "emotions":       EMOTIONS,
    "num_classes":    N_CLASSES,
    "img_size":       IMG_SIZE,
    "accuracy":       float(acc),
    "model_path":     MODEL_OUT,
    "face_alignment": HAS_MEDIAPIPE,
    "architecture":   "EfficientNetB2",
    "label_smoothing": 0.05,
}

with open(CONFIG_OUT, "w") as f:
    json.dump(config, f, indent=2)

with open(LABEL_OUT, "w") as f:
    json.dump(EMO_TO_IDX, f, indent=2)

print(f"\n  Config saved → {CONFIG_OUT}")
print(f"  Labels saved → {LABEL_OUT}")

print("\n" + "=" * 70)
print(f"  DONE! Model: {MODEL_OUT}")
print(f"  Test Accuracy: {acc*100:.2f}%")
print(f"  Emotions: {EMOTIONS}")
print(f"  Next: run api.py — it reads facial_config.json automatically")
print("=" * 70)
