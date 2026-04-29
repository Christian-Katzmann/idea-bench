#!/bin/bash
# appify launcher (Swift WebKit shell variant) — ensures the dev server is up,
# then hands the window over to the native Swift WebKit wrapper that lives next
# to this script. The wrapper takes over as the .app's foreground process, so
# the .app's own Dock icon stays visible and macOS handles single-instance
# activation natively.
#
# This file is a TEMPLATE. desktop-build.sh substitutes:
#   __APP_NAME__       human display name (e.g. "Momó Studio")
#   __APP_SLUG__       file-safe slug (e.g. "momo-studio")
#   __PROJECT_ROOT__   absolute path to the repo (baked at build time)
#   __PORT__           PREFERRED port — the launcher tries this first; if it's
#                      already in use (typically by another appify'd app), the
#                      launcher scans upward for a free port and uses that.
#   __START_COMMAND__  the command to start the dev server, run from PROJECT_ROOT.
#                      Must honor the PORT env var. Most dev servers do
#                      (vite, next, express, flask, CRA, …). If yours hardcodes
#                      a port literal in the command, the launcher's chosen
#                      port will be ignored and startup will time out.
#   __POLYFILL_PATH__  optional absolute path to a JS polyfill file (empty if none)
#
# PROJECT_ROOT is baked at build time — re-run desktop:build if the repo moves.

set -e

APP_NAME="__APP_NAME__"
APP_SLUG="__APP_SLUG__"
PROJECT_ROOT="__PROJECT_ROOT__"
PREFERRED_PORT=__PORT__
START_COMMAND="__START_COMMAND__"
POLYFILL_PATH="__POLYFILL_PATH__"

LOG_DIR="$HOME/Library/Logs/$APP_NAME"
mkdir -p "$LOG_DIR"
SERVER_LOG="$LOG_DIR/server.log"
PID_FILE="$LOG_DIR/server.pid"
PORT_FILE="$LOG_DIR/server.port"

HERE="$(cd "$(dirname "$0")" && pwd)"

# PATH augmentation — Finder/Dock launches start with bare /usr/bin:/bin.
NVM_BIN=""
if [ -d "$HOME/.nvm/versions/node" ]; then
    LATEST_NVM_NODE="$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)"
    [ -n "$LATEST_NVM_NODE" ] && NVM_BIN="$HOME/.nvm/versions/node/$LATEST_NVM_NODE/bin"
fi
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:${NVM_BIN}:$HOME/Library/pnpm:$PATH"

if [ ! -d "$PROJECT_ROOT" ]; then
    /usr/bin/osascript -e "display alert \"$APP_NAME failed to launch\" message \"Project repo not found at:\n$PROJECT_ROOT\n\nThe .app was built against a path that no longer exists. Re-run desktop:build from the repo.\""
    exit 1
fi

# --- Stale-state cleanup ----------------------------------------------
# If the recorded server PID is dead, scrap both PID and PORT files.
if [ -f "$PID_FILE" ]; then
    EXPECTED_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [ -z "$EXPECTED_PID" ] || ! kill -0 "$EXPECTED_PID" 2>/dev/null; then
        rm -f "$PID_FILE" "$PORT_FILE"
    fi
fi

# --- Reattach to our own existing server ------------------------------
# If we have a live PID and a recorded port, and the responder on that port
# really is our PID (not some other process that grabbed it after a crash),
# attach. Otherwise, scrap and reallocate.
CHOSEN_PORT=""
if [ -f "$PID_FILE" ] && [ -f "$PORT_FILE" ]; then
    EXPECTED_PID="$(cat "$PID_FILE")"
    EXPECTED_PORT="$(cat "$PORT_FILE")"
    if curl -sSf -o /dev/null --max-time 1 "http://localhost:$EXPECTED_PORT"; then
        if lsof -ti tcp:"$EXPECTED_PORT" 2>/dev/null | grep -qx "$EXPECTED_PID"; then
            CHOSEN_PORT="$EXPECTED_PORT"
        fi
    fi
    [ -z "$CHOSEN_PORT" ] && rm -f "$PID_FILE" "$PORT_FILE"
fi

# --- Allocate a free port + start server ------------------------------
if [ -z "$CHOSEN_PORT" ]; then
    # Scan from PREFERRED_PORT upward for the first free port.
    for p in $(seq "$PREFERRED_PORT" "$((PREFERRED_PORT + 50))"); do
        if ! lsof -i tcp:"$p" >/dev/null 2>&1; then
            CHOSEN_PORT="$p"
            break
        fi
    done

    if [ -z "$CHOSEN_PORT" ]; then
        /usr/bin/osascript -e "display alert \"$APP_NAME couldn't find a free port\" message \"Searched $PREFERRED_PORT–$((PREFERRED_PORT + 50)). Quit something using one of those ports and try again.\""
        exit 1
    fi

    cd "$PROJECT_ROOT"

    # Start the dev server with PORT="$CHOSEN_PORT" so vite/next/express/flask
    # bind to the chosen port instead of their default.
    PORT="$CHOSEN_PORT" nohup bash -c "$START_COMMAND" > "$SERVER_LOG" 2>&1 < /dev/null &
    SERVER_PID=$!
    echo "$SERVER_PID" > "$PID_FILE"
    echo "$CHOSEN_PORT" > "$PORT_FILE"
    disown "$SERVER_PID" 2>/dev/null || true

    URL="http://localhost:$CHOSEN_PORT"
    READY=0
    for _ in $(seq 1 120); do
        if curl -sSf -o /dev/null --max-time 1 "$URL"; then
            READY=1
            break
        fi
        sleep 0.5
    done

    if [ "$READY" != "1" ]; then
        TAIL="$(tail -40 "$SERVER_LOG" 2>/dev/null | sed 's/"/\\"/g' | tr '\n' ' ' | head -c 800)"
        rm -f "$PID_FILE" "$PORT_FILE"
        /usr/bin/osascript -e "display alert \"$APP_NAME failed to start\" message \"The dev server did not come up on $URL within 60 seconds.\n\nMost common cause: the START_COMMAND hardcodes a port literal instead of reading the PORT env var. Edit the project's dev script so PORT flows through.\n\nLast log lines:\n$TAIL\n\nFull log: $SERVER_LOG\""
        exit 1
    fi
fi

URL="http://localhost:$CHOSEN_PORT"

# --- Hand off to the native WebKit wrapper -----------------------------
# exec replaces this bash process with the Swift binary. The .app's identity
# stays intact (CFBundleIdentifier from Info.plist), so the Dock keeps showing
# OUR icon — not Chrome's, not Safari's.
WRAPPER="$HERE/wrapper"
if [ ! -x "$WRAPPER" ]; then
    /usr/bin/osascript -e "display alert \"$APP_NAME failed to launch\" message \"Native wrapper missing at:\n$WRAPPER\n\nRun desktop:build to rebuild the bundle.\""
    exit 1
fi

exec "$WRAPPER" "$URL" "$APP_NAME" "$CHOSEN_PORT" "$PID_FILE" "$POLYFILL_PATH"
