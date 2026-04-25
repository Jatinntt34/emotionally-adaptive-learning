import torch
import torch.nn as nn
from torchvision import models
import json

class EmotionModel(nn.Module):
    def __init__(self, num_classes):
        super().__init__()
        self.backbone = models.efficientnet_b2()
        in_feats = self.backbone.classifier[1].in_features
        self.backbone.classifier = nn.Sequential(
            nn.Linear(in_feats, 512),
            nn.ReLU(),
            nn.Dropout(0.4),
            nn.Linear(512, 256),
            nn.ReLU(),
            nn.Linear(256, num_classes)
        )
    def forward(self, x): return self.backbone(x)

def test():
    try:
        model = EmotionModel(7)
        dummy_input = torch.randn(1, 3, 224, 224)
        output = model(dummy_input)
        print(f"[OK] Logic test: Input {dummy_input.shape} -> Output {output.shape}")
        return True
    except Exception as e:
        print(f"[ERR] Logic failure: {e}")
        return False

if __name__ == "__main__":
    test()
