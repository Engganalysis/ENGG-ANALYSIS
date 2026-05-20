@echo off
title Engineering Analysis - Full Deploy

:: Prompt for custom commit message
echo.
set "defaultMsg=Update: Performance and UI improvements"
set /p msg="Enter commit message (Leave blank for default: %defaultMsg%): "
if "%msg%"=="" set "msg=%defaultMsg%"

echo.
echo === [1/4] Adding and Committing changes ===
git add .
git commit -m "%msg%"

echo.
echo === [2/4] Pushing to GitHub ===
git push origin main

echo.
echo === [3/4] Building and Deploying Frontend to Firebase ===
cd client
:: Use 'call' so the script doesn't exit after npm/firebase
call npm run build
call firebase deploy --only hosting
cd ..

echo.
echo === [4/4] Triggering Render Backend Deployment ===
:: Updated with your NEW direct service hook
curl -X POST "https://api.render.com/deploy/srv-d864jhf7f7vs739lc9e0?key=OpFXfg-HYD4"

echo.
echo.
echo ======================================================
echo    SUCCESS! Backend and Frontend are both deploying.
echo ======================================================
pause
