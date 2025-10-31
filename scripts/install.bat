@echo off
REM Binary Semaphore Chat System Installation Script for Windows

echo Binary Semaphore Chat System - Windows Installation
echo ===================================================

REM Check for administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script must be run as Administrator
    echo Right-click and select "Run as administrator"
    pause
    exit /b 1
)

echo Starting installation...

REM Create directories
echo Creating directories...
if not exist "c-daemon\obj" mkdir "c-daemon\obj"
if not exist "c-daemon\bin" mkdir "c-daemon\bin"
if not exist "data" mkdir "data"
if not exist "logs" mkdir "logs"

REM Check for required tools
echo Checking requirements...

where gcc >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: GCC compiler not found
    echo Please install MinGW-w64 or Visual Studio Build Tools
    pause
    exit /b 1
)

where node >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Node.js not found
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

where npm >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: npm not found
    echo Please install Node.js with npm
    pause
    exit /b 1
)

REM Build C daemon
echo Building C daemon...
cd c-daemon
call build.bat
if %errorLevel% neq 0 (
    echo ERROR: C daemon build failed
    cd ..
    pause
    exit /b 1
)
cd ..

REM Install Node.js dependencies
echo Installing Node.js dependencies...
cd node-api
call npm install
if %errorLevel% neq 0 (
    echo ERROR: Node.js dependencies installation failed
    cd ..
    pause
    exit /b 1
)
cd ..

REM Create configuration files
echo Creating configuration files...

REM Create .env file for Node.js API
echo NODE_ENV=development > node-api\.env
echo PORT=3000 >> node-api\.env
echo JWT_SECRET=your-secret-key-change-this >> node-api\.env
echo DAEMON_SOCKET_PATH=\\.\pipe\chat-daemon >> node-api\.env
echo LOG_LEVEL=info >> node-api\.env

REM Create daemon configuration
echo # Windows Daemon Configuration > config\daemon-windows.conf
echo socket_path=\\.\pipe\chat-daemon >> config\daemon-windows.conf
echo chat_db_path=data\chat.db >> config\daemon-windows.conf
echo logs_db_path=data\logs.db >> config\daemon-windows.conf
echo transaction_log_path=logs\transactions.log >> config\daemon-windows.conf
echo log_level=INFO >> config\daemon-windows.conf
echo max_connections=50 >> config\daemon-windows.conf

REM Initialize databases
echo Initializing databases...
if not exist "data\chat.db" (
    sqlite3 data\chat.db < scripts\init-chat-db.sql 2>nul || (
        echo Creating chat database schema...
        echo CREATE TABLE IF NOT EXISTS messages ( > temp_schema.sql
        echo     id INTEGER PRIMARY KEY AUTOINCREMENT, >> temp_schema.sql
        echo     username TEXT NOT NULL, >> temp_schema.sql
        echo     message TEXT NOT NULL CHECK(length(message) ^<= 2000^), >> temp_schema.sql
        echo     created_at TEXT NOT NULL >> temp_schema.sql
        echo ^); >> temp_schema.sql
        echo CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC^); >> temp_schema.sql
        echo CREATE INDEX IF NOT EXISTS idx_messages_username ON messages(username^); >> temp_schema.sql
        sqlite3 data\chat.db < temp_schema.sql
        del temp_schema.sql
    )
)

if not exist "data\logs.db" (
    echo Creating logs database schema...
    echo CREATE TABLE IF NOT EXISTS transactions ( > temp_logs_schema.sql
    echo     id INTEGER PRIMARY KEY AUTOINCREMENT, >> temp_logs_schema.sql
    echo     ts TEXT NOT NULL, >> temp_logs_schema.sql
    echo     action TEXT NOT NULL, >> temp_logs_schema.sql
    echo     user TEXT, >> temp_logs_schema.sql
    echo     content TEXT, >> temp_logs_schema.sql
    echo     semaphore_value INTEGER NOT NULL >> temp_logs_schema.sql
    echo ^); >> temp_logs_schema.sql
    echo CREATE INDEX IF NOT EXISTS idx_transactions_ts ON transactions(ts DESC^); >> temp_logs_schema.sql
    sqlite3 data\logs.db < temp_logs_schema.sql
    del temp_logs_schema.sql
)

REM Create startup scripts
echo Creating startup scripts...

echo @echo off > start-daemon.bat
echo echo Starting Chat Daemon... >> start-daemon.bat
echo cd c-daemon >> start-daemon.bat
echo bin\chat_daemon.exe >> start-daemon.bat

echo @echo off > start-api.bat
echo echo Starting Chat API... >> start-api.bat
echo cd node-api >> start-api.bat
echo npm start >> start-api.bat

echo @echo off > start-system.bat
echo echo Starting Binary Semaphore Chat System... >> start-system.bat
echo echo Starting daemon in background... >> start-system.bat
echo start /B cmd /c start-daemon.bat >> start-system.bat
echo timeout /t 3 /nobreak ^>nul >> start-system.bat
echo echo Starting API server... >> start-system.bat
echo call start-api.bat >> start-system.bat

echo Installation completed successfully!
echo.
echo Next steps:
echo 1. Review configuration files:
echo    - node-api\.env
echo    - config\daemon-windows.conf
echo.
echo 2. Start the system:
echo    - Run start-system.bat to start both services
echo    - Or start them separately:
echo      * start-daemon.bat (run first)
echo      * start-api.bat (run second)
echo.
echo 3. Test the installation:
echo    - Open browser to http://localhost:3000
echo    - Check logs in the logs\ directory
echo.
echo 4. For development:
echo    - Use setup-dev.bat for development setup
echo    - Modify configuration files as needed
echo.
pause