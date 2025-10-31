@echo off
REM Binary Semaphore Chat System Setup Script for Windows

echo Setting up Binary Semaphore Chat System...

REM Create directories
echo Creating directories...
if not exist "c-daemon\obj" mkdir "c-daemon\obj"
if not exist "c-daemon\bin" mkdir "c-daemon\bin"

REM Install Node.js dependencies
echo Installing Node.js dependencies...
cd node-api
call npm install
cd ..

echo Setup complete!
echo Next steps:
echo 1. Install C dependencies (SQLite3, cJSON)
echo 2. Build C daemon: cd c-daemon && make
echo 3. Start API server: cd node-api && npm start