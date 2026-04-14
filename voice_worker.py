"""
voice_worker.py — Isolated Voice Emotion Inference Worker
==========================================================
This script MUST be run as a subprocess by api.py, never imported directly.
It intentionally has NO TF_USE_LEGACY_KERAS environment variable set, which
allows native Keras 3.x to load cleanly without conflicting with the facial
model's legacy Keras environment in api.py.

Protocol:
  - Input:  raw float32 bytes from stdin (feature vector, pre-extracted by api.py)
  - Output: single JSON line to stdout: {"emotion": str, "confidence": float, "all": list}
  - Errors: printed to stderr, exit code 1

This isolation is the fix for Problem B (Keras Environment Conflict).
"""

import sys
import json
import os
import numpy as np

# Paths — must match api.py
VOICE_MODEL_PATH  = "audio models and  dataset/models/voice_model.h5"
VOICE_CONFIG_PATH = "audio models and  dataset/models/tfjs_voice/config.json"
VOICE_MEAN_PATH   = "audio models and  dataset/models/tfjs_voice/feature_mean.npy"
VOICE_STD_PATH    = "audio models and  dataset/models/tfjs_voice/feature_std.npy"


def main():
    # ── Load config ──────────────────────────────────────────────────────────
    try:
        with open(VOICE_CONFIG_PATH, "r") as f:
            cfg = json.load(f)
        VOICE_EMOTIONS = cfg["emotions"]
        N_FEATURES     = int(cfg.get("input_features", 80))
    except Exception as e:
        print(f"[voice_worker] Failed to load config: {e}", file=sys.stderr)
        sys.exit(1)

    # ── Load normalization stats ─────────────────────────────────────────────
    try:
        feature_mean = np.load(VOICE_MEAN_PATH)
        feature_std  = np.load(VOICE_STD_PATH)
    except Exception as e:
        print(f"[voice_worker] Failed to load norm stats: {e}", file=sys.stderr)
        # Fall back to identity normalization rather than crashing
        feature_mean = np.zeros(N_FEATURES, dtype=np.float32)
        feature_std  = np.ones(N_FEATURES, dtype=np.float32)

    # ── Load model with native Keras 3.x ─────────────────────────────────────
    # No TF_USE_LEGACY_KERAS set in this process — that's the entire point.
    try:
        import keras
        voice_model = keras.models.load_model(VOICE_MODEL_PATH, compile=False)
    except Exception as e:
        print(f"[voice_worker] Failed to load voice model: {e}", file=sys.stderr)
        sys.exit(1)

    # ── Read feature vector from stdin ───────────────────────────────────────
    try:
        raw_bytes = sys.stdin.buffer.read()
        if not raw_bytes:
            print("[voice_worker] No input received on stdin", file=sys.stderr)
            sys.exit(1)

        features = np.frombuffer(raw_bytes, dtype=np.float32).copy()

        if len(features) != N_FEATURES:
            print(
                f"[voice_worker] Feature length mismatch: got {len(features)}, expected {N_FEATURES}",
                file=sys.stderr
            )
            sys.exit(1)

    except Exception as e:
        print(f"[voice_worker] Failed to read features from stdin: {e}", file=sys.stderr)
        sys.exit(1)

    # ── Apply z-score normalization (same stats as training) ─────────────────
    # This is applied here, NOT in api.py, so the normalization always stays
    # co-located with the model that was trained with those exact statistics.
    features = (features - feature_mean) / (feature_std + 1e-8)

    # ── Run inference ─────────────────────────────────────────────────────────
    try:
        model_input = features.reshape(1, N_FEATURES, 1)
        raw_pred    = voice_model.predict(model_input, verbose=0)[0]

        idx      = int(np.argmax(raw_pred))
        emotion  = VOICE_EMOTIONS[idx]
        conf     = float(raw_pred[idx] * 100)

        result = {
            "emotion":    emotion,
            "confidence": round(conf, 2),
            "all":        [round(float(p), 6) for p in raw_pred],
        }
        print(json.dumps(result))

    except Exception as e:
        print(f"[voice_worker] Inference failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
