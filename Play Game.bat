@echo off
setlocal EnableExtensions
title Dead Acre
cd /d "%~dp0"

echo.
echo   =============================================
echo     DEAD ACRE
echo   =============================================
echo.

if not exist "package.json" goto :not_extracted

where node >nul 2>nul
if errorlevel 1 goto :no_node

node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=12)||(a===20&&b>=19)?0:1)"
if errorlevel 1 goto :old_node

rem Only run setup the first time, or when the game's building blocks change.
set "STAMP=node_modules\.dead-acre-installed"
set "NEEDS_SETUP=0"
if not exist "%STAMP%" set "NEEDS_SETUP=1"
if "%NEEDS_SETUP%"=="0" (
  fc /b "package-lock.json" "%STAMP%" >nul 2>nul
  if errorlevel 1 set "NEEDS_SETUP=1"
)
if "%NEEDS_SETUP%"=="0" goto :start_game

echo   First-time setup: downloading the game's building blocks.
echo   This needs the internet and takes a minute or two. Please wait...
echo.
call npm ci --no-audit --no-fund
if errorlevel 1 goto :setup_failed
copy /y "package-lock.json" "%STAMP%" >nul
echo.
echo   Setup finished.
echo.

:start_game
echo   Starting the game - your web browser will open in a moment.
echo.
echo   KEEP THIS WINDOW OPEN while you play. Closing it stops the game.
echo   To quit: close the browser tab, then close this window.
echo.
call npm run start
echo.
echo   The game has stopped.
echo   If you saw red error text above, copy it and send it to Claude.
echo.
pause
exit /b 0

:not_extracted
echo   I can't find the game files next to this launcher.
echo.
echo   If you downloaded a ZIP file: right-click it, choose "Extract All...",
echo   open the extracted folder, and double-click "Play Game.bat" in there.
echo.
pause
exit /b 1

:no_node
echo   Node.js is not installed. The game needs it to run - it is free and safe.
echo.
echo   How to fix it:
echo     1. Your browser is opening the Node.js website now.
echo     2. Download the version marked "LTS" for Windows - the .msi installer.
echo     3. Run the installer. Click "Next" on every screen and keep the
echo        default options. If it offers "Tools for Native Modules",
echo        leave that box UNTICKED - the game does not need it.
echo     4. When it has finished, double-click "Play Game.bat" again.
echo.
echo   Still says Node.js is missing after installing? Restart your computer
echo   and try once more.
echo.
start "" "https://nodejs.org/en/download"
pause
exit /b 1

:old_node
for /f "delims=" %%v in ('node -v') do set "NODE_VERSION=%%v"
echo   Your Node.js is too old. You have %NODE_VERSION% - the game needs 20.19 or newer.
echo.
echo   How to fix it:
echo     1. Your browser is opening the Node.js website now.
echo     2. Download the version marked "LTS" for Windows - the .msi installer.
echo     3. Run it. It replaces your old version. Keep the default options.
echo     4. Double-click "Play Game.bat" again.
echo.
start "" "https://nodejs.org/en/download"
pause
exit /b 1

:setup_failed
echo.
echo   Setup did not finish. Things to try:
echo     - Check your internet connection.
echo     - Close any other "Dead Acre" windows, then try again.
echo     - Still stuck? Copy the text in this window and send it to Claude.
echo.
pause
exit /b 1
