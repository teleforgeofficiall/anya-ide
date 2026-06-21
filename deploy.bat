@echo off
chcp 65001 >nul
title Anya IDE - Deploy Tool

echo ╔══════════════════════════════════════╗
echo ║       Anya IDE - Deploy Tool         ║
echo ╚══════════════════════════════════════╝
echo.
echo [1] Run Anya IDE directly (no install)
echo [2] Build new installer (NSIS setup)
echo [3] Build + Upload to GitHub Release
echo [4] Exit
echo.

set /p choice="Select (1-4): "

if "%choice%"=="1" goto run
if "%choice%"=="2" goto build
if "%choice%"=="3" goto release
if "%choice%"=="4" exit /b

:run
echo.
echo Starting Anya IDE...
call npm start
pause
exit /b

:build
echo.
echo Building NSIS installer...
call npx electron-builder --win nsis
echo.
echo Done! Installer at: release\Anya-IDE-Setup-1.0.0.exe
pause
exit /b

:release
echo.
echo Building NSIS installer...
call npx electron-builder --win nsis
echo.
echo Uploading to GitHub Release v1.0.0...
gh release upload v1.0.0 "release\Anya-IDE-Setup-1.0.0.exe" --clobber
echo.
echo Done!
pause
exit /b
