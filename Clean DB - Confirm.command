#!/bin/zsh
cd "/Users/arielargevany/Documents/דביר בסון - צאטבוט"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
/usr/bin/env node clean_database.js
echo
read -n 1 -s -r "?לחץ מקש כדי לסגור"
