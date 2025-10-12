# עדכון: הבוט לא מציג את עצמו מחדש ללקוחות קיימים
## Update: Bot No Longer Re-introduces Itself to Returning Clients

**תאריך / Date:** 5 אוקטובר 2025 / October 5, 2025

---

## 🎯 מטרת העדכון / Update Goal

מנע מג'ורג' להציג את עצמו מחדש ("היי! אני ג'ורג', העוזר של דביר...") כאשר לקוח שכבר יש לו היסטוריית שיחה שולח הודעה חדשה (כמו "היי").

במקום זאת, הבוט עכשיו מגיב בצורה חברית וטבעית יותר, כמו:
- "היי [שם]! מה נשמע? יש משהו שתרצה לשאול? 😊"
- "היי! מה נשמע? איך אפשר לעזור? 😊"

Prevent George from re-introducing himself ("Hi! I'm George, Dvir's assistant...") when a client with existing conversation history sends a new message (like "Hey").

Instead, the bot now responds in a more friendly and natural way, like:
- "Hey [name]! What's up? Do you have any questions? 😊"
- "Hey! What's up? How can I help? 😊"

---

## 🔧 שינויים טכניים / Technical Changes

### 1. **פונקציה `buildGeorgeSystemPrompt`**

**לפני / Before:**
```javascript
function buildGeorgeSystemPrompt() { ... }
```

**אחרי / After:**
```javascript
function buildGeorgeSystemPrompt(hasConversationHistory = false, clientName = null) { ... }
```

הפונקציה מקבלת כעת שני פרמטרים:
- `hasConversationHistory` - האם יש היסטוריית שיחה ללקוח
- `clientName` - שם הלקוח מהמאגר (אם קיים)

The function now receives two parameters:
- `hasConversationHistory` - whether the client has conversation history
- `clientName` - client's name from database (if exists)

### 2. **פרומפט דינמי / Dynamic Prompt**

הפרומפט המערכת כעת משתנה דינמית:

**ללקוח קיים עם היסטוריה / For returning client:**
```
⚠️ חשוב! הלקוח הזה כבר שוחח איתך בעבר - אל תציג את עצמך שוב!
- אם זיהית את השם מההיסטוריה: "היי [שם]! מה נשמע? יש משהו שתרצה לשאול? 😊"
- אם אין שם בהיסטוריה: "היי! מה נשמע? איך אפשר לעזור? 😊"
- תהיה חברי וקליל, כאילו אתם כבר מכירים
- אל תגיד "אני ג'ורג'" או תציג את עצמך שוב
```

**ללקוח חדש / For new client:**
```
- אם הלקוח מכיר את דביר: "היי! אני ג'ורג', העוזר של דביר 😊 איך אפשר לעזור לך היום?"
- אם זה קשר קר: "היי! אני ג'ורג', העוזר של דביר בסון - מאמן אומנויות לחימה 😊 איך קוראים לך?"
```

### 3. **קריאה לפונקציה / Function Call**

**בתוך `processMessage`:**
```javascript
// בדיקה אם יש שם בהיסטוריה
const phone = sessionId.replace('@c.us', '');
const clientInfo = await new Promise((resolve) => {
    db.get(`SELECT name FROM clients WHERE phone = ?`, [phone], (err, row) => {
        if (err || !row) resolve(null);
        else resolve(row);
    });
});

const hasHistory = conversationHistory.length > 0;
const clientName = clientInfo?.name || null;

const messages = [
    {
        role: "system",
        content: buildGeorgeSystemPrompt(hasHistory, clientName)
    },
    ...conversationHistory,
    ...
];
```

---

## 📝 קבצים שעודכנו / Updated Files

1. **`server.js`** - השרת הראשי / Main server
2. **`server_new.js`** - השרת החלופי / Alternative server

---

## ✅ תוצאה / Result

עכשיו כשלקוח קיים חוזר ואומר "היי" או "שלום", הוא יקבל תגובה חברית ומזדמנת במקום הצגה עצמית מלאה מחדש, מה שעושה את השיחה טבעית ופחות חוזרת על עצמה.

Now when a returning client says "Hey" or "Hello", they receive a friendly casual response instead of a full re-introduction, making the conversation more natural and less repetitive.

---

## 🧪 בדיקה / Testing

לבדיקת התכונה:

1. צור שיחה חדשה עם לקוח חדש - וודא שג'ורג' מציג את עצמו
2. סגור את השיחה
3. שלח הודעה חדשה מאותו מספר - וודא שג'ורג' לא מציג את עצמו שוב

To test the feature:

1. Start a new conversation with a new client - verify George introduces himself
2. Close the conversation
3. Send a new message from the same number - verify George doesn't re-introduce himself

---

**נוצר על ידי / Created by:** AI Assistant (Claude)
**תאריך / Date:** 5 אוקטובר 2025 / October 5, 2025

