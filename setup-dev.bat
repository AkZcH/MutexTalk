@echo off
REM Development setup script for Binary Semaphore Chat System

echo Setting up Binary Semaphore Chat System for development...

REM Create necessary directories
echo Creating directory structure...
if not exist "data" mkdir data
if not exist "logs" mkdir logs
if not exist "c-daemon\obj" mkdir c-daemon\obj
if not exist "c-daemon\bin" mkdir c-daemon\bin
if not exist "node-api\middleware" mkdir node-api\middleware

REM Setup Node.js dependencies
echo Installing Node.js dependencies...
cd node-api
call npm install
if %errorlevel% neq 0 (
    echo Failed to install Node.js dependencies!
    pause
    exit /b 1
)
cd ..

REM Check C compilation environment
echo Checking C compilation environment...
gcc --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Warning: GCC not found. Install MinGW-w64 or Visual Studio.
    echo Download from: https://www.mingw-w64.org/
)

echo.
echo Development setup complete!
echo.
echo Next steps:
echo 1. Install SQLite3 and cJSON libraries (consider using vcpkg)
echo 2. Build C daemon: cd c-daemon && build.bat
echo 3. Start API server: cd node-api && npm run dev
echo.
pause