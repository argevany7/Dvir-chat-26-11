# ניקוי מאגר הנתונים / Database Cleanup

## סקריפטים זמינים / Available Scripts

### 1. ניקוי עם אישורים (מומלץ) / Cleanup with Confirmations (Recommended)

```bash
# באמצעות npm
npm run clean-db

# או ישירות
node clean_database.js
```

**מה זה עושה:**
- מבקש אישור כפול מהמשתמש
- מציג סטטיסטיקות לפני המחיקה
- מנקה את כל הטבלאות: `clients`, `conversations`, `appointments`
- מאפס את מונה ה-ID של כל טבלה
- מציג דוח מפורט על התהליך

### 2. ניקוי מהיר (ללא אישורים) / Quick Cleanup (No Confirmations)

```bash
# באמצעות npm
npm run clean-db-quick

# או ישירות
node quick_clean.js
```

**מה זה עושה:**
- מנקה מיידית ללא אישורים
- מהיר לבדיקות ופיתוח
- מנקה את כל הטבלאות ומאפס מונים

## ⚠️ אזהרות חשובות / Important Warnings

1. **פעולה בלתי הפיכה** - לאחר המחיקה לא ניתן לשחזר את הנתונים
2. **עצור את השרת** - וודא שהשרת לא פועל בזמן הניקוי
3. **גיבוי** - אם יש נתונים חשובים, עשה גיבוי לפני הניקוי

## מתי להשתמש / When to Use

### ניקוי עם אישורים:
- כשיש נתונים אמיתיים במערכת
- לפני העלאה לפרודקשן
- כשרוצים להתחיל מחדש באופן מבוקר

### ניקוי מהיר:
- בזמן פיתוח ובדיקות
- כשרוצים לנקות מהר נתוני בדיקה
- אוטומציה של תהליכי בדיקה

## דוגמת שימוש / Usage Example

```bash
# עצור את השרת
npm run stop

# נקה את מאגר הנתונים
npm run clean-db

# הפעל את השרת מחדש
npm start
```

## מבנה הטבלאות שנמחקות / Tables Being Cleaned

1. **clients** - מידע על לקוחות (שם, גיל, טלפון, וכו')
2. **conversations** - היסטוריית שיחות עם לקוחות
3. **appointments** - פגישות שנקבעו

## בעיות נפוצות / Common Issues

### "Database is locked"
```bash
# עצור את השרת קודם
npm run stop
# ואז נקה
npm run clean-db
```

### "Permission denied"
```bash
# וודא שיש הרשאות
chmod +x clean_database.js
chmod +x quick_clean.js
```

### "Module not found"
```bash
# וודא שהתקנת את התלויות
npm install
```
