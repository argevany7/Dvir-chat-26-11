# 📦 רשימת קבצים להעלאה לשרת

## ✅ קבצים חדשים שנוצרו (חובה להעלות):

```
config/
  └── constants.js          ← קובץ חדש - כל הקונסטנטות

utils/
  ├── mutex.js              ← קובץ חדש - מניעת race conditions
  ├── cleanup.js            ← קובץ חדש - ניקוי זיכרון אוטומטי
  └── gptOptimizer.js       ← קובץ חדש - אופטימיזציה של GPT calls

handlers/
  └── paymentHandler.js     ← קובץ חדש - טיפול מאוחד בתשלומים
```

## 🔄 קבצים שעודכנו (חובה להעלות):

```
server.js                   ← עודכן עם imports חדשים ותיקונים
```

## 📋 קבצים קיימים שלא השתנו (לא צריך להעלות):

```
ariel_system_prompt.json    ← לא השתנה
package.json                ← לא השתנה
```

---

## 🚀 הוראות העלאה (SCP/SFTP):

### אופציה 1: העלאה ידנית עם SCP

```bash
# יצירת התיקיות בשרת (אם לא קיימות)
ssh user@your-server "mkdir -p /path/to/project/config /path/to/project/utils /path/to/project/handlers"

# העלאת הקבצים החדשים
scp config/constants.js user@your-server:/path/to/project/config/
scp utils/mutex.js user@your-server:/path/to/project/utils/
scp utils/cleanup.js user@your-server:/path/to/project/utils/
scp utils/gptOptimizer.js user@your-server:/path/to/project/utils/
scp handlers/paymentHandler.js user@your-server:/path/to/project/handlers/

# העלאת הקובץ המעודכן
scp server.js user@your-server:/path/to/project/
```

### אופציה 2: העלאה עם tar (מאוחד)

```bash
# יצירת ארכיון רק עם הקבצים הנדרשים
tar -czf deploy-update.tar.gz \
  config/constants.js \
  utils/mutex.js \
  utils/cleanup.js \
  utils/gptOptimizer.js \
  handlers/paymentHandler.js \
  server.js

# העלאה לשרת
scp deploy-update.tar.gz user@your-server:/path/to/project/

# בשרת - פתיחת הארכיון
ssh user@your-server "cd /path/to/project && tar -xzf deploy-update.tar.gz && rm deploy-update.tar.gz"
```

### אופציה 3: העלאה עם rsync (מומלץ!)

```bash
# העלאה רק של הקבצים ששונו/נוצרו
rsync -avz \
  config/constants.js \
  utils/mutex.js \
  utils/cleanup.js \
  utils/gptOptimizer.js \
  handlers/paymentHandler.js \
  server.js \
  user@your-server:/path/to/project/
```

---

## ⚠️ חשוב לבדוק אחרי העלאה:

1. **וודא שהתיקיות קיימות:**
   ```bash
   ssh user@your-server "ls -la /path/to/project/config /path/to/project/utils /path/to/project/handlers"
   ```

2. **בדוק שהקוד תקין:**
   ```bash
   ssh user@your-server "cd /path/to/project && node -c server.js"
   ```

3. **הפעל מחדש את השרת:**
   ```bash
   ssh user@your-server "cd /path/to/project && pm2 restart server || systemctl restart your-service || node server.js"
   ```

---

## 📝 הערות:

- **לא צריך להעלות** את `node_modules` - השרת כבר יש לו
- **לא צריך להעלות** את `package.json` - לא השתנה
- **לא צריך להעלות** את `ariel_system_prompt.json` - לא השתנה
- **לא צריך להעלות** את ה-database - נשאר בשרת

---

## 🔍 בדיקה מהירה - רשימת קבצים:

```bash
# רשימת הקבצים להעלאה
ls -lh config/constants.js \
       utils/mutex.js \
       utils/cleanup.js \
       utils/gptOptimizer.js \
       handlers/paymentHandler.js \
       server.js
```







