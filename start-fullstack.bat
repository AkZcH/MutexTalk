@echo off
REM Full Stack Startup Script for Binary Semaphore Chat System (Windows)

echo 🚀 Starting Binary Semaphore Chat System Full Stack
echo ==================================================

REM Check for required commands
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo ❌ Node.js not found. Please install Node.js
    pause
    exit /b 1
)

where npm >nul 2>&1
if %errorLevel% neq 0 (
    echo ❌ npm not found. Please install Node.js with npm
    pause
    exit /b 1
)

where gcc >nul 2>&1
if %errorLevel% neq 0 (
    echo ❌ GCC not found. Please install MinGW-w64 or Visual Studio Build Tools
    pause
    exit /b 1
)

echo ✅ All prerequisites found

REM Setup backend dependencies if needed
if not exist "node-api\node_modules" (
    echo 📦 Installing backend dependencies...
    cd node-api
    call npm install
    cd ..
)

REM Setup frontend dependencies if needed
if not exist "frontend\node_modules" (
    echo 📦 Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
)

REM Build C daemon if needed
if not exist "c-daemon\bin\chat_daemon.exe" (
    echo 🔧 Building C daemon...
    cd c-daemon
    call build.bat
    if %errorLevel% neq 0 (
        echo ❌ C daemon build failed
        cd ..
        pause
        exit /b 1
    )
    cd ..
)

REM Create directories
if not exist "data" mkdir data
if not exist "logs" mkdir logs

REM Initialize databases if needed
if not exist "data\chat.db" (
    echo 📊 Initializing databases...
    echo CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL); | sqlite3 data\chat.db
    echo CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, action TEXT NOT NULL, user TEXT, content TEXT, semaphore_value INTEGER NOT NULL); | sqlite3 data\logs.db
)

echo ✅ Setup complete
echo.

REM Create batch files to start services
echo 🔧 Starting C daemon...
echo @echo off > start_daemon_temp.bat
echo cd c-daemon >> start_daemon_temp.bat
echo bin\chat_daemon.exe >> start_daemon_temp.bat
start /B cmd /c start_daemon_temp.bat

REM Wait for daemon to start
timeout /t 3 /nobreak >nul

echo 🌐 Starting API server...
echo @echo off > start_api_temp.bat
echo cd node-api >> start_api_temp.bat
echo npm start >> start_api_temp.bat
start /B cmd /c start_api_temp.bat

REM Wait for API to start
echo ⏳ Waiting for API server to start...
timeout /t 10 /nobreak >nul

echo 🎨 Starting frontend...
echo @echo off > start_frontend_temp.bat
echo cd frontend >> start_frontend_temp.bat
echo npm run dev >> start_frontend_temp.bat
start /B cmd /c start_frontend_temp.bat

REM Wait for frontend to start
echo ⏳ Waiting for frontend to start...
timeout /t 10 /nobreak >nul

echo.
echo 🎉 Binary Semaphore Chat System is now running!
echo.
echo 📱 Frontend:  http://localhost:5173
echo 🌐 API:       http://localhost:3000
echo 🔍 Health:    http://localhost:3000/health
echo.
echo 📝 To stop services:
echo    - Close this window or press Ctrl+C
echo    - Or manually close the service windows
echo.

REM Keep window open
echo Press any key to open the application in your browser...
pause >nul

REM Open browser
start http://localhost:5173

echo.
echo Services are running in background windows.
echo Close this window when you're done to stop all services.
echo.
pause

REM Cleanup temp files
del start_daemon_temp.bat 2>nul
del start_api_temp.bat 2>nul
del start_frontend_temp.bat 2>nul