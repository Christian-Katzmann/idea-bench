#!/bin/bash
# Stop the persistent dev servers spawned by the desktop launchers, plus any
# open wrapper windows. Closing the app window with the red X does NOT kill
# these — the launcher daemonizes them so the next click is fast.
#
# This file is a TEMPLATE. The agent customizes the APPS table to match the
# project's apps. Each entry's PORT is the PREFERRED port — the runtime port
# may differ if collision-fallback kicked in. We read the actual runtime port
# from ~/Library/Logs/<APP_NAME>/server.port and fall back to the configured
# port if that file is missing.
#
# IMPORTANT: pgrep matches against the kernel's process command line, which on
# macOS stores paths in NFD (decomposed Unicode). Our shell strings are
# typically NFC. Matching paths with non-ASCII characters via `pgrep -f` will
# silently fail. We sidestep this by keying on the URL or port — both ASCII.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# APP_NAME | PREFERRED_PORT — must match the APPS table in desktop-build.sh.
APPS=(
  "ModelArena|3000"
)

kill_tree() {
    local pid=$1
    [ -z "$pid" ] && return
    kill -0 "$pid" 2>/dev/null || return
    for child in $(pgrep -P "$pid" 2>/dev/null); do
        kill_tree "$child"
    done
    kill -TERM "$pid" 2>/dev/null || true
}

closed_any=0
for entry in "${APPS[@]}"; do
    IFS='|' read -r APP_NAME PREFERRED_PORT <<<"$entry"
    PID_FILE="$HOME/Library/Logs/$APP_NAME/server.pid"
    PORT_FILE="$HOME/Library/Logs/$APP_NAME/server.port"

    # Use the runtime-allocated port if recorded; else the configured port.
    PORT="$(cat "$PORT_FILE" 2>/dev/null || true)"
    [ -z "$PORT" ] && PORT="$PREFERRED_PORT"

    # Stage 1: TERM the recorded PID's process tree.
    if [ -f "$PID_FILE" ]; then
        kill_tree "$(cat "$PID_FILE")"
        closed_any=1
    fi
    # Stage 2: sweep anyone still bound to the runtime port (re-parented children).
    for p in $(lsof -ti tcp:"$PORT" 2>/dev/null); do
        kill_tree "$p"
        closed_any=1
    done
    # Stage 3: wait up to 1.5s, then SIGKILL stragglers.
    if lsof -ti tcp:"$PORT" >/dev/null 2>&1; then
        for _ in 1 2 3; do
            [ -z "$(lsof -ti tcp:"$PORT" 2>/dev/null)" ] && break
            sleep 0.5
        done
        for p in $(lsof -ti tcp:"$PORT" 2>/dev/null); do
            kill -KILL "$p" 2>/dev/null || true
            closed_any=1
        done
    fi
    # Also sweep the preferred port if it differs from runtime — covers the
    # case where the runtime port file is missing but a server is still on
    # the configured port.
    if [ "$PORT" != "$PREFERRED_PORT" ]; then
        for p in $(lsof -ti tcp:"$PREFERRED_PORT" 2>/dev/null); do
            kill_tree "$p"
            closed_any=1
        done
    fi

    rm -f "$PID_FILE" "$PORT_FILE"
done

# Native WebKit wrapper windows — match on the unique URL argv we passed each
# wrapper. The URL is ASCII so NFC/NFD normalization isn't an issue here.
# We don't know the runtime URL anymore, so match the wrapper-binary path.
for entry in "${APPS[@]}"; do
    IFS='|' read -r APP_NAME PREFERRED_PORT <<<"$entry"
    # Wrapper invocations contain "MacOS/wrapper http://localhost:" — match
    # any port after that.
    for p in $(pgrep -f "MacOS/wrapper http://localhost:" 2>/dev/null); do
        # Only kill if this wrapper belongs to ONE of our apps. We check by
        # looking at the wrapper's argv for the app name.
        cmdline="$(ps -o command= -p "$p" 2>/dev/null || true)"
        if echo "$cmdline" | grep -qF "$APP_NAME"; then
            kill -TERM "$p" 2>/dev/null || true
            closed_any=1
        fi
    done
    # Legacy Chrome --user-data-dir windows from chrome-fallback builds.
    PROFILE="$HOME/Library/Application Support/$APP_NAME/BrowserProfile"
    for p in $(pgrep -f "user-data-dir=$PROFILE" 2>/dev/null); do
        kill -TERM "$p" 2>/dev/null || true
        closed_any=1
    done
done

if [ "$closed_any" = "1" ]; then
    echo "Stopped dev servers and open windows."
else
    echo "Nothing to stop — no servers were running."
fi
