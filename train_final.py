import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers, models
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.callbacks import ModelCheckpoint, EarlyStopping, ReduceLROnPlateau
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import classification_report, confusion_matrix
import os
from sklearn.utils.class_weight import compute_class_weight
import zipfile
import json
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input
gpus = tf.config.list_physical_devices('GPU')
if gpus:
    tf.config.experimental.set_memory_growth(gpus[0], True)
gpus = tf.config.list_physical_devices('GPU')
if gpus:
    tf.config.set_visible_devices(gpus[0], 'GPU')
print("TensorFlow version:", tf.__version__)
print("GPU Available:", tf.config.list_physical_devices('GPU'))

DATASET_PATH = 'datasets/combined'
IMG_SIZE = 128
BATCH_SIZE = 32
EMOTIONS = ['angry', 'disgust', 'fear', 'happy', 'sad', 'surprise', 'neutral']
NUM_CLASSES = len(EMOTIONS)

print(f"\nDataset loaded!")
print(f"Emotions: {EMOTIONS}")
print(f"Image size: {IMG_SIZE}x{IMG_SIZE}")
print(f"Batch size: {BATCH_SIZE}")

print("\n=== CREATING DATA GENERATORS ===\n")

# Training data augmentation (IMPORTANT for better accuracy)
train_datagen = ImageDataGenerator(
    preprocessing_function=preprocess_input,
    rotation_range=10,
    width_shift_range=0.1,
    height_shift_range=0.1,
    horizontal_flip=True,
    zoom_range=0.1,
    shear_range=0.1,
    fill_mode='nearest'
)

# Validation/Test data (no augmentation)
test_datagen = ImageDataGenerator(preprocessing_function=preprocess_input)

# Load training data
train_generator = train_datagen.flow_from_directory(
    f'{DATASET_PATH}/train',
    target_size=(IMG_SIZE, IMG_SIZE),
    batch_size=BATCH_SIZE,
    class_mode='categorical',
    shuffle=True
)

# Load test data
test_generator = test_datagen.flow_from_directory(
    f'{DATASET_PATH}/test',
    target_size=(IMG_SIZE, IMG_SIZE),
    batch_size=BATCH_SIZE,
    class_mode='categorical',
    shuffle=False
)

print(f"Training samples: {train_generator.samples}")
print(f"Test samples: {test_generator.samples}")
print(f"Classes: {train_generator.class_indices}")

def create_emotion_model():
    """
    Creates emotion detection model using Transfer Learning
    Base: MobileNetV2 (lightweight, fast)
    Custom head for emotion classification
    """

    # Input layer (grayscale converted to RGB for MobileNetV2)
    inputs = layers.Input(shape=(IMG_SIZE, IMG_SIZE, 3))
    x = inputs
    # Load pre-trained MobileNetV2 (without top layer)
    base_model = MobileNetV2(
        input_shape=(IMG_SIZE, IMG_SIZE, 3),
        include_top=False,
        weights='imagenet'
    )

    # Freeze base model initially
    base_model.trainable = False

    # Pass through base model
    x = base_model(x, training=False)

    # Custom classification head
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.BatchNormalization()(x)
    x = layers.Dropout(0.5)(x)
    x = layers.Dense(512, activation='relu', kernel_regularizer=tf.keras.regularizers.l2(0.001))(x)
    x = layers.BatchNormalization()(x)
    x = layers.Dropout(0.3)(x)
    x = layers.Dense(256, activation='relu', kernel_regularizer=tf.keras.regularizers.l2(0.001))(x)
    x = layers.Dropout(0.2)(x)

    # Output layer
    outputs = layers.Dense(NUM_CLASSES, activation='softmax')(x)

    # Create model
    model = models.Model(inputs=inputs, outputs=outputs, name='EmotionDetector')

    return model, base_model

# Create the model
model, base_model = create_emotion_model()

print("\n=== COMPILING MODEL ===\n")

# Optimizer with learning rate schedule
initial_learning_rate = 0.001
lr_schedule = tf.keras.optimizers.schedules.ExponentialDecay(
    initial_learning_rate,
    decay_steps=1000,
    decay_rate=0.96,
    staircase=True
)

model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=0.0001),
    loss=tf.keras.losses.CategoricalCrossentropy(label_smoothing=0.1),
    metrics=['accuracy', tf.keras.metrics.Precision(), tf.keras.metrics.Recall()]
)

print("✅ Model compiled!")

# Create directory for saving models
os.makedirs('models', exist_ok=True)

# Callbacks
callbacks = [
    # Save best model
    ModelCheckpoint(
        'models/best_model.h5',
        monitor='val_accuracy',
        save_best_only=True,
        mode='max',
        verbose=1
    ),

    # Early stopping
    EarlyStopping(
        monitor='val_loss',
        patience=10,
        restore_best_weights=True,
        verbose=1
    ),

    # Reduce learning rate on plateau
    ReduceLROnPlateau(
        monitor='val_loss',
        factor=0.5,
        patience=5,
        min_lr=1e-7,
        verbose=1
    )
]

print("✅ Callbacks configured!")

print("\n=== TRAINING PHASE 1: Frozen Base Model ===\n")

class_weights = compute_class_weight(
    class_weight='balanced',
    classes=np.unique(train_generator.classes),
    y=train_generator.classes
)

class_weights = dict(enumerate(class_weights))

# Train with frozen base (fast, learns custom head)
EPOCHS_PHASE1 = 27

history_phase1 = model.fit(
    train_generator,
    epochs=EPOCHS_PHASE1,
    validation_data=test_generator,
    callbacks=callbacks,
    class_weight=class_weights,
    verbose=1
)

print("\n✅ Phase 1 training complete!")

print("\n=== TRAINING PHASE 2: Fine-tuning ===\n")

# Unfreeze last 60 layers of base model for fine-tuning
base_model.trainable = True
print(f"Total layers in base model: {len(base_model.layers)}")

# Freeze all except last 20 layers
for layer in base_model.layers[:-60]:
    layer.trainable = False
print(f"Trainable layers: {sum([1 for layer in base_model.layers if layer.trainable])}")

# Recompile with lower learning rate
model.compile(
    optimizer=tf.keras.optimizers.Adam(1e-5),
    loss=tf.keras.losses.CategoricalCrossentropy(label_smoothing=0.1),
    metrics=['accuracy', tf.keras.metrics.Precision(), tf.keras.metrics.Recall()]
)

# Continue training
EPOCHS_PHASE2 = 35

history_phase2 =model.fit(
    train_generator,
    epochs=EPOCHS_PHASE2,
    validation_data=test_generator,
    callbacks=callbacks,
    class_weight=class_weights,
    verbose=1
)

print("\n✅ Phase 2 training complete!")

# Load best model
best_model = tf.keras.models.load_model('models/best_model.h5')

# Evaluate on test set
test_loss, test_accuracy, test_precision, test_recall = best_model.evaluate(test_generator)

print(f"\n📊 FINAL RESULTS:")
print(f"Test Accuracy: {test_accuracy*100:.2f}%")
print(f"Test Precision: {test_precision*100:.2}%", "%")
print(f"Test Recall: {test_recall*100:.2}%", "%")
print(f"Test Loss: {test_loss:.4f}")

# Calculate F1 Score
f1_score = 2 * (test_precision * test_recall) / (test_precision + test_recall)
print(f"F1 Score: {f1_score*100:.2}%", "%")


# Get predictions
test_generator.reset()
predictions = best_model.predict(test_generator, verbose=1)
predicted_classes = np.argmax(predictions, axis=1)
true_classes = test_generator.classes

# Confusion Matrix
cm = confusion_matrix(true_classes, predicted_classes)

# Plot confusion matrix
plt.figure(figsize=(10, 8))
sns.heatmap(cm, annot=True, fmt='d', cmap='Blues',
            xticklabels=EMOTIONS, yticklabels=EMOTIONS)
plt.title('Confusion Matrix')
plt.ylabel('True Label')
plt.xlabel('Predicted Label')
plt.savefig('confusion_matrix.png', dpi=300, bbox_inches='tight')
plt.show()

# Classification Report
print("\n📊 CLASSIFICATION REPORT:\n")
print(classification_report(true_classes, predicted_classes, target_names=EMOTIONS))


# Combine both training phases
history_combined = {
    'accuracy': history_phase1.history['accuracy'] + history_phase2.history['accuracy'],
    'val_accuracy': history_phase1.history['val_accuracy'] + history_phase2.history['val_accuracy'],
    'loss': history_phase1.history['loss'] + history_phase2.history['loss'],
    'val_loss': history_phase1.history['val_loss'] + history_phase2.history['val_loss']
}

# Plot accuracy
plt.figure(figsize=(14, 5))

plt.subplot(1, 2, 1)
plt.plot(history_combined['accuracy'], label='Training Accuracy')
plt.plot(history_combined['val_accuracy'], label='Validation Accuracy')
plt.axvline(x=EPOCHS_PHASE1, color='r', linestyle='--', label='Fine-tuning starts')
plt.title('Model Accuracy')
plt.ylabel('Accuracy')
plt.xlabel('Epoch')
plt.legend()
plt.grid(True)

plt.subplot(1, 2, 2)
plt.plot(history_combined['loss'], label='Training Loss')
plt.plot(history_combined['val_loss'], label='Validation Loss')
plt.axvline(x=EPOCHS_PHASE1, color='r', linestyle='--', label='Fine-tuning starts')
plt.title('Model Loss')
plt.ylabel('Loss')
plt.xlabel('Epoch')
plt.legend()
plt.grid(True)

plt.tight_layout()
plt.savefig('training_history.png', dpi=300, bbox_inches='tight')
plt.show()
# 1. Save as H5 (TensorFlow/Keras format)
best_model.save('models/emotion_model.h5')
print("✅ Saved as: emotion_model.h5")

# 2. Save as SavedModel format
best_model.save('models/emotion_model_saved')
print("✅ Saved as: emotion_model_saved/")