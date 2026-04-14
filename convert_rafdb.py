import pandas as pd
import os
import shutil
from tqdm import tqdm

print("Starting RAF-DB conversion...")

BASE = "datasets/rafdb"
DATASET = os.path.join(BASE, "DATASET")

emotion_map = {
    1: "surprise",
    2: "fear",
    3: "disgust",
    4: "happy",
    5: "sad",
    6: "angry",
    7: "neutral"
}

def convert(csv_file, split):

    df = pd.read_csv(csv_file)

    img_col = "image"
    label_col = "label"

    copied = 0

    for _, row in tqdm(df.iterrows(), total=len(df)):

        img = row[img_col]
        label = int(row[label_col])

        emotion = emotion_map[label]

        src = os.path.join(DATASET, split, str(label), img)

        if not os.path.exists(src):
            continue

        dst = os.path.join(BASE, split, emotion, img)

        os.makedirs(os.path.dirname(dst), exist_ok=True)

        shutil.copy(src, dst)

        copied += 1

    print(f"{split} images copied:", copied)


convert(os.path.join(BASE, "train_labels.csv"), "train")
convert(os.path.join(BASE, "test_labels.csv"), "test")

print("RAF-DB conversion finished.")