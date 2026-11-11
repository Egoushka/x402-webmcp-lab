#!/usr/bin/env bash
# Usage: build.sh <rawDir> <outDir>   rawDir is what record.mjs wrote. Needs ffmpeg on PATH or FFMPEG=...
set -euo pipefail
F=${FFMPEG:-ffmpeg}; R=$1; O=$2; T=$(mktemp -d); mkdir -p "$O"
for n in run1 run2; do
  ss=$(node -e "console.log(require('$R/offsets.json').$n + 0.1)")
  $F -v error -y -ss "$ss" -i "$R/$n"/*.webm -an -vf fps=25 -c:v libx264 -crf 24 -pix_fmt yuv420p "$T/$n.mp4"
done
printf "file '$T/run1.mp4'\nfile '$T/run2.mp4'\n" > "$T/list.txt"
$F -v error -y -f concat -safe 0 -i "$T/list.txt" -c copy -movflags +faststart "$O/demo.mp4"
$F -v error -y -i "$O/demo.mp4" -vf "fps=10,scale=540:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=48[p];[b][p]paletteuse=dither=none" "$O/demo.gif"
