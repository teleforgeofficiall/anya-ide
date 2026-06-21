@echo off
chcp 65001 >nul
title Anya IDE - Deploy Tool

:: Read version from package.json
for /f "tokens=2 delims=:," %%a in ('findstr /C:"\"version\"" package.json') do set VERSION=%%a
set VERSION=%VERSION:"=%
set VERSION=%VERSION: =%

echo ╔══════════════════════════════════════╗
echo ║       Anya IDE - Deploy Tool         ║
echo ║       Current Version: %VERSION%        ║
echo ╚══════════════════════════════════════╝
echo.
echo [1] Run Anya IDE (npm start)
echo [2] Clean + Build Installer (NSIS setup)
echo [3] Build + Upload to GitHub Release
echo [4] Build + Upload + Git Commit + Push
echo [5] Exit
echo.

set /p choice="Select (1-5): "

if "%choice%"=="1" goto run
if "%choice%"=="2" goto build
if "%choice%"=="3" goto release
if "%choice%"=="4" goto all
if "%choice%"=="5" exit /b

:run
echo.
echo Starting Anya IDE...
call npm start
pause
exit /b

:build
echo.
echo Cleaning old release...
if exist "release" rmdir /s /q release >nul 2>&1
echo Building NSIS installer...
call npx electron-builder --win nsis
echo.
echo Done! Installer: release\Anya-IDE-Setup-%VERSION%.exe
pause
exit /b

:release
echo.
echo Cleaning old release...
if exist "release" rmdir /s /q release >nul 2>&1
echo Building NSIS installer...
call npx electron-builder --win nsis
echo.
echo Uploading to GitHub Release v%VERSION%...
gh release upload v%VERSION% "release\Anya-IDE-Setup-%VERSION%.exe" --clobber
echo.
echo Done!
pause
exit /b

:all
echo.
echo Cleaning old release...
if exist "release" rmdir /s /q release >nul 2>&1
echo Building NSIS installer...
call npx electron-builder --win nsis
echo.
echo Uploading to GitHub Release v%VERSION%...
gh release upload v%VERSION% "release\Anya-IDE-Setup-%VERSION%.exe" --clobber
echo.
echo Pushing code to GitHub...
git add -A
git commit -m "deploy: v%VERSION% auto commit"
git push origin main
echo.
echo All done! v%VERSION% deployed.
pause
exit /b
