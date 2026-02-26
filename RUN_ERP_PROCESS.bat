@echo off
TITLE ENGG ANALYSIS - FULL REPORT GENERATION PROCESS
COLOR 0B

echo ========================================================
echo   ENGG ANALYSIS: ERP REPORT GENERATION WORKFLOW
echo ========================================================
echo.

:: Step 1: Image Upload & URL Mapping
echo [STEP 1/3] Uploading Question/Solution Images to ImgBB...
echo This will open a browser window. 
echo Please wait for links to be generated...
echo.
node server\upload_to_imgbb.js
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] ERROR: ImgBB Upload failed. 
    echo Please check your internet connection or credentials.
    pause
    exit /b %ERRORLEVEL%
)
echo.
echo [+] STEP 1 COMPLETE: URL Mapping generated successfully.
echo.

:: Step 2: Database Backup
echo [STEP 2/3] Database Backup Options...
set /p doBackup="Do you want to create a backup of ENGG_RESULT? (Y/N) [Default N]: "

if /i "%doBackup%"=="Y" (
    echo Refreshing database backup...
    node server\backup_engg_result.js --action=backup
) else (
    echo Skipping backup. Cleaning up backup table if exists...
    node server\backup_engg_result.js --action=cleanup
)
echo.

:: Step 3: Data Extraction & Database Sync
echo [STEP 3/3] Extracting Marks, Errors, and Metadata...
echo Syncing with Zero Report and Keys...
echo.
echo Please choose the extraction mode:
echo [1] TOP Only (Upload only Top identified students)
echo [2] ALL Only (Upload all students except identified Top)
echo [3] BOTH (Upload all students)
echo.
set /p choice="Enter your choice (1, 2, or 3) [Default is 1]: "

set MODE=TOP
if "%choice%"=="1" set MODE=TOP
if "%choice%"=="2" set MODE=ALL
if "%choice%"=="3" set MODE=BOTH

echo.
echo Starting extraction in %MODE% mode...
node server\extract_erp.js --mode=%MODE%

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] ERROR: ERP Extraction failed.
    echo Check if the Excel files are open or if TiDB is reachable.
    pause
    exit /b %ERRORLEVEL%
)
echo.

echo ========================================================
echo   SUCCESS: ERP REPORT READY IN TIDB
echo ========================================================
echo.
echo Process Summary:
echo 1. Images Uploaded ^& Mapped
echo 2. Latest Backup Created
echo 3. Results ^& Error Analysis Synced
echo.
pause
