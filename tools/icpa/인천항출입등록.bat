@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js가 없어요. https://nodejs.org 에서 LTS를 설치한 뒤 다시 실행하세요. & pause & exit /b)
if not exist node_modules (echo 처음 한 번 준비 중이에요... & call npm install --no-audit --no-fund)
node run.js
pause
