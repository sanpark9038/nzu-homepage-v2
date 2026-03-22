@echo off
setlocal
cd /d C:\Users\NZU\Desktop\nzu-homepage
"C:\Program Files\nodejs\node.exe" scripts\tools\check-ops-pipeline-freshness.js
set EXIT_CODE=%ERRORLEVEL%
endlocal & exit /b %EXIT_CODE%
