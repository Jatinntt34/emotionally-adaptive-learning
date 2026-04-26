# Agent Task: Implement the LLM-Powered Learning Path Generator (Free — Gemini API)

## Your Role
You are an expert full-stack developer. Your job is to implement a dynamic,
LLM-powered Learning Path Generator into an existing Emotionally Adaptive
Learning Platform using Google's FREE Gemini API.
Read every section carefully before touching any file.

---

## STEP 0 — Human: Get Your Free Gemini API Key (Do This First)

> This step is for the human running this agent, not the agent itself.
> Complete this before running the agent.

1. Go to: https://aistudio.google.com
2. Sign in with any Google account
3. Click "Get API Key" in the top left
4. Click "Create API key"
5. Copy the key — it looks like: AIzaSy...
6. No credit card required. No expiry. Completely free.
7. Add it to your project's .env file like this:
      GEMINI_API_KEY=AIzaSy_your_key_here
8. Or export it in your terminal:
      export GEMINI_API_KEY=AIzaSy_your_key_here

Once done, run the agent.

---
Do not paste the real API key into this file. Store it only in `.env` locally or in deployment secrets.

## Project Structure You Need to Know

```
/api.py                                        ← FastAPI backend (EDIT THIS)
/realtime_emotion_detector.py                  ← leave untouched
/models/emotion_model_saved/                   ← leave untouched
/.env                                          ← add GEMINI_API_KEY here
/emotionally-adaptive-learning-main/
  src/
    components/
      LearningPathView.tsx                     ← Frontend component (EDIT THIS)
    contexts/
      MoodContext.tsx                          ← leave untouched
    pages/                                     ← leave untouched
```

---

## What Already Exists (Do Not Break)

1. `/api.py` runs a FastAPI server with a WebSocket at `/ws/emotion`.
   - It receives base64 webcam frames, runs them through a Keras model,
     and returns: `{"status": "success", "emotion": "happy", "confidence": 98.5}`
   - Do NOT touch the WebSocket handler or any existing routes.

2. `MoodContext.tsx` maps raw emotions into 10 nuanced mood states:
   `energetic, calm, focused, creative, motivated, sad, anxious, bored, unmotivated, curious`

3. `LearningPathView.tsx` has a hardcoded function `generateModules(topic, format)`
   that produces fake, generic modules. You are replacing this with a real API call.

---

## TASK 1 — Edit `/api.py`

### Step 1: Install the Gemini package
Run this in the project environment before anything else:
```bash
pip install google-generativeai python-dotenv
```

### Step 2: Add these imports at the top of api.py (if not already present)
```python
import os
import json
import re
from pydantic import BaseModel
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.environ["GEMINI_API_KEY"])
```

### Step 3: Add the request schema class
```python
class PathRequest(BaseModel):
    topic: str
    goal: str
    mood: str
    format: str           # 'videos' | 'articles' | 'mixed'
    speed: str
    suggestedDifficulty: str
```

### Step 4: Add the mood instruction helper function
```python
def get_mood_instructions(mood: str) -> str:
    instructions = {
        "anxious": (
            "Generate 4 short, bite-sized modules (5-8 min each). "
            "Use warm, encouraging language in every title. "
            "Avoid jargon-heavy or overwhelming content. "
            "Build confidence step-by-step — easy wins first."
        ),
        "sad": (
            "Generate 4 gentle, supportive modules (5-10 min each). "
            "Titles should feel warm and achievable, never intimidating. "
            "Include a short motivating intro in every article. "
            "Keep quizzes light — 3 questions max."
        ),
        "energetic": (
            "Generate 6 challenging, fast-paced modules (20-30 min each). "
            "Push depth and complexity. Include frequent quizzes (every 2 modules). "
            "Use dynamic, high-energy language. Don't hold back on difficulty."
        ),
        "bored": (
            "Generate 5 highly engaging modules with unexpected angles. "
            "Vary the format aggressively — no two consecutive modules the same type. "
            "Use provocative, curiosity-triggering titles. "
            "Include at least 2 quizzes with challenging questions."
        ),
        "focused": (
            "Generate 5 deep, thorough modules (15-20 min each). "
            "Logical, systematic progression. Detailed article content. "
            "Precise, professional language. No filler — every sentence earns its place."
        ),
        "calm": (
            "Generate 5 steady, well-structured modules (12-15 min each). "
            "Clear, measured progression. Balanced mix of theory and application. "
            "Relaxed but substantive tone."
        ),
        "motivated": (
            "Generate 6 ambitious modules (15-25 min each). "
            "Include stretch goals and bonus depth sections in articles. "
            "Energetic, forward-momentum language. Mix all format types."
        ),
        "creative": (
            "Generate 5 modules exploring unconventional angles of the topic. "
            "Encourage lateral thinking. Include open-ended quiz questions. "
            "Article content should explore 'what if' scenarios and creative applications."
        ),
        "unmotivated": (
            "Generate 4 short modules (5-10 min) starting extremely easy to build momentum. "
            "Titles must feel low-pressure and achievable. "
            "Quick quizzes (2-3 questions) for immediate dopamine hits. "
            "First module must be framed as a 5-minute win."
        ),
        "curious": (
            "Generate 5 deep-dive modules (15-20 min). "
            "Go beyond surface-level — explore the 'why' and 'how' behind everything. "
            "Include rabbit-hole tangents in articles. "
            "Thought-provoking quiz questions that make the student think, not just recall."
        ),
    }
    return instructions.get(
        mood,
        "Generate 5 balanced, well-structured modules with clear progression. "
        "Mix formats. 12-15 min average duration."
    )
```

### Step 5: Add the format instruction helper function
```python
def get_format_instruction(format_pref: str) -> str:
    if format_pref == "videos":
        return (
            "Use 'video' type for at least 80% of modules. "
            "Only include an article if strictly necessary."
        )
    elif format_pref == "articles":
        return (
            "Use 'article' type for at least 80% of modules. "
            "Only include a video if it adds something the article cannot."
        )
    else:
        return (
            "Mix 'video', 'article', and 'quiz' types evenly across modules. "
            "Do not repeat the same type more than twice in a row."
        )
```

### Step 6: Add the new POST endpoint to the existing FastAPI app object
```python
@app.post("/api/generate-path")
async def generate_path(data: PathRequest):
    mood_instructions = get_mood_instructions(data.mood)
    format_instruction = get_format_instruction(data.format)

    prompt = f"""You are an expert curriculum designer creating a personalized learning path.

STUDENT PROFILE:
- Topic: {data.topic}
- Goal: {data.goal}
- Current Emotional State: {data.mood}
- Format Preference: {data.format}
- Learning Speed: {data.speed}
- Difficulty Level: {data.suggestedDifficulty}

MOOD-ADAPTIVE INSTRUCTIONS (follow these strictly):
{mood_instructions}

FORMAT INSTRUCTIONS (follow these strictly):
{format_instruction}

OUTPUT REQUIREMENTS:
Generate a JSON array of learning modules. Each module must match this exact schema:

{{
  "id": <number, sequential starting from 1>,
  "title": <string, specific engaging title about {data.topic}>,
  "type": <"video" | "article" | "quiz">,
  "duration": <string, e.g. "12 min">,
  "completed": false,
  "searchQuery": <string, ONLY if type is "video" — a precise YouTube search query>,
  "articleContent": <string, ONLY if type is "article" — full Markdown content, minimum 400 words>
}}

STRICT RULES:
1. "video" modules: include "searchQuery" only. No "articleContent".
2. "article" modules: include "articleContent" only. No "searchQuery".
   Write real, factually accurate Markdown using ##, **bold**, bullet lists, code blocks if relevant.
   Minimum 400 words. This is actual content the student reads — make it good.
3. "quiz" modules: no searchQuery, no articleContent. Just id/title/type/duration/completed.
4. Every title must be specific to "{data.topic}" — never generic like "Introduction to Topic".
5. The full curriculum must logically progress toward this goal: "{data.goal}".
6. All content must be factually accurate. Do not hallucinate libraries, APIs, or concepts.

Respond with ONLY the raw JSON array. No markdown fences. No explanation. No wrapper object."""

    gemini = genai.GenerativeModel("gemini-1.5-flash")

    response = gemini.generate_content(
        prompt,
        generation_config=genai.types.GenerationConfig(
            temperature=0.7,
            max_output_tokens=5000,
        ),
    )

    raw = response.text.strip()

    # Strip accidental markdown code fences if Gemini adds them
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    modules = json.loads(raw)

    # Enforce schema correctness
    for i, module in enumerate(modules):
        module["id"] = i + 1
        module["completed"] = False
        if module.get("type") != "video":
            module.pop("searchQuery", None)
        if module.get("type") != "article":
            module.pop("articleContent", None)

    return {"modules": modules}
```

### Step 7: Verify CORS middleware exists in api.py
If this block is NOT already present, add it immediately after `app = FastAPI()`:
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## TASK 2 — Edit `LearningPathView.tsx`

Location: `/emotionally-adaptive-learning-main/src/components/LearningPathView.tsx`

### Step 1: Delete generateModules()
Find and completely delete the `generateModules()` function and every call to it.

### Step 2: Add state variables inside the component
```tsx
const [modules, setModules] = useState<LearningModule[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
```

### Step 3: Add the fetch function inside the component
```tsx
async function fetchLearningPath() {
  setLoading(true);
  setError(null);
  setModules([]);

  try {
    const response = await fetch("/api/generate-path", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pathData),
    });

    if (!response.ok) throw new Error(`Server error: ${response.status}`);

    const data = await response.json();
    const fetched: LearningModule[] = data.modules;
    setModules(fetched);
    if (fetched.length > 0) setActiveModule(fetched[0]);
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : "Something went wrong generating your path."
    );
  } finally {
    setLoading(false);
  }
}
```

### Step 4: Add useEffect to call the fetch on mount
```tsx
useEffect(() => {
  fetchLearningPath();
}, []);
```

### Step 5: Add the loading message map
```tsx
const loadingMessages: Record<string, string> = {
  anxious:     "Taking it step by step, building your path gently...",
  sad:         "Crafting something warm and achievable just for you...",
  energetic:   "Assembling a high-octane curriculum — hold tight!",
  bored:       "Finding the most interesting angles on this topic...",
  focused:     "Structuring a deep, logical learning sequence...",
  calm:        "Building a steady, well-paced path for you...",
  motivated:   "Designing an ambitious curriculum to push you forward...",
  creative:    "Exploring unconventional angles on your topic...",
  unmotivated: "Starting with quick wins to get your momentum going...",
  curious:     "Diving deep — finding the fascinating why behind everything...",
};
const loadingMessage = loadingMessages[pathData.mood] ?? "Generating your personalised learning path...";
```

### Step 6: Add the loading UI — render when loading === true
```tsx
if (loading) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <p className="max-w-sm text-center text-lg opacity-80">{loadingMessage}</p>
      <div className="w-full max-w-xl space-y-4">
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            className="animate-pulse space-y-3 rounded-xl border border-current/10 p-5 opacity-60"
          >
            <div className="h-4 w-3/4 rounded bg-current/20" />
            <div className="h-3 w-1/4 rounded bg-current/10" />
            <div className="h-3 w-1/2 rounded bg-current/10" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Step 7: Add the error UI — render when error !== null
```tsx
if (error) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <p className="text-lg font-medium opacity-90">
        Couldn't generate your path right now.
      </p>
      <p className="max-w-sm text-sm opacity-60">{error}</p>
      <button
        onClick={fetchLearningPath}
        className="rounded-lg border border-current/30 px-6 py-2 text-sm transition hover:border-current/60"
      >
        Try again
      </button>
    </div>
  );
}
```

### Step 8: Keep everything else untouched
The module list rendering, active module viewer, completion tracking, and progress
bar all stay exactly as they were — they just now use the `modules` state array
populated by the API instead of the old hardcoded function.

---

## Validation Checklist

Before finishing, verify every item:

- [ ] `pip install google-generativeai python-dotenv` was run successfully
- [ ] `.env` file contains `GEMINI_API_KEY=your_key_here`
- [ ] `api.py` imports `google.generativeai`, `os`, `json`, `re`, `load_dotenv`
- [ ] `api.py` calls `load_dotenv()` and `genai.configure(api_key=...)` at the top
- [ ] `api.py` has `PathRequest` Pydantic model defined
- [ ] `api.py` has `POST /api/generate-path` registered on the `app` object
- [ ] `api.py` has CORS middleware enabled
- [ ] `LearningPathView.tsx` no longer contains `generateModules()`
- [ ] `LearningPathView.tsx` has `loading`, `error`, and `modules` state variables
- [ ] `LearningPathView.tsx` calls `fetchLearningPath()` inside `useEffect` on mount
- [ ] Loading skeleton renders while API call is in progress
- [ ] Error state renders with a retry button if the API call fails
- [ ] The `/ws/emotion` WebSocket in `api.py` is completely untouched
- [ ] `MoodContext.tsx` is completely untouched

---

## What Success Looks Like

When a user fills in /create-path and navigates to /learning-path:

1. A mood-aligned loading message + skeleton appears immediately
2. The FastAPI backend calls the FREE Gemini API with the student's full profile
3. Gemini returns a real JSON array of modules tailored to the student's emotional state
4. Modules populate the sidebar and the first one opens automatically
5. Video modules show a YouTube search link for the exact topic
6. Article modules show real Markdown content (400+ words, factually accurate)
7. Quiz modules show a placeholder with a complete button
8. Completing a module marks it done and auto-advances to the next one

---

## Cost Summary

This implementation uses Google Gemini 1.5 Flash which is:
- Completely FREE up to 15 requests per minute
- FREE up to 1 million tokens per day
- No credit card required
- No expiry on the free tier
