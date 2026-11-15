@echo off
setlocal
chcp 65001 >nul
title Remover autostart do GS Stats PRO

set "LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\GS Stats PRO.lnk"
set "OLD=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\NBA Lab.lnk"
set "OLD2=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\GS NBA PRO.lnk"

if exist "%OLD%" del /f /q "%OLD%"
if exist "%OLD2%" del /f /q "%OLD2%"

if exist "%LNK%" (
  del /f /q "%LNK%"
  echo Atalho de inicializacao removido. O GS Stats PRO nao abre mais junto com o Windows.
  echo O atalho da Area de Trabalho continua funcionando.
) else (
  echo O GS Stats PRO nao estava configurado para abrir junto com o Windows.
)

echo.
if /I not "%~1"=="--silent" pause
exit /b 0
