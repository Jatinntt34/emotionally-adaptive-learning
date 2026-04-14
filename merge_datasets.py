import os
import shutil
from tqdm import tqdm

print("Starting dataset merge...")

EMOTIONS = ['angry','disgust','fear','happy','sad','surprise','neutral']

# create folders
for split in ["train", "test"]:
    for emotion in EMOTIONS:
        os.makedirs(f"datasets/combined/{split}/{emotion}", exist_ok=True)

total = 0

# =====================================================
# FER2013 (from fer2013_raw)
# =====================================================
print("Merging FER2013")

fer_path = "datasets/fer2013_raw"

split_map = {
    "Training": "train",
    "PublicTest": "test",
    "PrivateTest": "test"
}

if os.path.exists(fer_path):
    for orig_split, new_split in split_map.items():
        for emotion in EMOTIONS:
            src_path = os.path.join(fer_path, orig_split, emotion)

            if os.path.exists(src_path):
                for img in tqdm(os.listdir(src_path), desc=f"FER2013 {orig_split}/{emotion}"):
                    try:
                        src = os.path.join(src_path, img)
                        dst = f"datasets/combined/{new_split}/{emotion}/fer_{img}"
                        shutil.copy(src, dst)
                        total += 1
                    except:
                        continue

# =====================================================
# FERPLUS (from ferplus_images)
# =====================================================
print("Merging FERPlus")

ferplus_path = "datasets/ferplus_images"

if os.path.exists(ferplus_path):
    for orig_split, new_split in split_map.items():
        for emotion in EMOTIONS:
            src_path = os.path.join(ferplus_path, orig_split, emotion)

            if os.path.exists(src_path):
                for img in tqdm(os.listdir(src_path), desc=f"FERPlus {orig_split}/{emotion}"):
                    try:
                        src = os.path.join(src_path, img)
                        dst = f"datasets/combined/{new_split}/{emotion}/ferplus_{img}"
                        shutil.copy(src, dst)
                        total += 1
                    except:
                        continue

# =====================================================
# RAF-DB
# =====================================================
print("Merging RAFDB")

raf_path = "datasets/rafdb"

if os.path.exists(raf_path):
    for split in ["train", "test"]:
        for emotion in EMOTIONS:
            src_path = os.path.join(raf_path, split, emotion)

            if os.path.exists(src_path):
                for img in tqdm(os.listdir(src_path), desc=f"RAFDB {split}/{emotion}"):
                    try:
                        src = os.path.join(src_path, img)
                        dst = f"datasets/combined/{split}/{emotion}/raf_{img}"
                        shutil.copy(src, dst)
                        total += 1
                    except:
                        continue

# =====================================================
# CK+
# =====================================================
print("Merging CK+")

ck_path = "datasets/ckplus"

if os.path.exists(ck_path):
    for root, dirs, files in os.walk(ck_path):
        for file in files:
            if file.endswith(('.png','.jpg','.jpeg')):
                for emotion in EMOTIONS:
                    if emotion in root.lower():
                        try:
                            src = os.path.join(root, file)
                            split = "train" if os.urandom(1)[0] > 50 else "test"
                            dst = f"datasets/combined/{split}/{emotion}/ck_{file}"
                            shutil.copy(src, dst)
                            total += 1
                        except:
                            continue
                        break

# =====================================================
# JAFFE
# =====================================================
print("Merging JAFFE")

jaffe_path = "datasets/jaffe"

emotion_map = {
    'AN': 'angry',
    'DI': 'disgust',
    'FE': 'fear',
    'HA': 'happy',
    'SA': 'sad',
    'SU': 'surprise',
    'NE': 'neutral'
}

if os.path.exists(jaffe_path):
    for file in os.listdir(jaffe_path):
        if file.endswith(('.tiff','.jpg','.png')):
            try:
                code = file.split('.')[1][:2].upper()
                if code in emotion_map:
                    emotion = emotion_map[code]

                    src = os.path.join(jaffe_path, file)
                    split = "train" if os.urandom(1)[0] > 50 else "test"
                    dst = f"datasets/combined/{split}/{emotion}/jaffe_{file}.jpg"

                    shutil.copy(src, dst)
                    total += 1
            except:
                continue

# =====================================================
print("\nDone")
print(f"Total images merged: {total}")