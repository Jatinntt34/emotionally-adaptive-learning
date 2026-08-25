 #  Emotionally Adaptive Learning System

An AI-driven platform that adapts its learning content based on the user's emotional state, detected via facial expressions and voice analysis.

## Project Structure

- `api.py`: The main backend server (FastAPI).
- `emotionally-adaptive-learning-main/`: The React/Vite frontend application.
- `models/`: (Ignored in Git) Pre-trained models for facial and voice emotion detection.
- `datasets/`: (Ignored in Git) Datasets used for training and validation.

## Setup Instructions

### Backend (Python)

1. **Create a virtual environment**:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and fill in your API keys:
   ```bash
   cp .env.example .env
   ```

4. **Run the Backend**:
   ```bash
   python api.py
   ```

### Frontend (React/Vite)

1. **Navigate to the frontend directory**:
   ```bash
   cd emotionally-adaptive-learning-main
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run the development server**:
   ```bash
   npm run dev
   ```

## Why are some files missing?

To keep the repository size manageable and for security reasons, the following are not included in this repository:
- **Datasets and Models**: These files are too large for GitHub. You must provide your own weights in the `models/` folder or download them from [Insert Link Here].
- **.env file**: Contains sensitive API keys. Use `.env.example` as a template.

## Troubleshooting

- **Missing Models**: If the backend fails to start because of missing `.h5` or `.keras` files, ensure you have placed the trained models in the `models/` directory.
- **API Errors**: Ensure your `GEMINI_API_KEY` is valid and has sufficient quota.




for direct link to the website - https://emotionally-adaptive-learning2.vercel.app/
