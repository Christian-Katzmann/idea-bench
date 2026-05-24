#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$ROOT/design/trailer"
FRAME_DIR="$OUT_DIR/frames"

mkdir -p "$FRAME_DIR"

ink="#1F1B16"
paper="#F7F6F3"
accent="#047857"
border="#E8E6E1"
soft="#6E6A62"

caption_slide() {
  local src="$1"
  local out="$2"
  local caption="$3"
  local subcaption="$4"

  magick "$src" -resize '1920x1080^' -gravity center -extent 1920x1080 \
    \( -size 1920x230 xc:none \
      -fill 'rgba(31,27,22,0.88)' -draw 'rectangle 0,0 1920,230' \
      -font Helvetica-Bold -pointsize 54 -fill "$paper" -annotate +80+88 "$caption" \
      -font Helvetica -pointsize 30 -fill '#D8D3CA' -annotate +82+146 "$subcaption" \
    \) -gravity south -composite "$out"
}

caption_slide \
  "$ROOT/design/screenshots/hero-blind-vote.png" \
  "$FRAME_DIR/01-blind-vote.png" \
  "Blind comparisons, no model tells." \
  "Voters choose between outputs without seeing model, prompt, or contestant identity."

caption_slide \
  "$ROOT/design/screenshots/hero-blind-vote.png" \
  "$FRAME_DIR/02-voting-evidence.png" \
  "Every vote becomes evidence." \
  "Real people or simulated personas create the pairwise signal the rating model needs."

caption_slide \
  "$ROOT/design/screenshots/hero-leaderboard.png" \
  "$FRAME_DIR/03-rating.png" \
  "Pairwise votes become defensible ratings." \
  "The campaign dashboard surfaces Bradley-Terry ratings, confidence, and group alignment."

magick -size 1920x1080 xc:"$paper" \
  -fill "$ink" -font Helvetica-Bold -pointsize 72 -annotate +110+185 "The evaluation loop" \
  -fill "$soft" -font Helvetica -pointsize 34 -annotate +114+245 "One prompt, several contestants, a blind ballot, and decision-ready evidence." \
  -fill "$border" -draw 'roundrectangle 110,360 1810,690 32,32' \
  -fill white -draw 'roundrectangle 118,368 1802,682 28,28' \
  -fill "$accent" -draw 'polygon 180,482 232,482 198,578 146,578' \
  -fill "$ink" -font Helvetica-Bold -pointsize 31 -annotate +280+490 "Prompt + contestants" \
  -fill "$soft" -font Helvetica -pointsize 24 -annotate +280+532 "models, system prompts, variants" \
  -fill "$accent" -draw 'rectangle 590,520 690,528' \
  -draw 'polygon 690,506 735,524 690,542' \
  -fill "$ink" -font Helvetica-Bold -pointsize 31 -annotate +780+490 "Blind ballot" \
  -fill "$soft" -font Helvetica -pointsize 24 -annotate +780+532 "identity hidden until close" \
  -fill "$accent" -draw 'rectangle 1080,520 1180,528' \
  -draw 'polygon 1180,506 1225,524 1180,542' \
  -fill "$ink" -font Helvetica-Bold -pointsize 31 -annotate +1270+490 "Bradley-Terry rating" \
  -fill "$soft" -font Helvetica -pointsize 24 -annotate +1270+532 "confidence and alignment" \
  -fill "$ink" -font Helvetica-Bold -pointsize 54 -annotate +110+888 "ModelArena keeps the reveal last." \
  -fill "$soft" -font Helvetica -pointsize 30 -annotate +114+946 "The process protects the vote first, then shows which model won." \
  "$FRAME_DIR/04-loop.png"

magick "$ROOT/design/social/social-preview.png" -resize '1920x1080^' -gravity center -extent 1920x1080 \
  "$FRAME_DIR/05-positioning.png"

ffmpeg -y \
  -loop 1 -t 6 -i "$FRAME_DIR/01-blind-vote.png" \
  -loop 1 -t 6 -i "$FRAME_DIR/02-voting-evidence.png" \
  -loop 1 -t 6 -i "$FRAME_DIR/03-rating.png" \
  -loop 1 -t 6 -i "$FRAME_DIR/04-loop.png" \
  -loop 1 -t 6 -i "$FRAME_DIR/05-positioning.png" \
  -filter_complex "[0:v][1:v][2:v][3:v][4:v]concat=n=5:v=1:a=0,format=yuv420p[out]" \
  -map "[out]" -r 30 "$OUT_DIR/trailer.mp4" >/tmp/modelarena-trailer-ffmpeg.log 2>&1

ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT_DIR/trailer.mp4"
