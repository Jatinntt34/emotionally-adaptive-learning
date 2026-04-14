import pandas as pd
import os
import numpy as np
import cv2
from tqdm import tqdm

print("Rebuilding FER2013 images with correct names...")

CSV_PATH = "datasets/raw_fer2013/fer2013.csv"
OUTPUT = "datasets/fer2013_raw"

emotion_map = {
    0:"angry",
    1:"disgust",
    2:"fear",
    3:"happy",
    4:"sad",
    5:"surprise",
    6:"neutral"
}

df = pd.read_csv(CSV_PATH)

for split in ["Training","PublicTest","PrivateTest"]:
    for e in emotion_map.values():
        os.makedirs(os.path.join(OUTPUT,split,e),exist_ok=True)

for i,row in tqdm(df.iterrows(), total=len(df)):

    pixels = np.array(row["pixels"].split(),dtype="uint8")
    img = pixels.reshape(48,48)

    emotion = emotion_map[row["emotion"]]
    split = row["Usage"]

    # THIS is the important fix
    name = f"fer{i:07d}.png"

    path = os.path.join(
        OUTPUT,
        split,
        emotion,
        name
    )

    cv2.imwrite(path,img)

print("FER2013 rebuild complete.")