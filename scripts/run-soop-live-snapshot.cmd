@echo off
setlocal

cd /d "%~dp0.."
"C:\Program Files\nodejs\node.exe" "C:\Users\NZU\Desktop\nzu-homepage\scripts\tools\watch-soop-live-snapshot.js" %*
