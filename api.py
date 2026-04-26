"""
api.py — MoodLearn Backend v2.0
================================
Facial model : EfficientNetB2 (224×224) — trained by train_facial.py  [TensorFlow]
               Falls back to emotion_model.h5 (MobileNetV2 128×128) if new model not found yet.
Voice model  : wav2vec2 fine-tuned — trained by train_voice.py         [HuggingFace/PyTorch]
               Returns graceful neutral if model not trained yet.

WebSockets:
  /ws/emotion  — facial emotion from base64 JPEG frames
  /ws/voice    — voice emotion from float32 PCM at 16000 Hz
                 (Frontend sends 16 kHz directly — no server-side resampling needed)

Run:
  python api.py
"""

import os, sys, json, re, time, random, hashlib, base64
import asyncio, warnings, urllib.request, urllib.parse as _uparse
from pathlib import Path
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional
from datetime import datetime, timedelta

warnings.filterwarnings("ignore")

os.environ["TF_CPP_MIN_LOG_LEVEL"]      = "2"
os.environ["TF_FORCE_GPU_ALLOW_GROWTH"] = "true"
os.environ["TOKENIZERS_PARALLELISM"]    = "false"

import cv2
import numpy as np
import uvicorn, bcrypt, jwt, librosa
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from bson import ObjectId
from urllib.parse import quote_plus
from pydantic import BaseModel, EmailStr, Field
from dotenv import load_dotenv

load_dotenv()

# =============================================================================
# GEMINI
# =============================================================================
api_key      = os.environ.get("GEMINI_API_KEY")
GENAI_CLIENT = None
BEST_MODEL   = "gemini-1.5-flash"

try:
    from google import genai as google_genai
    from google.genai import types as genai_types
    GENAI_CLIENT = google_genai.Client(api_key=api_key) if api_key else None
    if GENAI_CLIENT:
        try:
            flash = [m.name for m in GENAI_CLIENT.models.list() if "flash" in m.name.lower()]
            if any("2.5" in m for m in flash):   BEST_MODEL = next(m for m in flash if "2.5" in m)
            elif any("1.5" in m for m in flash): BEST_MODEL = next(m for m in flash if "1.5" in m)
            elif flash:                          BEST_MODEL = flash[0]
            print(f"Gemini ready — {BEST_MODEL}")
        except Exception as e:
            print(f"Gemini discovery failed: {e}")
except Exception as e:
    print(f"google-genai not available: {e}")

# =============================================================================
# TENSORFLOW  (facial model — EfficientNetB2 OR legacy MobileNetV2 fallback)
# =============================================================================
TF_AVAILABLE = False
try:
    import tensorflow as tf
    TF_AVAILABLE = True
    for g in tf.config.list_physical_devices("GPU"):
        tf.config.experimental.set_memory_growth(g, True)
    print(f"TensorFlow {tf.__version__}")
except Exception as e:
    print(f"TensorFlow not available: {e}")

# =============================================================================
# PYTORCH / HUGGINGFACE  (voice model — wav2vec2)
# =============================================================================
HF_AVAILABLE = False
VOICE_DEVICE = "cpu"
try:
    import torch
    from transformers import Wav2Vec2ForSequenceClassification, Wav2Vec2FeatureExtractor
    HF_AVAILABLE = True
    VOICE_DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"PyTorch {torch.__version__} | device: {VOICE_DEVICE}")
    
    # Import new facial architecture
    try:
        from model_arch import EmotionModel
    except ImportError:
        print("model_arch.py not found - creating fallback architecture...")
except Exception as e:
    print(f"PyTorch/transformers not available: {e}")

# =============================================================================
# MEDIAPIPE  (face detection + alignment)
# =============================================================================
HAS_MEDIAPIPE = False
try:
    import mediapipe as mp
    HAS_MEDIAPIPE   = True
    _mp_face_det    = mp.solutions.face_detection
    _mp_face_mesh   = mp.solutions.face_mesh
    print("MediaPipe loaded — face alignment + detection enabled")
except Exception as e:
    print(f"MediaPipe initialization failed: {e}")
    print("Continuing without MediaPipe face alignment...")

# =============================================================================
# THREAD POOL  (keeps async WS loop non-blocking during ML inference)
# =============================================================================
_executor = ThreadPoolExecutor(max_workers=2)

MAX_RETRIES          = 3
INITIAL_BACKOFF_TIME = 2

# =============================================================================
# FASTAPI
# =============================================================================
app = FastAPI()

ALLOWED_ORIGINS = ["*"]

app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

@app.get("/")
async def root():
    return {"status": "online", "message": "MoodLearn API v2.0",
            "endpoints": ["/ws/emotion", "/ws/voice", "/api/auth", "/api/paths", "/api/health"]}

@app.get("/health")
@app.get("/api/health")
async def health_check():
    try:
        await db_client.admin.command("ping")
        return {"status": "healthy"}
    except Exception:
        return {"status": "degraded"}

# =============================================================================
# DATABASE
# =============================================================================
MONGO_URI                   = os.environ.get("MONGODB_URI")
JWT_SECRET                  = os.environ.get("JWT_SECRET")
ALGORITHM                   = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", 60 * 24))

if not MONGO_URI:
    raise RuntimeError("FATAL: MONGODB_URI not set. Add it to local .env or deployment secrets.")
if not JWT_SECRET:
    raise RuntimeError("FATAL: JWT_SECRET not set. Add it to local .env or deployment secrets.")

db_client    = AsyncIOMotorClient(MONGO_URI)
db           = db_client.get_database("moodlearn_db")
users_col    = db.get_collection("users")
paths_col    = db.get_collection("paths")
emotions_col = db.get_collection("emotions")

CACHE_DIR = Path("models/cache/paths")
CACHE_DIR.mkdir(parents=True, exist_ok=True)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

# =============================================================================
# AUTH
# =============================================================================
def hash_password(p):      return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()
def verify_password(p, h): return bcrypt.checkpw(p.encode(), h.encode())
def create_access_token(data):
    d = {**data, "exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)}
    return jwt.encode(d, JWT_SECRET, algorithm=ALGORITHM)

_auth_attempts = defaultdict(list)

def _check_rate_limit(ip: str, max_attempts: int = 5, window: int = 60):
    now = time.time()
    _auth_attempts[ip] = [t for t in _auth_attempts[ip] if now - t < window]
    if len(_auth_attempts[ip]) >= max_attempts:
        raise HTTPException(status_code=429, detail="Too many attempts. Wait 60 seconds.")
    _auth_attempts[ip].append(now)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    exc = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Could not validate credentials",
                        headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        email   = payload.get("sub")
        if not email: raise exc
    except jwt.PyJWTError: raise exc
    user = await users_col.find_one({"email": email})
    if not user: raise exc
    return user

async def _authenticate_websocket(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008)
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if not email:
            await websocket.close(code=1008)
            return None
        user = await users_col.find_one({"email": email})
        if not user:
            await websocket.close(code=1008)
            return None
        return user
    except jwt.PyJWTError:
        await websocket.close(code=1008)
        return None

# =============================================================================
# PYDANTIC MODELS
# =============================================================================
class UserAuth(BaseModel):
    email: EmailStr; password: str; displayName: Optional[str] = None

class CompletedModule(BaseModel):
    id: int; title: str; type: str
    completedAt: datetime = Field(default_factory=datetime.utcnow)

class PathSaveRequest(BaseModel):
    topic: str; goal: str; mood: str; speed: str
    format: str; totalModules: int; modules: List[dict]

class PathRequest(BaseModel):
    topic: str; goal: str; mood: str
    format: str; speed: str; suggestedDifficulty: str

# =============================================================================
# FACIAL MODEL LOADER
# Priority: EfficientNetB2 (new) → MobileNetV2 (old backward compat)
# =============================================================================
FACIAL_EMOTIONS = ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"]
FACIAL_IMG_SIZE = 224
_facial_mode    = "none"          # "efficientnetb2" | "mobilenetv2_compat" | "none"
facial_model    = None

# Try to read config from new training script output
try:
    with open("models/facial_config.json") as f:
        _fc = json.load(f)
    FACIAL_EMOTIONS = _fc.get("emotions", FACIAL_EMOTIONS)
    FACIAL_IMG_SIZE = _fc.get("img_size", 224)
    print(f"Facial config loaded: {FACIAL_EMOTIONS} | size={FACIAL_IMG_SIZE}")
except Exception:
    print("No facial_config.json — using defaults (224px EfficientNetB2 or 128px fallback)")

# Determine device for facial model (PyTorch)
FACIAL_DEVICE = "cuda" if (torch.cuda.is_available() if 'torch' in sys.modules else False) else "cpu"

# --- Try new PyTorch EfficientNetB2 model (v3) ---
if 'torch' in sys.modules:
    try:
        pth_path = "models/facial_emotion_v3.pth"
        if os.path.exists(pth_path):
            facial_model = EmotionModel(num_classes=len(FACIAL_EMOTIONS))
            state_dict = torch.load(pth_path, map_location=FACIAL_DEVICE)
            facial_model.load_state_dict(state_dict)
            facial_model.eval()
            facial_model.to(FACIAL_DEVICE)
            _facial_mode = "pytorch_v3"
            print(f"Facial model loaded (PyTorch v3, {FACIAL_IMG_SIZE}px) on {FACIAL_DEVICE}")
    except Exception as e:
        print(f"Failed to load PyTorch v3 model: {e}")

if facial_model is None and TF_AVAILABLE:
    # --- Try legacy EfficientNetB2 TensorFlow model (v2) ---
    try:
        facial_model = tf.keras.models.load_model("models/facial_model.h5")
        _facial_mode = "efficientnetb2"
        print(f"Facial model loaded (TensorFlow v2, {FACIAL_IMG_SIZE}px)")
    except Exception as e:
        print(f"facial_model.h5 not found — trying legacy emotion_model.h5 ...")
        # --- Fallback: old MobileNetV2 128px model (v1) ---
        try:
            facial_model = tf.keras.models.load_model("models/emotion_model.h5")
            FACIAL_IMG_SIZE = 128
            _facial_mode    = "mobilenetv2_compat"
            print(f"Facial model loaded (MobileNetV2 backward-compat, 128px)")
        except Exception as e2:
            print(f"No facial model available: {e2}")

def _pytorch_preprocess(img: np.ndarray) -> torch.Tensor:
    """Matches Albumentations.Normalize used in train_facial.py"""
    try:
        img = img.astype(np.float32) / 255.0
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        img = (img - mean) / std
        img = img.transpose(2, 0, 1) # HWC to CHW
        # Force float32 to avoid DoubleTensor errors
        return torch.from_numpy(img).unsqueeze(0).to(FACIAL_DEVICE).to(torch.float32)
    except Exception as e:
        print(f"[_pytorch_preprocess] Error: {e}")
        raise e


def _efficientnet_preprocess(img: np.ndarray) -> np.ndarray:
    """EfficientNetB2 preprocessing — same as training."""
    return tf.keras.applications.efficientnet.preprocess_input(img.astype(np.float32))

def _mobilenet_preprocess(img: np.ndarray) -> np.ndarray:
    """MobileNetV2 preprocessing — matches old emotion_model.h5 training."""
    from tensorflow.keras.applications.mobilenet_v2 import preprocess_input
    return preprocess_input(img.astype(np.float32))


def _align_face(image: np.ndarray) -> np.ndarray:
    """Rotate face so eyes are horizontal — removes pose variation (+4-5% accuracy)."""
    if not HAS_MEDIAPIPE or _facial_mode != "efficientnetb2":
        return image   # alignment only with new model (trained with alignment)
    try:
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        with _mp_face_mesh.FaceMesh(static_image_mode=True, max_num_faces=1,
                                    refine_landmarks=False,
                                    min_detection_confidence=0.4) as mesh:
            res = mesh.process(rgb)
            if not res.multi_face_landmarks:
                return image
            lm = res.multi_face_landmarks[0].landmark
            h, w = image.shape[:2]
            le     = np.array([lm[33].x * w,   lm[33].y  * h])
            re     = np.array([lm[263].x * w,  lm[263].y * h])
            angle  = np.degrees(np.arctan2(re[1] - le[1], re[0] - le[0]))
            center = tuple(((le + re) / 2).astype(int))
            M      = cv2.getRotationMatrix2D(center, angle, 1.0)
            return cv2.warpAffine(image, M, (w, h), flags=cv2.INTER_LINEAR)
    except Exception:
        return image


def _detect_face_roi(frame: np.ndarray) -> np.ndarray | None:
    """Returns largest face ROI. MediaPipe → Haar cascade fallback."""
    if HAS_MEDIAPIPE:
        try:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            with _mp_face_det.FaceDetection(model_selection=1,
                                            min_detection_confidence=0.5) as det:
                res = det.process(rgb)
                if res.detections:
                    h, w = frame.shape[:2]
                    best = max(res.detections,
                               key=lambda d: d.location_data.relative_bounding_box.width *
                                             d.location_data.relative_bounding_box.height)
                    bb  = best.location_data.relative_bounding_box
                    x, y = max(0, int(bb.xmin * w)), max(0, int(bb.ymin * h))
                    fw, fh = int(bb.width * w), int(bb.height * h)
                    roi = frame[y:y + fh, x:x + fw]
                    return roi if roi.size > 0 else None
        except Exception:
            pass

    # Haar cascade fallback
    haarcascade = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    try:
        cascade = cv2.CascadeClassifier(haarcascade)
        if not cascade.empty():
            gray  = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = cascade.detectMultiScale(gray, 1.1, 5, minSize=(30, 30))
            if len(faces) > 0:
                x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
                roi = frame[y:y + h, x:x + w]
                return roi if roi.size > 0 else None
    except Exception:
        pass
    return None


class _TemporalEnsemble:
    """Average probability vectors over N frames — smoother than majority vote."""
    def __init__(self, window: int = 5):
        self._buf = []; self._n = window

    def update(self, probs: np.ndarray) -> tuple:
        self._buf.append(probs)
        if len(self._buf) > self._n: self._buf.pop(0)
        avg = np.mean(self._buf, axis=0)
        idx = int(np.argmax(avg))
        return idx, float(avg[idx] * 100)

    def clear(self): self._buf = []


_facial_ensemble = _TemporalEnsemble(window=5)


def _predict_facial_sync(face_img: np.ndarray) -> tuple:
    """Blocking inference — called via run_in_executor."""
    if facial_model is None:
        return "neutral", 0.0
    try:
        img = _align_face(face_img)
        img = cv2.resize(img, (FACIAL_IMG_SIZE, FACIAL_IMG_SIZE))
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        if _facial_mode == "pytorch_v3":
            tensor = _pytorch_preprocess(img)
            with torch.no_grad():
                logits = facial_model(tensor)
                probs = torch.softmax(logits, dim=-1)[0].cpu().numpy()
        else:
            arr = np.expand_dims(img, 0)
            if _facial_mode == "efficientnetb2":
                arr = _efficientnet_preprocess(arr)
            else:
                arr = _mobilenet_preprocess(arr)
            probs = facial_model.predict(arr, verbose=0)[0]

        idx, conf = _facial_ensemble.update(probs)
        return FACIAL_EMOTIONS[idx], conf
    except Exception as e:
        print(f"[Facial] {e}"); return "neutral", 0.0

# =============================================================================
# VOICE MODEL — wav2vec2 (HuggingFace/PyTorch)
# Frontend sends 16 kHz float32 PCM — no resampling needed.
# =============================================================================
VOICE_EMOTIONS       = ["angry", "calm", "disgust", "fear", "happy", "neutral", "sad"]
VOICE_SR             = 16000      # wav2vec2 native rate — frontend now sends 16kHz
VOICE_MAX_LEN        = 64000      # 4 seconds at 16kHz
voice_model          = None
voice_feat_extractor = None

try:
    with open("models/voice_config.json") as f:
        _vc = json.load(f)
    VOICE_EMOTIONS = _vc.get("emotions",   VOICE_EMOTIONS)
    VOICE_SR       = _vc.get("sample_rate", 16000)
    VOICE_MAX_LEN  = _vc.get("max_length",  64000)
    print(f"Voice config loaded: {VOICE_EMOTIONS}")
except Exception as e:
    print(f"No voice_config.json — using defaults: {e}")

if HF_AVAILABLE:
    try:
        voice_feat_extractor = Wav2Vec2FeatureExtractor.from_pretrained("models/voice_model")
        voice_model          = Wav2Vec2ForSequenceClassification.from_pretrained("models/voice_model")
        voice_model.eval()
        voice_model.to(VOICE_DEVICE)
        print(f"Voice model loaded (wav2vec2) on {VOICE_DEVICE}")
    except Exception as e:
        print(f"Voice model not found — will return neutral until trained. ({e})")


def _predict_voice_sync(audio_16k: np.ndarray) -> tuple:
    """Blocking inference — called via run_in_executor."""
    if voice_model is None or voice_feat_extractor is None:
        return "neutral", 0.0, []
    try:
        inputs = voice_feat_extractor(
            audio_16k, sampling_rate=VOICE_SR,
            max_length=VOICE_MAX_LEN, truncation=True,
            padding="max_length", return_tensors="pt",
        )
        inputs = {k: v.to(VOICE_DEVICE) for k, v in inputs.items()}
        with torch.no_grad():
            logits = voice_model(**inputs).logits
        probs = torch.softmax(logits, dim=-1)[0].cpu().numpy()
        idx   = int(np.argmax(probs))
        return VOICE_EMOTIONS[idx], float(probs[idx] * 100), probs.tolist()
    except Exception as e:
        print(f"[Voice] {e}"); return "neutral", 0.0, []

# =============================================================================
# AUTH ROUTES
# =============================================================================
@app.post("/api/auth/signup")
async def signup(user: UserAuth, request: Request):
    _check_rate_limit(request.client.host if request.client else "unknown")
    user.email = user.email.lower().strip()
    if await users_col.find_one({"email": user.email}):
        raise HTTPException(400, "Email already registered")
    await users_col.insert_one({"email": user.email, "password": hash_password(user.password),
                                 "displayName": user.displayName, "createdAt": datetime.utcnow()})
    return {"status": "success", "access_token": create_access_token({"sub": user.email}),
            "user": {"email": user.email, "displayName": user.displayName}}

@app.post("/api/auth/login")
async def login(user: UserAuth, request: Request):
    _check_rate_limit(request.client.host if request.client else "unknown")
    user.email = user.email.lower().strip()
    db_user = await users_col.find_one({"email": user.email})
    if not db_user or not verify_password(user.password, db_user["password"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    return {"status": "success", "access_token": create_access_token({"sub": user.email}),
            "user": {"email": db_user["email"], "displayName": db_user.get("displayName")}}

@app.get("/api/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {"email": current_user["email"], "displayName": current_user.get("displayName"),
            "id": str(current_user["_id"])}

# =============================================================================
# WEBSOCKET — FACIAL EMOTION
# =============================================================================
@app.websocket("/ws/emotion")
async def facial_ws(websocket: WebSocket):
    if not await _authenticate_websocket(websocket):
        return
    await websocket.accept()
    print(f"[Facial] Client connected")
    _facial_ensemble.clear()
    loop = asyncio.get_event_loop()
    try:
        while True:
            data = await websocket.receive_text()
            if "," in data: data = data.split(",")[1]
            try:
                frame = cv2.imdecode(np.frombuffer(base64.b64decode(data), np.uint8), cv2.IMREAD_COLOR)
                if frame is None: continue
                
                # Extract face ROI
                roi = _detect_face_roi(frame)
                
                if roi is None:
                    _facial_ensemble.clear()
                    await websocket.send_json({"status": "no_face"}); continue

                emotion, conf = await loop.run_in_executor(_executor, _predict_facial_sync, roi)

                status_key = "success" if conf >= 45.0 else "low_confidence"
                print(f"[Facial] Pred: {emotion} ({conf:.1f}%)")
                try:
                    await websocket.send_json({"status": status_key, "emotion": emotion,
                                               "confidence": round(conf, 1)})
                except: pass
            except Exception as e:
                import traceback
                print(f"[Facial] Error: {e}")
                traceback.print_exc()
                try:
                    await websocket.send_json({"status": "error", "message": str(e)})
                except: pass
    except WebSocketDisconnect:
        _facial_ensemble.clear()
        print("Disconnected /ws/emotion")

# =============================================================================
# WEBSOCKET — VOICE EMOTION
# Frontend now sends 16 kHz float32 PCM directly — no resampling step.
# =============================================================================
@app.websocket("/ws/voice")
async def voice_ws(websocket: WebSocket):
    if not await _authenticate_websocket(websocket):
        return
    await websocket.accept()
    print(f"[Voice] Client connected")

    SMOOTH_N   = 3
    voice_hist = []
    loop       = asyncio.get_event_loop()

    try:
        while True:
            data = await websocket.receive_bytes()
            try:
                # Frontend sends 16kHz float32 PCM directly
                audio_16k = np.frombuffer(data, dtype=np.float32).copy()
                rms  = float(np.sqrt(np.mean(audio_16k ** 2)))
                peak = float(np.abs(audio_16k).max())
                print(f"  [Voice] n={len(audio_16k)} ({len(audio_16k)/VOICE_SR:.1f}s) RMS={rms:.5f} peak={peak:.4f}")

                # Silence rejection
                if rms < 0.01 or peak < 0.02:
                    voice_hist.clear()
                    await websocket.send_json({"status": "no_voice"}); continue

                # Amplitude normalization — compensates for mic hardware differences
                if rms > 1e-6:
                    audio_16k = audio_16k * (0.05 / rms)

                # Blocking inference in thread pool
                emotion, conf, all_probs = await loop.run_in_executor(
                    _executor, _predict_voice_sync, audio_16k)

                # Temperature scaling — softens overconfident predictions
                if all_probs:
                    raw  = np.array(all_probs, dtype=np.float64)
                    logp = np.log(raw + 1e-10) / 1.3
                    pred = np.exp(logp - logp.max())
                    pred = (pred / pred.sum()).astype(np.float32)
                    idx  = int(np.argmax(pred))
                    emotion, conf = VOICE_EMOTIONS[idx], float(pred[idx] * 100)
                else:
                    pred = None

                # Rolling majority-vote smoothing
                voice_hist.append(emotion)
                if len(voice_hist) > SMOOTH_N: voice_hist.pop(0)
                smoothed = Counter(voice_hist).most_common(1)[0][0]

                if pred is not None and smoothed in VOICE_EMOTIONS:
                    si     = VOICE_EMOTIONS.index(smoothed)
                    s_conf = float(pred[si] * 100)
                    gap    = float((np.sort(pred)[::-1][0] - np.sort(pred)[::-1][1]) * 100)
                else:
                    s_conf, gap = conf, 0.0

                print(f"[Voice] Pred: {smoothed} ({s_conf:.1f}%)")
                status_key = "success" if s_conf >= 45.0 else "low_confidence"
                try:
                    await websocket.send_json({"status": status_key, "emotion": smoothed,
                                               "confidence": round(s_conf, 1), "top2_gap": round(gap, 1)})
                except: pass
            except Exception as e:
                print(f"  [Voice] error: {e}")
                try:
                    await websocket.send_json({"status": "error", "message": str(e)})
                except: pass
    except WebSocketDisconnect:
        print("Disconnected /ws/voice")

# =============================================================================
# PATH ROUTES
# =============================================================================
@app.post("/api/paths")
async def save_path(path_data: PathSaveRequest, current_user: dict = Depends(get_current_user)):
    d = {**path_data.dict(), "userId": str(current_user["_id"]),
         "createdAt": datetime.utcnow(), "completedModules": []}
    result = await paths_col.insert_one(d)
    return {"status": "success", "id": str(result.inserted_id)}

@app.get("/api/paths")
async def get_paths(current_user: dict = Depends(get_current_user)):
    paths = await paths_col.find({"userId": str(current_user["_id"])}).sort("createdAt", -1).to_list(100)
    for p in paths: p["id"] = str(p.pop("_id"))
    return {"status": "success", "history": paths}

@app.patch("/api/paths/{path_id}/progress")
async def update_progress(path_id: str, module: CompletedModule,
                           current_user: dict = Depends(get_current_user)):
    path = await paths_col.find_one({"_id": ObjectId(path_id), "userId": str(current_user["_id"])})
    if not path: raise HTTPException(404, "Path not found")
    oid = ObjectId(path_id)
    await paths_col.update_one({"_id": oid}, {"$pull": {"completedModules": {"id": module.id}}})
    await paths_col.update_one({"_id": oid}, {"$push": {"completedModules": module.dict()}})
    return {"status": "success"}

@app.delete("/api/paths/{path_id}")
async def delete_path(path_id: str, current_user: dict = Depends(get_current_user)):
    r = await paths_col.delete_one({"_id": ObjectId(path_id), "userId": str(current_user["_id"])})
    if r.deleted_count == 0: raise HTTPException(404, "Path not found")
    return {"status": "success"}

@app.post("/api/emotions/log")
async def log_emotion(mood_data: dict, current_user: dict = Depends(get_current_user)):
    await emotions_col.insert_one({"userId": str(current_user["_id"]),
        "timestamp": datetime.utcnow(), "mood": mood_data.get("mood"),
        "source": mood_data.get("source"), "confidence": mood_data.get("confidence")})
    return {"status": "success"}

# =============================================================================
# YOUTUBE SEARCH
# =============================================================================
def _sanitize_search_query(q: str) -> str:
    """Sanitize a YouTube search query: strip noise, cap to ~8 words, ensure relevance."""
    # Remove special chars and extra whitespace
    q = re.sub(r'[\[\]{}()"\'\\]', '', q)
    # Take part before any colon/dash/emdash separator
    q = q.split(':')[0].split('—')[0].split(' - ')[0].strip()
    # Cap to first 8 words
    words = q.split()
    if len(words) > 8:
        q = ' '.join(words[:8])
    return q.strip()

@app.get("/api/youtube-search")
async def youtube_search(q: str, topic: str = "", current_user: dict = Depends(get_current_user)):
    yt_key = os.environ.get("YOUTUBE_API_KEY")
    clean_q = _sanitize_search_query(q)
    if not clean_q: clean_q = q.split(':')[0].split('—')[0].strip()[:50]

    # Ensure topic context is in the query — prevents generic titles
    # from returning off-topic results (e.g. "Overcoming Challenges" → guitar video)
    if topic:
        topic_words = set(topic.lower().split())
        query_words = set(clean_q.lower().split())
        # If the query doesn't already contain any of the topic's key words, prepend it
        if not topic_words & query_words:
            clean_q = f"{topic} {clean_q}"
            # Re-cap to 8 words after prepending
            words = clean_q.split()
            if len(words) > 8:
                clean_q = ' '.join(words[:8])

    if not yt_key:
        # No API key — return a fallback search URL so frontend can still show something
        return {"error": "missing_youtube_key", "fallbackUrl": f"https://www.youtube.com/results?search_query={_uparse.quote_plus(clean_q)}"}
    try:
        search_q = f"{clean_q} -shorts -short"

        search_url = (f"https://www.googleapis.com/youtube/v3/search?part=snippet&type=video"
                      f"&videoDuration=medium&maxResults=3&q={_uparse.quote_plus(search_q)}&key={yt_key}")
        
        with urllib.request.urlopen(urllib.request.Request(search_url, headers={"User-Agent": "Mozilla/5.0"}), timeout=8) as resp:
            search_data = json.loads(resp.read().decode())
        
        # Check for API quota errors in the response
        if "error" in search_data:
            error_reason = search_data.get("error", {}).get("errors", [{}])[0].get("reason", "")
            if error_reason in ["quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded"]:
                print(f"YouTube API quota exceeded — using search fallback")
                return {"error": "quota_exceeded", "fallbackUrl": f"https://www.youtube.com/results?search_query={_uparse.quote_plus(clean_q)}"}

        items = search_data.get("items", [])
        if not items:
            # Fallback to any duration if medium is too restrictive
            search_url = (f"https://www.googleapis.com/youtube/v3/search?part=snippet&type=video"
                          f"&maxResults=1&q={_uparse.quote_plus(search_q)}&key={yt_key}")
            with urllib.request.urlopen(urllib.request.Request(search_url, headers={"User-Agent": "Mozilla/5.0"}), timeout=8) as resp:
                search_data = json.loads(resp.read().decode())
            items = search_data.get("items", [])
            if not items: return {"error": "no_results", "fallbackUrl": f"https://www.youtube.com/results?search_query={_uparse.quote_plus(clean_q)}"}

        it = items[0]
        v_id = it["id"]["videoId"]
        
        # Fetch actual duration
        details_url = f"https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id={v_id}&key={yt_key}"
        with urllib.request.urlopen(urllib.request.Request(details_url, headers={"User-Agent": "Mozilla/5.0"}), timeout=5) as resp:
            details_data = json.loads(resp.read().decode())
        
        duration = "10:00" # fallback
        if details_data.get("items"):
            iso_dur = details_data["items"][0]["contentDetails"]["duration"]
            import re as _re
            m = _re.search(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', iso_dur)
            if m:
                h, mins, s = m.groups()
                h = int(h) if h else 0
                mins = int(mins) if mins else 0
                s = int(s) if s else 0
                if h > 0: duration = f"{h}:{mins:02d}:{s:02d}"
                else: duration = f"{mins}:{s:02d}"

        return {"videoId": v_id, "title": it["snippet"]["title"],
                "thumbnail": it["snippet"]["thumbnails"]["medium"]["url"],
                "duration": duration}
    except Exception as e:
        error_str = str(e).lower()
        if any(x in error_str for x in ["quota", "429", "rate", "limit"]):
            print(f"YouTube API quota/rate error: {str(e)[:100]}")
        return {"error": str(e), "fallbackUrl": f"https://www.youtube.com/results?search_query={_uparse.quote_plus(clean_q)}"}

# =============================================================================
# LEARNING PATH HELPERS
# =============================================================================
def get_module_count_and_pace(speed, mood):
    mood, speed = mood.lower(), speed.lower()
    if mood in ["anxious","sad","unmotivated"]:
        return {"count":"12 to 15","duration":"8 to 12 min","note":"Short, digestible modules. Build momentum with frequent small wins."}
    if any(w in speed for w in ["fast","quick","rapid"]):
        return {"count":"15 to 18","duration":"15 to 25 min","note":"Dense, challenging modules. Skip fundamentals, go straight to application."}
    if any(w in speed for w in ["slow","relaxed","steady"]):
        return {"count":"18 to 22","duration":"8 to 15 min","note":"One concept per module. Deep mastery before moving forward."}
    return {"count":"15 to 18","duration":"10 to 18 min","note":"Balanced depth and breadth."}

def get_quiz_frequency(mood, difficulty):
    mood = mood.lower()
    if mood in ["energetic","motivated","bored","curious"]: return "Place a quiz after every 2 content modules."
    if mood in ["anxious","sad","unmotivated"]:             return "Place a quiz after every 4 content modules. Keep them gentle."
    if any(w in difficulty.lower() for w in ["advanced","expert"]): return "Place a quiz after every 2 content modules. Make questions challenging."
    return "Place a quiz after every 3 content modules."

def get_mood_tone(mood):
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

def get_difficulty_rules(d):
    d = d.lower()
    if any(w in d for w in ["beginner","easy","starter","novice"]): return "Beginner. Start from zero. Explain every term clearly with analogies. Examples should be simple and illustrative."
    if any(w in d for w in ["advanced","expert","hard","senior"]):  return "Advanced. Skip basics. Focus on complex patterns, edge cases, and high-level strategy."
    return "Intermediate. Assume basic familiarity. Focus on practical application and best practices."

def get_format_rules(fmt):
    if fmt == "videos":   return "80%+ of non-quiz modules must be type 'video'."
    if fmt == "articles": return "80%+ of non-quiz modules must be type 'article'."
    return "Mix 'video' and 'article'. Never repeat same type more than twice in a row."

# =============================================================================
# LOCAL FALLBACK GENERATOR
# =============================================================================
def _detect_topic_category(topic: str) -> str:
    """Detect the domain category of a topic for appropriate content generation."""
    t = topic.lower()
    if any(w in t for w in ["meditat","mindful","yoga","breathe","breathing","zen","chakra","spiritual","prayer","relax"]):
        return "wellness"
    if any(w in t for w in ["python","javascript","react","code","coding","programming","software","web dev","algorithm","data structure","api","database","sql","html","css","machine learning","ai ","artificial intel"]):
        return "coding"
    if any(w in t for w in ["physics","chemistry","biology","quantum","neuroscience","astronomy","math","calculus","statistics","genome","evolution","molecule"]):
        return "science"
    if any(w in t for w in ["paint","drawing","sketch","music","composition","photography","film","cinema","sculpture","design","animation","illustration"]):
        return "arts"
    if any(w in t for w in ["history","ancient","war","civilization","empire","revolution","medieval","renaissance"]):
        return "history"
    if any(w in t for w in ["business","marketing","finance","investing","startup","entrepreneur","management","leadership","economics","accounting"]):
        return "business"
    if any(w in t for w in ["writing","novel","poetry","essay","storytelling","creative writing","journalism","rhetoric"]):
        return "writing"
    if any(w in t for w in ["cook","cuisine","baking","recipe","nutrition","diet","food"]):
        return "culinary"
    if any(w in t for w in ["fitness","workout","exercise","strength","cardio","bodybuilding","sports","martial"]):
        return "fitness"
    if any(w in t for w in ["philosophy","ethics","logic","metaphysics","epistemology","existential","stoic"]):
        return "philosophy"
    if any(w in t for w in ["language","spanish","french","german","japanese","chinese","korean","linguis"]):
        return "language"
    return "general"

_PHASE_TEMPLATES = {
    "wellness": {
        "phases": ["Origins & Philosophy", "Science & Understanding", "Foundation Practices", "Core Techniques", "Advanced Methods", "Integration & Lifestyle"],
        "subtopic_templates": [
            "History & Origins of {topic}", "The Philosophy Behind {topic}", "Scientific Research on {topic}",
            "How {topic} Affects the Brain & Body", "Preparing Your Mind for {topic}", "Creating Your Sacred Space",
            "Foundational {topic} Technique #1: Breath Awareness", "Foundational Technique #2: Body Scan",
            "The Role of Posture in {topic}", "Overcoming Common Obstacles in {topic}",
            "Intermediate {topic}: Guided Visualization", "Deepening Your Practice with Mantras",
            "Emotional Regulation Through {topic}", "The Flow State: Advanced {topic} Practices",
            "Building a Daily {topic} Routine", "Tracking Progress & Measuring Growth",
            "Advanced: {topic} and Neuroplasticity", "Integrating {topic} Into Professional Life",
            "Community & Shared Practice", "Lifelong Mastery: Your {topic} Journey Ahead"
        ]
    },
    "science": {
        "phases": ["Foundations", "Core Theory", "Mathematical Framework", "Experimental Methods", "Advanced Topics", "Frontiers"],
        "subtopic_templates": [
            "What is {topic}? — A Conceptual Overview", "Historical Development of {topic}",
            "Fundamental Principles of {topic}", "Key Terminology & Definitions",
            "The Core Laws Governing {topic}", "Mathematical Models in {topic}",
            "Experimental Evidence for {topic}", "Measurement & Observation Techniques",
            "Common Misconceptions About {topic}", "Real-World Applications of {topic}",
            "Intermediate Concepts: Beyond the Basics", "Analytical Problem-Solving in {topic}",
            "Case Studies in {topic}", "Critical Analysis of {topic} Theories",
            "Advanced: Cutting-Edge Research in {topic}", "Interdisciplinary Connections",
            "Unsolved Problems in {topic}", "The Future of {topic}",
            "Ethics & Responsibility in {topic}", "Building a Career in {topic}"
        ]
    },
    "arts": {
        "phases": ["Appreciation & History", "Fundamentals", "Core Skills", "Technique Development", "Personal Expression", "Mastery"],
        "subtopic_templates": [
            "Understanding {topic}: What Makes It an Art", "History & Evolution of {topic}",
            "Influential Masters of {topic}", "Essential Tools & Materials for {topic}",
            "Foundational Techniques in {topic}", "Understanding Composition & Balance",
            "Color Theory / Tonal Relationships in {topic}", "Practice Exercise: First Creation",
            "Developing Your Unique Style", "Critique & Self-Assessment Methods",
            "Intermediate Techniques: Adding Depth", "Working with Light & Shadow",
            "Emotional Expression Through {topic}", "Creating a Portfolio of Work",
            "Advanced Methods & Experimentation", "Finding Your Artistic Voice",
            "Presenting & Sharing Your {topic}", "The Business of {topic}",
            "Continuous Growth & Inspiration", "Your Lifelong {topic} Practice"
        ]
    },
    "business": {
        "phases": ["Landscape & Context", "Core Frameworks", "Strategy", "Execution", "Growth", "Leadership"],
        "subtopic_templates": [
            "Understanding the Landscape of {topic}", "Key Players & Market Dynamics",
            "Core Principles of {topic}", "Essential Frameworks & Models",
            "Strategic Thinking in {topic}", "Data-Driven Decision Making",
            "Building a {topic} Plan", "Resource Allocation & Prioritization",
            "Execution: From Strategy to Action", "Measuring Success with KPIs",
            "Common Pitfalls & How to Avoid Them", "Case Studies: Success & Failure",
            "Scaling & Growth Strategies", "Innovation Within {topic}",
            "Leadership in {topic}", "Building Teams Around {topic}",
            "Ethics & Sustainability", "Future Trends in {topic}",
            "Personal Brand in {topic}", "Your {topic} Mastery Roadmap"
        ]
    },
    "general": {
        "phases": ["Introduction", "Core Concepts", "Practical Application", "Deep Understanding", "Advanced Mastery", "Integration"],
        "subtopic_templates": [
            "What is {topic}? — Complete Overview", "Historical Context & Origins of {topic}",
            "Why {topic} Matters Today", "Essential Vocabulary & Key Concepts",
            "The Core Principles of {topic}", "How {topic} Works in Practice",
            "Common Approaches to {topic}", "Hands-On: Your First Exercise with {topic}",
            "Intermediate {topic}: Going Deeper", "Analyzing Real-World Examples",
            "Problem-Solving Strategies in {topic}", "Critical Thinking Applied to {topic}",
            "Advanced Concepts in {topic}", "Connecting {topic} to Related Fields",
            "Overcoming Challenges & Plateaus", "Expert-Level {topic} Techniques",
            "Building Your Own Framework for {topic}", "Measuring Your Progress",
            "The Future of {topic}", "Lifelong Learning: Your {topic} Journey"
        ]
    }
}
# Copy general for uncovered categories
for _cat in ["coding","history","writing","culinary","fitness","philosophy","language"]:
    if _cat not in _PHASE_TEMPLATES:
        _PHASE_TEMPLATES[_cat] = _PHASE_TEMPLATES["general"]


def _local_generate(data: PathRequest) -> list:
    topic, goal = data.topic.strip(), data.goal.strip()
    mood, fmt   = data.mood.lower(), data.format
    speed       = data.speed.lower()
    difficulty  = data.suggestedDifficulty.lower()
    category    = _detect_topic_category(topic)

    if mood in ["anxious","sad","unmotivated"]:              count,mn,mx,qe = 15,6,12,4
    elif any(w in speed for w in ["fast","quick","rapid"]): count,mn,mx,qe = 16,12,22,2
    elif any(w in speed for w in ["slow","relaxed"]):       count,mn,mx,qe = 20,8,15,3
    else:                                                   count,mn,mx,qe = 16,10,18,3
    if mood in ["energetic","bored","motivated"]: qe = 2

    templates = _PHASE_TEMPLATES.get(category, _PHASE_TEMPLATES["general"])
    subtopics = [t.replace("{topic}", topic) for t in templates["subtopic_templates"]][:count]
    phases    = templates["phases"]

    def get_local_tone(m):
        return {"anxious":"Take a deep breath. You're doing wonderfully — one step at a time.",
                "sad":"You showed up today, and that matters more than you think. Let's explore gently.",
                "energetic":"Let's dive in with full intensity — no holding back!",
                "bored":"Here's the angle most people never consider...",
                "focused":"Pure signal, zero noise. Let's get precise.",
                "calm":"Settle in. There's beauty in understanding things deeply.",
                "motivated":f"This is the module that directly unlocks your goal: {goal}.",
                "creative":"Let's look at this from a completely unexpected direction.",
                "unmotivated":"This will only take a few minutes. Start here and see how you feel.",
                "curious":"There's a fascinating 'why' behind every concept here.",
                }.get(m, f"An essential exploration of {topic}.")

    def article_gen(sub, phase_name):
        tone = get_local_tone(mood)
        level_desc = "advanced deep-dive" if "advanced" in difficulty else "beginner-friendly exploration" if "beginner" in difficulty else "comprehensive guide"
        return (
            f"## {sub}\n\n"
            f"*{tone}*\n\n"
            f"### Introduction\n\n"
            f"Welcome to this {level_desc} on **{sub}**. This module sits within the **{phase_name}** phase of your learning journey, "
            f"specifically designed to align with your current mood ({mood}) and your ultimate goal of **{goal}**.\n\n"
            f"Understanding {sub} is not merely an academic exercise — it is the bridge between knowing about {topic} and truly embodying it. "
            f"Whether you are just beginning or deepening an existing practice, this module will give you both the conceptual understanding and the practical tools to move forward with confidence.\n\n"
            f"### Why This Matters\n\n"
            f"Before diving into the details, it's worth understanding *why* {sub} deserves focused attention within the broader landscape of {topic}. "
            f"Many learners skip this area, only to find themselves hitting a plateau later. The concepts here form the connective tissue between foundational knowledge and advanced mastery.\n\n"
            f"When experts in {topic} are asked what separates competent practitioners from truly exceptional ones, the answer almost always relates back to the principles covered in {sub}. "
            f"This is where intuition gets built — not from memorizing facts, but from deeply understanding relationships.\n\n"
            f"### Core Concepts\n\n"
            f"**The Foundation**: At its heart, {sub} is about understanding the underlying patterns and principles that govern {topic}. "
            f"Think of it as learning the grammar of a language rather than just memorizing phrases. Once you grasp these patterns, everything else becomes more intuitive.\n\n"
            f"**The Connection**: {sub} doesn't exist in isolation. It connects to virtually every other aspect of {topic} you'll encounter in this learning path. "
            f"As you progress through subsequent modules, you'll notice how the ideas introduced here keep reappearing in new and more sophisticated contexts.\n\n"
            f"**The Application**: Theory without application is incomplete. In the context of {sub}, application means taking these concepts and testing them against real-world scenarios. "
            f"The practical exercise at the end of this module is specifically designed to bridge this gap.\n\n"
            f"### Deep Exploration\n\n"
            f"Let's examine the key dimensions of {sub} more closely.\n\n"
            f"**Dimension 1 — Historical Context**: Every field has a history, and understanding how {sub} evolved helps you appreciate *why* certain approaches work better than others. "
            f"The early practitioners of {topic} approached {sub} very differently from how we understand it today. This evolution wasn't random — it was driven by systematic observation, experimentation, and refinement.\n\n"
            f"**Dimension 2 — Practical Methodology**: There are several proven approaches to mastering {sub}. The most effective method depends on your current level and learning style. "
            f"For beginners, a structured, step-by-step approach works best. For intermediate learners, a more exploratory, question-driven approach accelerates growth. "
            f"For advanced practitioners, the focus shifts to edge cases and nuanced applications.\n\n"
            f"**Dimension 3 — Common Misconceptions**: One of the biggest misconceptions about {sub} is that it can be mastered quickly through surface-level study. "
            f"In reality, {sub} rewards depth over breadth. It's better to spend more time truly understanding a few key principles than to rush through many.\n\n"
            f"### Practical Exercise\n\n"
            f"Take the next 15 minutes to engage with this hands-on exercise:\n\n"
            f"1. **Reflect**: Write down what you currently understand about {sub}. Don't worry about being \"right\" — this is about establishing your starting point.\n"
            f"2. **Observe**: Look for examples of {sub} in your daily life or in current events. How does {topic} show up when you're actively looking for it?\n"
            f"3. **Apply**: Choose one concept from this module and try to explain it to someone else (or write a brief explanation). Teaching is the fastest path to deep understanding.\n"
            f"4. **Connect**: How does what you learned in {sub} relate to your goal of **{goal}**? Write one sentence connecting them.\n\n"
            f"### Key Takeaways\n\n"
            f"- **{sub}** is a critical building block for achieving mastery in {topic}\n"
            f"- The concepts here form the foundation for everything that follows in your learning path\n"
            f"- True understanding comes from *applying* these ideas, not just reading about them\n"
            f"- Your goal of **{goal}** is directly served by the insights in this module\n"
            f"- Revisit this module after completing later ones — you'll see it with fresh eyes\n\n"
            f"### What's Next\n\n"
            f"In the next module, you'll build directly on what you've learned here. The concepts from {sub} will serve as the launching pad for more advanced explorations of {topic}. "
            f"Take a moment to consolidate what you've learned before moving on.\n"
        )

    def quiz_gen(concepts, phase_name=""):
        qs = []
        t = topic
        for i, c in enumerate(concepts[:5]):
            label = c.split(":")[0].strip() if ":" in c else c.strip()
            if i == 0:
                qs.append({"id":1,
                    "question": f"Which of the following best describes the primary purpose of studying {label}?",
                    "options": [
                        f"To understand the foundational principles that govern {t}",
                        f"To memorize a set of rigid rules without understanding their purpose",
                        f"To gain a superficial overview sufficient for casual conversation",
                        f"To identify which parts of {t} can be safely ignored"
                    ], "correctAnswer": 0,
                    "explanation": f"Studying {label} provides the foundational understanding necessary for all subsequent learning in {t}."})
            elif i == 1:
                qs.append({"id":2,
                    "question": f"A common misconception about {label} is that it:",
                    "options": [
                        f"Requires years of prior experience to begin",
                        f"Can be fully mastered through brief, surface-level study alone",
                        f"Is only relevant to advanced practitioners of {t}",
                        f"Has no connection to practical, real-world application"
                    ], "correctAnswer": 1,
                    "explanation": f"{label} rewards depth over breadth. Surface-level study misses the nuanced insights that drive real mastery."})
            elif i == 2:
                qs.append({"id":3,
                    "question": f"How does {label} relate to the broader field of {t}?",
                    "options": [
                        f"It exists as an isolated sub-field with no cross-connections",
                        f"It serves as connective tissue linking foundational and advanced concepts",
                        f"It was historically important but has been superseded by newer approaches",
                        f"It is considered optional supplementary material by most experts"
                    ], "correctAnswer": 1,
                    "explanation": f"{label} connects core principles to advanced applications, making it essential connective knowledge in {t}."})
            elif i == 3:
                qs.append({"id":4,
                    "question": f"What distinguishes competent practitioners from exceptional ones in the context of {label}?",
                    "options": [
                        f"Exceptional practitioners have access to better resources",
                        f"Competent practitioners focus only on theory while ignoring application",
                        f"Exceptional practitioners deeply understand relationships between concepts, not just individual facts",
                        f"There is no meaningful difference — both achieve the same outcomes"
                    ], "correctAnswer": 2,
                    "explanation": f"Mastery in {label} comes from understanding the relationships and patterns, not from memorizing isolated facts."})
            elif i == 4:
                qs.append({"id":5,
                    "question": f"Which learning strategy is most effective when approaching {label}?",
                    "options": [
                        f"Rushing through material quickly to cover maximum ground",
                        f"Focusing exclusively on theoretical knowledge without practice",
                        f"Combining structured study with hands-on application and reflection",
                        f"Waiting until you feel fully prepared before attempting any exercises"
                    ], "correctAnswer": 2,
                    "explanation": f"The most effective approach combines theory with practice. Active engagement with {label} accelerates understanding."})
        return qs

    modules, mid, buf, sq = [], 1, [], 0
    max_d = 18 if "advanced" in difficulty else 14
    min_d = 6 if mood in ["anxious", "unmotivated"] else 8

    for i, sub in enumerate(subtopics):
        dur = random.randint(min_d, max_d)
        phase_idx = min(i * len(phases) // len(subtopics), len(phases) - 1)
        phase_name = phases[phase_idx]
        mtype = "video" if fmt == "videos" else "article" if fmt == "articles" else ("video" if i % 2 == 0 else "article")
        buf.append(sub); sq += 1
        # Build a short, clean YouTube search query (not the full subtitle)
        short_title = sub.split(":")[0].split("—")[0].strip()  # take part before : or —
        q = f"{topic} {short_title} explained"
        if len(q) > 80: q = f"{topic} {short_title}"[:80]  # cap length
        if mtype == "video":
            modules.append({"id":mid,"title":sub,"type":"video","duration":f"{dur} min","completed":False,
                            "searchQuery":q,"youtubeUrl":"https://www.youtube.com/results?search_query="+quote_plus(q)})
        else:
            modules.append({"id":mid,"title":sub,"type":"article","duration":f"{dur} min","completed":False,
                            "articleContent":article_gen(sub, phase_name), "questions": quiz_gen([sub], phase_name)})
        mid += 1
        if sq >= qe and i < len(subtopics) - 1:
            quiz_dur = random.randint(8, 12)
            modules.append({"id":mid,"title":f"Checkpoint: {phase_name}",
                            "type":"quiz","duration":f"{quiz_dur} min","completed":False,"questions":quiz_gen(buf, phase_name)})
            mid += 1; sq = 0; buf = []
    
    final_dur = random.randint(10, 15)
    modules.append({"id":mid,"title":f"Final Assessment: {topic}","type":"quiz",
                    "duration":f"{final_dur} min","completed":False,"questions":quiz_gen(subtopics[-5:], "Mastery")})
    return modules

# =============================================================================
# GEMINI ARTICLE GENERATOR
# =============================================================================
def _rich_article_fallback(topic, title, mood="focused", difficulty="intermediate", goal="mastery"):
    """Generate a rich 800+ word article locally when Gemini is unavailable."""
    category = _detect_topic_category(topic)
    tone_map = {"anxious":"Take a deep breath. You're doing wonderfully — one step at a time.",
                "sad":"You showed up today, and that matters more than you think. Let's explore gently.",
                "energetic":"Let's dive in with full intensity — no holding back!",
                "bored":"Here's the angle most people never consider...",
                "focused":"Pure signal, zero noise. Let's get precise.",
                "calm":"Settle in. There's beauty in understanding things deeply.",
                "motivated":f"This is the module that directly unlocks your goal: {goal}.",
                "creative":"Let's look at this from a completely unexpected direction.",
                "unmotivated":"This will only take a few minutes. Start here and see how you feel.",
                "curious":"There's a fascinating 'why' behind every concept here."}
    tone = tone_map.get(mood.lower(), f"An essential exploration of {topic}.")
    level_desc = "advanced deep-dive" if "advanced" in difficulty.lower() else "beginner-friendly exploration" if "beginner" in difficulty.lower() else "comprehensive guide"
    return (
        f"## {title}\n\n"
        f"*{tone}*\n\n"
        f"### Introduction\n\n"
        f"Welcome to this {level_desc} on **{title}**. This module is part of your learning journey through **{topic}**, "
        f"specifically designed to align with your current mood and your ultimate goals.\n\n"
        f"Understanding {title} is not merely an academic exercise — it is the bridge between knowing about {topic} and truly embodying it. "
        f"Whether you are just beginning or deepening an existing practice, this module will give you both the conceptual understanding and the practical tools to move forward with confidence.\n\n"
        f"### Why This Matters\n\n"
        f"Before diving into the details, it's worth understanding *why* {title} deserves focused attention within the broader landscape of {topic}. "
        f"Many learners skip this area, only to find themselves hitting a plateau later. The concepts here form the connective tissue between foundational knowledge and advanced mastery.\n\n"
        f"When experts in {topic} are asked what separates competent practitioners from truly exceptional ones, the answer almost always relates back to the principles covered in {title}. "
        f"This is where intuition gets built — not from memorizing facts, but from deeply understanding relationships.\n\n"
        f"### Core Concepts\n\n"
        f"**The Foundation**: At its heart, {title} is about understanding the underlying patterns and principles that govern {topic}. "
        f"Think of it as learning the grammar of a language rather than just memorizing phrases. Once you grasp these patterns, everything else becomes more intuitive.\n\n"
        f"**The Connection**: {title} doesn't exist in isolation. It connects to virtually every other aspect of {topic} you'll encounter in this learning path. "
        f"As you progress through subsequent modules, you'll notice how the ideas introduced here keep reappearing in new and more sophisticated contexts.\n\n"
        f"**The Application**: Theory without application is incomplete. In the context of {title}, application means taking these concepts and testing them against real-world scenarios. "
        f"The practical exercise at the end of this module is specifically designed to bridge this gap.\n\n"
        f"### Deep Exploration\n\n"
        f"Let's examine the key dimensions of {title} more closely.\n\n"
        f"**Dimension 1 — Historical Context**: Every field has a history, and understanding how {title} evolved helps you appreciate *why* certain approaches work better than others. "
        f"The early practitioners of {topic} approached this very differently from how we understand it today. This evolution wasn't random — it was driven by systematic observation, experimentation, and refinement.\n\n"
        f"**Dimension 2 — Practical Methodology**: There are several proven approaches to mastering {title}. The most effective method depends on your current level and learning style. "
        f"For beginners, a structured, step-by-step approach works best. For intermediate learners, a more exploratory, question-driven approach accelerates growth. "
        f"For advanced practitioners, the focus shifts to edge cases and nuanced applications.\n\n"
        f"**Dimension 3 — Common Misconceptions**: One of the biggest misconceptions about {title} is that it can be mastered quickly through surface-level study. "
        f"In reality, this topic rewards depth over breadth. It's better to spend more time truly understanding a few key principles than to rush through many.\n\n"
        f"### Practical Exercise\n\n"
        f"Take the next 15 minutes to engage with this hands-on exercise:\n\n"
        f"1. **Reflect**: Write down what you currently understand about {title}. Don't worry about being \"right\" — this is about establishing your starting point.\n"
        f"2. **Observe**: Look for examples of {title} in your daily life or in current events. How does {topic} show up when you're actively looking for it?\n"
        f"3. **Apply**: Choose one concept from this module and try to explain it to someone else (or write a brief explanation). Teaching is the fastest path to deep understanding.\n"
        f"4. **Connect**: How does what you learned in {title} relate to your broader goals? Write one sentence connecting them.\n\n"
        f"### Key Takeaways\n\n"
        f"- **{title}** is a critical building block for achieving mastery in {topic}\n"
        f"- The concepts here form the foundation for everything that follows in your learning path\n"
        f"- True understanding comes from *applying* these ideas, not just reading about them\n"
        f"- Revisit this module after completing later ones — you'll see it with fresh eyes\n"
        f"- Depth beats breadth: focus on truly understanding rather than rushing ahead\n\n"
        f"### What's Next\n\n"
        f"In the next module, you'll build directly on what you've learned here. The concepts from {title} will serve as the launching pad for more advanced explorations of {topic}. "
        f"Take a moment to consolidate what you've learned before moving on.\n"
    )

def _generate_article_content(topic, title, mood, difficulty):
    if not GENAI_CLIENT: return _rich_article_fallback(topic, title, mood, difficulty)
    category = _detect_topic_category(topic)
    prompt = (f'You are a world-class educator writing a learning article.\n'
              f'Topic: "{topic}" (Category: {category})\nModule: "{title}"\n'
              f'Tone: {get_mood_tone(mood)}\nDifficulty: {get_difficulty_rules(difficulty)}\n\n'
              f'STRICT RULES:\n'
              f'- Write 800-1200 words of rich, substantive content\n'
              f'- Use Markdown: ## for title, ### for sections, **bold**, bullets, numbered lists\n'
              f'- Structure: Introduction (why this matters) → Core Concepts (3-4 subsections) → Deep Exploration → Practical Exercise → Key Takeaways (5 bullets) → What\'s Next\n'
              f'- DOMAIN AWARENESS: If the topic is about wellness, use wellness examples. If science, use equations and experiments. If arts, use creative examples. NEVER use coding examples unless the topic is explicitly about programming.\n'
              f'- Make content genuinely educational — teach real concepts, not generic platitudes\n'
              f'- Include at least one concrete, actionable exercise the learner can do in 10-15 minutes\n'
              f'Return ONLY: {{"content":"<markdown>"}}'
              )
    for attempt in range(MAX_RETRIES):
        try:
            resp = GENAI_CLIENT.models.generate_content(
                model=BEST_MODEL, contents=prompt,
                config=genai_types.GenerateContentConfig(
                    temperature=0.7, max_output_tokens=8192, response_mime_type="application/json"))
            raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", resp.text.strip())
            content = json.loads(raw).get("content", "")
            # Validate: only accept if it's actually substantive (300+ chars)
            if content and len(content) > 300:
                return content
        except Exception as e:
            if attempt < MAX_RETRIES - 1 and any(x in str(e).lower() for x in ["429","rate","quota"]):
                time.sleep(INITIAL_BACKOFF_TIME * (2 ** attempt)); continue
            break
    # Always fall back to rich local article — never a 2-line stub
    return _rich_article_fallback(topic, title, mood, difficulty)

# =============================================================================
# GENERATE PATH
# =============================================================================
@app.post("/api/generate-path")
async def generate_path(data: PathRequest, current_user: dict = Depends(get_current_user)):
    cache_hash = hashlib.md5(f"{data.topic}|{data.goal}|{data.mood}|{data.speed}|{data.format}|{data.suggestedDifficulty}".encode()).hexdigest()
    cache_file = CACHE_DIR / f"{cache_hash}.json"

    if cache_file.exists():
        try:
            with open(cache_file) as f: return {"status":"success","modules":json.load(f),"source":"cache"}
        except Exception: pass

    if not GENAI_CLIENT:
        mods = _local_generate(data); _save_cache(cache_file, mods)
        return {"status":"success","modules":mods,"source":"local"}

    pacing = get_module_count_and_pace(data.speed, data.mood)
    prompt = (
        f"You are a world-class, domain-agnostic expert curriculum designer. Your goal is to create a bespoke learning path for any topic, purely tailored to the user's psychological state and goal.\n\n"
        f"STUDENT CONTEXT:\n"
        f"- Topic: {data.topic}\n"
        f"- Goal: {data.goal}\n"
        f"- Current Mood: {data.mood} (ADAPT the curriculum structure to this mood)\n"
        f"- Speed: {data.speed}\n"
        f"- Difficulty: {data.suggestedDifficulty}\n"
        f"- Format: {data.format}\n\n"
        f"CONSTRAINTS:\n"
        f"1. ABSOLUTE TOPIC AGNOSTICISM: If the topic is '{data.topic}', do NOT use any programming-specific terms (like 'setup', 'environment', 'syntax', 'debugging', 'compile') unless the topic is explicitly about software development. For meditation, use 'mindfulness stages'; for physics, use 'theoretical foundations'; for art, use 'medium mastery'.\n"
        f"2. MOOD-SENSITIVE STRUCTURE: For '{data.mood}' mood, {get_mood_tone(data.mood)}\n"
        f"3. DURATION: Duration MUST be a string (e.g., '15 min'). Each module should be roughly {pacing['duration']}.\n"
        f"4. MODULES: Generate exactly {pacing['count']} modules.\n"
        f"5. QUIZZES: {get_quiz_frequency(data.mood, data.suggestedDifficulty)}. Questions MUST be highly specific to the topic content, not generic templates.\n\n"
        f"Return ONLY a raw JSON array. Each item must follow this schema:\n"
        f'VIDEO:   {{"id":int,"title":str,"type":"video","duration":str,"completed":false,"searchQuery":str}}\n'
        f'CRITICAL: searchQuery for videos MUST be a SHORT YouTube search phrase (5-7 words max, e.g. "neuroscience introduction explained", "meditation basics for beginners"). Do NOT use long descriptions, commas, or colons in searchQuery.\n'
        f'ARTICLE: {{"id":int,"title":str,"type":"article","duration":str,"completed":false,"questions":[{{"id":int,"question":str,"options":[str,str,str,str],"correctAnswer":int,"explanation":str}}]}}\n'
        f'QUIZ:    {{"id":int,"title":str,"type":"quiz","duration":str,"completed":false,"questions":[{{"id":int,"question":str,"options":[str,str,str,str],"correctAnswer":int,"explanation":str}}]}}\n'
        f'\nFinal Goal: "{data.goal}". Ensure the path is a logical progression toward this goal.'
    )

    for attempt in range(1, MAX_RETRIES + 1):
        if attempt > 1: time.sleep(2 ** (attempt - 1))
        try:
            resp  = GENAI_CLIENT.models.generate_content(
                model=BEST_MODEL, contents=prompt,
                config=genai_types.GenerateContentConfig(
                    temperature=0.7, max_output_tokens=8192, response_mime_type="application/json"))
            text  = resp.text.strip()
            s, e  = text.find("["), text.rfind("]")
            raw   = text[s:e+1] if s != -1 and e != -1 else re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
            mods  = json.loads(raw)
            if not isinstance(mods, list) or not mods: raise ValueError("Empty")

            for i, m in enumerate(mods):
                m["id"] = i + 1; m["completed"] = False
                if m.get("type") == "video":
                    m.pop("articleContent", None); m.pop("questions", None)
                    # Sanitize searchQuery — Gemini sometimes generates long/noisy ones
                    if "searchQuery" in m:
                        m["searchQuery"] = _sanitize_search_query(m["searchQuery"])
                        if not m["searchQuery"]:
                            m["searchQuery"] = f"{data.topic} explained"
                    else:
                        # Generate a clean searchQuery from the title
                        short = m.get("title", data.topic).split(":")[0].split("—")[0].strip()
                        words = short.split()
                        m["searchQuery"] = ' '.join(words[:6]) + " explained" if len(words) <= 6 else ' '.join(words[:6])
                    m["youtubeUrl"] = "https://www.youtube.com/results?search_query=" + quote_plus(m["searchQuery"])
                elif m.get("type") == "article":
                    m.pop("searchQuery", None); m.pop("youtubeUrl", None)
                    if not m.get("questions"): m["questions"] = []
                elif m.get("type") == "quiz":
                    m.pop("searchQuery", None); m.pop("youtubeUrl", None); m.pop("articleContent", None)
                    if not m.get("questions"): m["questions"] = []

            # Generate article content LOCALLY — no extra Gemini calls needed
            # This is instant, never rate-limited, and produces 800+ word articles
            for m in [x for x in mods if x.get("type") == "article"]:
                m["articleContent"] = _rich_article_fallback(
                    data.topic, m["title"], data.mood, data.suggestedDifficulty,
                    goal=data.goal or f"Learn {data.topic}")

            _save_cache(cache_file, mods)
            return {"status":"success","modules":mods,"source":"gemini"}
        except Exception as e:
            print(f"Gemini attempt {attempt}: {str(e)[:150]}")
            if any(x in str(e) for x in ["ResourceExhausted","429","quota"]): continue
            break

    mods = _local_generate(data); _save_cache(cache_file, mods)
    return {"status":"success","modules":mods,"source":"local"}

def _save_cache(cache_file, modules):
    try:
        with open(cache_file, "w") as f: json.dump(modules, f)
    except Exception as e: print(f"Cache error: {e}")

# =============================================================================
# CACHE VERSION INVALIDATION
# =============================================================================
_CACHE_VERSION = "v7_no_rate_limits"
_cache_version_file = CACHE_DIR / "_version.txt"
def _check_cache_version():
    try:
        if _cache_version_file.exists():
            if _cache_version_file.read_text().strip() == _CACHE_VERSION:
                return
        # Version mismatch — clear all cached paths
        import shutil
        for f in CACHE_DIR.glob("*.json"):
            f.unlink()
        _cache_version_file.write_text(_CACHE_VERSION)
        print(f"Cache cleared — upgraded to {_CACHE_VERSION}")
    except Exception as e:
        print(f"Cache version check error: {e}")

_check_cache_version()

# =============================================================================
# NEXT TOPIC SUGGESTIONS
# =============================================================================
_TOPIC_GRAPH = {
    "wellness": ["Mindfulness Meditation", "Yoga Philosophy", "Breathwork Science", "Sleep Optimization", "Stress Management", "Emotional Intelligence", "Sound Healing", "Tai Chi"],
    "science": ["Quantum Mechanics", "Neuroscience", "Astrophysics", "Molecular Biology", "Climate Science", "Genetics", "Organic Chemistry", "Statistical Mechanics"],
    "arts": ["Oil Painting", "Digital Illustration", "Music Theory", "Photography Composition", "Sculpture", "Film Direction", "Creative Writing", "Graphic Design"],
    "business": ["Strategic Management", "Digital Marketing", "Financial Modeling", "Startup Growth", "Behavioral Economics", "Negotiation", "Product Management", "Data Analytics"],
    "coding": ["Machine Learning", "System Design", "Algorithms", "Cloud Architecture", "Web Development", "Mobile Development", "DevOps", "Cybersecurity"],
    "history": ["Ancient Civilizations", "World War History", "Renaissance Art", "Industrial Revolution", "Cold War Politics", "Ancient Philosophy", "Medieval Society", "Colonial History"],
    "philosophy": ["Stoicism", "Existentialism", "Ethics", "Logic", "Eastern Philosophy", "Political Philosophy", "Aesthetics", "Epistemology"],
    "writing": ["Fiction Writing", "Poetry", "Screenwriting", "Journalism", "Memoir Writing", "Technical Writing", "Rhetoric", "Copywriting"],
    "general": ["Critical Thinking", "Systems Thinking", "Communication Skills", "Problem Solving", "Research Methods", "Decision Making", "Speed Learning", "Memory Techniques"],
}

class NextTopicRequest(BaseModel):
    topic: str
    goal: str = ""
    completedTopics: list = []

@app.post("/api/suggest-next-topics")
async def suggest_next_topics(data: NextTopicRequest, current_user: dict = Depends(get_current_user)):
    category = _detect_topic_category(data.topic)

    if GENAI_CLIENT:
        prompt = (
            f"The user just completed a learning path on \"{data.topic}\" with the goal: \"{data.goal}\".\n"
            f"Suggest exactly 5 related topics they should explore next, ordered from most to least relevant.\n"
            f"Each topic should be a natural progression that builds on what they learned.\n"
            f"Return ONLY a JSON array: [{{\"topic\":str, \"reason\":str, \"difficulty\":\"beginner\"|\"intermediate\"|\"advanced\"}}]\n"
            f"The reason should be 1 sentence explaining WHY this is a good next step."
        )
        try:
            resp = GENAI_CLIENT.models.generate_content(
                model=BEST_MODEL, contents=prompt,
                config=genai_types.GenerateContentConfig(
                    temperature=0.8, max_output_tokens=2048, response_mime_type="application/json"))
            raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", resp.text.strip())
            s, e = raw.find("["), raw.rfind("]")
            suggestions = json.loads(raw[s:e+1]) if s != -1 and e != -1 else json.loads(raw)
            if isinstance(suggestions, list) and suggestions:
                return {"status": "success", "suggestions": suggestions[:5]}
        except Exception as ex:
            print(f"Next-topic AI failed: {str(ex)[:100]}")

    # Local fallback from knowledge graph
    pool = _TOPIC_GRAPH.get(category, _TOPIC_GRAPH["general"])
    completed_lower = {t.lower() for t in data.completedTopics}
    available = [t for t in pool if t.lower() not in completed_lower and t.lower() != data.topic.lower()]
    if len(available) < 3:
        available = pool[:5]

    suggestions = []
    for t in available[:5]:
        suggestions.append({
            "topic": t,
            "reason": f"A natural progression from {data.topic} that deepens your understanding of {category}.",
            "difficulty": "intermediate"
        })
    return {"status": "success", "suggestions": suggestions}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("api:app", host="0.0.0.0", port=port, reload=False, timeout_keep_alive=300)
