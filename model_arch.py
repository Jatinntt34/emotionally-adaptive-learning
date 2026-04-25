import torch
import torch.nn as nn
from torchvision import models

class EmotionModel(nn.Module):
    def __init__(self, num_classes=7):
        super().__init__()
        # Using EfficientNetB2 for the best balance of depth and parameter efficiency
        self.backbone = models.efficientnet_b2(weights='DEFAULT')
        in_feats = self.backbone.classifier[1].in_features
        self.backbone.classifier = nn.Sequential(
            nn.Linear(in_feats, 512),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(512, 256),
            nn.ReLU(),
            nn.Linear(256, num_classes)
        )
    def forward(self, x):
        return self.backbone(x)
