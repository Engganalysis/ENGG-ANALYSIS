@echo off
title ENGG Analysis Result Uploader

:: Custom Heading configuration for PDFs and saved files
set CUSTOM_HEADING=Sri Chaitanya Educational Institutions

:: Change to the current project directory using relative path
cd /d "%~dp0"

echo Starting Engineering Result Auto-Uploader...
echo Watching: F:\Project files\ENGG_RESULT.csv
echo.

echo ------------------------------------------------------------
set /p skip="[OPTIONAL] Enter number of rows to skip (or press ENTER to start from beginning/checkpoint): "
if not "%skip%"=="" (
    echo.
    echo [SKIP MODE] Starting uploader, skipping first %skip% records...
    set SKIP_RECORDS=%skip%
) else (
    echo.
    echo [NORMAL MODE] Starting uploader from beginning or last checkpoint...
    set SKIP_RECORDS=
)
echo ------------------------------------------------------------
echo.

:: Run the script
if exist "server\auto_upload_engg.js" (
    node server/auto_upload_engg.js
) else (
    echo.
    echo ---------------------------------------------------------------------
    echo ERROR: 'server\auto_upload_engg.js' not found!
    echo Current Directory is: %CD%
    echo Expected to find the script at: %CD%\server\auto_upload_engg.js
    echo ---------------------------------------------------------------------
    echo.
)

pause
