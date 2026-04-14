import os
import google.genai as genai
from dotenv import load_dotenv

load_dotenv()
api_key = os.environ.get("GEMINI_API_KEY")
client = genai.Client(api_key=api_key)

models = list(client.models.list())
for m in models:
    if 'flash' in m.name:
        print(m.name, getattr(m, 'supported_generation_methods', []))
