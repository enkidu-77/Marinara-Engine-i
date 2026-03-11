#!/data/data/com.termux/files/usr/bin/bash
# ──────────────────────────────────────────────
# Marinara Engine — Start Script (Termux / Android)
# ──────────────────────────────────────────────
set -e

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   Marinara Engine  —  Termux Launcher    ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# Navigate to script directory
cd "$(dirname "$0")"

# ── Ensure required Termux packages ──
# build-essential provides clang/make/pkg-config needed for better-sqlite3 native compilation
for pkg_name in git python build-essential; do
    if ! dpkg -s "$pkg_name" &> /dev/null; then
        echo "  [..] Installing $pkg_name..."
        pkg install -y "$pkg_name" 2>/dev/null || true
    fi
done

# ── Auto-update from Git ──
if [ -d ".git" ]; then
    echo "  [..] Checking for updates..."
    OLD_HEAD=$(git rev-parse HEAD 2>/dev/null)
    if git pull 2>/dev/null; then
        NEW_HEAD=$(git rev-parse HEAD 2>/dev/null)
        if [ "$OLD_HEAD" != "$NEW_HEAD" ]; then
            echo "  [OK] Updated to $(git log -1 --format='%h %s' 2>/dev/null)"
            echo "  [..] Reinstalling dependencies..."
            pnpm install
            rm -rf packages/shared/dist packages/server/dist packages/client/dist
            rm -f packages/shared/tsconfig.tsbuildinfo packages/server/tsconfig.tsbuildinfo packages/client/tsconfig.tsbuildinfo
        else
            echo "  [OK] Already up to date"
        fi
    else
        echo "  [WARN] Could not check for updates (no internet?). Continuing with current version."
    fi
fi

# ── Check Node.js ──
if ! command -v node &> /dev/null || ! node -v &> /dev/null; then
    echo "  [..] Node.js not found or broken — installing via pkg..."
    pkg install -y nodejs-lts
fi

if ! NODE_VERSION=$(node -v 2>/dev/null | cut -d'.' -f1 | tr -d 'v'); then
    echo "  [ERR] Node.js is still not working after install."
    echo "        Try:  pkg upgrade && pkg install nodejs-lts"
    exit 1
fi

if [ -z "$NODE_VERSION" ]; then
    echo "  [ERR] Could not determine Node.js version."
    echo "        Try:  pkg upgrade && pkg install nodejs-lts"
    exit 1
fi

echo "  [OK] Node.js $(node -v) found"

if [ "$NODE_VERSION" -lt 20 ]; then
    echo "  [WARN] Node.js 20+ is recommended. You have v${NODE_VERSION}."
    echo "         Run:  pkg upgrade nodejs-lts"
fi

# ── Check pnpm ──
if ! command -v pnpm &> /dev/null; then
    echo "  [..] pnpm not found, installing globally..."
    npm install -g pnpm
fi
echo "  [OK] pnpm found"

# ── Install dependencies ──
if [ ! -d "node_modules" ]; then
    echo ""
    echo "  [..] Installing dependencies (first run)..."
    echo "       This may take several minutes on mobile."
    echo ""
    pnpm install
fi

# ── Ensure better-sqlite3 native binary is built ──
# @libsql/client has no Android ARM64 binary, so we fall back to better-sqlite3.
# pnpm install may skip native compilation if build tools were missing at the time.
BS3_PKG=$(find node_modules -path "*/better-sqlite3/package.json" -not -path "*/.cache/*" 2>/dev/null | head -1)
if [ -n "$BS3_PKG" ]; then
    BS3_DIR=$(dirname "$BS3_PKG")
else
    # Package not installed — pnpm may have skipped the optional dep entirely.
    echo "  [..] Installing better-sqlite3 (required for Termux)..."
    pnpm --filter @marinara-engine/server add -O better-sqlite3@"^11.0.0" 2>&1 || true
    BS3_PKG=$(find node_modules -path "*/better-sqlite3/package.json" -not -path "*/.cache/*" 2>/dev/null | head -1)
    if [ -n "$BS3_PKG" ]; then
        BS3_DIR=$(dirname "$BS3_PKG")
    fi
fi

if [ -n "$BS3_DIR" ] && [ ! -f "$BS3_DIR/build/Release/better_sqlite3.node" ]; then
    echo "  [..] Compiling better-sqlite3 native module..."
    echo "       (requires clang — may take a minute)"
    (cd "$BS3_DIR" && npx --yes node-gyp rebuild --release 2>&1) || {
        echo "  [ERR] Failed to compile better-sqlite3."
        echo "        Make sure build tools are installed:"
        echo "          pkg install build-essential python"
        echo "        Then try again: ./start-termux.sh"
        exit 1
    }
    echo "  [OK] better-sqlite3 compiled successfully"
elif [ -z "$BS3_DIR" ]; then
    echo "  [ERR] Could not install better-sqlite3."
    echo "        Try manually: pnpm --filter @marinara-engine/server add -O better-sqlite3"
    exit 1
fi

# ── Build if needed ──
if [ ! -d "packages/shared/dist" ]; then
    echo "  [..] Building shared types..."
    pnpm build:shared
fi
if [ ! -d "packages/server/dist" ]; then
    echo "  [..] Building server..."
    pnpm build:server
fi
if [ ! -d "packages/client/dist" ]; then
    echo "  [..] Building client..."
    # Skip tsc type-check on Termux — it OOMs on low-memory devices.
    # Skip PWA service worker — terser minifier OOMs on low-memory devices.
    # Vite doesn't need tsc output (tsconfig has noEmit: true).
    SKIP_PWA=1 pnpm --filter @marinara-engine/client exec vite build
fi

# ── Database schema ──
echo "  [..] Syncing database schema..."
pnpm db:push 2>/dev/null || true

# ── Detect IP address for LAN access ──
LOCAL_IP=$(ip -4 addr show wlan0 2>/dev/null | grep 'inet ' | sed 's/.*inet \([0-9.]*\).*/\1/' || echo "")
if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP=$(ifconfig 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | head -n 1 || echo "")
fi

# ── Start ──
echo ""
echo "  ══════════════════════════════════════════"
echo "    Starting Marinara Engine on http://localhost:7860"
if [ -n "$LOCAL_IP" ]; then
echo "    LAN access: http://${LOCAL_IP}:7860"
fi
echo ""
echo "    Open the URL above in your mobile browser."
echo "    Press Ctrl+C to stop"
echo "  ══════════════════════════════════════════"
echo ""

# Load .env if present (respects user overrides)
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

export NODE_ENV=production
export PORT=${PORT:-7860}
export HOST=${HOST:-0.0.0.0}

# Use better-sqlite3 on Termux — @libsql/client has no Android ARM64 native binary
export DATABASE_DRIVER=${DATABASE_DRIVER:-better-sqlite3}

# Open in Termux browser if available (no-op if not)
if command -v termux-open-url &> /dev/null; then
    (sleep 3 && termux-open-url "http://localhost:7860") &
fi

# Start server
cd packages/server
exec node dist/index.js
