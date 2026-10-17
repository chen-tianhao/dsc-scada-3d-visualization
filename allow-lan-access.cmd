@echo off
REM ===================================================================
REM  allow-lan-access.cmd
REM  Allow inbound TCP 8080 through Windows Firewall (LAN access).
REM  *** Must be run as Administrator: right-click -> Run as administrator ***
REM  Content intentionally ASCII-only to avoid console codepage issues.
REM ===================================================================
chcp 65001 >nul 2>&1

net user >nul 2>&1
net session >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Not running as Administrator.
  echo         Right-click this file and choose "Run as administrator".
  echo.
  pause
  exit /b 1
)

set RULE=DSC_SCADA_Screen_8080
set PORT=8080

echo Removing any pre-existing rule "%RULE%" ...
netsh advfirewall firewall delete rule name="%RULE%" >nul 2>&1

echo Adding inbound allow rule: TCP %PORT% on all profiles ...
netsh advfirewall firewall add rule name="%RULE%" dir=in action=allow protocol=TCP localport=%PORT% profile=any remoteip=any
if errorlevel 1 (
  echo.
  echo [FAILED] Could not create the firewall rule.
  pause
  exit /b 1
)

echo.
echo [OK] Inbound TCP %PORT% is now allowed on all network profiles.
echo.
echo Current rule:
netsh advfirewall firewall show rule name="%RULE%"
echo.
echo To remove this rule later, run in an Administrator prompt:
echo   netsh advfirewall firewall delete rule name="%RULE%"
echo.
pause
