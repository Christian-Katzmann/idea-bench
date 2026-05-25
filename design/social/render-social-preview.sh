#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$ROOT/design/social/social-preview.png"
SHOT="$ROOT/design/screenshots/hero-blind-vote.png"

if ! command -v magick >/dev/null 2>&1; then
  echo "Missing required command: magick" >&2
  echo "Install ImageMagick, then rerun this script." >&2
  exit 127
fi

ink="#1F1B16"
paper="#F7F6F3"
accent="#047857"
soft="#D8D3CA"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

magick "$SHOT" \
  -resize '1450x820^' \
  -gravity center \
  -extent 1450x820 \
  "$tmp/product.png"

magick -size 2560x1280 xc:"$paper" \
  -fill "$ink" -draw 'rectangle 0,0 910,1280' \
  -fill "$accent" -draw 'polygon 110,255 184,255 134,385 60,385' \
  -fill "$paper" -font Helvetica-Bold -pointsize 96 -annotate +230+340 "ïdea Bench" \
  -fill "$soft" -font Helvetica -pointsize 44 -annotate +90+640 "Blind LLM evaluations" \
  -fill "$soft" -font Helvetica -pointsize 44 -annotate +90+700 "you can defend." \
  "$tmp/base.png"

magick "$tmp/base.png" \
  \( "$tmp/product.png" \
    \( +clone -background black -shadow 45x35+0+42 \) +swap \
    -background none -layers merge \
  \) -geometry +1010+260 -composite \
  "$OUT"

file "$OUT"
