@echo off
chcp 65001 >nul
title Anya IDE - Deploy Tool

:: Read version from package.json
for /f "tokens=2 delims=:," %%a in ('findstr /C:"\"version\"" package.json') do set VERSION=%%a
set VERSION=%VERSION:"=%
set VERSION=%VERSION: =%

:menu
cls
echo.
echo  ╔══════════════════════════════════════╗
echo  ║       Anya IDE  v%VERSION%            ║
echo  ║       Deploy Tool                    ║
echo  ╚══════════════════════════════════════╝
echo.
echo  [1] Run Anya IDE (npm start)
echo  [2] Clean + Build Installer (NSIS)
echo  [3] Build + Upload to GitHub Release
echo  [4] Build + Upload + Git Commit + Push
echo  [5] Exit
echo.
echo  Select option and press Enter:
echo.

set /p choice="> "

if "%choice%"=="1" goto run
if "%choice%"=="2" goto build
if "%choice%"=="3" goto release
if "%choice%"=="4" goto all
if "%choice%"=="5" exit /b

echo Invalid option. Try again.
timeout /t 2 >nul
goto menu

:run
cls
echo Starting Anya IDE (v%VERSION%)...
echo.
call npm start
echo.
echo Anya IDE closed.
pause
goto menu

:build
cls
echo Cleaning old release...
if exist "release" rmdir /s /q release >nul 2>&1
echo Building NSIS installer for v%VERSION%...
echo.
call npx electron-builder --win nsis
echo.
if exist "release\*.exe" (
    echo ✓ Installer built: release\Anya-IDE-Setup-%VERSION%.exe
) else (
    echo ✕ Build failed — check errors above.
)
echo.
pause
goto menu

:release
cls
echo Cleaning old release...
if exist "release" rmdir /s /q release >nul 2>&1
echo Building NSIS installer for v%VERSION%...
echo.
call npx electron-builder --win nsis
echo.
if not exist "release\*.exe" (
    echo ✕ Build failed.
    pause
    goto menu
)
echo Uploading to GitHub Release v%VERSION%...
gh release upload v%VERSION% "release\Anya-IDE-Setup-%VERSION%.exe" --clobber
echo.
echo ✓ Done! v%VERSION% uploaded.
echo.
pause
goto menu

:all
cls
echo Cleaning old release...
if exist "release" rmdir /s /q release >nul 2>&1
echo Building NSIS installer for v%VERSION%...
echo.
call npx electron-builder --win nsis
echo.
if not exist "release\*.exe" (
    echo ✕ Build failed.
    pause
    goto menu
)
echo Uploading to GitHub Release v%VERSION%...
gh release upload v%VERSION% "release\Anya-IDE-Setup-%VERSION%.exe" --clobber
echo.
echo Pushing code to GitHub...
git add -A
git commit -m "deploy: v%VERSION% auto commit"
git push origin main
echo.
echo ✓ All done! v%VERSION% deployed.
echo.
pause
goto menu
