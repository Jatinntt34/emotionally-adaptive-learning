import os
import sys
from dotenv import load_dotenv

# 1. Check if the library is installed with the correct import path for google-genai
try:
    from google import genai
except ImportError:
    print("❌ ERROR: The 'google-genai' library is not recognized.")
    print(f"Please run this command: {sys.executable} -m pip install google-genai python-dotenv")
    sys.exit(1)

# 2. Force reload environment variables
load_dotenv(override=True)

API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    print("ERROR: GEMINI_API_KEY is not set in .env or environment variables.")
    sys.exit(1)

print(f"--- DEBUGGING CONNECTION (NEW SDK) ---")
print(f"Python Path: {sys.executable}")
print(f"Using API Key: {API_KEY[:15]}...")

try:
    # Initialize the client
    client = genai.Client(api_key=API_KEY)
    
    # Updated list based on your successful 'list_models' output
    # These are the models your environment specifically supports
    models_to_test = [
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-flash-latest',
        'gemini-1.5-flash'
    ]
    
    success = False
    for model_name in models_to_test:
        try:
            print(f"Testing {model_name}...")
            # Note: We use the simple name, the SDK handles the 'models/' prefix
            response = client.models.generate_content(
                model=model_name, 
                contents="Verify connection: Respond with 'CONNECTED'."
            )
            print("-" * 30)
            print(f"✅ SUCCESS with {model_name}!")
            print(f"Response: {response.text}")
            print("-" * 30)
            success = True
            break # Stop if we found a working model
        except Exception as inner_e:
            print(f"  - {model_name} failed: {str(inner_e)[:100]}...")

    if not success:
        print("\n❌ ALL TESTED MODELS FAILED.")
        print("Checking which models ARE available for your key...")
        available_models = list(client.models.list())
        if available_models:
            print("Your key supports these models:")
            for m in available_models:
                print(f"  - {m.name}")
        else:
            print("No models found. Your API key might be inactive or restricted.")
    
except Exception as e:
    print("-" * 30)
    print("❌ CRITICAL SDK ERROR")
    print(f"Error Message: {str(e)}")
    print("-" * 30)
