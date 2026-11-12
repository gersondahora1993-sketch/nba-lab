@echo off
setlocal
chcp 65001 >nul
title Remover autostart do NBA Lab

set "LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\NBA Lab.lnk"

if exist "%LNK%" (
  del /f /q "%LNK%"
  echo Atalho de inicializacao removido. O NBA Lab nao abre mais junto com o Windows.
  echo O atalho da Area de Trabalho continua funcionando.
) else (
  echo O NBA Lab nao estava configurado para abrir junto com o Windows.
)

echo.
if /I not "%~1"=="--silent" pause
exit /b 0
