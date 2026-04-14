import asyncio
import json
from api import generate_path, PathRequest

async def test():
    req = PathRequest(
        topic="Ancient Roman Engineering",
        goal="Understand aqueducts",
        mood="curious",
        format="mixed",
        speed="steady",
        suggestedDifficulty="beginner"
    )
    try:
        print("Starting generation for Ancient Roman Engineering...")
        result = await generate_path(req)
        print(f"Status: {result.get('status')}")
        print(f"Source: {result.get('source')}")
        print(f"Modules: {len(result.get('modules', []))}")
    except Exception as e:
        print(f"FAILED: {e}")

if __name__ == "__main__":
    asyncio.run(test())
