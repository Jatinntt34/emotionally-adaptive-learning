"""
api.py — MoodLearn Backend v2.0
================================
Facial model : EfficientNetB2 trained by train_facial.py  (TensorFlow)
Voice model  : wav2vec2 fine-tuned by train_voice.py      (HuggingFace/PyTorch)
No Keras version conflicts — both frameworks coexist cleanly.

WebSockets:
  /ws/emotion  — facial emotion from base64 JPEG frames
  /ws/voice    — voice emotion from float32 PCM at 22050 Hz

NOTE: Frontend sends audio at 22050 Hz.
      api.py resamples to 16kHz internally for wav2vec2.
      Do NOT change the frontend audio pipeline.
"""

import os, sys, json, re, time, random, hashlib, base64
import asyncio, warnings, urllib.request, urllib.parse as _uparse
from pathlib import Path
from collections import Counter
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
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
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
            if any("2.5" in m for m in flash):      BEST_MODEL = next(m for m in flash if "2.5" in m)
            elif any("1.5" in m for m in flash):    BEST_MODEL = next(m for m in flash if "1.5" in m)
            elif flash:                              BEST_MODEL = flash[0]
            print(f"Gemini ready — {BEST_MODEL}")
        except Exception as e:
            print(f"Gemini discovery failed: {e}")
except Exception as e:
    print(f"google-genai not available: {e}")

# =============================================================================
# TENSORFLOW  (facial model)
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
# PYTORCH / HUGGINGFACE  (voice model)
# =============================================================================
HF_AVAILABLE = False
VOICE_DEVICE = "cpu"
try:
    import torch
    from transformers import Wav2Vec2ForSequenceClassification, Wav2Vec2FeatureExtractor
    HF_AVAILABLE = True
    VOICE_DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"PyTorch {torch.__version__} | voice device: {VOICE_DEVICE}")
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
    print("MediaPipe loaded — face alignment enabled")
except ImportError:
    print("MediaPipe not installed — pip install mediapipe for +5% accuracy")

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
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

@app.get("/")
async def root():
    return {"status": "online", "message": "MoodLearn API v2.0",
            "endpoints": ["/ws/emotion", "/ws/voice", "/api/auth", "/api/paths", "/api/health"]}

@app.get("/health")
@app.get("/api/health")
async def health_check():
    h = {"status": "healthy", "timestamp": datetime.utcnow()}
    try:
        await db_client.admin.command("ping"); h["mongodb"] = "connected"
    except Exception as e:
        h["mongodb"] = f"error: {e}"; h["status"] = "degraded"
    h["facial_model"] = "loaded" if facial_model  is not None else "not_loaded"
    h["voice_model"]  = "loaded" if voice_model   is not None else "not_loaded"
    if None in (facial_model, voice_model): h["status"] = "degraded"
    return h

# =============================================================================
# DATABASE
# =============================================================================
MONGO_URI                   = os.environ.get("MONGODB_URI")
JWT_SECRET                  = os.environ.get("JWT_SECRET", "dev_secret_change_in_prod")
ALGORITHM                   = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

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
# FACIAL MODEL — EfficientNetB2
# =============================================================================
FACIAL_EMOTIONS = ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"]
FACIAL_IMG_SIZE = 224
facial_model    = None

try:
    with open("models/facial_config.json") as f:
        _fc = json.load(f)
    FACIAL_EMOTIONS = _fc.get("emotions", FACIAL_EMOTIONS)
    FACIAL_IMG_SIZE = _fc.get("img_size",  224)
    print(f"Facial config: {FACIAL_EMOTIONS}")
except Exception as e:
    print(f"Facial config missing (defaults): {e}")

if TF_AVAILABLE:
    try:
        facial_model = tf.keras.models.load_model("models/facial_model.h5")
        print("Facial model loaded (EfficientNetB2)")
    except Exception as e:
        print(f"Facial model load error: {e}")


def _align_face(image: np.ndarray) -> np.ndarray:
    """Rotate face so eyes are horizontal — removes pose variation."""
    if not HAS_MEDIAPIPE:
        return image
    try:
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        with _mp_face_mesh.FaceMesh(static_image_mode=True, max_num_faces=1,
                                    min_detection_confidence=0.4) as mesh:
            res = mesh.process(rgb)
            if not res.multi_face_landmarks:
                return image
            lm = res.multi_face_landmarks[0].landmark
            h, w = image.shape[:2]
            le     = np.array([lm[33].x * w,  lm[33].y  * h])
            re     = np.array([lm[263].x * w, lm[263].y * h])
            angle  = np.degrees(np.arctan2(re[1]-le[1], re[0]-le[0]))
            center = tuple(((le+re)/2).astype(int))
            M      = cv2.getRotationMatrix2D(center, angle, 1.0)
            return cv2.warpAffine(image, M, (w, h))
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
                    x, y = max(0, int(bb.xmin*w)),  max(0, int(bb.ymin*h))
                    fw, fh = int(bb.width*w), int(bb.height*h)
                    roi = frame[y:y+fh, x:x+fw]
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
                x, y, w, h = max(faces, key=lambda f: f[2]*f[3])
                roi = frame[y:y+h, x:x+w]
                return roi if roi.size > 0 else None
    except Exception:
        pass
    return None


class _TemporalEnsemble:
    """Average probability vectors over N frames — smoother than majority vote."""
    def __init__(self, window=5):
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
        img   = _align_face(face_img)
        img   = cv2.resize(img, (FACIAL_IMG_SIZE, FACIAL_IMG_SIZE))
        img   = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        arr   = tf.keras.applications.efficientnet.preprocess_input(
                    np.expand_dims(img.astype(np.float32), 0))
        probs = facial_model.predict(arr, verbose=0)[0]
        idx, conf = _facial_ensemble.update(probs)
        return FACIAL_EMOTIONS[idx], conf
    except Exception as e:
        print(f"[Facial] {e}"); return "neutral", 0.0

# =============================================================================
# VOICE MODEL — wav2vec2
# =============================================================================
VOICE_EMOTIONS       = ["angry", "calm", "disgust", "fear", "happy", "neutral", "sad"]
VOICE_SR             = 16000
VOICE_MAX_LEN        = 64000
voice_model          = None
voice_feat_extractor = None

try:
    with open("models/voice_config.json") as f:
        _vc = json.load(f)
    VOICE_EMOTIONS = _vc.get("emotions",   VOICE_EMOTIONS)
    VOICE_SR       = _vc.get("sample_rate", 16000)
    VOICE_MAX_LEN  = _vc.get("max_length",  64000)
    print(f"Voice config: {VOICE_EMOTIONS}")
except Exception as e:
    print(f"Voice config missing (defaults): {e}")

if HF_AVAILABLE:
    try:
        voice_feat_extractor = Wav2Vec2FeatureExtractor.from_pretrained("models/voice_model")
        voice_model          = Wav2Vec2ForSequenceClassification.from_pretrained("models/voice_model")
        voice_model.eval()
        voice_model.to(VOICE_DEVICE)
        print(f"Voice model loaded (wav2vec2) on {VOICE_DEVICE}")
    except Exception as e:
        print(f"Voice model load error: {e}")


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
        probs   = torch.softmax(logits, dim=-1)[0].cpu().numpy()
        idx     = int(np.argmax(probs))
        return VOICE_EMOTIONS[idx], float(probs[idx]*100), probs.tolist()
    except Exception as e:
        print(f"[Voice] {e}"); return "neutral", 0.0, []

# =============================================================================
# AUTH ROUTES
# =============================================================================
@app.post("/api/auth/signup")
async def signup(user: UserAuth):
    if await users_col.find_one({"email": user.email}):
        raise HTTPException(400, "Email already registered")
    await users_col.insert_one({"email": user.email, "password": hash_password(user.password),
                                 "displayName": user.displayName, "createdAt": datetime.utcnow()})
    return {"status": "success", "access_token": create_access_token({"sub": user.email}),
            "user": {"email": user.email, "displayName": user.displayName}}

@app.post("/api/auth/login")
async def login(user: UserAuth):
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
    await websocket.accept()
    print("Client connected /ws/emotion")
    _facial_ensemble.clear()
    loop = asyncio.get_event_loop()
    try:
        while True:
            data = await websocket.receive_text()
            if "," in data: data = data.split(",")[1]
            try:
                frame = cv2.imdecode(np.frombuffer(base64.b64decode(data), np.uint8), cv2.IMREAD_COLOR)
                if frame is None: continue

                roi = _detect_face_roi(frame)
                if roi is None:
                    _facial_ensemble.clear()
                    await websocket.send_json({"status": "no_face"}); continue

                emotion, conf = await loop.run_in_executor(_executor, _predict_facial_sync, roi)

                status_key = "success" if conf >= 45.0 else "low_confidence"
                await websocket.send_json({"status": status_key, "emotion": emotion,
                                           "confidence": round(conf, 1)})
            except Exception as e:
                await websocket.send_json({"status": "error", "message": str(e)})
    except WebSocketDisconnect:
        _facial_ensemble.clear()
        print("Disconnected /ws/emotion")

# =============================================================================
# WEBSOCKET — VOICE EMOTION
# =============================================================================
@app.websocket("/ws/voice")
async def voice_ws(websocket: WebSocket):
    await websocket.accept()
    print("Client connected /ws/voice")

    SMOOTH_N    = 3
    voice_hist  = []
    loop        = asyncio.get_event_loop()
    FRONTEND_SR = 22050   # frontend sends 22050 Hz — we resample to 16kHz here

    try:
        while True:
            data = await websocket.receive_bytes()
            try:
                audio_22k = np.frombuffer(data, dtype=np.float32).copy()
                rms  = float(np.sqrt(np.mean(audio_22k**2)))
                peak = float(np.abs(audio_22k).max())
                print(f"  [Voice] n={len(audio_22k)} RMS={rms:.5f} peak={peak:.4f}")

                # Silence rejection — raised thresholds for real mics
                if rms < 0.01 or peak < 0.02:
                    voice_hist.clear()
                    await websocket.send_json({"status": "no_voice"}); continue

                # Amplitude normalization — compensates for mic hardware differences
                if rms > 1e-6:
                    audio_22k = audio_22k * (0.05 / rms)

                # Resample to 16kHz (wav2vec2 requirement)
                audio_16k = librosa.resample(audio_22k, orig_sr=FRONTEND_SR, target_sr=VOICE_SR)

                # Blocking inference in thread pool
                emotion, conf, all_probs = await loop.run_in_executor(
                    _executor, _predict_voice_sync, audio_16k.astype(np.float32))

                # Temperature scaling — softens overconfident predictions
                if all_probs:
                    raw  = np.array(all_probs, dtype=np.float64)
                    logp = np.log(raw + 1e-10) / 1.3
                    pred = np.exp(logp - logp.max())
                    pred = (pred / pred.sum()).astype(np.float32)
                    idx  = int(np.argmax(pred))
                    emotion, conf = VOICE_EMOTIONS[idx], float(pred[idx]*100)
                else:
                    pred = None

                # Rolling majority-vote smoothing
                voice_hist.append(emotion)
                if len(voice_hist) > SMOOTH_N: voice_hist.pop(0)
                smoothed = Counter(voice_hist).most_common(1)[0][0]

                if pred is not None and smoothed in VOICE_EMOTIONS:
                    si     = VOICE_EMOTIONS.index(smoothed)
                    s_conf = float(pred[si]*100)
                    gap    = float((np.sort(pred)[::-1][0] - np.sort(pred)[::-1][1])*100)
                else:
                    s_conf, gap = conf, 0.0

                print(f"  [Voice] {smoothed} ({s_conf:.1f}%)")
                status_key = "success" if s_conf >= 45.0 else "low_confidence"
                await websocket.send_json({"status": status_key, "emotion": smoothed,
                                           "confidence": round(s_conf, 1), "top2_gap": round(gap, 1)})
            except Exception as e:
                print(f"  [Voice] error: {e}")
                await websocket.send_json({"status": "error", "message": str(e)})
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
@app.get("/api/youtube-search")
async def youtube_search(q: str):
    yt_key = os.environ.get("YOUTUBE_API_KEY")
    if not yt_key: return {"error": "missing_youtube_key"}
    try:
        url = (f"https://www.googleapis.com/youtube/v3/search?part=snippet&type=video"
               f"&maxResults=1&q={_uparse.quote_plus(q)}&key={yt_key}")
        with urllib.request.urlopen(
            urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=8
        ) as resp:
            data  = json.loads(resp.read().decode())
        items = data.get("items", [])
        if not items: return {"error": "no_results"}
        it = items[0]
        return {"videoId": it["id"]["videoId"], "title": it["snippet"]["title"],
                "thumbnail": it["snippet"]["thumbnails"]["medium"]["url"]}
    except Exception as e:
        return {"error": str(e)}

# =============================================================================
# LEARNING PATH HELPERS
# =============================================================================
def get_module_count_and_pace(speed, mood):
    mood, speed = mood.lower(), speed.lower()
    if mood in ["anxious","sad","unmotivated"]:
        return {"count":"8 to 10","duration":"8 to 15 min","note":"Short modules."}
    if any(w in speed for w in ["fast","quick","rapid"]):
        return {"count":"10 to 12","duration":"20 to 35 min","note":"Dense modules."}
    if any(w in speed for w in ["slow","relaxed","steady"]):
        return {"count":"12 to 15","duration":"8 to 15 min","note":"Mastery first."}
    return {"count":"10 to 12","duration":"12 to 20 min","note":"Balanced depth."}

def get_quiz_frequency(mood, difficulty):
    mood = mood.lower()
    if mood in ["energetic","motivated","bored","curious"]: return "Quiz every 2 modules."
    if mood in ["anxious","sad","unmotivated"]:             return "Quiz every 4 modules. Keep gentle."
    if any(w in difficulty.lower() for w in ["advanced","expert"]): return "Quiz every 2 modules. Challenging."
    return "Quiz every 3 modules."

def get_mood_tone(mood):
    return {"anxious":"Warm, reassuring.","sad":"Gentle, supportive.",
            "energetic":"Bold, challenging.","bored":"Surprising angles.",
            "focused":"Zero fluff, dense.","calm":"Relaxed, substantive.",
            "motivated":"Ambitious, goal-connected.","creative":"Unconventional.",
            "unmotivated":"Effortless to start.","curious":"Feed curiosity deeply.",
            }.get(mood.lower(),"Clear, structured, professional.")

def get_difficulty_rules(d):
    d = d.lower()
    if any(w in d for w in ["beginner","easy","starter"]): return "Beginner. Start from zero."
    if any(w in d for w in ["advanced","expert","hard"]):  return "Advanced. Skip basics."
    return "Intermediate. Practical application."

def get_format_rules(fmt):
    if fmt=="videos":   return "80%+ modules type 'video'."
    if fmt=="articles": return "80%+ modules type 'article'."
    return "Mix video and article. Never same type 3x in a row."

# =============================================================================
# LOCAL FALLBACK GENERATOR
# ======================================def _local_generate(data: PathRequest) -> list:
    topic, goal = data.topic.strip(), data.goal.strip()
    mood, fmt   = data.mood.lower(), data.format
    speed       = data.speed.lower()
    difficulty  = data.suggestedDifficulty.lower()

    if mood in ["anxious","sad","unmotivated"]:              count,mn,mx,qe = 10,6,12,4
    elif any(w in speed for w in ["fast","quick","rapid"]): count,mn,mx,qe = 12,20,30,2
    elif any(w in speed for w in ["slow","relaxed"]):       count,mn,mx,qe = 15,8,15,3
    else:                                                   count,mn,mx,qe = 12,12,20,3
    if mood in ["energetic","bored","motivated"]: qe = 2

    def get_local_tone(m):
        return {"anxious":f"Don't worry — one step at a time.","sad":"You're doing great by showing up.",
                "energetic":"No hand-holding, just the good stuff.","bored":"Here's what most tutorials skip...",
                "focused":"Precise and dense.","calm":"Understanding beats speed.",
                "motivated":f"Directly unlocks: {goal}.","creative":"Unconventional angle.",
                "unmotivated":"Shortest explanation you'll find.","curious":"Why does this exist?",
                }.get(m, f"Key part of {topic}.")

    subtopics = [
        f"Foundations of {topic}",
        f"Core Principles of {topic}",
        f"Evolutionary Patterns in {topic}",
        f"Primary Methodologies of {topic}",
        f"Conceptual Frameworks for {topic}",
        f"Advanced Synthesis of {topic}",
        f"Practical Challenges in {topic}",
        f"Strategic Mastery of {topic}",
        f"Deep Dive: {topic} Dynamics",
        f"Applied Wisdom: {goal}",
        f"Synthesizing {topic} Skills",
        f"Expert Perspectives on {topic}",
        f"Mastery Roadmap: {topic}",
        f"Final Synthesis: {goal}"
    ][:count]

    def article_gen(sub):
        tone = get_local_tone(mood)
        level_desc = "conceptual deep-dive" if "advanced" in difficulty else "foundational guide"
        return (f"## {sub}\n\n"
                f"{tone}\n\n"
                f"### Introduction\n"
                f"Welcome to this {level_desc} on **{sub}**. This module is specifically designed to align with your current mood ({mood}) and your ultimate goal of **{goal}**. "
                f"Understanding the core mechanics of {sub} is not just about theory; it's about building the mental models required for mastery in {topic}.\n\n"
                f"### Deep Dive: {sub}\n"
                f"When exploring {sub}, we must consider how it bridges the gap between basic concepts and advanced application. "
                f"In the context of {topic}, {sub} acts as a critical pivot point. It involves a synthesis of previous principles with a forward-looking perspective on execution. "
                f"Many practitioners struggle with {sub} because they overlook the subtle interplay between its constituent parts. "
                f"By focusing on this relationship, you will unlock a deeper level of efficiency in your practice.\n\n"
                f"### Core Insight\n"
                f"The most important thing to remember about **{sub}** is that it is a dynamic process, not a static state. "
                f"Achieving **{goal}** depends on your ability to apply these insights consistently and adaptively.\n\n"
                f"### Key Takeaways\n"
                f"- **Mastery of Foundations**: Learn the fundamental relationship between {sub} and {topic}.\n"
                f"- **Strategic Application**: Apply this concept directly to your final goal: {goal}.\n"
                f"- **Cognitive Flexibility**: Develop the ability to shift perspectives based on the specific requirements of the task at hand.\n\n"
                f"### Practical Exercise\n"
                f"Spend the next 10 minutes observing how {sub} manifests in your current environment. "
                f"Reflect on how your understanding of {topic} has evolved through this exploration. "
                f"What is one concrete way you can integrate this insight into your routine today?\n")

    def quiz_gen(concepts):
        qs = []
        for i, c in enumerate(concepts[:3]):
            l = c.split(":")[0].strip()
            ans_idx = (i + 1) % 4
            opts = [
                f"It is a minor detail in {topic}",
                f"It provides a fundamental basis for {topic}",
                f"It is only for theoretical discussion",
                f"It is an outdated approach to {topic}"
            ]
            correct_text = f"It provides a fundamental basis for {topic}"
            if correct_text in opts: opts.remove(correct_text)
            opts.insert(ans_idx, correct_text)
            qs.append({
                "id": i + 1,
                "question": f"What is the primary role of {l} in the context of {topic}?",
                "options": opts,
                "correctAnswer": ans_idx,
                "explanation": f"{l} is essential for understanding the core principles of {topic}."
            })
        return qs

    modules, mid, buf, sq = [], 1, [], 0
    for i, sub in enumerate(subtopics):
        dur = random.randint(mn, mx)
        mtype = "video" if fmt == "videos" else "article" if fmt == "articles" else ("video" if i % 2 == 0 else "article")
        buf.append(sub); sq += 1
        q = f"{topic} {sub}"
        if mtype == "video":
            modules.append({"id":mid,"title":sub,"type":"video","duration":f"{dur} min","completed":False,
                            "searchQuery":q,"youtubeUrl":"https://www.youtube.com/results?search_query="+quote_plus(q)})
        else:
            modules.append({"id":mid,"title":sub,"type":"article","duration":f"{dur} min","completed":False,
                            "articleContent":article_gen(sub), "questions": quiz_gen([sub])})
        mid += 1
        if sq >= qe and i < len(subtopics) - 1:
            modules.append({"id":mid,"title":f"Checkpoint: {buf[-1]}",
                            "type":"quiz","duration":"8 min","completed":False,"questions":quiz_gen(buf)})
            mid += 1; sq = 0; buf = []
    modules.append({"id":mid,"title":f"Final Synthesis: {topic}","type":"quiz",
                    "duration":"12 min","completed":False,"questions":quiz_gen(subtopics[-4:])})
    return modules

# =============================================================================
# GEMINI ARTICLE GENERATOR
# =============================================================================
def _generate_article_content(topic, title, mood, difficulty):
    if not GENAI_CLIENT: return f"## {title}\n\nModule covering **{title}** in {topic}.\n"
    prompt = (f'Write a learning article for "{topic}", module: "{title}".\n'
              f'Tone: {get_mood_tone(mood)}\nDifficulty: {get_difficulty_rules(difficulty)}\n'
              f'300-500 words, Markdown with ##, **bold**, bullets. Use appropriate examples ONLY if highly relevant to the topic (e.g., equations for physics, quotes for philosophy).\n'
              f'Return ONLY: {{"content":"<markdown>"}}')
    for attempt in range(MAX_RETRIES):
        try:
            resp = GENAI_CLIENT.models.generate_content(
                model=BEST_MODEL, contents=prompt,
                config=genai_types.GenerateContentConfig(
                    temperature=0.7,max_output_tokens=4096,response_mime_type="application/json"))
            raw = re.sub(r"^```(?:json)?\s*|\s*```$","",resp.text.strip())
            return json.loads(raw).get("content", f"## {title}\n\nContent for {topic}.\n")
        except Exception as e:
            if attempt < MAX_RETRIES-1 and any(x in str(e).lower() for x in ["429","rate","quota"]):
                time.sleep(INITIAL_BACKOFF_TIME*(2**attempt)); continue
            break
    return f"## {title}\n\nModule covering **{title}** in {topic}.\n"

# =============================================================================
# GENERATE PATH
# =============================================================================
@app.post("/api/generate-path")
async def generate_path(data: PathRequest):
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
    prompt = (f"Expert curriculum designer. STUDENT: Topic={data.topic}, Goal={data.goal}, "
              f"Mood={data.mood}, Format={data.format}, Speed={data.speed}, Difficulty={data.suggestedDifficulty}\n"
              f"Generate {pacing['count']} modules. Duration: {pacing['duration']}. {pacing['note']}\n"
              f"Quiz: {get_quiz_frequency(data.mood,data.suggestedDifficulty)}\n"
              f"Tone: {get_mood_tone(data.mood)}\nDifficulty: {get_difficulty_rules(data.suggestedDifficulty)}\n"
              f"Format: {get_format_rules(data.format)}\n\n"
              f'Return JSON array. Each item:\n'
              f'VIDEO:   {{"id":int,"title":str,"type":"video","duration":str,"completed":false,"searchQuery":str}}\n'
              f'ARTICLE: {{"id":int,"title":str,"type":"article","duration":str,"completed":false}}\n'
              f'QUIZ:    {{"id":int,"title":str,"type":"quiz","duration":str,"completed":false,"questions":[...]}}\n'
              f'Goal: "{data.goal}". Return ONLY raw JSON array.')

    for attempt in range(1, MAX_RETRIES+1):
        if attempt > 1: time.sleep(2**(attempt-1))
        try:
            resp  = GENAI_CLIENT.models.generate_content(
                model=BEST_MODEL, contents=prompt,
                config=genai_types.GenerateContentConfig(
                    temperature=0.7,max_output_tokens=8192,response_mime_type="application/json"))
            text  = resp.text.strip()
            s,e   = text.find("["), text.rfind("]")
            raw   = text[s:e+1] if s!=-1 and e!=-1 else re.sub(r"^```(?:json)?\s*|\s*```$","",text)
            mods  = json.loads(raw)
            if not isinstance(mods,list) or not mods: raise ValueError("Empty")

            for i,m in enumerate(mods):
                m["id"]=i+1; m["completed"]=False
                if m.get("type")=="video":
                    m.pop("articleContent",None); m.pop("questions",None)
                    if "searchQuery" in m and "youtubeUrl" not in m:
                        m["youtubeUrl"]="https://www.youtube.com/results?search_query="+quote_plus(m["searchQuery"])
                elif m.get("type")=="article":
                    m.pop("searchQuery",None); m.pop("youtubeUrl",None); m.pop("questions",None)
                elif m.get("type")=="quiz":
                    m.pop("searchQuery",None); m.pop("youtubeUrl",None); m.pop("articleContent",None)
                    if not m.get("questions"): m["questions"]=[]

            for m in [x for x in mods if x.get("type")=="article"]:
                m["articleContent"] = _generate_article_content(
                    data.topic, m["title"], data.mood, data.suggestedDifficulty)

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
        with open(cache_file,"w") as f: json.dump(modules,f)
    except Exception as e: print(f"Cache error: {e}")

if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=False, timeout_keep_alive=300)
