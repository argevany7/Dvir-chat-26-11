#!/bin/bash
# סקריפט להעלאת השינויים לשרת

# הגדרות (תשנה לפי השרת שלך)
SERVER_USER="your-username"
SERVER_HOST="your-server.com"
SERVER_PATH="/path/to/project"

echo "📦 מכין העלאה לשרת..."

# יצירת תיקיות בשרת (אם לא קיימות)
echo "📁 יוצר תיקיות בשרת..."
ssh ${SERVER_USER}@${SERVER_HOST} "mkdir -p ${SERVER_PATH}/config ${SERVER_PATH}/utils ${SERVER_PATH}/handlers"

# העלאת הקבצים
echo "⬆️  מעלה קבצים..."
scp config/constants.js ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/config/
scp utils/mutex.js ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/utils/
scp utils/cleanup.js ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/utils/
scp utils/gptOptimizer.js ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/utils/
scp handlers/paymentHandler.js ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/handlers/
scp server.js ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/

echo "✅ הקבצים הועלו בהצלחה!"

# בדיקת תקינות
echo "🔍 בודק תקינות קוד..."
ssh ${SERVER_USER}@${SERVER_HOST} "cd ${SERVER_PATH} && node -c server.js && echo '✅ הקוד תקין!' || echo '❌ יש שגיאות בקוד!'"

echo ""
echo "🎉 סיום! עכשיו הפעל מחדש את השרת:"
echo "   ssh ${SERVER_USER}@${SERVER_HOST} 'cd ${SERVER_PATH} && pm2 restart server'"
