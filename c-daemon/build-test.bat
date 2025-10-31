@echo off
REM Test build script - compiles without SQLite for testing

echo Test Build (No SQLite dependency)...

REM Create directories
if not exist "obj" mkdir obj
if not exist "bin" mkdir bin

REM Check for compiler
where gcc >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: GCC not found. Please install MinGW-w64 or use Visual Studio.
    echo Download from: https://www.mingw-w64.org/downloads/
    pause
    exit /b 1
)

echo Compiling source files...

REM Compile with minimal dependencies
gcc -Wall -Wextra -std=c99 -Iinclude -DTEST_BUILD -c src/main.c -o obj/main.o
if %errorlevel% neq 0 (
    echo Compilation of main.c failed!
    pause
    exit /b 1
)

gcc -Wall -Wextra -std=c99 -Iinclude -DTEST_BUILD -c src/semaphore.c -o obj/semaphore.o
if %errorlevel% neq 0 (
    echo Compilation of semaphore.c failed!
    pause
    exit /b 1
)

echo Linking executable...
gcc obj/main.o obj/semaphore.o -o bin/chat_daemon_test.exe -lws2_32
if %errorlevel% neq 0 (
    echo Linking failed!
    pause
    exit /b 1
)

echo.
echo Test build complete: bin/chat_daemon_test.exe
echo This version has database functionality disabled for testing.
echo.
pause