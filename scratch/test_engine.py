import asyncio
import sys
import os
import json
import urllib.parse as _uparse
import urllib.request

# Add current directory to path so we can import api.py
sys.path.append(os.getcwd())

from api import generate_path, PathRequest, youtube_search

async def test_engine():
    print("--- 1. Testing Path Generation for 'Deep Meditation' ---")
    req = PathRequest(
        topic="Deep Meditation",
        goal="Reduce stress and achieve inner peace",
        mood="anxious",
        format="mixed",
        speed="slow",
        suggestedDifficulty="beginner"
    )
    
    try:
        # We need to mock some environment variables if they are missing
        if not os.environ.get("GEMINI_API_KEY"):
            print("WARNING: GEMINI_API_KEY not found. Testing local fallback logic.")
            
        result = await generate_path(req)
        print(f"Status: {result.get('status')}")
        print(f"Source: {result.get('source')}")
        modules = result.get('modules', [])
        
        # Check for coding keywords
        coding_keywords = ["setup", "environment", "program", "syntax", "code", "python", "developer"]
        bias_found = False
        for mod in modules:
            title = mod['title'].lower()
            for kw in coding_keywords:
                if kw in title:
                    print(f"!!! BIAS DETECTED in module: {mod['title']}")
                    bias_found = True
        
        if not bias_found:
            print("SUCCESS: No coding bias found in curriculum.")
        
        print(f"Sample Module: {modules[0]['title']}")
        
    except Exception as e:
        print(f"Path Gen FAILED: {e}")

    print("\n--- 2. Testing YouTube Search (Shorts Exclusion) ---")
    try:
        yt_result = await youtube_search("Deep Meditation Techniques")
        if "error" in yt_result:
            print(f"YouTube Search Error: {yt_result['error']}")
        else:
            print(f"Title: {yt_result['title']}")
            print(f"Duration: {yt_result['duration']}")
            # Basic check: Shorts are usually < 1:00. 
            parts = yt_result['duration'].split(':')
            if len(parts) == 2:
                mins = int(parts[0])
                if mins < 1:
                    print("!!! WARNING: Result might be a short!")
                else:
                    print(f"SUCCESS: Long-form video found ({yt_result['duration']})")
            else:
                print(f"SUCCESS: Long-form video found ({yt_result['duration']})")
                
    except Exception as e:
        print(f"YouTube Search FAILED: {e}")

if __name__ == "__main__":
    asyncio.run(test_engine())
