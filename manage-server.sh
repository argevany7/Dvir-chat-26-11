#!/bin/bash

# Script לניהול הפרויקט - הפעלה, עצירה, ובדיקת סטטוס
# שימוש: ./manage-server.sh [start|stop|restart|status|logs]

PROJECT_NAME="דביר בסון צ'אטבוט"
SERVER_FILE="server_simple.js"
PORT=3001

function show_help() {
    echo "📋 $PROJECT_NAME - ניהול שרת"
    echo ""
    echo "שימוש: ./manage-server.sh [פעולה]"
    echo ""
    echo "פעולות זמינות:"
    echo "  start    - הפעלת השרת ברקע"
    echo "  stop     - עצירת השרת"
    echo "  restart  - הפעלה מחדש של השרת"
    echo "  status   - בדיקת סטטוס השרת"
    echo "  logs     - הצגת לוגים"
    echo "  help     - הצגת עזרה זו"
    echo ""
}

function check_status() {
    local pids=$(ps aux | grep "$SERVER_FILE" | grep -v grep | awk '{print $2}')
    local port_check=$(lsof -ti:$PORT)
    
    if [ ! -z "$pids" ] || [ ! -z "$port_check" ]; then
        echo "✅ השרת פועל"
        if [ ! -z "$pids" ]; then
            echo "🔍 תהליכים פעילים:"
            ps aux | grep "$SERVER_FILE" | grep -v grep
        fi
        if [ ! -z "$port_check" ]; then
            echo "🌐 פורט $PORT בשימוש:"
            lsof -i:$PORT
        fi
        return 0
    else
        echo "❌ השרת לא פועל"
        return 1
    fi
}

function start_server() {
    echo "🚀 מפעיל את $PROJECT_NAME..."
    
    # בדיקה אם השרת כבר פועל
    if check_status > /dev/null 2>&1; then
        echo "⚠️  השרת כבר פועל!"
        check_status
        return 1
    fi
    
    # הפעלת השרת ברקע
    echo "▶️  מתחיל שרת..."
    nohup npm start > server.log 2>&1 &
    
    # המתנה קצרה לוודא שהשרת התחיל
    sleep 3
    
    if check_status > /dev/null 2>&1; then
        echo "✅ השרת הופעל בהצלחה!"
        echo "🌐 גישה לאפליקציה: http://localhost:$PORT"
        echo "📱 QR Code לווטסאפ: http://localhost:$PORT/qr"
        echo "📊 סטטוס: http://localhost:$PORT/status"
        echo "📝 לוגים: tail -f server.log"
    else
        echo "❌ שגיאה בהפעלת השרת"
        echo "📝 בדוק את הלוגים: cat server.log"
        return 1
    fi
}

function stop_server() {
    echo "⏹️  עוצר את $PROJECT_NAME..."
    
    # הפעלת סקריפט העצירה
    if [ -f "./kill-server.sh" ]; then
        ./kill-server.sh
    else
        echo "⚠️  קובץ kill-server.sh לא נמצא, מנסה עצירה ידנית..."
        
        # עצירה ידנית
        local pids=$(ps aux | grep "$SERVER_FILE" | grep -v grep | awk '{print $2}')
        local port_pids=$(lsof -ti:$PORT)
        
        for pid in $pids $port_pids; do
            if [ ! -z "$pid" ]; then
                echo "🔪 עוצר תהליך $pid"
                kill -TERM $pid 2>/dev/null
                sleep 1
                if kill -0 $pid 2>/dev/null; then
                    kill -KILL $pid 2>/dev/null
                fi
            fi
        done
    fi
    
    # בדיקה שהשרת נעצר
    sleep 2
    if ! check_status > /dev/null 2>&1; then
        echo "✅ השרת נעצר בהצלחה"
    else
        echo "⚠️  יתכן שחלק מהתהליכים עדיין פועלים"
        check_status
    fi
}

function restart_server() {
    echo "🔄 מפעיל מחדש את $PROJECT_NAME..."
    stop_server
    sleep 2
    start_server
}

function show_logs() {
    if [ -f "server.log" ]; then
        echo "📝 הצגת לוגים אחרונים:"
        echo "=================="
        tail -n 50 server.log
        echo "=================="
        echo "💡 לצפייה בזמן אמת: tail -f server.log"
    else
        echo "❌ קובץ לוגים לא נמצא"
        echo "💡 הפעל את השרת קודם: ./manage-server.sh start"
    fi
}

# עיבוד ארגומנטים
case "${1:-help}" in
    "start")
        start_server
        ;;
    "stop")
        stop_server
        ;;
    "restart")
        restart_server
        ;;
    "status")
        check_status
        ;;
    "logs")
        show_logs
        ;;
    "help"|"--help"|"-h")
        show_help
        ;;
    *)
        echo "❌ פעולה לא מוכרת: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
