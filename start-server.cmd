@echo off
REM ===================================================================
REM  start-server.cmd  -  Start the DCS/SCADA screen web service.
REM  No Administrator rights required (unless you pick port 80).
REM  Keep this window open; closing it stops the service.
REM  Usage:  start-server.cmd [port]        (default 8080)
REM  Content intentionally ASCII-only to avoid console codepage issues.
REM ===================================================================
chcp 65001 >nul 2>&1
cd /d "%~dp0"

set PORT=%1
if "%PORT%"=="" set PORT=8080

REM --- locate node.exe -------------------------------------------------
set NODE_EXE=
if exist "%~dp0node.exe" set NODE_EXE=%~dp0node.exe
if not defined NODE_EXE (
  if exist "C:\Users\admin\.workbuddy\binaries\node\versions\22.22.2-6\node.exe" (
    set NODE_EXE=C:\Users\admin\.workbuddy\binaries\node\versions\22.22.2-6\node.exe
  )
)
if not defined NODE_EXE (
  for /f "delims=" %%i in ('where node 2^>nul') do if not defined NODE_EXE set NODE_EXE=%%i
)
if not defined NODE_EXE (
  echo [ERROR] node.exe not found. Please install Node.js 18+ first.
  echo         https://nodejs.org/
  pause
  exit /b 1
)

echo Using node: %NODE_EXE%
echo.
"%NODE_EXE%" server.js %PORT%

echo.
echo [STOPPED] The service has exited.
pause
