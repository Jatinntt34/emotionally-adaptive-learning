@echo off
echo ====================================================
echo   Starting Emotionally Adaptive Learning System
echo ====================================================
echo.

echo [1/2] Starting Python Backend Server...
start "Emotion Backend API" cmd /k "python api.py"

echo [2/2] Starting React Frontend...
cd emotionally-adaptive-learning-main
start "Emotion Frontend UI" cmd /k "npm run dev"

echo.
echo Both services are starting up in separate windows! 
echo You can safely close THIS window, but leave the two new black windows open.
echo.
pause
