import os
from dotenv import load_dotenv
from google import genai

load_dotenv()
api_key = os.environ.get("GEMINI_API_KEY")
client = genai.Client(api_key=api_key)

models_to_test = [
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "models/gemini-2.0-flash",
    "models/gemini-1.5-flash",
    "gemini-flash-latest",
    "models/gemini-flash-latest"
]

for m in models_to_test:
    try:
        print(f"Testing model: {m}...", end=" ", flush=True)
        r = client.models.generate_content(model=m, contents="Say 'Yes'")
        print(f"SUCCESS: {r.text.strip()}")
    except Exception as e:
        print(f"FAILED: {str(e)[:100]}")
