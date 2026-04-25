import os, json, torch, librosa, random
import numpy as np
from pathlib import Path
from tqdm import tqdm
from sklearn.model_selection import train_test_split
from sklearn.utils.class_weight import compute_class_weight
from transformers import (
    Wav2Vec2ForSequenceClassification,
    Wav2Vec2FeatureExtractor,
    TrainingArguments,
    Trainer
)
from datasets import Dataset

# ============= CONFIG =============
EMOTIONS = ["angry", "calm", "disgust", "fear", "happy", "neutral", "sad"]
EMO_TO_IDX = {e: i for i, e in enumerate(EMOTIONS)}
SR = 16000
MAX_SEC = 4
MAX_SAMPLES = SR * MAX_SEC

def load_and_pad(path):
    try:
        y, _ = librosa.load(path, sr=SR)
        if len(y) > MAX_SAMPLES: y = y[:MAX_SAMPLES]
        else: y = np.pad(y, (0, MAX_SAMPLES - len(y)))
        return y
    except: return np.zeros(MAX_SAMPLES)

def load_ravdess(base_dir):
    samples = []
    # Filename: 03-01-XX... XX is emotion
    # 01=neutral, 02=calm, 03=happy, 04=sad, 05=angry, 06=fear, 07=disgust, 08=surprise
    mapping = {"01":"neutral", "02":"calm", "03":"happy", "04":"sad", "05":"angry", "06":"fear", "07":"disgust"}
    for f in Path(base_dir).rglob("*.wav"):
        parts = f.name.split("-")
        if len(parts) >= 3 and parts[2] in mapping:
            samples.append((str(f), EMO_TO_IDX[mapping[parts[2]]]))
    return samples

def load_tess(base_dir):
    samples = []
    # Folder based or filename based (e.g. OAF_angry)
    for f in Path(base_dir).rglob("*.wav"):
        name = f.name.lower()
        for e in EMOTIONS:
            if e in name:
                samples.append((str(f), EMO_TO_IDX[e]))
                break
    return samples

def load_all_voice():
    # Robust path handling for the specific local filesystem
    paths = [
        ("audio models and  dataset/datasets/ravdess", "ravdess"),
        ("audio models and  dataset/datasets/tess", "tess"),
        ("datasets/voice", "generic")
    ]
    total = []
    for p, t in paths:
        if not os.path.exists(p): continue
        print(f"[INFO] Loading {t} from {p}...")
        if t == "ravdess": total += load_ravdess(p)
        elif t == "tess": total += load_tess(p)
        else:
            for f in Path(p).rglob("*.wav"):
                for e in EMOTIONS:
                    if e in f.name.lower():
                        total.append((str(f), EMO_TO_IDX[e]))
                        break
    print(f"[INFO] Found {len(total)} total voice samples")
    return total

class WeightedTrainer(Trainer):
    def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
        labels = inputs.pop("labels")
        outputs = model(**inputs)
        logits = outputs.logits
        if not hasattr(self, "class_weights"):
            self.class_weights = torch.ones(len(EMOTIONS)).to(model.device)
        loss_fct = torch.nn.CrossEntropyLoss(weight=self.class_weights)
        loss = loss_fct(logits, labels)
        return (loss, outputs) if return_outputs else loss

def train():
    samples = load_all_voice()
    if not samples: return print("[ERR] No audio data found")

    train_s, val_s = train_test_split(samples, test_size=0.1, random_state=42)
    
    extractor = Wav2Vec2FeatureExtractor.from_pretrained("facebook/wav2vec2-base")
    
    def process(batch_samples):
        inputs = [load_and_pad(s[0]) for s in batch_samples]
        labels = [s[1] for s in batch_samples]
        features = extractor(inputs, sampling_rate=SR, return_tensors="pt", padding=True)
        features["labels"] = torch.tensor(labels)
        return features

    # Simplified Trainer structure for robustness
    model = Wav2Vec2ForSequenceClassification.from_pretrained(
        "facebook/wav2vec2-base", num_labels=len(EMOTIONS)
    )

    training_args = TrainingArguments(
        output_dir="./models/voice_tmp",
        num_train_epochs=10,
        per_device_train_batch_size=4, # Keep low for 4GB VRAM
        gradient_accumulation_steps=4,
        learning_rate=3e-5,
        fp16=True,
        evaluation_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        logging_steps=10
    )

    # Compute weights
    y_train = [s[1] for s in train_s]
    weights = compute_class_weight('balanced', classes=np.unique(y_train), y=y_train)
    class_weights = torch.tensor(weights, dtype=torch.float).to("cuda" if torch.cuda.is_available() else "cpu")

    # Data collation logic
    def collate_fn(batch):
        return process(batch)

    trainer = WeightedTrainer(
        model=model,
        args=training_args,
        train_dataset=train_s,
        eval_dataset=val_s,
        data_collator=collate_fn,
    )
    trainer.class_weights = class_weights

    print("[INFO] Starting Voice Training...")
    trainer.train()
    
    model.save_pretrained("models/voice_model")
    print("[OK] Voice model saved to models/voice_model")

if __name__ == "__main__":
    train()
