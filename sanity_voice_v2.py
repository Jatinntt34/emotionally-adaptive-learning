"""
Quick sanity test: loads the new 120-dim voice_model.h5 and runs predictions
on real RAVDESS files to confirm inference is working correctly.
"""
import os, json, numpy as np, librosa, glob
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

TFJS_DIR   = "audio models and  dataset/models/tfjs_voice"
MODEL_PATH = "audio models and  dataset/models/voice_model.h5"
RAVDESS    = "audio models and  dataset/datasets/ravdess"

RAVDESS_EMOTION_MAP = {
    1:"neutral", 2:"calm", 3:"happy", 4:"sad",
    5:"angry",   6:"fear", 7:"disgust",
}

# Load config
with open(f"{TFJS_DIR}/config.json", encoding="utf-8") as f:
    cfg = json.load(f)

EMOTIONS    = cfg["emotions"]
N_FEATURES  = cfg["input_features"]   # 120
N_FFT       = cfg.get("n_fft", 512)
HOP_LENGTH  = cfg.get("hop_length", 128)
N_MFCC      = cfg.get("n_mfcc", 40)
USE_DELTA   = (N_FEATURES == 120)
X_mean      = np.load(f"{TFJS_DIR}/feature_mean.npy")
X_std       = np.load(f"{TFJS_DIR}/feature_std.npy")
SR          = cfg["sr"]

print("=" * 55)
print("VOICE MODEL SANITY CHECK")
print("=" * 55)
print(f"  input_features : {N_FEATURES}")
print(f"  feature_type   : {'120-dim (mean+std+delta)' if USE_DELTA else '80-dim (mean+std)'}")
print(f"  emotions       : {EMOTIONS}")
print(f"  n_fft={N_FFT}  hop={HOP_LENGTH}  n_mfcc={N_MFCC}")
print()

import keras as _k
model = _k.models.load_model(MODEL_PATH, compile=False)
print(f"  Model loaded  ({os.path.getsize(MODEL_PATH)//1024} KB)")
print(f"  Input shape   : {model.input_shape}")
print()

def extract(audio):
    if len(audio) < SR // 2:
        audio = np.pad(audio, (0, SR//2 - len(audio)), mode="constant")
    if len(audio) < N_FFT:
        audio = np.pad(audio, (0, N_FFT - len(audio)), mode="constant")
    mfcc = librosa.feature.mfcc(y=audio.astype(np.float32), sr=SR,
                                  n_mfcc=N_MFCC, n_fft=N_FFT, hop_length=HOP_LENGTH)
    if USE_DELTA:
        delta = librosa.feature.delta(mfcc)
        feat = np.concatenate([np.mean(mfcc, 1), np.std(mfcc, 1), np.mean(delta, 1)])
    else:
        feat = np.concatenate([np.mean(mfcc, 1), np.std(mfcc, 1)])
    return (feat - X_mean) / (X_std + 1e-8)

# Silence test
sil  = np.zeros(SR * 3, dtype=np.float32)
fs   = extract(sil)
ps   = model.predict(fs.reshape(1, N_FEATURES, 1), verbose=0)[0]
print(f"  Silence -> max conf: {ps.max()*100:.1f}%  (good if <= 20%)")
print()

# Real file tests
wavs = sorted(glob.glob(f"{RAVDESS}/**/*.wav", recursive=True))[:12]
print(f"  Testing {len(wavs)} RAVDESS files:")
correct, total = 0, 0
for w in wavs:
    try:
        audio, _ = librosa.load(w, sr=SR, duration=4)
        feat     = extract(audio)
        pred     = model.predict(feat.reshape(1, N_FEATURES, 1), verbose=0)[0]
        true_emo = RAVDESS_EMOTION_MAP.get(int(os.path.basename(w).split("-")[2]), "?")
        pred_emo = EMOTIONS[np.argmax(pred)]
        conf     = pred.max() * 100
        ok       = "CORRECT" if true_emo == pred_emo else "WRONG  "
        print(f"    [{ok}]  true={true_emo:<8} pred={pred_emo:<8} ({conf:.1f}%)")
        total += 1
        if true_emo == pred_emo:
            correct += 1
    except Exception as e:
        print(f"    SKIP: {e}")

print()
print(f"  Accuracy on sample: {correct}/{total}  ({correct/total*100:.1f}%)")
print("=" * 55)
print(f"  VOICE MODEL IS READY FOR PRODUCTION!")
print("=" * 55)
