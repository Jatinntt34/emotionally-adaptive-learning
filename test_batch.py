import os
import google.genai as genai
from google.genai import types as genai_types
from dotenv import load_dotenv

load_dotenv()
api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    print("NO API KEY")
    exit()

client = genai.Client(api_key=api_key)

try:
    titles_list = '1. "Introduction"\n2. "Syntax and Variables"'
    batch_prompt = f"""You are writing educational articles for a student.
Write a separate article for EACH of these module titles:
{titles_list}

For EACH article:
- Write 100 words of real educational content
- Use ## for section headings

Return a JSON object where each key is the exact module title and each value is the full markdown article content string.
"""
    response = client.models.generate_content(
        model="models/gemini-2.5-flash",
        contents=batch_prompt,
        config=genai_types.GenerateContentConfig(
            temperature=0.7,
            max_output_tokens=4096,
            response_mime_type="application/json",
        ),
    )
    print("Success:", response.text[:200])
except Exception as e:
    print("Error:", type(e).__name__, str(e))
