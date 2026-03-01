@echo off
setlocal
chcp 65001 > nul
echo ==========================================
echo   正在启动 谷歌邮箱接码助手 (React版)
echo   如果弹出防火墙提示，请允许访问
echo ==========================================

:: 强制清理可能卡住的 node 进程
taskkill /f /im node.exe >nul 2>nul
timeout /t 1 /nobreak > nul

:: 启动 Vite 开发服务器进程
start "React 接码助手服务" cmd /k "npm run dev"

:: 等待服务启动
timeout /t 3 /nobreak > nul

:: 强制使用 127.0.0.1 打开浏览器，绕过代理和 localhost IPv6 拦截
echo 正在打开浏览器...
start http://127.0.0.1:5173

echo.
echo   服务已在后台运行！(地址：http://127.0.0.1:5173)
echo   请不要关闭此黑框窗口。
echo.
pause
