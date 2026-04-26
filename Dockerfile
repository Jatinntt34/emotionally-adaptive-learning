FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libsm6 libxrender1 libxext6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Use lean production requirements (no training libs)
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY api.py model_arch.py ./
COPY models/facial_config.json models/facial_emotion_v3.pth ./models/
COPY models/voice_model/config.json models/voice_model/model.safetensors models/voice_model/preprocessor_config.json ./models/voice_model/

# .env is NOT copied — secrets are set via HF Spaces secrets manager
# Required secrets: MONGODB_URI, JWT_SECRET, GEMINI_API_KEY, YOUTUBE_API_KEY, ALLOWED_ORIGINS

ENV PORT=7860
EXPOSE 7860

CMD ["python", "api.py"]
