@echo off
echo 🚀 Starting Cement OCR System (LOCAL MODE)...

REM --- Start Redis in Docker ---
echo 🧱 Starting Redis (Docker)...
docker start b2b_redis >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Failed to start Redis container. Starting manually...
    docker run -d --name b2b_redis -p 6379:6379 redis
)

REM --- Flask Backend ---
echo 🟦 Starting Flask API at http://127.0.0.1:5000 ...
start cmd /k "cd python && python main.py"

REM --- Celery Worker ---
echo 🟩 Starting Celery Worker...
start cmd /k "cd python && celery -A celery_app worker --loglevel=INFO --pool=solo"


REM --- Next.js Frontend ---
echo 🟨 Starting Next.js UI at http://localhost:3000 ...
start cmd /k "cd web && npm run dev"

echo ✅ All services launched locally!
echo -----------------------------------------
echo Backend:   http://127.0.0.1:5000/api/health
echo Frontend:  http://localhost:3000
echo Redis:     Docker container b2b_redis
echo -----------------------------------------
pause
