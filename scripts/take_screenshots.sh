#!/bin/bash
# Helper script to take screenshots from connected Android device via ADB
# Usage: ./take_screenshots.sh [suffix_name]

SUFFIX=${1:-"screen"}
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="screenshot_${SUFFIX}_${TIMESTAMP}.png"
DEST_DIR="./screenshots"

mkdir -p $DEST_DIR

echo "📸 Taking screenshot from Android device..."
adb exec-out screencap -p > "$DEST_DIR/$FILENAME"

if [ $? -eq 0 ]; then
    echo "✅ Screenshot saved to $DEST_DIR/$FILENAME"
else
    echo "❌ Failed to take screenshot. Make sure ADB is connected and a device is listed."
fi
