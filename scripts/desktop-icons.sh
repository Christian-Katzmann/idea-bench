#!/bin/bash
# Generates AppIcon.icns from assets/<slug>-icon.{png,svg} for one app.
# Required env: APP_NAME, APP_SLUG. (APP_NAME may include non-ASCII characters
# such as accented letters; the bash variable handles that fine.)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

APP_NAME="${APP_NAME:?must set APP_NAME (e.g. 'Momó Studio')}"
APP_SLUG="${APP_SLUG:?must set APP_SLUG (e.g. 'momo-studio')}"

# Per-app icon, falling back to repo-wide app-icon.*
SRC_PNG=""
for candidate in "$ROOT/assets/${APP_SLUG}-icon.png" "$ROOT/assets/app-icon.png"; do
    [ -f "$candidate" ] && SRC_PNG="$candidate" && break
done
SRC_SVG=""
for candidate in "$ROOT/assets/${APP_SLUG}-icon.svg" "$ROOT/assets/app-icon.svg"; do
    [ -f "$candidate" ] && SRC_SVG="$candidate" && break
done

OUT_DIR="$ROOT/assets/icons/$APP_SLUG"
ICONSET="$OUT_DIR/AppIcon.iconset"
ICNS="$ROOT/desktop/${APP_NAME}.app/Contents/Resources/AppIcon.icns"

mkdir -p "$OUT_DIR" "$(dirname "$ICNS")"
rm -rf "$ICONSET"
mkdir -p "$ICONSET"

if [ -n "$SRC_PNG" ]; then
    SOURCE="$SRC_PNG"
elif [ -n "$SRC_SVG" ]; then
    SOURCE="$OUT_DIR/source-1024.png"
    if command -v rsvg-convert >/dev/null; then
        rsvg-convert -w 1024 -h 1024 "$SRC_SVG" -o "$SOURCE"
    elif command -v magick >/dev/null; then
        magick -background none -density 300 "$SRC_SVG" -resize 1024x1024 "$SOURCE"
    else
        sips -s format png -Z 1024 "$SRC_SVG" --out "$SOURCE" >/dev/null
    fi
else
    echo "No source icon for $APP_SLUG (looked at assets/${APP_SLUG}-icon.{png,svg} and assets/app-icon.{png,svg})" >&2
    exit 1
fi

# Pre-scale to a clean 1024 master so iconset entries up-/down-sample identically.
MASTER="$OUT_DIR/icon_1024.png"
sips -z 1024 1024 "$SOURCE" --out "$MASTER" >/dev/null

for size in 16 32 64 128 256 512; do
    sips -z "$size" "$size" "$MASTER" --out "$OUT_DIR/icon_${size}.png" >/dev/null
done

cp "$OUT_DIR/icon_16.png"   "$ICONSET/icon_16x16.png"
cp "$OUT_DIR/icon_32.png"   "$ICONSET/icon_16x16@2x.png"
cp "$OUT_DIR/icon_32.png"   "$ICONSET/icon_32x32.png"
cp "$OUT_DIR/icon_64.png"   "$ICONSET/icon_32x32@2x.png"
cp "$OUT_DIR/icon_128.png"  "$ICONSET/icon_128x128.png"
cp "$OUT_DIR/icon_256.png"  "$ICONSET/icon_128x128@2x.png"
cp "$OUT_DIR/icon_256.png"  "$ICONSET/icon_256x256.png"
cp "$OUT_DIR/icon_512.png"  "$ICONSET/icon_256x256@2x.png"
cp "$OUT_DIR/icon_512.png"  "$ICONSET/icon_512x512.png"
cp "$OUT_DIR/icon_1024.png" "$ICONSET/icon_512x512@2x.png"

iconutil -c icns "$ICONSET" -o "$ICNS"
echo "Generated: $ICNS"
