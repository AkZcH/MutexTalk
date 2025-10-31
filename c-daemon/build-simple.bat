@echo off
REM Simple build script for Binary Semaphore Chat Daemon on Windows

echo Building Binary Semaphore Chat Daemon (Simple Version)...

REM Create directories if they don't exist
if not exist "obj" mkdir obj
if not exist "bin" mkdir bin
if not exist "..\data" mkdir "..\data"
if not exist "..\logs" mkdir "..\logs"

REM Try to detect available compiler
where cl >nul 2>&1
if %errorlevel% equ 0 (
    echo Using Microsoft Visual C++ Compiler (cl.exe)
    goto :use_msvc
)

where gcc >nul 2>&1
if %errorlevel% equ 0 (
    echo Using GCC compiler
    goto :use_gcc
)

echo ERROR: No suitable C compiler found!
echo Please install one of the following:
echo 1. Visual Studio with C++ support (includes cl.exe)
echo 2. MinGW-w64 (includes gcc)
echo 3. Clang/LLVM
echo.
echo For Visual Studio: https://visualstudio.microsoft.com/downloads/
echo For MinGW-w64: https://www.mingw-w64.org/downloads/
pause
exit /b 1

:use_msvc
echo Compiling with MSVC...
cl /nologo /W3 /Iinclude /c src/main.c /Fo:obj/main.obj
if %errorlevel% neq 0 goto :compile_error

cl /nologo /W3 /Iinclude /c src/semaphore.c /Fo:obj/semaphore.obj
if %errorlevel% neq 0 goto :compile_error

cl /nologo /W3 /Iinclude /c src/db.c /Fo:obj/db.obj
if %errorlevel% neq 0 goto :compile_error

cl /nologo /W3 /Iinclude /c src/logger.c /Fo:obj/logger.obj
if %errorlevel% neq 0 goto :compile_error

cl /nologo /W3 /Iinclude /c src/handlers.c /Fo:obj/handlers.obj
if %errorlevel% neq 0 goto :compile_error

echo Linking with MSVC...
link /nologo obj/main.obj obj/semaphore.obj obj/db.obj obj/logger.obj obj/handlers.obj /out:bin/chat_daemon.exe ws2_32.lib
if %errorlevel% neq 0 goto :link_error

goto :success

:use_gcc
echo Compiling with GCC...
gcc -Wall -Wextra -std=c99 -Iinclude -c src/main.c -o obj/main.o
if %errorlevel% neq 0 goto :compile_error

gcc -Wall -Wextra -std=c99 -Iinclude -c src/semaphore.c -o obj/semaphore.o
if %errorlevel% neq 0 goto :compile_error

gcc -Wall -Wextra -std=c99 -Iinclude -c src/db.c -o obj/db.o
if %errorlevel% neq 0 goto :compile_error

gcc -Wall -Wextra -std=c99 -Iinclude -c src/logger.c -o obj/logger.o
if %errorlevel% neq 0 goto :compile_error

gcc -Wall -Wextra -std=c99 -Iinclude -c src/handlers.c -o obj/handlers.o
if %errorlevel% neq 0 goto :compile_error

echo Linking with GCC...
gcc obj/main.o obj/semaphore.o obj/db.o obj/logger.o obj/handlers.o -o bin/chat_daemon.exe -lws2_32
if %errorlevel% neq 0 goto :link_error

goto :success

:compile_error
echo ERROR: Compilation failed!
echo Check the error messages above for details.
pause
exit /b 1

:link_error
echo ERROR: Linking failed!
echo Note: SQLite3 library is required but not linked in this simple build.
echo This build is for testing compilation only.
pause
exit /b 1

:success
echo.
echo Build successful!
echo Executable created: bin/chat_daemon.exe
echo.
echo Note: This is a minimal build without SQLite3 support.
echo For full functionality, you'll need to install SQLite3 development libraries.
echo.
pause