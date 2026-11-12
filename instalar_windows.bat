@echo off
setlocal
chcp 65001 >nul
title Instalar NBA Lab no Windows

set "URL=https://gersondahora1993-sketch.github.io/nba-lab/"
set "ICO=%~dp0assets\nba-lab.ico"
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"

if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if not exist "%EDGE%" (
  echo O Microsoft Edge nao foi encontrado neste computador.
  echo O app vai abrir no navegador padrao; instale pelo icone da barra de endereco.
  start "" "%URL%"
  pause
  exit /b 1
)

if not exist "%LOCALAPPDATA%\NBALab" mkdir "%LOCALAPPDATA%\NBALab"
copy /Y "%ICO%" "%LOCALAPPDATA%\NBALab\nba-lab.ico" >nul

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ws=New-Object -ComObject WScript.Shell; $edge=$env:EDGE; $url=$env:URL; $ico=(Join-Path $env:LOCALAPPDATA 'NBALab\nba-lab.ico'); foreach($d in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Startup'))){ $s=$ws.CreateShortcut((Join-Path $d 'NBA Lab.lnk')); $s.TargetPath=$edge; $s.Arguments='--app=' + $url + ' --window-size=1500,950'; $s.IconLocation=$ico + ',0'; $s.WorkingDirectory=(Split-Path $edge); $s.Description='NBA Lab - estatisticas da NBA'; $s.Save() }"

if errorlevel 1 (
  echo.
  echo Nao foi possivel criar os atalhos.
  pause
  exit /b 1
)

echo.
echo Atalhos criados com sucesso:
echo   - Area de Trabalho: "NBA Lab"
echo   - Inicializacao: abre junto com o Windows
echo.
echo Para desativar a abertura automatica, rode remover_autostart.bat
echo.

if /I not "%~1"=="--silent" (
  echo Abrindo o NBA Lab...
  start "" "%EDGE%" --app=%URL% --window-size=1500,950
)
exit /b 0
