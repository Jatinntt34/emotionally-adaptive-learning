import requests
import json
import time

print("="*60)
print("Testing Full Learning Path + Lazy Loading Articles E2E flow")
print("="*60)

# STEP 1: Generate Path
start = time.time()
print("\n[1] Creating learning path (Structure only)...")
path_response = requests.post('http://localhost:8000/api/generate-path', json={
    'topic': 'Machine Learning',
    'goal': 'Learn Neural Networks',
    'mood': 'focused',
    'format': 'mixed',
    'speed': 'moderate',
    'suggestedDifficulty': 'beginner'
}, timeout=60)

if path_response.status_code != 200:
    print(f"❌ Failed to generate path: {path_response.status_code}")
    exit(1)

path_data = path_response.json()
modules = path_data.get('modules', [])

print(f"✅ Path generated in {time.time() - start:.1f}s")
print(f"📊 Total Modules: {len(modules)}")

article_modules = [m for m in modules if m['type'] == 'article']
print(f"📄 Found {len(article_modules)} Article Modules to test lazy-loading")

# STEP 2: Test lazy-loading an article
if article_modules:
    test_article = article_modules[0]
    print(f"\n[2] Testing Lazy-Load for article: '{test_article['title']}'...")
    
    art_start = time.time()
    art_response = requests.post('http://localhost:8000/api/generate-article', json={
        'topic': 'Machine Learning',
        'title': test_article['title'],
        'mood': 'focused',
        'difficulty': 'beginner'
    }, timeout=30)
    
    if art_response.status_code == 200:
        art_data = art_response.json()
        content = art_data.get('content', '')
        
        is_fallback = 'Keep practising and move' in content or 'fallback' in content.lower()
        if not is_fallback and len(content) > 100:
            print(f"✅ Successfully fetched real article content! ({time.time() - art_start:.1f}s)")
            print(f"📝 Length: {len(content)} characters")
            print("\nPreview of actual AI-generated content:")
            print("-" * 40)
            print(content[:300] + "...\n")
            print("-" * 40)
            print("\nSUCCESS! The backend properly delegates article generation dynamically to avoid the Gemini API Rate Limiting!")
        else:
            print(f"❌ Received fallback content: {content[:100]}")
    else:
        print(f"❌ Failed to fetch article: {art_response.status_code}")
else:
    print("❌ No article modules were in the generated path!")
