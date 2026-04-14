# LOCAL EMOTION DETECTION TRAINING (STABLE VERSION)

import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

import tensorflow as tf
from tensorflow.keras import layers, models
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from tensorflow.keras.callbacks import ModelCheckpoint, EarlyStopping, ReduceLROnPlateau
from tensorflow.keras.applications import EfficientNetB1

import numpy as np
import cv2
from tqdm import tqdm
from sklearn.metrics import classification_report, confusion_matrix
import matplotlib.pyplot as plt
import seaborn as sns
import json

print("="*70)
print("EMOTION DETECTION TRAINING")
print("="*70)

# ================= GPU CHECK =================

print("\nChecking GPU...")

gpus = tf.config.list_physical_devices('GPU')

if gpus:
    for gpu in gpus:
        tf.config.experimental.set_memory_growth(gpu, True)

    print("GPU detected:", gpus[0].name)

else:
    print("No GPU detected. Training will run on CPU.")

print("TensorFlow:", tf.__version__)

# ================= DATASET CHECK =================

print("\nChecking datasets...")

if not os.path.exists("datasets"):
    raise Exception("datasets folder not found")

EMOTIONS = ['angry','disgust','fear','happy','sad','surprise','neutral']

os.makedirs("datasets/combined/train", exist_ok=True)
os.makedirs("datasets/combined/test", exist_ok=True)

for e in EMOTIONS:
    os.makedirs(f"datasets/combined/train/{e}", exist_ok=True)
    os.makedirs(f"datasets/combined/test/{e}", exist_ok=True)

# ================= DATASET PROCESSING =================

def process_datasets():

    total = 0

    print("\nProcessing FER2013")

    for split in ['train','test']:

        base = f"datasets/fer2013/{split}"

        if not os.path.exists(base):
            continue

        for emotion in EMOTIONS:

            path = f"{base}/{emotion}"

            if not os.path.exists(path):
                continue

            for img in tqdm(os.listdir(path)):

                src = f"{path}/{img}"
                dst = f"datasets/combined/{split}/{emotion}/fer_{img}"

                try:

                    im = cv2.imread(src, cv2.IMREAD_GRAYSCALE)

                    if im is None:
                        continue

                    im = cv2.resize(im,(48,48))
                    cv2.imwrite(dst,im)

                    total += 1

                except:
                    pass

    print("FER2013 images:", total)

process_datasets()

# ================= DATA GENERATORS =================

print("\nCreating generators...")

BATCH_SIZE = 32

train_datagen = ImageDataGenerator(
    rescale=1./255,
    rotation_range=20,
    width_shift_range=0.2,
    height_shift_range=0.2,
    horizontal_flip=True,
    zoom_range=0.2,
    validation_split=0.15
)

test_datagen = ImageDataGenerator(rescale=1./255)

train_gen = train_datagen.flow_from_directory(
    "datasets/combined/train",
    target_size=(48,48),
    batch_size=BATCH_SIZE,
    color_mode="grayscale",
    subset="training"
)

val_gen = train_datagen.flow_from_directory(
    "datasets/combined/train",
    target_size=(48,48),
    batch_size=BATCH_SIZE,
    color_mode="grayscale",
    subset="validation"
)

test_gen = test_datagen.flow_from_directory(
    "datasets/combined/test",
    target_size=(48,48),
    batch_size=BATCH_SIZE,
    color_mode="grayscale"
)

# ================= MODEL =================

print("\nBuilding model...")

inputs = layers.Input(shape=(48,48,1))

x = layers.Conv2D(3,(1,1),padding="same")(inputs)

base = EfficientNetB1(
    include_top=False,
    weights="imagenet",
    input_shape=(48,48,3)
)

base.trainable = False

x = base(x)
x = layers.GlobalAveragePooling2D()(x)
x = layers.BatchNormalization()(x)
x = layers.Dropout(0.5)(x)

x = layers.Dense(256,activation="relu")(x)
x = layers.Dropout(0.4)(x)

outputs = layers.Dense(7,activation="softmax")(x)

model = models.Model(inputs,outputs)

print("Model params:", model.count_params())

# ================= COMPILE =================

model.compile(
    optimizer=tf.keras.optimizers.Adam(0.001),
    loss="categorical_crossentropy",
    metrics=["accuracy"]
)

# ================= CALLBACKS =================

os.makedirs("models",exist_ok=True)

callbacks = [

    ModelCheckpoint(
        "models/best_model.h5",
        monitor="val_accuracy",
        save_best_only=True
    ),

    EarlyStopping(
        monitor="val_loss",
        patience=10,
        restore_best_weights=True
    ),

    ReduceLROnPlateau(
        monitor="val_loss",
        factor=0.5,
        patience=5
    )
]

# ================= TRAINING =================

print("\nStarting training...")

history = model.fit(
    train_gen,
    epochs=20,
    validation_data=val_gen,
    callbacks=callbacks
)

# ================= EVALUATION =================

print("\nEvaluating...")

model = tf.keras.models.load_model("models/best_model.h5")

results = model.evaluate(test_gen)

print("Accuracy:", results[1])

# ================= SAVE =================

model.save("models/emotion_model.h5")
model.save("models/saved_model")

print("\nTraining complete.")
