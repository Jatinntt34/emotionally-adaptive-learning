import os, json, time, cv2, gc
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from torchvision import models, transforms
from tqdm import tqdm
import mediapipe as mp
import albumentations as A
from albumentations.pytorch import ToTensorV2
from sklearn.model_selection import train_test_split
from model_arch import EmotionModel

# =============================================================================
# CONFIGURATION & GPU SETUP
# =============================================================================
CONFIG = {
    "target_size": (224, 224),
    "batch_size": 24, # Optimized for RTX 3050 4GB
    "epochs": 20,
    "lr": 1e-4,
    "emotions": ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"],
    "model_path": "models/facial_emotion_v3.pth",
    "config_path": "models/facial_config.json"
}

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"[INFO] Using device: {DEVICE}")

# Singleton-style MediaPipe Alignment
class FaceAligner:
    def __init__(self):
        self.mp_face_mesh = None

    def align(self, image):
        if self.mp_face_mesh is None:
            self.mp_face_mesh = mp.solutions.face_mesh.FaceMesh(
                static_image_mode=True, max_num_faces=1, min_detection_confidence=0.5
            )
        
        try:
            results = self.mp_face_mesh.process(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
            if not results.multi_face_landmarks:
                return image
            
            h, w, _ = image.shape
            landmarks = results.multi_face_landmarks[0]
            left_eye = landmarks.landmark[33]
            right_eye = landmarks.landmark[263]
            
            dx = (right_eye.x - left_eye.x) * w
            dy = (right_eye.y - left_eye.y) * h
            angle = np.degrees(np.arctan2(dy, dx))
            
            center = (int((left_eye.x + right_eye.x) * w / 2), int((left_eye.y + right_eye.y) * h / 2))
            M = cv2.getRotationMatrix2D(center, angle, 1.0)
            return cv2.warpAffine(image, M, (w, h))
        except:
            return image

# =============================================================================
# DATASET & MODEL
# =============================================================================
class EmotionDataset(Dataset):
    def __init__(self, samples, transform=None, aligner=None):
        self.samples = samples
        self.transform = transform
        self.aligner = aligner
    def __len__(self): return len(self.samples)
    def __getitem__(self, idx):
        path, label = self.samples[idx]
        try:
            img = cv2.imread(path)
            if img is None: raise ValueError("Empty")
            img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            if self.aligner:
                img = self.aligner.align(img)
        except:
            img = np.zeros((224, 224, 3), dtype=np.uint8)
        
        if self.transform:
            img = self.transform(image=img)["image"]
        return img, torch.tensor(label, dtype=torch.long)

def gather_samples():
    samples = []
    # Combined (Direct folders)
    c_train = "datasets/combined/train"
    if os.path.exists(c_train):
        for i, emo in enumerate(CONFIG["emotions"]):
            d = os.path.join(c_train, emo)
            if os.path.exists(d):
                samples += [(os.path.join(d, f), i) for f in os.listdir(d) if f.lower().endswith(('.png', '.jpg'))]

    # CK+
    ck = "datasets/ckplus"
    if os.path.exists(ck):
        for i, emo in enumerate(CONFIG["emotions"]):
            d = os.path.join(ck, emo)
            if os.path.exists(d):
                samples += [(os.path.join(d, f), i) for f in os.listdir(d) if f.lower().endswith(('.png', '.jpg'))]

    # RAF-DB
    raf_csv = "datasets/rafdb/train_labels.csv"
    raf_img = "datasets/rafdb/train"
    if os.path.exists(raf_csv):
        import pandas as pd
        raf_map = {1: 6, 2: 2, 3: 1, 4: 3, 5: 5, 6: 0, 7: 4}
        df = pd.read_csv(raf_csv)
        for _, r in df.iterrows():
            p = os.path.join(raf_img, r['image'])
            if os.path.exists(p): samples.append((p, raf_map.get(r['label'], 4)))

    print(f"[INFO] Total training samples: {len(samples)}")
    return samples

# Loaded from model_arch

# =============================================================================
# MAIN TRAINING
# =============================================================================
def train():
    samples = gather_samples()
    if not samples: return print("[ERR] No data found")

    train_s, val_s = train_test_split(samples, test_size=0.15, random_state=42)
    
    tf = lambda t: A.Compose([
        A.Resize(224, 224),
        A.HorizontalFlip(p=0.5) if t else A.NoOp(),
        A.RandomBrightnessContrast(p=0.2) if t else A.NoOp(),
        A.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
        ToTensorV2()
    ])

    # Note: Aligner is DISABLED for raw training speed, can be enabled if user prefers.
    # aligner = FaceAligner() 
    
    train_loader = DataLoader(EmotionDataset(train_s, tf(True)), batch_size=CONFIG["batch_size"], shuffle=True, num_workers=2)
    val_loader   = DataLoader(EmotionDataset(val_s, tf(False)), batch_size=CONFIG["batch_size"], shuffle=False, num_workers=2)

    model = EmotionModel(len(CONFIG["emotions"])).to(DEVICE)
    optimizer = torch.optim.Adam(model.parameters(), lr=CONFIG["lr"])
    criterion = nn.CrossEntropyLoss()
    scaler = torch.amp.GradScaler('cuda')

    print("[INFO] Starting Training...")
    best_acc = 0
    for epoch in range(CONFIG["epochs"]):
        model.train()
        for imgs, labels in tqdm(train_loader, desc=f"Epoch {epoch+1}"):
            imgs, labels = imgs.to(DEVICE), labels.to(DEVICE)
            optimizer.zero_grad()
            with torch.amp.autocast('cuda'):
                loss = criterion(model(imgs), labels)
            
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()

        model.eval()
        correct, total = 0, 0
        with torch.no_grad():
            for imgs, labels in val_loader:
                imgs, labels = imgs.to(DEVICE), labels.to(DEVICE)
                _, pred = torch.max(model(imgs).data, 1)
                total += labels.size(0); correct += (pred == labels).sum().item()
        
        acc = 100 * correct / total
        print(f"Val Acc: {acc:.2f}%")
        if acc > best_acc:
            best_acc = acc
            torch.save(model.state_dict(), CONFIG["model_path"])
            with open(CONFIG["config_path"], 'w') as f:
                json.dump({"emotions": CONFIG["emotions"], "acc": acc}, f)
            print(f"[OK] Saved version with {acc:.2f}% accuracy")

if __name__ == "__main__":
    train()
