@echo off
echo ========================================================
echo   ENGINEERING RESULT EXCEL EXTRACTOR & UPLOADER
echo ========================================================
echo.
cd /d "%~dp0"
node server/extract_results.js
echo.
echo ========================================================
echo   Process Finished. Check log above for details.
echo ========================================================
pause
