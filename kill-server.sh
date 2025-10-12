#!/bin/bash

# Kill script לפרויקט דביר בסון צ'אטבוט
# סקריפט זה יעצור את כל התהליכים הקשורים לפרויקט

echo "🔍 מחפש תהליכים של הפרויקט..."

# חיפוש תהליכים לפי שם הקובץ (כולל server.js, server_new.js)
PIDS=$(ps aux | grep -E "server\.js|server_new\.js" | grep -v grep | awk '{print $2}')

if [ -z "$PIDS" ]; then
    echo "❌ לא נמצאו תהליכים פעילים של server.js"
else
    echo "🎯 נמצאו התהליכים הבאים:"
    ps aux | grep -E "server\.js|server_new\.js" | grep -v grep
    
    echo "⏹️  עוצר תהליכים..."
    for PID in $PIDS; do
        echo "🔪 עוצר תהליך $PID"
        kill -TERM $PID
        sleep 1
        
        # בדיקה אם התהליך עדיין פועל
        if kill -0 $PID 2>/dev/null; then
            echo "💀 כפיית עצירה של תהליך $PID"
            kill -KILL $PID
        fi
    done
fi

# חיפוש תהליכים לפי פורט 3001
echo "🔍 מחפש תהליכים על פורט 3001..."
PORT_PIDS=$(lsof -ti:3001)

if [ -z "$PORT_PIDS" ]; then
    echo "✅ פורט 3001 פנוי"
else
    echo "🎯 נמצאו תהליכים על פורט 3001:"
    lsof -i:3001
    
    echo "⏹️  עוצר תהליכים על פורט 3001..."
    for PID in $PORT_PIDS; do
        echo "🔪 עוצר תהליך $PID על פורט 3001"
        kill -TERM $PID
        sleep 1
        
        # בדיקה אם התהליך עדיין פועל
        if kill -0 $PID 2>/dev/null; then
            echo "💀 כפיית עצירה של תהליך $PID"
            kill -KILL $PID
        fi
    done
fi

# חיפוש תהליכי Node.js שקשורים לפרויקט
echo "🔍 מחפש תהליכי Node.js קשורים..."
NODE_PIDS=$(ps aux | grep "node.*dvir" | grep -v grep | awk '{print $2}')

if [ ! -z "$NODE_PIDS" ]; then
    echo "🎯 נמצאו תהליכי Node.js קשורים:"
    ps aux | grep "node.*dvir" | grep -v grep
    
    for PID in $NODE_PIDS; do
        echo "🔪 עוצר תהליך Node.js $PID"
        kill -TERM $PID
        sleep 1
        
        if kill -0 $PID 2>/dev/null; then
            echo "💀 כפיית עצירה של תהליך $PID"
            kill -KILL $PID
        fi
    done
fi

# חיפוש תהליכי Chrome/Puppeteer
echo "🔍 מחפש תהליכי Chrome/Puppeteer..."
CHROME_PIDS=$(ps aux | grep "chrome.*remote-debugging-port=9222" | grep -v grep | awk '{print $2}')

if [ ! -z "$CHROME_PIDS" ]; then
    echo "🎯 נמצאו תהליכי Chrome של הפרויקט:"
    ps aux | grep "chrome.*remote-debugging-port=9222" | grep -v grep
    
    for PID in $CHROME_PIDS; do
        echo "🔪 עוצר תהליך Chrome $PID"
        kill -TERM $PID
        sleep 1
        
        if kill -0 $PID 2>/dev/null; then
            echo "💀 כפיית עצירה של תהליך Chrome $PID"
            kill -KILL $PID
        fi
    done
fi

# הערה: לא מוחקים את /tmp/chrome-user-data כדי לשמור על חיבור הווטסאפ
# אם תרצה להתנתק מווטסאפ ולהתחבר מחדש, מחק ידנית: rm -rf /tmp/chrome-user-data

echo "✅ הפרויקט נעצר בהצלחה!"
echo "💡 כדי להפעיל שוב: npm start או npm run dev"
