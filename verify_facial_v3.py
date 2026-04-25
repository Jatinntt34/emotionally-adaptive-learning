import torch
import torch.nn as nn
from model_arch import EmotionModel
import numpy as np

def verify():
    print("[INFO] Testing Facial Model Loading...")
    try:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = EmotionModel(num_classes=7)
        state_dict = torch.load("models/facial_emotion_v3.pth", map_location=device)
        model.load_state_dict(state_dict)
        model.to(device)
        model.eval()
        print(f"[OK] Model loaded successfully on {device}")
        
        # Dummy inference
        dummy_input = torch.randn(1, 3, 224, 224).to(device)
        with torch.no_grad():
            output = model(dummy_input)
            probs = torch.softmax(output, dim=-1)
            print(f"[OK] Inference successful. Output shape: {output.shape}")
            print(f"[OK] Probs: {probs.cpu().numpy()}")
            
    except Exception as e:
        print(f"[FAIL] {e}")

if __name__ == "__main__":
    verify()
