import json, numpy as np, os, sys

cfg_path   = "audio models and  dataset/models/tfjs_voice/config.json"
mean_path  = "audio models and  dataset/models/tfjs_voice/feature_mean.npy"
std_path   = "audio models and  dataset/models/tfjs_voice/feature_std.npy"
model_path = "audio models and  dataset/models/voice_model.h5"

print("=" * 55)
print("RETRAIN OUTPUT CHECK")
print("=" * 55)

for label, path in [
    ("voice_model.h5", model_path),
    ("config.json",    cfg_path),
    ("feature_mean",   mean_path),
    ("feature_std",    std_path),
]:
    if os.path.exists(path):
        kb = os.path.getsize(path) // 1024
        mtime = os.path.getmtime(path)
        import datetime
        dt = datetime.datetime.fromtimestamp(mtime).strftime("%H:%M:%S")
        print(f"  [OK] {label:<20} {kb:>6} KB   saved at {dt}")
    else:
        print(f"  [MISSING] {label}")

print()
print("=== CONFIG.JSON CONTENTS ===")
try:
    with open(cfg_path, encoding="utf-8") as f:
        cfg = json.load(f)
    print(f"  input_features : {cfg['input_features']}")
    print(f"  emotions       : {cfg['emotions']}")
    print(f"  num_classes    : {cfg['num_classes']}")
    print(f"  accuracy       : {cfg['accuracy']*100:.2f}%")
    print(f"  feature_type   : {cfg.get('feature_type', 'NOT SET (old 80-dim)')}")
    print(f"  n_fft          : {cfg.get('n_fft', 'NOT SET')}")
    mean = np.load(mean_path)
    std  = np.load(std_path)
    print(f"  feature_mean   : shape={mean.shape}")
    print(f"  feature_std    : shape={std.shape}")
    print()
    if cfg["input_features"] == 120:
        print("  RESULT: 120-dim v2 model is READY!")
    else:
        print("  RESULT: Still 80-dim config - config not updated yet")
        sys.exit(1)
except Exception as e:
    print(f"  ERROR reading config: {e}")
    sys.exit(1)
