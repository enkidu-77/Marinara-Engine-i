@echo off
setlocal enabledelayedexpansion
title Marinara Engine
color 0A
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║       Marinara Engine  -  Launcher        ║
echo  ╚══════════════════════════════════════════╝
echo.

:: Check for Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js is not installed or not in PATH.
    echo  Please install Node.js 20+ from https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: Auto-update from Git
if exist ".git" (
    echo  [..] Checking for updates...
    for /f "tokens=*" %%i in ('git rev-parse HEAD 2^>nul') do set "OLD_HEAD=%%i"
    git pull >nul 2>&1
    if !errorlevel! equ 0 (
        for /f "tokens=*" %%i in ('git rev-parse HEAD 2^>nul') do set "NEW_HEAD=%%i"
        if not "!OLD_HEAD!"=="!NEW_HEAD!" (
            echo  [OK] Updated to latest version
            echo  [..] Reinstalling dependencies...
            call pnpm install
            :: Force rebuild
            if exist "packages\shared\dist" rmdir /s /q "packages\shared\dist"
            if exist "packages\server\dist" rmdir /s /q "packages\server\dist"
            if exist "packages\client\dist" rmdir /s /q "packages\client\dist"
            del /q "packages\shared\tsconfig.tsbuildinfo" 2>nul
            del /q "packages\server\tsconfig.tsbuildinfo" 2>nul
            del /q "packages\client\tsconfig.tsbuildinfo" 2>nul
        ) else (
            echo  [OK] Already up to date
        )
    ) else (
        echo  [WARN] Could not check for updates. Continuing with current version.
    )
)

:: Check Node version
for /f "tokens=1 delims=v." %%a in ('node -v') do set NODE_MAJOR=%%a
for /f "tokens=2 delims=v." %%a in ('node -v') do set NODE_MAJOR=%%a
echo  [OK] Node.js found: 
node -v

:: Check for pnpm
where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo  [..] pnpm not found, installing via corepack...
    corepack enable
    corepack prepare pnpm@latest --activate
)
echo  [OK] pnpm found

:: Install dependencies if needed
if not exist "node_modules" (
    echo.
    echo  [..] Installing dependencies (first run)...
    echo      This may take a few minutes.
    echo.
    call pnpm install
    if %errorlevel% neq 0 (
        echo  [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
)

:: Build if needed
if not exist "packages\shared\dist" (
    echo  [..] Building shared types...
    call pnpm build:shared
)
if not exist "packages\server\dist" (
    echo  [..] Building server...
    call pnpm build:server
)
if not exist "packages\client\dist" (
    echo  [..] Building client...
    call pnpm build:client
)

:: Push database schema
echo  [..] Syncing database schema...
call pnpm db:push 2>nul

:: Start the server
:: Load .env if present (respects user overrides)
:: eol=# skips comment lines; tokens/delims split on first '='
if exist .env (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do (
    if not "%%A"=="" if not "%%B"=="" set "%%A=%%B"
  )
)

:: Set defaults only if not already set
set NODE_ENV=production
if not defined PORT set PORT=7860
if not defined HOST set HOST=0.0.0.0

set PROTOCOL=http
if defined SSL_CERT if defined SSL_KEY set PROTOCOL=https

echo.
echo  ══════════════════════════════════════════
echo    Starting Marinara Engine on %PROTOCOL%://localhost:%PORT%
echo    Press Ctrl+C to stop
echo  ══════════════════════════════════════════
echo.

:: Open browser after a short delay (use explorer.exe as fallback)
start "" cmd /c "timeout /t 4 /nobreak >nul && start %PROTOCOL%://localhost:%PORT% || explorer %PROTOCOL%://localhost:%PORT%"

:: Start server
cd packages\server
node dist/index.js
