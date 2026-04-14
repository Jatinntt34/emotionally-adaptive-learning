import os
import pandas as pd
import shutil
from tqdm import tqdm

print("Starting FERPlus conversion...")

# paths
FERPLUS_CSV = "datasets/ferplus/fer2013new.csv"
FER2013_IMAGES = "datasets/fer2013_raw"
OUTPUT = "datasets/ferplus_images"

# emotion mapping
emotion_map = {
    "neutral": "neutral",
    "happiness": "happy",
    "surprise": "surprise",
    "sadness": "sad",
    "anger": "angry",
    "disgust": "disgust",
    "fear": "fear"
}

emotions = [
    "neutral",
    "happy",
    "surprise",
    "sad",
    "angry",
    "disgust",
    "fear"
]

splits = ["Training", "PublicTest", "PrivateTest"]

# create folders
for split in splits:
    for emotion in emotions:
        os.makedirs(os.path.join(OUTPUT, split, emotion), exist_ok=True)

# load csv
df = pd.read_csv(FERPLUS_CSV)

print("Columns detected:", df.columns)

copied = 0
skipped = 0

# iterate rows
for _, row in tqdm(df.iterrows(), total=len(df)):

    split = str(row["Usage"])

    img_name = str(row["Image name"])

    # skip invalid rows
    if img_name == "nan":
        skipped += 1
        continue

    # vote columns
    votes = row[[
        "neutral",
        "happiness",
        "surprise",
        "sadness",
        "anger",
        "disgust",
        "fear"
    ]]

    # get highest vote
    label = votes.idxmax()

    emotion = emotion_map[label]

    # build source path
    src = os.path.join(
        FER2013_IMAGES,
        split,
        emotion,
        img_name
    )

    dst = os.path.join(
        OUTPUT,
        split,
        emotion,
        img_name
    )

    if os.path.exists(src):

        shutil.copy(src, dst)
        copied += 1

    else:

        skipped += 1


print("\nFERPlus conversion finished.")
print("Images copied:", copied)
print("Skipped:", skipped)