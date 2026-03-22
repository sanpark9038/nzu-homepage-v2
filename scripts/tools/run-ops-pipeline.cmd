@echo off
setlocal
cd /d C:\Users\NZU\Desktop\nzu-homepage
"C:\Program Files\nodejs\node.exe" scripts\tools\run-ops-pipeline-chunked.js --chunk-size 3 --inactive-skip-days 14
set EXIT_CODE=%ERRORLEVEL%
endlocal & exit /b %EXIT_CODE%
