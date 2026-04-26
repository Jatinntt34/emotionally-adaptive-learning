# AFFEX — Complete Launch Plan

> Emotionally Adaptive Learning Platform  
> 4th Year Project — Jatin Tiwari  
> Plan Created: April 26, 2026

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Hosting & Deployment Strategy](#3-hosting--deployment-strategy)
4. [Security Audit Findings](#4-security-audit-findings)
5. [Implementation Plan — All Code Changes](#5-implementation-plan--all-code-changes)
6. [Deployment Steps (Step-by-Step)](#6-deployment-steps-step-by-step)
7. [Cross-Platform Optimization](#7-cross-platform-optimization)
8. [Credentials & API Keys Reference](#8-credentials--api-keys-reference)
9. [Verification Checklist](#9-verification-checklist)
10. [Timeline](#10-timeline)

---

## 1. Project Overview

### What is AFFEX?

An AI-powered learning platform that detects your emotions in real-time (via camera and microphone) and adapts learning content to match your current mood. Built as a 4th year engineering project.

### Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite | User interface |
| Styling | TailwindCSS + GSAP + Framer Motion | Premium animations & design |
| Backend | Python FastAPI + WebSockets | API server + real-time streaming |
| Facial AI | PyTorch EfficientNetB2 (34MB) | Detect emotions from camera frames |
| Voice AI | HuggingFace wav2vec2 (378MB) | Detect emotions from voice audio |
| Database | MongoDB (via motor async driver) | Users, learning paths, progress |
| Content AI | Google Gemini API | Generate personalized learning content |
| Auth | JWT + bcrypt | Secure user authentication |

### Key Features

- Real-time facial emotion detection via webcam
- Real-time voice emotion detection via microphone
- AI-generated learning paths tailored to your mood
- Module completion tracking and progress visualization
- Mood-adaptive UI (colors, animations change with detected emotion)
- YouTube video integration for learning content

---

## 2. Architecture Diagram

### Production Architecture (All Free, All Permanent)

```
┌─────────────────────────────────────────────────────┐
│  USER'S DEVICE (Phone / Tablet / Laptop)            │
│  Browser: Camera + Microphone → sends frames/audio  │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS / WSS
                       ▼
┌─────────────────────────────────────────────────────┐
│  VERCEL (Free Static Hosting)                        │
│  ┌─────────────────────────────────────────────┐    │
│  │  React Frontend Build (HTML/CSS/JS)          │    │
│  │  URL: https://affex-frontend.vercel.app      │    │
│  │                                               │    │
│  │  • Landing page with GSAP scroll animations  │    │
│  │  • Auth page (login / signup)                │    │
│  │  • Learning path creator & viewer            │    │
│  │  • Progress dashboard                        │    │
│  │  • NeuralDock emotion display                │    │
│  └─────────────────────────────────────────────┘    │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS REST + WSS WebSocket
                       ▼
┌─────────────────────────────────────────────────────┐
│  HUGGING FACE SPACES (Free ML Hosting)               │
│  Docker Container — 16GB RAM, 2 vCPU                 │
│  ┌─────────────────────────────────────────────┐    │
│  │  FastAPI Backend (api.py)                    │    │
│  │                                               │    │
│  │  REST Endpoints:                              │    │
│  │  • POST /api/auth/signup                     │    │
│  │  • POST /api/auth/login                      │    │
│  │  • GET  /api/auth/me                         │    │
│  │  • POST /api/paths                           │    │
│  │  • GET  /api/paths                           │    │
│  │  • POST /api/generate-path                   │    │
│  │  • GET  /api/youtube-search                  │    │
│  │  • GET  /api/health                          │    │
│  │                                               │    │
│  │  WebSocket Endpoints:                         │    │
│  │  • /ws/emotion — facial emotion streaming    │    │
│  │  • /ws/voice  — voice emotion streaming      │    │
│  │                                               │    │
│  │  ML Models:                                   │    │
│  │  • EfficientNetB2 (facial_emotion_v3.pth)    │    │
│  │  • wav2vec2 (model.safetensors)              │    │
│  │                                               │    │
│  │  URL: https://ichimarugin2-affex-api.hf.space│    │
│  └─────────────────────────────────────────────┘    │
└──────────────────────┬──────────────────────────────┘
                       │ MongoDB Driver (TLS)
                       ▼
┌─────────────────────────────────────────────────────┐
│  MONGODB ATLAS (Free Cloud Database)                 │
│  M0 Sandbox — 512MB — Mumbai Region                  │
│  ┌─────────────────────────────────────────────┐    │
│  │  Database: affex_db                          │    │
│  │  • users      — accounts + hashed passwords │    │
│  │  • paths      — learning paths + modules    │    │
│  │  • emotions   — emotion history logs        │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘

External APIs:
  • Google Gemini (free) — content generation
  • YouTube Data API (free) — video search
```

### Local Development Architecture

```
┌──────────────────────────────┐
│  Terminal 1: npm run dev     │ ← React dev server (port 8080)
│  Vite proxy: /api/* → :8000 │
│  Vite proxy: /ws/*  → :8000 │
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│  Terminal 2: python api.py   │ ← FastAPI backend (port 8000)
│  Loads models into memory    │
│  Connects to MongoDB         │
└──────────────────────────────┘
```

---

## 3. Hosting & Deployment Strategy

### Why These Platforms?

| Platform | Why Chosen | Limitation |
|---|---|---|
| **Hugging Face Spaces** | Only free platform with 16GB RAM — enough for PyTorch + TensorFlow + 378MB voice model | Sleeps after 48hrs idle (30s cold start) |
| **Vercel** | Best free static hosting, instant deploys from GitHub, automatic HTTPS | Frontend only (no backend) |
| **MongoDB Atlas** | Free 512MB cloud database, managed, no maintenance | 512MB storage limit (plenty for demo) |

### Cost Breakdown

| Service | Monthly Cost |
|---|---|
| Hugging Face Spaces (Docker, CPU) | **$0** |
| Vercel (Hobby plan) | **$0** |
| MongoDB Atlas (M0 Sandbox) | **$0** |
| Google Gemini API (free tier) | **$0** |
| YouTube Data API (free tier) | **$0** |
| **Total** | **$0/month** |

### Platform Limitations & Mitigations

| Limitation | Impact | Mitigation |
|---|---|---|
| HF Space sleeps after 48h | First visitor waits 30s | Add a loading screen that says "Waking up AI models..." |
| No GPU on free HF tier | ML inference slower (~500ms vs ~50ms) | Acceptable for demo — still real-time enough |
| Atlas 512MB storage | Limited user data | More than enough for a demo with <100 users |
| Vercel serverless limit | No backend logic on Vercel | Backend is on HF Spaces — Vercel only serves static files |

---

## 4. Security Audit Findings

### Audit Summary

| Severity | Count | Status |
|---|---|---|
| 🔴 Critical | 3 | Will fix |
| 🟠 High | 4 | Will fix |
| 🟡 Medium | 3 | Will fix where practical |
| 🟢 Low | 2 | Acceptable for demo |

### Detailed Findings

#### 🔴 CRITICAL

| # | Issue | File | Line | Risk |
|---|---|---|---|---|
| 1 | CORS allows all origins (`*`) | `api.py` | 127 | Any website can call your API |
| 2 | WebSocket URLs hardcoded to `127.0.0.1` | `NeuralContext.tsx` | 105, 196 | Camera/voice dead for all non-localhost users |
| 3 | Weak MongoDB password (redacted; rotate before launch) | `.env` | 3 | Full database access if URI leaks |

#### 🟠 HIGH

| # | Issue | File | Line | Risk |
|---|---|---|---|---|
| 4 | JWT has unsafe default fallback | `api.py` | 153 | Token forgery if .env missing |
| 5 | No rate limiting on login/signup | `api.py` | 446, 456 | Brute-force attacks |
| 6 | WebSockets have no authentication | `api.py` | 468, 510 | Resource abuse |
| 7 | Health endpoint leaks system info | `api.py` | 135-147 | Internal state exposure |

#### 🟡 MEDIUM

| # | Issue | File | Risk |
|---|---|---|---|
| 8 | JWT tokens valid for 7 days | `api.py` line 155 | Stolen tokens last too long |
| 9 | fetch() uses relative URLs | `AuthContext.tsx`, etc. | Breaks in production |
| 10 | No XSS sanitization on topic input | `api.py` content gen | Potential script injection |

#### 🟢 LOW (Acceptable)

| # | Issue | Note |
|---|---|---|
| 11 | No CSRF protection | Not needed for JWT-based APIs |
| 12 | Verbose error logging | Fine for demo, disable for production |

### What's Already Secure ✅

- ✅ Passwords hashed with bcrypt (industry standard)
- ✅ JWT authentication on protected routes
- ✅ Pydantic input validation on all request models
- ✅ `.env` file is in `.gitignore` and was never committed to git
- ✅ No API keys exposed in frontend code
- ✅ MongoDB connection uses TLS (Atlas enforces it)

---

## 5. Implementation Plan — All Code Changes

### Phase 1: Security Fixes

#### 1.1 Remove JWT Default Fallback
**File:** `api.py` line 153
```python
# BEFORE:
JWT_SECRET = os.environ.get("JWT_SECRET", "dev_secret_change_in_prod")

# AFTER:
JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("FATAL: JWT_SECRET not set. Add it to .env")
```

#### 1.2 Lock CORS
**File:** `api.py` lines 127-128
```python
# BEFORE:
app.add_middleware(CORSMiddleware, allow_origins=["*"], ...)

# AFTER:
ALLOWED_ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:8080,http://localhost:5173"
).split(",")
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, ...)
```

#### 1.3 Add Rate Limiting
**File:** `api.py` — add before auth routes
```python
from collections import defaultdict
import time as _time

_login_attempts = defaultdict(list)

def _check_rate_limit(ip: str, max_attempts: int = 5, window: int = 60):
    now = _time.time()
    _login_attempts[ip] = [t for t in _login_attempts[ip] if now - t < window]
    if len(_login_attempts[ip]) >= max_attempts:
        raise HTTPException(429, "Too many attempts. Wait 60 seconds.")
    _login_attempts[ip].append(now)
```
Add `_check_rate_limit(request.client.host)` to `signup()` and `login()`.

#### 1.4 Protect Open Endpoints
Add `current_user: dict = Depends(get_current_user)` to:
- `/api/generate-path`
- `/api/youtube-search`
- `/api/suggest-next-topics`

#### 1.5 Reduce Health Info
```python
@app.get("/health")
@app.get("/api/health")
async def health_check():
    try:
        await db_client.admin.command("ping")
        return {"status": "healthy"}
    except Exception:
        return {"status": "degraded"}
```

---

### Phase 2: Dynamic API URLs

#### 2.1 Create Config File
**File:** `src/config.ts` — **NEW**
```typescript
const RAW_API_URL = import.meta.env.VITE_API_URL || '';

export const API_BASE = RAW_API_URL;

export const WS_BASE = RAW_API_URL
  ? RAW_API_URL.replace('https://', 'wss://').replace('http://', 'ws://')
  : `ws://${window.location.hostname}:8000`;
```

#### 2.2 Update WebSocket Connections
**Files to change:**
| File | Line | Before | After |
|---|---|---|---|
| `NeuralContext.tsx` | 105 | `ws://127.0.0.1:8000/ws/emotion` | `` `${WS_BASE}/ws/emotion` `` |
| `NeuralContext.tsx` | 196 | `ws://127.0.0.1:8000/ws/voice` | `` `${WS_BASE}/ws/voice` `` |
| `CameraCapture.tsx` | 88 | `ws://127.0.0.1:8000/ws/emotion` | `` `${WS_BASE}/ws/emotion` `` |
| `CameraCapture.tsx` | 160 | `ws://127.0.0.1:8000/ws/voice` | `` `${WS_BASE}/ws/voice` `` |

#### 2.3 Update All fetch() Calls
**Files to change:**
| File | Lines | Change |
|---|---|---|
| `AuthContext.tsx` | 33, 54, 72 | Prefix all `/api/auth/*` with `API_BASE` |
| `ProgressContext.tsx` | 156, 208, 248, 273 | Prefix all `/api/paths*` with `API_BASE` |
| `LearningPathView.tsx` | 427, 451, 585 | Prefix all `/api/*` with `API_BASE` |

---

### Phase 3: Backend Production Prep

#### 3.1 Dynamic Port
**File:** `api.py` last line
```python
port = int(os.environ.get("PORT", 8000))
uvicorn.run("api:app", host="0.0.0.0", port=port, reload=False, timeout_keep_alive=300)
```

#### 3.2 Dockerfile for HF Spaces
**File:** `Dockerfile` — **NEW** in project root
```dockerfile
FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx libglib2.0-0 libsm6 libxrender1 libxext6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY api.py model_arch.py ./
COPY models/ models/

ENV PORT=7860
EXPOSE 7860
CMD ["python", "api.py"]
```

#### 3.3 HF Spaces Metadata
**File:** `README.md` for the HF Space
```yaml
---
title: AFFEX Backend
emoji: 🧠
colorFrom: purple
colorTo: orange
sdk: docker
app_port: 7860
---
```

---

## 6. Deployment Steps (Step-by-Step)

### Step 1: MongoDB Atlas

1. Go to https://cloud.mongodb.com → Create free account
2. **Create Cluster** → M0 Free → Region: Mumbai
3. **Database Access** → Add User → Username: `affex_prod` → Auto-generate password → **COPY IT**
4. **Network Access** → Add IP → `0.0.0.0/0`
5. **Connect** → Drivers → Copy connection string
6. Update `.env`:
   ```
   MONGODB_URI=mongodb+srv://affex_prod:GENERATED_PASSWORD@cluster0.xxxxx.mongodb.net/affex_db
   ```

### Step 2: Hugging Face Spaces

1. Go to https://huggingface.co → Log in as `ichimaruGin2`
2. **New Space** → Name: `affex-api` → SDK: **Docker** → Public
3. Clone: `git clone https://huggingface.co/spaces/ichimaruGin2/affex-api`
4. Copy files into it:
   ```
   api.py
   model_arch.py
   requirements.txt
   Dockerfile
   models/facial_emotion_v3.pth
   models/facial_config.json
   models/voice_model/config.json
   models/voice_model/model.safetensors
   models/voice_model/preprocessor_config.json
   ```
5. Set up Git LFS for large files:
   ```bash
   git lfs install
   git lfs track "*.pth" "*.safetensors" "*.h5"
   git add .gitattributes
   ```
6. Push:
   ```bash
   git add . && git commit -m "Deploy" && git push
   ```
7. Wait 5-10 min → URL: `https://ichimarugin2-affex-api.hf.space`

### Step 3: Vercel Frontend

1. Create GitHub repo: `Jatinntt34/affex-frontend`
2. Push `emotionally-adaptive-learning-main/` contents to it
3. Go to https://vercel.com → Import from GitHub → Select repo
4. Settings: Framework **Vite**, Build `npm run build`, Output `dist`
5. Environment variable: `VITE_API_URL` = `https://ichimarugin2-affex-api.hf.space`
6. Deploy → URL: `https://affex-frontend.vercel.app`

### Step 4: Connect Everything

1. Set these as Hugging Face Space secrets, not as a committed `.env` file:
   ```
   ALLOWED_ORIGINS=https://affex-frontend.vercel.app,http://localhost:8080
   ```
2. Redeploy HF Space (push again)
3. Test end-to-end: open Vercel URL → login → camera → voice → learning path

---

## 7. Cross-Platform Optimization

### Device Compatibility Matrix

| Feature | Desktop Chrome | Desktop Firefox | Mobile Chrome | Mobile Safari | Tablet |
|---|---|---|---|---|---|
| Landing page | ✅ | ✅ | ✅ | ✅ | ✅ |
| GSAP scroll animations | ✅ | ✅ | ⚠️ Needs touch-action | ⚠️ Needs touch-action | ✅ |
| Camera emotion | ✅ | ✅ | ✅ (HTTPS only) | ✅ (HTTPS only) | ✅ |
| Voice emotion | ✅ | ✅ | ✅ (tap to start) | ⚠️ Limited | ✅ |
| Learning path | ✅ | ✅ | ✅ | ✅ | ✅ |
| NeuralDock | ✅ | ✅ | ⚠️ May overlap | ⚠️ May overlap | ✅ |

### Required CSS Fix for Touch Devices
```css
/* Add to index.css */
* {
  touch-action: pan-y;
  -webkit-tap-highlight-color: transparent;
}
```

### Mobile-Specific Notes
- Camera requires **HTTPS** — both Vercel and HF Spaces provide this automatically
- Voice recording needs a **user tap** to start (browser security policy)
- `position: fixed` elements (NeuralDock) behave differently on iOS Safari
- NeuralDock should hide or minimize on screens narrower than 768px

---

## 8. Credentials & API Keys Reference

### Credential Rotation Checklist (CHANGE BEFORE LAUNCH)

Do not store real credential values in this document, GitHub, Hugging Face source files, Docker images, screenshots, or chat. Keep them only in local `.env` for development and in platform secret managers for deployment.

| Credential | Current Local Status | Security Risk | Where to Change |
|---|---|---|---|
| **Gemini API Key** | Present in local `.env` only; rotate because it appeared in this draft | Medium — quota/cost abuse | https://aistudio.google.com/apikey |
| **YouTube API Key** | Present in local `.env` only; rotate because it appeared in this draft | Medium — quota abuse | https://console.cloud.google.com → APIs → Credentials |
| **MongoDB Password** | Present in local `.env`; rotate before launch | 🔴 HIGH — database access if leaked | https://cloud.mongodb.com → Database Access → Edit User |
| **JWT Secret** | Present in local `.env`; regenerate before launch if shared anywhere | Session/token forgery if leaked | Generate a new 64+ char random secret locally |

### After Changing Credentials

Update local `.env` only, and set the same values in deployment secret managers:
```env
GEMINI_API_KEY=your_new_gemini_key
YOUTUBE_API_KEY=your_new_youtube_key
MONGODB_URI=mongodb+srv://affex_prod:NEW_STRONG_PASSWORD@cluster.mongodb.net/affex_db
JWT_SECRET=your_new_64_char_hex_string
ALLOWED_ORIGINS=https://affex-frontend.vercel.app,http://localhost:8080
```

> ⚠️ After changing JWT_SECRET, all existing login sessions become invalid. Users must log in again. Do this BEFORE the demo, not during.

> ⚠️ After changing MongoDB password, update the URI in .env IMMEDIATELY or the backend will crash.

---

## 9. Verification Checklist

### Pre-Launch Tests

| # | Test | How to Verify | Expected Result |
|---|---|---|---|
| 1 | Backend starts | `python api.py` | No crash, prints "Gemini ready", "Facial model loaded" |
| 2 | Frontend builds | `npm run build` | No errors, creates `dist/` folder |
| 3 | Signup works | Create new account | Returns token, redirects to dashboard |
| 4 | Login works | Log in with created account | Returns token, shows user info |
| 5 | Camera emotion | Allow camera → show face | Emotion changes (not stuck on neutral) |
| 6 | Voice emotion | Allow microphone → speak | Voice emotion detected |
| 7 | Generate path | Search topic → generate | Modules appear with content |
| 8 | Scroll animations | Scroll landing page | Sections fade/slide into view |
| 9 | No " />" suffix | Check all buttons | Clean text, no stray characters |
| 10 | Rate limiting | Wrong password 6 times | "Too many attempts" error on 6th |
| 11 | CORS blocking | From random site, fetch your API | Blocked by CORS |
| 12 | Mobile camera | Open on phone via HTTPS URL | Camera permission prompt works |
| 13 | Mobile scroll | Scroll landing on phone | Smooth, no stuck sections |
| 14 | Tablet layout | Open on tablet | No overlapping elements |

### Post-Deploy Smoke Test

1. Open `https://affex-frontend.vercel.app` on laptop
2. Open same URL on phone
3. Create account on laptop
4. Log in on phone with same account
5. Generate a learning path on both devices
6. Verify camera works on both
7. Complete a module and check progress syncs

---

## 10. Timeline

### Day 1 (April 26 — Today)

| Time | Task | Duration |
|---|---|---|
| Hour 1 | Security fixes in `api.py` (CORS, JWT, rate limit, endpoint auth) | 45 min |
| Hour 2 | Create `src/config.ts` + update all WebSocket/fetch URLs | 30 min |
| Hour 2 | Backend prod prep (Dockerfile, dynamic port) | 20 min |
| Hour 3 | MongoDB Atlas setup (free cluster, new password) | 30 min |
| Hour 3 | Deploy backend to HF Spaces | 45 min |
| Hour 4 | Deploy frontend to Vercel | 30 min |
| Hour 4 | Connect everything + initial testing | 30 min |

### Day 2 (April 27 — Launch Day)

| Time | Task | Duration |
|---|---|---|
| Hour 1 | Fix any issues from Day 1 testing | 1 hr |
| Hour 2 | Cross-platform testing (phone + tablet) | 30 min |
| Hour 2 | Final credential rotation | 15 min |
| Hour 2 | Full verification checklist run-through | 30 min |
| — | **🚀 LAUNCH** | — |

**Total work: ~6-7 hours across 2 days**

---

## Appendix: File Change Summary

| File | Action | What Changes |
|---|---|---|
| `api.py` | MODIFY | CORS lock, JWT hardening, rate limit, endpoint auth, health reduction, dynamic port |
| `src/config.ts` | NEW | Central API/WS URL configuration |
| `src/contexts/NeuralContext.tsx` | MODIFY | WebSocket URLs use config |
| `src/components/CameraCapture.tsx` | MODIFY | WebSocket URLs use config |
| `src/contexts/AuthContext.tsx` | MODIFY | fetch() URLs use config |
| `src/contexts/ProgressContext.tsx` | MODIFY | fetch() URLs use config |
| `src/components/LearningPathView.tsx` | MODIFY | fetch() URLs use config |
| `src/index.css` | MODIFY | Add touch-action for mobile |
| `Dockerfile` | NEW | HF Spaces container definition |
| `README.md` (HF Space) | NEW | HF Spaces metadata |
| `.env` | MODIFY LOCALLY ONLY | New MongoDB URI, updated ALLOWED_ORIGINS; never commit or copy into Docker |

---

*This document is the single source of truth for the AFFEX launch. No other plans or documents are needed.*
