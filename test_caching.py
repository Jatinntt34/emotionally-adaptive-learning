import requests
import json
import time

URL = "http://localhost:8000/api/generate-path"
PAYLOAD = {
    "topic": "Python for Data Science",
    "goal": "Build a simple classifier",
    "mood": "energetic",
    "format": "mixed",
    "speed": "normal",
    "suggestedDifficulty": "beginner"
}

def test_cache():
    print("--- First Call (Gemini Generation) ---")
    start = time.time()
    r1 = requests.post(URL, json=PAYLOAD)
    print(f"Status: {r1.status_code}")
    print(f"Time taken: {time.time() - start:.2f}s")
    if r1.status_code == 200:
        print(f"Modules: {len(r1.json().get('modules', []))}")
        print(f"Cached marker: {r1.json().get('cached', False)}")

    print("\n--- Second Call (Should be Cached) ---")
    start = time.time()
    r2 = requests.post(URL, json=PAYLOAD)
    print(f"Status: {r2.status_code}")
    print(f"Time taken: {time.time() - start:.2f}s")
    if r2.status_code == 200:
        print(f"Cached marker: {r2.json().get('cached', False)}")

if __name__ == "__main__":
    test_cache()
