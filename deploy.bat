@echo off
title Engineering Analysis - Full Deploy
:: Automated commit message for current set of improvements
set "msg=Fix: PDF Space Optimization, Image Splitting across pages, and Header overlap fixes"

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
curl -X POST "https://api.render.com/deploy/srv-d6673b7gi27c73dlr9j0?key=XKk6HDUo_v4"

echo.
echo.
echo ======================================================
echo    SUCCESS! Backend and Frontend are both deploying.
echo ======================================================
pause
