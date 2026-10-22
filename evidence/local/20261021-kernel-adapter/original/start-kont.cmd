@echo off
cd /d "%~dp0"
call node scripts/build.mjs
if errorlevel 1 exit /b 1
call node scripts/dev.mjs
