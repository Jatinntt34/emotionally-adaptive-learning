import cv2
import os
import sys
import json
import re
import subprocess
from collections import Counter
import time
import random
import uvicorn
import urllib.request
import urllib.parse as _uparse
from motor.motor_asyncio import AsyncIOMotorClient
import bcrypt
import jwt
from datetime import datetime, timedelta
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from bson import ObjectId
from urllib.parse import quote_plus
from pydantic import BaseModel, EmailStr, Field
from dotenv import load_dotenv
from typing import List, Optional
import hashlib
from pathlib import Path

load_dotenv()
api_key = os.environ.get("GEMINI_API_KEY")

try:
    from google import genai as google_genai
    from google.genai import types as genai_types
    GENAI_CLIENT = google_genai.Client(api_key=api_key) if api_key else None

    AVAILABLE_MODELS = []
    BEST_MODEL = "gemini-1.5-flash"
    if GENAI_CLIENT:
        try:
            AVAILABLE_MODELS = [m.name for m in GENAI_CLIENT.models.list()]
            flash_models = [m for m in AVAILABLE_MODELS if "flash" in m.lower()]
            if any("2.5" in m for m in flash_models):
                BEST_MODEL = next(m for m in flash_models if "2.5" in m)
            elif any("1.5" in m for m in flash_models):
                BEST_MODEL = next(m for m in flash_models if "1.5" in m)
            elif flash_models:
                BEST_MODEL = flash_models[0]
            print(f"Detected Gemini environment. Using model: {BEST_MODEL}")
        except Exception as _me:
            print(f"Model discovery failed, using default: {_me}")
except Exception as _e:
    print(f"Warning: google-genai SDK not available: {_e}")
    GENAI_CLIENT = None
    BEST_MODEL = "gemini-1.5-flash"

# =============================================================================
# KERAS ISOLATION — FIX FOR PROBLEM B
# TF_USE_LEGACY_KERAS=1 is set ONLY for the facial model (TF/MobileNetV2).
# The voice model runs in a completely separate subprocess (voice_worker.py)
# with NO environment override, so it uses native Keras 3.x cleanly.
# Never set this env var before voice model code.
# =============================================================================
os.environ["TF_USE_LEGACY_KERAS"] = "1"
import tensorflow as tf
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input
import numpy as np
import base64
import librosa

# --- Constants for Resilience ---
MAX_RETRIES          = 3
INITIAL_BACKOFF_TIME = 2

class ApiClientError(Exception):
    pass

def is_server_error(e: Exception) -> bool:
    msg = str(e).lower()
    return any(x in msg for x in ["500", "503", "internal server error", "unavailable"])


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {
        "status": "online",
        "message": "MoodLearn Emotionally Adaptive API",
        "version": "1.0.0",
        "endpoints": ["/api/auth", "/api/paths", "/ws/emotion", "/api/health"]
    }

@app.get("/health")
@app.get("/api/health")
async def health_check():
    health = {"status": "healthy", "timestamp": datetime.utcnow()}
    try:
        await db_client.admin.command('ping')
        health["mongodb"] = "connected"
    except Exception as e:
        health["mongodb"] = f"error: {str(e)}"
        health["status"] = "degraded"
    health["facial_model"] = "loaded" if model is not None else "not_loaded"
    if model is None:
        health["status"] = "degraded"
    return health

# =============================================================================
# DATABASE CONFIG
# =============================================================================
MONGO_URI = os.environ.get("MONGODB_URI")
JWT_SECRET = os.environ.get("JWT_SECRET", "default_secret_for_dev_only")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

db_client = AsyncIOMotorClient(MONGO_URI)
db = db_client.get_database("moodlearn_db")
users_col    = db.get_collection("users")
paths_col    = db.get_collection("paths")
emotions_col = db.get_collection("emotions")

# =============================================================================
# CACHE SETUP
# =============================================================================
WORKSPACE_ROOT = Path("c:/Users/JATIN/Desktop/models and datasets/facial models and dataset")
CACHE_DIR = WORKSPACE_ROOT / "cache" / "paths"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

# =============================================================================
# AUTH UTILS
# =============================================================================
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

def create_access_token(data: dict):
    to_encode = data.copy()
    to_encode.update({"exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    exc = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Could not validate credentials",
                        headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if not email:
            raise exc
    except jwt.PyJWTError:
        raise exc
    user = await users_col.find_one({"email": email})
    if not user:
        raise exc
    return user

# =============================================================================
# PYDANTIC MODELS
# =============================================================================
class UserAuth(BaseModel):
    email: EmailStr
    password: str
    displayName: Optional[str] = None

class CompletedModule(BaseModel):
    id: int
    title: str
    type: str
    completedAt: datetime = Field(default_factory=datetime.utcnow)

class PathSaveRequest(BaseModel):
    topic: str
    goal: str
    mood: str
    speed: str
    format: str
    totalModules: int
    modules: List[dict]

class PathRequest(BaseModel):
    topic: str
    goal: str
    mood: str
    format: str
    speed: str
    suggestedDifficulty: str

# =============================================================================
# FACIAL EMOTION MODEL
# Loaded under TF_USE_LEGACY_KERAS=1 — works fine for MobileNetV2
# =============================================================================
IMG_SIZE = 128
EMOTIONS = ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"]
MODEL_PATH = "models/emotion_model.h5"
HAARCASCADE_PATH = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"

try:
    model = tf.keras.models.load_model(MODEL_PATH)
    print(f"Loaded facial model from {MODEL_PATH}")
except Exception as e:
    print(f"Error loading facial model: {e}")
    model = None

try:
    face_cascade = cv2.CascadeClassifier(HAARCASCADE_PATH)
    if face_cascade.empty():
        raise IOError("Could not load Haar Cascade XML file")
    print("Loaded Haar Cascade")
except IOError as e:
    print(f"Error loading Haar Cascade: {e}")
    face_cascade = None


def predict_emotion(face_img):
    """
    Run facial emotion inference.
    Confidence threshold enforced at the WebSocket level (>= 45%).
    No manual weight biasing — model softmax probabilities are used as-is.
    """
    if model is None:
        return "neutral", 0.0
    face_img = cv2.resize(face_img, (IMG_SIZE, IMG_SIZE))
    if len(face_img.shape) == 3:
        face_img = cv2.cvtColor(face_img, cv2.COLOR_BGR2RGB)
    arr = preprocess_input(np.expand_dims(tf.keras.preprocessing.image.img_to_array(face_img), 0))
    preds = model.predict(arr, verbose=0)[0]
    idx = np.argmax(preds)
    return EMOTIONS[idx], float(preds[idx] * 100)


# =============================================================================
# VOICE EMOTION MODEL — SUBPROCESS ISOLATION  (FIX FOR PROBLEM B)
# =============================================================================
# The voice model (Keras 3.x) cannot coexist with TF_USE_LEGACY_KERAS=1 in
# the same Python process. We run voice_worker.py as a child process with a
# clean environment (no TF_USE_LEGACY_KERAS set), pass the raw feature vector
# over stdin, and read the JSON prediction from stdout.
#
# voice_worker.py must live in the same directory as api.py.
# =============================================================================
VOICE_WORKER_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "voice_worker.py")

# Load voice config for feature extraction constants (still needed in api.py)
VOICE_CONFIG_PATH = "audio models and  dataset/models/tfjs_voice/config.json"
VOICE_MEAN_PATH   = "audio models and  dataset/models/tfjs_voice/feature_mean.npy"
VOICE_STD_PATH    = "audio models and  dataset/models/tfjs_voice/feature_std.npy"

try:
    with open(VOICE_CONFIG_PATH, "r") as _vcf:
        _vcfg = json.load(_vcf)
    VOICE_EMOTIONS        = _vcfg["emotions"]
    _VOICE_N_FEATURES_CFG = int(_vcfg.get("input_features", 80))
    print(f"Voice emotions from config: {VOICE_EMOTIONS}")
    print(f"Voice model input_features from config: {_VOICE_N_FEATURES_CFG}")
except Exception as _ve:
    print(f"Warning: could not load voice config, using defaults: {_ve}")
    VOICE_EMOTIONS        = ["angry", "calm", "disgust", "fear", "happy", "neutral", "sad"]
    _VOICE_N_FEATURES_CFG = 80

# ─────────────────────────────────────────────────────────────────────────────
# VOICE FEATURE EXTRACTION CONSTANTS
# These MUST stay in sync with retrain_voice.py / retrain_voice_v2.py
# ─────────────────────────────────────────────────────────────────────────────
_VOICE_N_FFT      = 512    # locked — matches retrain scripts
_VOICE_HOP_LENGTH = 128    # N_FFT // 4
_VOICE_N_MFCC     = 40
_VOICE_N_FEATURES = _VOICE_N_FEATURES_CFG
_VOICE_USE_DELTA  = (_VOICE_N_FEATURES == 120)

print(f"Voice feature mode: {'120-dim with delta' if _VOICE_USE_DELTA else '80-dim mean+std'}")


def extract_features_for_voice(audio_chunk, sr=22050):
    """
    Extract MFCC features from raw audio.

    FIX — Problem A (Normalization Mismatch):
    Audio is normalized to a fixed RMS target BEFORE MFCC extraction.
    This compensates for the studio-vs-laptop-mic amplitude difference that
    caused the static feature_mean.npy z-score to receive out-of-distribution
    values, producing random predictions.

    NOTE: The per-feature z-score normalization (using feature_mean/std .npy)
    is intentionally NOT applied here anymore — it is applied inside
    voice_worker.py where the normalization arrays are loaded alongside
    the model, keeping everything in one place.
    """
    try:
        audio_chunk = audio_chunk.astype(np.float32)

        # ── Per-frame amplitude normalization (FIX for Problem A) ───────────
        # Normalize to a consistent RMS level before feature extraction.
        # This removes the mic-hardware dependent amplitude variation that
        # shifts the MFCC distribution away from the training data.
        target_rms = 0.05
        current_rms = float(np.sqrt(np.mean(audio_chunk ** 2)))
        if current_rms > 1e-6:
            audio_chunk = audio_chunk * (target_rms / current_rms)
        # ────────────────────────────────────────────────────────────────────

        min_length = sr // 2
        if len(audio_chunk) < min_length:
            audio_chunk = np.pad(audio_chunk, (0, min_length - len(audio_chunk)), mode="constant")

        if len(audio_chunk) < _VOICE_N_FFT:
            audio_chunk = np.pad(audio_chunk, (0, _VOICE_N_FFT - len(audio_chunk)), mode="constant")

        mfcc = librosa.feature.mfcc(
            y=audio_chunk,
            sr=sr,
            n_mfcc=_VOICE_N_MFCC,
            n_fft=_VOICE_N_FFT,
            hop_length=_VOICE_HOP_LENGTH,
        )

        if _VOICE_USE_DELTA:
            delta    = librosa.feature.delta(mfcc)
            features = np.concatenate([
                np.mean(mfcc,  axis=1),
                np.std(mfcc,   axis=1),
                np.mean(delta, axis=1),
            ])
        else:
            features = np.concatenate([np.mean(mfcc, axis=1), np.std(mfcc, axis=1)])

        return features
    except Exception as e:
        print(f"Error extracting voice features: {e}")
        return None


def predict_voice_emotion(features: np.ndarray) -> tuple:
    """
    Run voice emotion inference in an isolated subprocess.

    This is the core fix for Problem B (Keras Environment Conflict).
    voice_worker.py runs with a clean environment — no TF_USE_LEGACY_KERAS —
    so native Keras 3.x loads without conflict with the facial model's
    TF_USE_LEGACY_KERAS=1 environment.

    Communication: raw float32 bytes over stdin → JSON over stdout.

    Returns: (emotion: str, confidence: float, all_probs: list)
    """
    try:
        # Build a clean environment without the legacy keras flag
        clean_env = os.environ.copy()
        clean_env.pop("TF_USE_LEGACY_KERAS", None)

        proc = subprocess.run(
            [sys.executable, VOICE_WORKER_PATH],
            input=features.astype(np.float32).tobytes(),
            capture_output=True,
            timeout=10,
            env=clean_env
        )
        if proc.returncode != 0:
            stderr = proc.stderr.decode(errors="replace")[:300]
            print(f"  [Voice worker error] {stderr}")
            return "neutral", 0.0, []

        result = json.loads(proc.stdout.decode().strip())
        return result["emotion"], result["confidence"], result.get("all", [])

    except subprocess.TimeoutExpired:
        print("  [Voice worker] Timeout — subprocess took >10s")
        return "neutral", 0.0, []
    except Exception as e:
        print(f"  [Voice subprocess] {e}")
        return "neutral", 0.0, []


# =============================================================================
# AUTH ROUTES
# =============================================================================
@app.post("/api/auth/signup")
async def signup(user: UserAuth):
    if await users_col.find_one({"email": user.email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    await users_col.insert_one({
        "email": user.email, "password": hash_password(user.password),
        "displayName": user.displayName, "createdAt": datetime.utcnow()
    })
    token = create_access_token({"sub": user.email})
    return {"status": "success", "access_token": token,
            "user": {"email": user.email, "displayName": user.displayName}}


@app.post("/api/auth/login")
async def login(user: UserAuth):
    db_user = await users_col.find_one({"email": user.email})
    if not db_user or not verify_password(user.password, db_user["password"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    token = create_access_token({"sub": user.email})
    return {"status": "success", "access_token": token,
            "user": {"email": db_user["email"], "displayName": db_user.get("displayName")}}


@app.get("/api/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {"email": current_user["email"], "displayName": current_user.get("displayName"),
            "id": str(current_user["_id"])}


# =============================================================================
# WEBSOCKET — FACIAL EMOTION DETECTION
# =============================================================================
@app.websocket("/ws/emotion")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("Client connected to /ws/emotion")

    # Rolling smoothing buffer for facial predictions
    _FACIAL_SMOOTH_N = 3
    _facial_hist: list = []

    try:
        while True:
            data = await websocket.receive_text()
            if "," in data:
                data = data.split(",")[1]
            try:
                frame = cv2.imdecode(np.frombuffer(base64.b64decode(data), np.uint8), cv2.IMREAD_COLOR)
                if frame is None:
                    continue

                if face_cascade is None:
                    await websocket.send_json({"status": "error", "message": "Face cascade not loaded"})
                    continue

                faces = face_cascade.detectMultiScale(
                    cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), 1.1, 5, minSize=(30, 30))

                if len(faces) > 0:
                    (x, y, w, h) = max(faces, key=lambda f: f[2] * f[3])
                    roi = frame[y:y+h, x:x+w]
                    if roi.size > 0:
                        emotion, conf = predict_emotion(roi)

                        # Rolling smoothing (same pattern as voice)
                        _facial_hist.append(emotion)
                        if len(_facial_hist) > _FACIAL_SMOOTH_N:
                            _facial_hist.pop(0)
                        smoothed = Counter(_facial_hist).most_common(1)[0][0]

                        # FIX: Raised confidence threshold from 35% to 45%.
                        # At 35% the model is essentially guessing — random
                        # non-neutral predictions were the visible symptom.
                        if conf >= 45.0:
                            await websocket.send_json({
                                "status": "success",
                                "emotion": smoothed,
                                "confidence": conf
                            })
                        else:
                            await websocket.send_json({
                                "status": "low_confidence",
                                "emotion": smoothed,
                                "confidence": conf
                            })
                    else:
                        await websocket.send_json({"status": "no_face_roi"})
                else:
                    _facial_hist.clear()  # reset smoothing buffer when face disappears
                    await websocket.send_json({"status": "no_face"})

            except Exception as e:
                await websocket.send_json({"status": "error", "message": str(e)})
    except WebSocketDisconnect:
        print("Client disconnected from /ws/emotion")


# =============================================================================
# WEBSOCKET — VOICE EMOTION DETECTION
# =============================================================================
@app.websocket("/ws/voice")
async def voice_websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("Client connected to /ws/voice")

    _SMOOTH_N     = 3
    _voice_hist: list = []

    try:
        while True:
            data = await websocket.receive_bytes()

            try:
                audio_chunk = np.frombuffer(data, dtype=np.float32).copy()

                rms     = float(np.sqrt(np.mean(audio_chunk ** 2)))
                peak    = float(np.abs(audio_chunk).max())
                samples = len(audio_chunk)
                print(f"  [Voice] samples={samples} ({samples/22050:.1f}s) | RMS={rms:.5f} | peak={peak:.4f}")

                # ── Silence rejection (FIX for Problem C) ───────────────────
                # Raised from RMS<0.001/peak<0.005 to RMS<0.01/peak<0.02.
                # Old thresholds were below typical background noise floor
                # (fans, HVAC, mic self-noise), causing noise to pass through
                # as valid audio and produce false Angry/Fear predictions.
                if rms < 0.01 or peak < 0.02:
                    print(f"  [Voice] Rejected as silence (RMS={rms:.5f} peak={peak:.5f})")
                    _voice_hist.clear()  # reset smoothing on silence
                    await websocket.send_json({"status": "no_voice"})
                    continue

                # ── Feature extraction ──────────────────────────────────────
                features = extract_features_for_voice(audio_chunk)
                if features is None or len(features) != _VOICE_N_FEATURES:
                    await websocket.send_json({"status": "error", "message": "Failed to extract features"})
                    continue

                # ── Subprocess inference (FIX for Problem B) ────────────────
                # predict_voice_emotion runs voice_worker.py in a clean env.
                # voice_worker.py applies the z-score normalization internally
                # using the saved feature_mean/std .npy files.
                emotion, conf, all_probs = predict_voice_emotion(features)

                print(f"  [Voice] subprocess result: {emotion} ({conf:.1f}%)")

                # ── Temperature scaling on returned probabilities ────────────
                if all_probs:
                    raw_pred = np.array(all_probs, dtype=np.float64)
                    _TEMP    = 1.5
                    log_p    = np.log(raw_pred + 1e-10) / _TEMP
                    pred     = np.exp(log_p - log_p.max())
                    pred     = (pred / pred.sum()).astype(np.float32)
                    idx      = int(np.argmax(pred))
                    emotion  = VOICE_EMOTIONS[idx]
                    conf     = float(pred[idx] * 100)
                else:
                    pred = None

                # ── Rolling majority-vote smoothing ─────────────────────────
                _voice_hist.append(emotion)
                if len(_voice_hist) > _SMOOTH_N:
                    _voice_hist.pop(0)

                smoothed_emotion = Counter(_voice_hist).most_common(1)[0][0]

                if pred is not None:
                    smooth_idx  = VOICE_EMOTIONS.index(smoothed_emotion)
                    smooth_conf = float(pred[smooth_idx] * 100)
                    sorted_pred = np.sort(pred)[::-1]
                    top2_gap    = float(sorted_pred[0] - sorted_pred[1])
                else:
                    smooth_conf = conf
                    top2_gap    = 0.0

                print(f"  [Voice] smooth({_voice_hist}) -> {smoothed_emotion} ({smooth_conf:.1f}%)")

                # FIX: Raised confidence threshold from 35% to 45%.
                # Temperature scaling + smoothing already reduce noise, so the
                # higher bar filters remaining uncertain predictions cleanly.
                if smooth_conf >= 45.0:
                    await websocket.send_json({
                        "status": "success",
                        "emotion": smoothed_emotion,
                        "confidence": smooth_conf,
                        "top2_gap": round(top2_gap * 100, 1),
                    })
                else:
                    await websocket.send_json({
                        "status": "low_confidence",
                        "emotion": smoothed_emotion,
                        "confidence": smooth_conf,
                        "top2_gap": round(top2_gap * 100, 1),
                    })

            except Exception as e:
                print(f"  [Voice] WS error: {e}")
                await websocket.send_json({"status": "error", "message": str(e)})
    except WebSocketDisconnect:
        print("Client disconnected from /ws/voice")


# =============================================================================
# PATH ROUTES
# =============================================================================
@app.post("/api/paths")
async def save_path(path_data: PathSaveRequest, current_user: dict = Depends(get_current_user)):
    d = path_data.dict()
    d["userId"] = str(current_user["_id"])
    d["createdAt"] = datetime.utcnow()
    d["completedModules"] = []
    result = await paths_col.insert_one(d)
    return {"status": "success", "id": str(result.inserted_id)}


@app.get("/api/paths")
async def get_paths(current_user: dict = Depends(get_current_user)):
    paths = await paths_col.find({"userId": str(current_user["_id"])}).sort("createdAt", -1).to_list(100)
    for p in paths:
        p["id"] = str(p["_id"])
        del p["_id"]
    return {"status": "success", "history": paths}


@app.patch("/api/paths/{path_id}/progress")
async def update_progress(path_id: str, module: CompletedModule, current_user: dict = Depends(get_current_user)):
    path = await paths_col.find_one({"_id": ObjectId(path_id), "userId": str(current_user["_id"])})
    if not path:
        raise HTTPException(status_code=404, detail="Path not found")
    await paths_col.update_one({"_id": ObjectId(path_id)}, {"$pull": {"completedModules": {"id": module.id}}})
    await paths_col.update_one({"_id": ObjectId(path_id)}, {"$push": {"completedModules": module.dict()}})
    return {"status": "success"}


@app.delete("/api/paths/{path_id}")
async def delete_path(path_id: str, current_user: dict = Depends(get_current_user)):
    result = await paths_col.delete_one({"_id": ObjectId(path_id), "userId": str(current_user["_id"])})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Path not found")
    return {"status": "success"}


@app.post("/api/emotions/log")
async def log_emotion(mood_data: dict, current_user: dict = Depends(get_current_user)):
    await emotions_col.insert_one({
        "userId": str(current_user["_id"]), "timestamp": datetime.utcnow(),
        "mood": mood_data.get("mood"), "source": mood_data.get("source"),
        "confidence": mood_data.get("confidence")
    })
    return {"status": "success"}


# =============================================================================
# YOUTUBE SEARCH
# =============================================================================
@app.get("/api/youtube-search")
async def youtube_search(q: str):
    yt_key = os.environ.get("YOUTUBE_API_KEY")
    if not yt_key:
        return {"error": "missing_youtube_key"}
    try:
        url = (f"https://www.googleapis.com/youtube/v3/search"
               f"?part=snippet&type=video&maxResults=1&q={_uparse.quote_plus(q)}&key={yt_key}")
        with urllib.request.urlopen(
            urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=8
        ) as resp:
            data = json.loads(resp.read().decode())
        items = data.get("items", [])
        if not items:
            return {"error": "no_results"}
        item = items[0]
        return {"videoId": item["id"]["videoId"], "title": item["snippet"]["title"],
                "thumbnail": item["snippet"]["thumbnails"]["medium"]["url"]}
    except Exception as e:
        return {"error": str(e)}


# =============================================================================
# LEARNING PATH — HELPER FUNCTIONS
# =============================================================================

def get_module_count_and_pace(speed: str, mood: str) -> dict:
    mood, speed = mood.lower(), speed.lower()
    if mood in ["anxious", "sad", "unmotivated"]:
        return {"count": "8 to 10", "duration": "8 to 15 min", "note": "Short modules. Build momentum slowly."}
    if any(w in speed for w in ["fast", "quick", "rapid"]):
        return {"count": "10 to 12", "duration": "20 to 35 min", "note": "Dense modules. Skip basics."}
    if any(w in speed for w in ["slow", "relaxed", "steady"]):
        return {"count": "12 to 15", "duration": "8 to 15 min", "note": "One concept per module. Mastery first."}
    return {"count": "10 to 12", "duration": "12 to 20 min", "note": "Balanced depth."}


def get_quiz_frequency(mood: str, difficulty: str) -> str:
    mood = mood.lower()
    if mood in ["energetic", "motivated", "bored", "curious"]:
        return "Place a quiz after every 2 content modules."
    if mood in ["anxious", "sad", "unmotivated"]:
        return "Place a quiz after every 4 content modules. Keep them gentle (3 questions)."
    if any(w in difficulty.lower() for w in ["advanced", "expert"]):
        return "Place a quiz after every 2 content modules. Make questions challenging."
    return "Place a quiz after every 3 content modules."


def get_mood_tone(mood: str) -> str:
    return {
        "anxious":     "Warm, reassuring. Never use 'master' or 'deep dive'. Open every article with encouragement.",
        "sad":         "Gentle, supportive. Like a kind friend. Small wins first. Nothing intimidating.",
        "energetic":   "Bold, exciting. Push complexity. Add challenge sections. Never dumb down.",
        "bored":       "Surprising angles. Start with a counterintuitive insight. Curiosity-triggering titles.",
        "focused":     "Zero fluff. Dense, precise. Every sentence earns its place.",
        "calm":        "Relaxed but substantive. Conversational warmth. Clear breathing room.",
        "motivated":   "Ambitious. Connect every concept to the final goal.",
        "creative":    "Unconventional angles. Explore the 'what if'. Real-world creative applications.",
        "unmotivated": "Effortless to start. First module under 10 min. Build momentum gradually.",
        "curious":     "Feed curiosity deeply. Explain the 'why it was designed this way'.",
    }.get(mood.lower(), "Clear, structured, professional.")


def get_difficulty_rules(difficulty: str) -> str:
    d = difficulty.lower()
    if any(w in d for w in ["beginner", "easy", "starter", "novice"]):
        return "Beginner. Start from zero. Explain every term. Code examples max 15 lines."
    if any(w in d for w in ["advanced", "expert", "hard", "senior"]):
        return "Advanced. Skip basics. Focus on complex patterns and production concerns."
    return "Intermediate. Assume basic familiarity. Focus on practical application."


def get_format_rules(fmt: str) -> str:
    if fmt == "videos":   return "80%+ of non-quiz modules must be type 'video'."
    if fmt == "articles": return "80%+ of non-quiz modules must be type 'article'."
    return "Mix 'video' and 'article'. Never repeat same type more than twice in a row."


# =============================================================================
# LOCAL GENERATOR — ZERO DEPENDENCY FALLBACK
# =============================================================================

def _local_generate(data: PathRequest) -> list:
    topic      = data.topic.strip()
    goal       = data.goal.strip()
    mood       = data.mood.lower()
    fmt        = data.format
    speed      = data.speed.lower()
    difficulty = data.suggestedDifficulty.lower()

    if mood in ["anxious", "sad", "unmotivated"]:
        count, min_d, max_d, q_every = 10, 6, 12, 4
    elif any(w in speed for w in ["fast", "quick", "rapid"]):
        count, min_d, max_d, q_every = 12, 20, 30, 2
    elif any(w in speed for w in ["slow", "relaxed", "steady"]):
        count, min_d, max_d, q_every = 15, 8, 15, 3
    else:
        count, min_d, max_d, q_every = 12, 12, 20, 3

    if mood in ["energetic", "bored", "motivated"]:
        q_every = 2

    if any(w in difficulty for w in ["beginner", "easy", "starter"]):
        diff_note = "Start from zero. Explain every term. Short code examples under 15 lines."
    elif any(w in difficulty for w in ["advanced", "expert", "hard"]):
        diff_note = "Skip basics. Focus on production patterns and edge cases."
    else:
        diff_note = "Assume basic familiarity. Focus on practical application."

    tone = {
        "anxious":     "Don't worry — this is simpler than it looks. One step at a time.",
        "sad":         "You're doing great by showing up. This will be clear and gentle.",
        "energetic":   "Let's get straight into it — no hand-holding, just the good stuff.",
        "bored":       "Here's something most tutorials skip about this topic...",
        "focused":     "Precise and dense. Every line counts.",
        "calm":        "Take your time. Understanding beats speed every time.",
        "motivated":   f"This concept directly unlocks your goal: {goal}.",
        "creative":    "Let's look at this from an angle most people miss.",
        "unmotivated": "The shortest, clearest explanation you will find.",
        "curious":     "The interesting question is not *what* this is — it is *why* it exists.",
    }.get(mood, f"This module covers a key part of learning {topic}.")

    subtopics = [
        f"What is {topic}? Core concepts and mental models",
        f"Setting up your {topic} environment",
        f"Your first {topic} program: understanding the basics",
        f"Core syntax and structure in {topic}",
        f"Working with data: types and variables in {topic}",
        f"Control flow: conditions and decisions in {topic}",
        f"Loops and iteration in {topic}",
        f"Functions: reusable, modular {topic} code",
        f"Error handling and debugging in {topic}",
        f"Working with files and I/O in {topic}",
        f"Modules and packages in {topic}",
        f"Common patterns and idioms in {topic}",
        f"Testing your {topic} code",
        f"Performance and optimisation in {topic}",
        f"Connecting {topic} to external services",
        f"Advanced patterns in {topic} for production",
        f"Building a complete project: {goal}",
        f"Deploying and sharing your {topic} project",
    ][:count]

    def make_article(sub: str) -> str:
        return f"""## {sub}

{tone}

{diff_note}

---

### Why this matters for: *{goal}*

{sub} is a foundational piece of the puzzle. Without it you will hit
confusing errors later. With it, the path to **{goal}** becomes much clearer.

---

### The core idea

At its heart, **{sub}** in {topic} gives you control over a specific
aspect of how your code behaves. Think of it as a pipeline: input goes in,
a transformation is applied, clean output comes out.

The three things you need to understand:

1. **Syntax** — how to write it correctly
2. **Semantics** — what it actually does when it runs
3. **Scope** — where it applies and where it does not

---

### Practical example

```python
# {sub} — minimal working example
# Goal: {goal}

def demonstrate(input_data):
    if not input_data:
        raise ValueError("Input cannot be empty")
    result = input_data  # core logic here
    return result

output = demonstrate("example")
print(f"Result: {{output}}")
```

---

### Common mistakes

- **Using it without understanding scope** — apply only where it is needed
- **Ignoring error messages** — they tell you exactly what went wrong
- **Over-engineering** — start with the simple form, upgrade only when needed

---

### Takeaway

After this module you can explain {sub} in plain language, write a basic
example from scratch, and apply it toward your goal: **{goal}**
"""

    def make_quiz(concepts: list) -> list:
        questions = []
        for i, c in enumerate(concepts[:4]):
            label = c.split(":")[0].strip()
            questions.append({
                "id": i + 1,
                "question": f"What is the primary purpose of {label} in {topic}?",
                "options": [
                    f"To define and control {label} behaviour in {topic}",
                    f"To permanently delete {topic} configurations",
                    f"To connect {topic} to external databases only",
                    f"To compile {topic} into machine code",
                ],
                "correctAnswer": 0,
                "explanation": f"{label} defines and controls specific behaviour in {topic}.",
            })
        questions.append({
            "id": len(questions) + 1,
            "question": f"When debugging a {topic} error, what is the best first step?",
            "options": [
                "Read the error message carefully — it tells you exactly what failed",
                "Delete the code and rewrite from scratch",
                "Add more dependencies to see if that fixes it",
                "Ask for help without trying anything first",
            ],
            "correctAnswer": 0,
            "explanation": "Error messages are precise. Reading them carefully is always the fastest path to a fix.",
        })
        return questions[:5]

    modules, mid, buf, since_q = [], 1, [], 0

    for i, sub in enumerate(subtopics):
        dur = random.randint(min_d, max_d)
        m_type = "video" if fmt == "videos" else "article" if fmt == "articles" else ("video" if i % 2 == 0 else "article")
        buf.append(sub)
        since_q += 1
        sq = f"{topic} {sub} tutorial"

        if m_type == "video":
            modules.append({"id": mid, "title": sub, "type": "video", "duration": f"{dur} min",
                            "completed": False, "searchQuery": sq,
                            "youtubeUrl": "https://www.youtube.com/results?search_query=" + quote_plus(sq)})
        else:
            modules.append({"id": mid, "title": sub, "type": "article", "duration": f"{dur} min",
                            "completed": False, "articleContent": make_article(sub)})
        mid += 1

        if since_q >= q_every and i < len(subtopics) - 1:
            recent = buf[-q_every:]
            modules.append({"id": mid, "title": f"Checkpoint: {recent[0].split(':')[0].strip()}",
                            "type": "quiz", "duration": "8 min", "completed": False,
                            "questions": make_quiz(recent)})
            mid += 1
            since_q = 0
            buf = []

    modules.append({"id": mid, "title": f"Final Assessment: {topic}",
                    "type": "quiz", "duration": "12 min", "completed": False,
                    "questions": make_quiz(subtopics[-4:])})
    return modules


# =============================================================================
# GEMINI ARTICLE CONTENT GENERATOR
# =============================================================================

def _generate_article_content(topic: str, title: str, mood: str, difficulty: str) -> str:
    if not GENAI_CLIENT:
        return _local_article_fallback(topic, title)

    prompt = f"""Write a learning article for a student studying "{topic}".
Module title: "{title}"
Tone: {get_mood_tone(mood)}
Difficulty: {get_difficulty_rules(difficulty)}

Write 300-500 words of educational Markdown content.
Use ## headings, **bold** terms, bullet lists, and ```python code blocks.
Be factually accurate.

Return ONLY a JSON object: {{"content": "<markdown string>"}}"""

    last_error = None

    for attempt in range(MAX_RETRIES):
        try:
            resp = GENAI_CLIENT.models.generate_content(
                model=BEST_MODEL,
                contents=prompt,
                config=genai_types.GenerateContentConfig(
                    temperature=0.7, max_output_tokens=4096, response_mime_type="application/json"),
            )
            raw = re.sub(r"^```(?:json)?\s*", "", resp.text.strip())
            raw = re.sub(r"\s*```$", "", raw)
            return json.loads(raw).get("content", _local_article_fallback(topic, title))

        except (Exception, ApiClientError) as e:
            last_error = e
            if attempt < MAX_RETRIES - 1 and (
                "resource has been exhausted" in str(e).lower() or
                "rate limit" in str(e).lower() or
                "429" in str(e).lower() or
                "network" in str(e).lower() or
                is_server_error(e)
            ):
                wait_time = INITIAL_BACKOFF_TIME * (2 ** attempt)
                print(f"[!] Attempt {attempt + 1} failed for '{title}': {e}. Retrying in {wait_time}s...")
                time.sleep(wait_time)
                continue
            break

    print(f"[ERROR] Failed to retrieve content for '{title}'. Last error: {type(last_error).__name__}")
    return _local_article_fallback(topic, title)


def _local_article_fallback(topic: str, title: str) -> str:
    return f"""## {title}

This module covers **{title}** as part of your {topic} learning path.

### Key Concepts

- Understanding the fundamentals of {title}
- Practical applications and real-world examples
- Best practices and common patterns
- Mistakes to avoid when working with {title}

### Why it matters

Mastering {title} is an important step in your {topic} journey.
Take your time and practise the concepts before moving on.

### Summary

Keep building on what you have learned and proceed to the next module when ready.
"""


# =============================================================================
# MAIN ENDPOINT: POST /api/generate-path
# =============================================================================

@app.post("/api/generate-path")
async def generate_path(data: PathRequest):

    # ── 1. Cache check ─────────────────────────────────────────────────────
    cache_key = f"{data.topic}|{data.goal}|{data.mood}|{data.speed}|{data.format}|{data.suggestedDifficulty}"
    cache_hash = hashlib.md5(cache_key.encode()).hexdigest()
    cache_file = CACHE_DIR / f"{cache_hash}.json"

    if cache_file.exists():
        try:
            print(f"Cache hit: {data.topic}")
            with open(cache_file, "r") as f:
                return {"status": "success", "modules": json.load(f), "source": "cache"}
        except Exception as e:
            print(f"Cache read error: {e}")

    # ── 2. No Gemini client → local ────────────────────────────────────────
    if not GENAI_CLIENT:
        print("No Gemini client - local generator")
        modules = _local_generate(data)
        _save_cache(cache_file, modules)
        return {"status": "success", "modules": modules, "source": "local"}

    # ── 3. Gemini Phase 1: generate structure ──────────────────────────────
    pacing = get_module_count_and_pace(data.speed, data.mood)

    structure_prompt = f"""You are an expert curriculum designer building a complete online course.

STUDENT PROFILE:
Topic: {data.topic} | Goal: {data.goal} | Mood: {data.mood}
Format: {data.format} | Speed: {data.speed} | Difficulty: {data.suggestedDifficulty}

MODULE COUNT (MANDATORY): Generate {pacing["count"]} modules.
Duration: {pacing["duration"]} | Note: {pacing["note"]}
Quiz placement: {get_quiz_frequency(data.mood, data.suggestedDifficulty)}
Tone: {get_mood_tone(data.mood)}
Difficulty rules: {get_difficulty_rules(data.suggestedDifficulty)}
Format rules: {get_format_rules(data.format)}

OUTPUT — Return a JSON array. Each element is ONE of:

VIDEO:   {{"id":<int>,"title":<specific sub-concept>,"type":"video","duration":<string>,"completed":false,"searchQuery":<YouTube search string>}}
ARTICLE: {{"id":<int>,"title":<specific sub-concept>,"type":"article","duration":<string>,"completed":false}}
QUIZ:    {{"id":<int>,"title":<string>,"type":"quiz","duration":<string>,"completed":false,"questions":[{{"id":<int>,"question":<string>,"options":[<4 strings>],"correctAnswer":<0-3>,"explanation":<string>}}]}}

Rules:
- Titles must be specific sub-concepts, never generic overviews
- Quiz modules must have 4-6 real questions
- Article modules: NO articleContent field — just title and metadata
- Path must progress logically toward: "{data.goal}"

Return ONLY the raw JSON array."""
    raw = ""

    for attempt in range(1, MAX_RETRIES + 1):
        if attempt > 1:
            wait = 2 ** (attempt - 1)
            print(f"Retry {attempt}/{MAX_RETRIES} - waiting {wait}s...")
            time.sleep(wait)

        try:
            print(f"Gemini attempt {attempt} for '{data.topic}'...")
            response = GENAI_CLIENT.models.generate_content(
                model=BEST_MODEL,
                contents=structure_prompt,
                config=genai_types.GenerateContentConfig(
                    temperature=0.7,
                    max_output_tokens=8192,
                    response_mime_type="application/json",
                ),
            )
            text  = response.text.strip()
            start = text.find("[")
            end   = text.rfind("]")
            if start != -1 and end != -1:
                raw = text[start:end+1]
            else:
                raw = re.sub(r"^```(?:json)?\s*", "", text)
                raw = re.sub(r"\s*```$", "", raw)

            try:
                modules = json.loads(raw)
            except json.JSONDecodeError as jde:
                print(f"JSON Parse Error: {jde}")
                print(f"RAW PREVIEW: {text[:500]}...")
                raise jde

            if not isinstance(modules, list) or len(modules) == 0:
                raise ValueError("Gemini returned empty list")

            for i, m in enumerate(modules):
                m["id"] = i + 1
                m["completed"] = False
                if m.get("type") == "video":
                    m.pop("articleContent", None)
                    m.pop("questions", None)
                    if "searchQuery" in m and "youtubeUrl" not in m:
                        m["youtubeUrl"] = "https://www.youtube.com/results?search_query=" + quote_plus(m["searchQuery"])
                elif m.get("type") == "article":
                    m.pop("searchQuery", None)
                    m.pop("youtubeUrl", None)
                    m.pop("questions", None)
                elif m.get("type") == "quiz":
                    m.pop("searchQuery", None)
                    m.pop("youtubeUrl", None)
                    m.pop("articleContent", None)
                    if not m.get("questions"):
                        m["questions"] = []

            print(f"Phase 1 done: {len(modules)} modules")

            article_mods = [m for m in modules if m.get("type") == "article"]
            print(f"Phase 2: {len(article_mods)} articles to fill...")
            for m in article_mods:
                m["articleContent"] = _generate_article_content(
                    data.topic, m["title"], data.mood, data.suggestedDifficulty)
                print(f"  Done: '{m['title']}'")

            print(f"Complete: {len(modules)} modules from Gemini")
            _save_cache(cache_file, modules)
            return {"status": "success", "modules": modules, "source": "gemini"}

        except Exception as e:
            err = str(e)
            print(f"Gemini attempt {attempt} failed: {err[:200]}")
            if raw:
                print(f"Raw preview: {raw[:200]}")
            if any(x in err for x in ["ResourceExhausted", "429", "quota"]):
                time.sleep(2 ** attempt)
                continue
            break

    # ── 4. All Gemini attempts failed → local generator ────────────────────
    print("Gemini unavailable — using local generator")
    modules = _local_generate(data)
    _save_cache(cache_file, modules)
    return {"status": "success", "modules": modules, "source": "local"}


def _save_cache(cache_file: Path, modules: list):
    try:
        with open(cache_file, "w") as f:
            json.dump(modules, f)
        print(f"Cached: {cache_file.name}")
    except Exception as e:
        print(f"Cache write error: {e}")


if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True, timeout_keep_alive=300)
