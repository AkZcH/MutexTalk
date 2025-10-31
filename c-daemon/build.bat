@echo off
REM Build script for Binary Semaphore Chat Daemon on Windows

echo Building Binary Semaphore Chat Daemon...

REM Create directories if they don't exist
if not exist "obj" mkdir obj
if not exist "bin" mkdir bin
if not exist "..\data" mkdir "..\data"
if not exist "..\logs" mkdir "..\logs"

REM Check for required libraries
echo Checking for required dependencies...
echo Note: Ensure SQLite3 and cJSON libraries are available
echo Consider using vcpkg: vcpkg install sqlite3 cjson

REM Compile source files
echo Compiling source files...
gcc -Wall -Wextra -std=c99 -Iinclude -c src/main.c -o obj/main.o
if %errorlevel% neq 0 (
    echo Compilation of main.c failed!
    pause
    exit /b 1
)

gcc -Wall -Wextra -std=c99 -Iinclude -c src/semaphore.c -o obj/semaphore.o
if %errorlevel% neq 0 (
    echo Compilation of semaphore.c failed!
    pause
    exit /b 1
)

gcc -Wall -Wextra -std=c99 -Iinclude -c src/db.c -o obj/db.o
if %errorlevel% neq 0 (
    echo Compilation of db.c failed!
    pause
    exit /b 1
)

gcc -Wall -Wextra -std=c99 -Iinclude -c src/logger.c -o obj/logger.o
if %errorlevel% neq 0 (
    echo Compilation of logger.c failed!
    pause
    exit /b 1
)

gcc -Wall -Wextra -std=c99 -Iinclude -c src/handlers.c -o obj/handlers.o
if %errorlevel% neq 0 (
    echo Compilation of handlers.c failed!
    pause
    exit /b 1
)

REM Link the executable
echo Linking executable...
gcc obj/main.o obj/semaphore.o obj/db.o obj/logger.o obj/handlers.o -o bin/chat_daemon.exe -lws2_32 -lsqlite3 -lcjson
if %errorlevel% neq 0 (
    echo Linking failed! Make sure SQLite3 and cJSON libraries are installed.
    echo Try: vcpkg install sqlite3 cjson
    pause
    exit /b 1
)

echo Build complete. Executable: bin/chat_daemon.exe
echo Run 'bin/chat_daemon.exe' to start the daemon
pause