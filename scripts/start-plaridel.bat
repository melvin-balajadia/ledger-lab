@echo off
title Plaridel Costing Dashboard

rem Must run with server/ as the working directory -- dotenv (in server/index.js)
rem loads .env relative to the process's cwd, not the script's location. Running
rem from anywhere else (e.g. the repo root) silently boots with no DB password,
rem no port, no session secret.
cd /d "%~dp0..\server"

echo Checking database...
sc query MySQL80 | find "RUNNING" >nul 2>&1
if errorlevel 1 (
  echo Starting MySQL...
  net start MySQL80 >nul 2>&1
  if errorlevel 1 (
    echo.
    echo Could not start MySQL. Please contact IT.
    echo.
    timeout /t 4 /nobreak >nul
    exit /b 1
  )
)

echo Starting dashboard...
rem Opens the browser a couple seconds after the server starts listening below,
rem instead of immediately -- opening it right away can hit the port before
rem Express is up and show "can't reach this page" on first load.
start "" /min cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:4000"

echo.
echo ============================================
echo   Plaridel Costing Dashboard is starting.
echo   The dashboard will open in your browser
echo   in a few seconds.
echo.
echo   KEEP THIS WINDOW OPEN while you work.
echo   Close it when you are finished.
echo ============================================
echo.
node index.js
rem If node exits (crash, or she closed it), show the window for a few
rem seconds so any error is readable, then close on its own -- no keypress.
timeout /t 8 /nobreak >nul
