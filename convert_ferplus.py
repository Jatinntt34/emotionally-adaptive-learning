import pandas as pd
import os
import shutil
from tqdm import tqdm

print("Starting FERPlus conversion...")

CSV = "datasets/ferplus/fer2013new.csv"
FER2013 = "datasets/fer2013"
OUT = "datasets/ferplus_processed"

emotions = [
    "neutral",
    "happy",
    "surprise",
    "sad",
    "angry",
    "disgust",
    "fear"
]

vote_columns = [
    "neutral",
    "happiness",
    "surprise",
    "sadness",
    "anger",
    "disgust",
    "fear"
]

# Create output folders
for split in ["train", "test"]:
    for e in emotions:
        os.makedirs(f"{OUT}/{split}/{e}", exist_ok=True)

print("Indexing FER2013 images...")

image_index = {}

for split in ["train", "test"]:
    split_path = os.path.join(FER2013, split)

    for emotion in os.listdir(split_path):
        emo_path = os.path.join(split_path, emotion)

        for img in os.listdir(emo_path):
            name = os.path.splitext(img)[0]   # remove extension
            image_index[name] = os.path.join(emo_path, img)

print("Images indexed:", len(image_index))

df = pd.read_csv(CSV)

copied = 0
skipped = 0

for _, row in tqdm(df.iterrows(), total=len(df)):

    img = row["Image name"]

    if not isinstance(img, str):
        skipped += 1
        continue

    base = os.path.splitext(img)[0]

    votes = [row[v] for v in vote_columns]
    label = votes.index(max(votes))
    emotion = emotions[label]

    split = "train" if row["Usage"] == "Training" else "test"

    if base in image_index:
        src = image_index[base]
        dst = os.path.join(OUT, split, emotion, img)

        shutil.copy(src, dst)
        copied += 1
    else:
        skipped += 1

print("Images copied:", copied)
print("Skipped:", skipped)
print("FERPlus conversion finished.")