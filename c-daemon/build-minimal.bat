@echo off
REM Minimal build script for Binary Semaphore Chat Daemon on Windows
REM This version only requires a C compiler - no external libraries

echo Building Binary Semaphore Chat Daemon (Minimal Version)...

REM Create directories if they don't exist
if not exist "obj" mkdir obj
if not exist "bin" mkdir bin

REM Check for GCC first
where gcc >nul 2>&1
if %errorlevel% equ 0 (
    echo Using GCC compiler
    goto :use_gcc
)

REM Check for Visual Studio compiler
where cl >nul 2>&1
if %errorlevel% equ 0 (
    echo Using Microsoft Visual C++ Compiler
    goto :use_msvc
)

echo ERROR: No suitable C compiler found!
echo Please install one of the following:
echo 1. MinGW-w64 (includes gcc) - https://www.mingw-w64.org/downloads/
echo 2. Visual Studio with C++ support (includes cl.exe)
echo.
pause
exit /b 1

:use_gcc
echo Compiling with GCC...
gcc -Wall -Wextra -std=c99 -Iinclude -c src/main.c -o obj/main.o
if %errorlevel% neq 0 goto :compile_error

gcc -Wall -Wextra -std=c99 -Iinclude -c src/semaphore.c -o obj/semaphore.o
if %errorlevel% neq 0 goto :compile_error

gcc -Wall -Wextra -std=c99 -Iinclude -c src/db_simple.c -o obj/db_simple.o
if %errorlevel% neq 0 goto :compile_error

echo Linking with GCC...
gcc obj/main.o obj/semaphore.o obj/db_simple.o -o bin/chat_daemon.exe -lws2_32
if %errorlevel% neq 0 goto :link_error

goto :success

:use_msvc
echo Compiling with MSVC...
cl /nologo /W3 /Iinclude /c src/main.c /Fo:obj/main.obj
if %errorlevel% neq 0 goto :compile_error

cl /nologo /W3 /Iinclude /c src/semaphore.c /Fo:obj/semaphore.obj
if %errorlevel% neq 0 goto :compile_error

cl /nologo /W3 /Iinclude /c src/db_simple.c /Fo:obj/db_simple.obj
if %errorlevel% neq 0 goto :compile_error

echo Linking with MSVC...
link /nologo obj/main.obj obj/semaphore.obj obj/db_simple.obj /out:bin/chat_daemon.exe ws2_32.lib
if %errorlevel% neq 0 goto :link_error

goto :success

:compile_error
echo ERROR: Compilation failed!
echo Check the error messages above for details.
pause
exit /b 1

:link_error
echo ERROR: Linking failed!
echo Check the error messages above for details.
pause
exit /b 1

:success
echo.
echo ========================================
echo Build successful!
echo ========================================
echo Executable created: bin/chat_daemon.exe
echo.
echo To test the daemon:
echo 1. Run: bin\chat_daemon.exe
echo 2. Open browser to: http://127.0.0.1:8081/api/semaphore/status
echo 3. Use curl or Postman to test POST endpoints
echo.
echo Test commands:
echo   curl -X GET http://127.0.0.1:8081/api/semaphore/status
echo   curl -X POST http://127.0.0.1:8081/api/semaphore/acquire
echo   curl -X POST http://127.0.0.1:8081/api/semaphore/release
echo.
pause