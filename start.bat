@echo off
setlocal
set "PROJECT_ROOT=%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_ROOT%scripts\bootstrap-windows.ps1"
if errorlevel 1 (
  echo.
  echo 啟動失敗。請查看上方訊息，修正後再重試。
  pause
  exit /b 1
)
endlocal
