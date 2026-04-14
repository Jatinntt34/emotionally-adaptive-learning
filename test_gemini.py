from google import genai as g
from google.genai import types as t
import os, json, re
from dotenv import load_dotenv

load_dotenv()
client = g.Client(api_key=os.environ.get('GEMINI_API_KEY'))

prompt = """You are a curriculum expert. Generate a learning path for Python for a focused learner.
OUTPUT REQUIREMENTS:
Generate a JSON array of 4 modules. Each module must match this schema:
{"id": <number>, "title": <string>, "type": <"video"|"article"|"quiz">, "duration": <string>, "completed": false, "searchQuery": <string, only if video>}
Respond with ONLY the raw JSON array. No markdown fences. No explanation."""

r = client.models.generate_content(
    model='models/gemini-2.5-flash',
    contents=prompt,
    config=t.GenerateContentConfig(temperature=0.7, max_output_tokens=2000)
)

print("STATUS: Success")
raw = r.text.strip()
print("FIRST 200 CHARS:", repr(raw[:200]))
raw = re.sub(r'^```(?:json)?\s*', '', raw)
raw = re.sub(r'\s*```$', '', raw)
try:
    modules = json.loads(raw)
    print("JSON PARSE: OK, got", len(modules), "modules")
    print("Module 1:", modules[0])
except Exception as e:
    print("JSON PARSE FAILED:", e)
    print("FULL RAW:", raw[:500])
