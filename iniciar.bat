@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  ============================================
echo   GS NBA PRO - Dashboard de estatisticas e probabilidades
echo  ============================================
echo.
echo  Abrindo em http://localhost:3000 ...
echo  Feche esta janela para encerrar o servidor.
echo.

start "" /b powershell -NoProfile -Command "Start-Sleep 3; Start-Process 'http://localhost:3000'"
node server.js
pause
