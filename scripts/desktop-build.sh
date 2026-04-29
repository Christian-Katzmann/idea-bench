#!/bin/bash
# Builds desktop/<AppName>.app bundle(s) for every entry in the APPS table.
# Idempotent: re-running rebuilds the bundles in place.
#
# This file is a TEMPLATE. The agent customizes the APPS table for the project
# and chooses the launcher mode (swift|chrome) based on swiftc availability.
#
# APPS table format (pipe-delimited):
#   APP_NAME | APP_SLUG | PORT | START_COMMAND | BUNDLE_ID | VERSION | POLYFILL_PATH
#
# - APP_NAME       human display name, may include non-ASCII (e.g. "Momó Studio")
# - APP_SLUG       file-safe slug (e.g. "momo-studio")
# - PORT           dev server port (e.g. 5173)
# - START_COMMAND  command to start the dev server, run from PROJECT_ROOT.
#                  Example: "pnpm --filter @foo/bar dev" or "npm run dev" or
#                  "python -m flask run --port=5000"
# - BUNDLE_ID      reverse-DNS bundle id (e.g. "com.user.foo")
# - VERSION        marketing version (e.g. "0.1.0")
# - POLYFILL_PATH  optional absolute path to a JS polyfill file. Use @ROOT@
#                  to reference the repo root (e.g. "@ROOT@/assets/foo-polyfill.js").
#                  Empty when no polyfill is needed.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

APPS=(
  "ModelArena|modelarena|3000|npm run dev|com.user.modelarena|0.1.0|"
)

# Launcher mode: "swift" (preferred) or "chrome" (fallback when swiftc unavailable).
LAUNCHER_MODE="${APPIFY_LAUNCHER_MODE:-swift}"
if [ "$LAUNCHER_MODE" = "swift" ] && ! command -v swiftc >/dev/null 2>&1; then
    echo "swiftc not found — falling back to Chrome --app launcher." >&2
    echo "(Install Xcode Command Line Tools: xcode-select --install)" >&2
    LAUNCHER_MODE="chrome"
fi

PLIST_TEMPLATE="$ROOT/scripts/info-plist-template.xml"
WRAPPER_SRC="$ROOT/scripts/wrapper.swift"
WRAPPER_BUILD="$ROOT/assets/icons/build/wrapper"

if [ "$LAUNCHER_MODE" = "swift" ]; then
    RUN_TEMPLATE="$ROOT/scripts/run-template.sh"
else
    RUN_TEMPLATE="$ROOT/scripts/run-template-chrome.sh"
fi

if [ ! -f "$RUN_TEMPLATE" ] || [ ! -f "$PLIST_TEMPLATE" ]; then
    echo "Missing templates next to this script. Expected:" >&2
    echo "  $RUN_TEMPLATE" >&2
    echo "  $PLIST_TEMPLATE" >&2
    exit 1
fi

# --- Compile the native WebKit wrapper (cached) ------------------------
# Reused across every app — the URL and display name are argv to the binary,
# so there's no per-app build product.
if [ "$LAUNCHER_MODE" = "swift" ]; then
    if [ ! -f "$WRAPPER_SRC" ]; then
        echo "Missing wrapper source: $WRAPPER_SRC" >&2
        exit 1
    fi
    mkdir -p "$(dirname "$WRAPPER_BUILD")"
    if [ ! -x "$WRAPPER_BUILD" ] || [ "$WRAPPER_SRC" -nt "$WRAPPER_BUILD" ]; then
        echo "Compiling native wrapper: $WRAPPER_BUILD"
        # Build for the host arch by default. Override with APPIFY_SWIFT_TARGET.
        TARGET_FLAG=""
        if [ -n "${APPIFY_SWIFT_TARGET:-}" ]; then
            TARGET_FLAG="-target $APPIFY_SWIFT_TARGET"
        fi
        # shellcheck disable=SC2086
        swiftc -O "$WRAPPER_SRC" \
            -o "$WRAPPER_BUILD" \
            -framework Cocoa -framework WebKit \
            $TARGET_FLAG
    fi
fi

substitute() {
    /usr/bin/python3 - "$@" <<'PY'
import sys, pathlib
src = pathlib.Path(sys.argv[1]).read_text()
for arg in sys.argv[2:]:
    key, _, value = arg.partition("=")
    src = src.replace(key, value)
sys.stdout.write(src)
PY
}

for entry in "${APPS[@]}"; do
    IFS='|' read -r APP_NAME APP_SLUG PORT START_COMMAND BUNDLE_ID VERSION POLYFILL_PATH <<<"$entry"
    POLYFILL_PATH="${POLYFILL_PATH//@ROOT@/$ROOT}"

    APP_DIR="$ROOT/desktop/${APP_NAME}.app"
    CONTENTS="$APP_DIR/Contents"
    MACOS="$CONTENTS/MacOS"
    RESOURCES="$CONTENTS/Resources"

    echo "Building: $APP_DIR"
    mkdir -p "$MACOS" "$RESOURCES"

    substitute "$PLIST_TEMPLATE" \
        "__APP_NAME__=$APP_NAME" \
        "__BUNDLE_ID__=$BUNDLE_ID" \
        "__VERSION__=$VERSION" \
        > "$CONTENTS/Info.plist"

    substitute "$RUN_TEMPLATE" \
        "__APP_NAME__=$APP_NAME" \
        "__APP_SLUG__=$APP_SLUG" \
        "__PROJECT_ROOT__=$ROOT" \
        "__PORT__=$PORT" \
        "__START_COMMAND__=$START_COMMAND" \
        "__POLYFILL_PATH__=$POLYFILL_PATH" \
        > "$MACOS/run"
    chmod +x "$MACOS/run"

    if [ "$LAUNCHER_MODE" = "swift" ]; then
        cp "$WRAPPER_BUILD" "$MACOS/wrapper"
        chmod +x "$MACOS/wrapper"
    fi

    if [ ! -f "$RESOURCES/AppIcon.icns" ]; then
        APP_NAME="$APP_NAME" APP_SLUG="$APP_SLUG" "$ROOT/scripts/desktop-icons.sh"
    fi

    # Touch the bundle so Finder picks up changes (icon cache).
    touch "$APP_DIR"
done

echo
echo "Built ${#APPS[@]} app(s) under $ROOT/desktop/  (mode: $LAUNCHER_MODE)"
echo "  Install:  ./scripts/desktop-install.sh    # copies to ~/Desktop/MyApps/"
