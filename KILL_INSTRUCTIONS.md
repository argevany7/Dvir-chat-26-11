# 🔪 הוראות עצירת הפרויקט

## דרכים לעצירת הפרויקט שרץ ברקע

### 1. שימוש ב-npm scripts (הכי פשוט)
```bash
npm run kill
# או
npm run stop
```

### 2. שימוש בסקריפט העצירה הישיר
```bash
./kill-server.sh
```

### 3. שימוש בסקריפט הניהול המתקדם
```bash
# עצירת השרת
./manage-server.sh stop

# בדיקת סטטוס
./manage-server.sh status

# הפעלה מחדש
./manage-server.sh restart
```

### 4. עצירה ידנית (אם הסקריפטים לא עובדים)
```bash
# חיפוש תהליכים לפי שם הקובץ
ps aux | grep server_simple.js

# עצירת תהליך לפי PID (החלף XXXX במספר התהליך)
kill XXXX

# עצירה כפויה אם נדרש
kill -9 XXXX

# עצירת כל התהליכים על פורט 3001
lsof -ti:3001 | xargs kill
```

## מה הסקריפטים עושים?

### `kill-server.sh`
- מחפש ועוצר את כל התהליכים של `server_simple.js`
- עוצר תהליכים שרצים על פורט 3001
- עוצר תהליכי Chrome/Puppeteer קשורים (לווטסאפ)
- מנקה קבצים זמניים

### `manage-server.sh`
- **start** - מפעיל את השרת ברקע
- **stop** - עוצר את השרת
- **restart** - הפעלה מחדש
- **status** - בודק אם השרת פועל
- **logs** - מציג לוגים של השרת

## בעיות נפוצות ופתרונות

### השרת לא נעצר
```bash
# עצירה כפויה של כל תהליכי Node.js
pkill -f "node.*server_simple"

# עצירת כל התהליכים על הפורט
sudo lsof -ti:3001 | xargs sudo kill -9
```

### תהליכי Chrome תקועים
```bash
# עצירת כל תהליכי Chrome
pkill -f "chrome.*remote-debugging"

# ניקוי תיקיית Chrome זמנית
rm -rf /tmp/chrome-user-data
```

### בדיקה מה רץ על הפורט
```bash
# בדיקת מה רץ על פורט 3001
lsof -i:3001

# בדיקת כל תהליכי Node.js
ps aux | grep node
```

## טיפים

1. **תמיד השתמש ב-npm scripts** - הכי פשוט ובטוח
2. **בדוק סטטוס לפני הפעלה** - `./manage-server.sh status`
3. **צפה בלוגים אם יש בעיות** - `./manage-server.sh logs`
4. **אם הכל תקוע** - הפעל מחדש את הטרמינל או המחשב

## הפעלה מחדש מלאה
```bash
# עצירה מלאה
npm run kill

# המתנה קצרה
sleep 2

# הפעלה מחדש
npm start
# או לפיתוח
npm run dev
```
