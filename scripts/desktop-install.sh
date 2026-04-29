#!/bin/bash
# Copies every desktop/*.app into ~/Desktop/MyApps/ (or APPIFY_INSTALL_DIR).
# That folder is meant to live as a Dock Stack — drag it to the right side of
# the Dock once and every appified app appears there automatically.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

TARGET="${APPIFY_INSTALL_DIR:-$HOME/Desktop/MyApps}"

if [ ! -d "$TARGET" ]; then
    if [ "$TARGET" = "$HOME/Desktop/MyApps" ]; then
        mkdir -p "$TARGET"
        echo "Created $TARGET."
        echo "Drag this folder to the right side of your Dock once,"
        echo "and every future appified app will appear in its Dock Stack automatically."
    else
        echo "Install target $TARGET does not exist." >&2
        exit 1
    fi
fi

shopt -s nullglob
count=0
for app in "$ROOT/desktop"/*.app; do
    name="$(basename "$app")"
    rm -rf "$TARGET/$name"
    cp -R "$app" "$TARGET/$name"
    # Re-bless modification time so Finder refreshes its icon cache.
    touch "$TARGET/$name"
    echo "Installed: $TARGET/$name"
    count=$((count + 1))
done

if [ "$count" -eq 0 ]; then
    echo "No .app bundles found under $ROOT/desktop/. Run desktop-build.sh first." >&2
    exit 1
fi
