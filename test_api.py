import requests, time

print("Testing learning path generation with batch article approach...")
print("This may take 30-60 seconds...\n")

start = time.time()
r = requests.post('http://localhost:8000/api/generate-path', json={
    'topic': 'Python',
    'goal': 'Learn basics',
    'mood': 'focused',
    'format': 'mixed',
    'speed': 'moderate',
    'suggestedDifficulty': 'beginner'
}, timeout=300)
elapsed = time.time() - start
d = r.json()

print(f"Status: {d['status']}")
print(f"Time: {elapsed:.1f}s")

mods = d.get('modules', [])
print(f"Total Modules: {len(mods)}\n")

articles = [m for m in mods if m['type'] == 'article']
videos = [m for m in mods if m['type'] == 'video']
quizzes = [m for m in mods if m['type'] == 'quiz']
print(f"Videos: {len(videos)}, Articles: {len(articles)}, Quizzes: {len(quizzes)}\n")

# Check each article
fallback_count = 0
real_count = 0
for m in articles:
    content = m.get('articleContent', '')
    is_fallback = 'Keep practising' in content or 'Master these concepts' in content
    if is_fallback:
        fallback_count += 1
        tag = "FALLBACK"
    else:
        real_count += 1
        tag = "REAL"
    print(f"  [{tag}] Module {m['id']}: {m['title'][:50]} ({len(content)} chars)")
    if not is_fallback:
        print(f"           Preview: {content[:120]}...")

print(f"\n{'='*60}")
print(f"REAL articles: {real_count}/{len(articles)}")
print(f"FALLBACK articles: {fallback_count}/{len(articles)}")
if fallback_count == 0:
    print("ALL ARTICLES ARE REAL CONTENT!")
