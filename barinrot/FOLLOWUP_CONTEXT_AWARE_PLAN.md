# תכנית: הודעות פולואו-אפ מותאמות אישית עם סיכום שיחה

## מטרה
ליצור הודעות פולואו-אפ שמותאמות למה שנאמר בשיחה, במקום הודעות גנריות.

## התהליך המוצע

### 1. טריגר לסיכום שיחה
כאשר מתחיל פולואו-אפ (אחרי 10 שעות ללא מענה), המערכת תשלח את ההיסטוריה ל-GPT לסיכום.

### 2. מבנה הסיכום (JSON)
```json
{
  "client_phone": "972...",
  "name": "שם הלקוח",
  "child_name": "שם הילד (אם רלוונטי)",
  "isParentForChild": true/false,
  "conversation_summary": "סיכום קצר של השיחה",
  "pain_points": [
    "נקודת כאב 1 (למשל: חוסר ביטחון עצמי)",
    "נקודת כאב 2"
  ],
  "motivations": [
    "מוטיבציה 1",
    "מוטיבציה 2"
  ],
  "conversation_stage": "waiting_for_decision / waiting_for_response / stopped_responding / waiting_for_payment",
  "last_topic": "על מה דיברנו לאחרונה"
}
```

### 3. הודעות מותאמות לפי שלב השיחה

#### A. ממתין להחלטה (waiting_for_decision)
- לקוח אמר "אני צריך לחשוב"
- הודעה: "{שם}, חשבת על זה? {התייחסות לנקודת כאב ספציפית}"
- דוגמה: "משה, חשבת על האימונים? אני זוכר שדיברנו על הביטחון העצמי של דניאל - זה ממש יכול לעזור לו"

#### B. ממתין לתשובה (waiting_for_response)
- לקוח שאל שאלה אבל לא המשיך
- הודעה: "{שם}, מה דעתך על מה שדיברנו? {התייחסות ספציפית}"
- דוגמה: "אריאל, מה דעתך על האימונים שדיברנו עליהם? זה יכול להתאים לך בדיוק למה שסיפרת על הלחץ בעבודה"

#### C. הפסיק לענות (stopped_responding)
- השיחה הייתה טובה אבל הלקוח פתאום נעלם
- הודעה: "{שם}, מה קרה? {התייחסות לשיחה}"
- דוגמה: "יוסי, מה קרה? הייתה שיחה טובה על האימונים לדניאל, אשמח להמשיך"

#### D. ממתין לתשלום (waiting_for_payment)
- כבר קבעו אימון אבל לא שילם
- הודעה: "{שם}, שלחתי לך קישור לתשלום - קיבלת?"
- דוגמה: "משה, שלחתי לך את הקישור לתשלום לאימון של דניאל - הכל בסדר?"

### 4. שינויים נדרשים בקוד

#### שלב 1: יצירת סיכום בעת התחלת פולואו-אפ
```javascript
async function createConversationSummaryForFollowup(sessionId) {
    const phone = sessionId.replace('@c.us', '');
    const history = await loadConversationHistory(sessionId);
    
    // שליחה ל-GPT לסיכום
    const summary = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
            role: "system",
            content: `נתח את השיחה הבאה וצור סיכום JSON:
            
            ${history.map(m => `${m.role}: ${m.content}`).join('\n')}
            
            החזר JSON עם:
            - name: שם הלקוח
            - child_name: שם הילד (אם רלוונטי, אחרת null)
            - isParentForChild: האם זה הורה עבור ילד
            - conversation_summary: סיכום קצר (2-3 שורות)
            - pain_points: מערך של נקודות כאב שהלקוח הזכיר
            - motivations: למה הלקוח פנה
            - conversation_stage: waiting_for_decision / waiting_for_response / stopped_responding / waiting_for_payment
            - last_topic: על מה דיברנו לאחרונה`
        }],
        temperature: 0.1
    });
    
    const summaryData = JSON.parse(summary.choices[0].message.content);
    
    // שמירה ב-DB
    db.run(`INSERT INTO chat_summaries (client_phone, summary_data) VALUES (?, ?)`,
        [phone, JSON.stringify(summaryData)]);
    
    return summaryData;
}
```

#### שלב 2: שיפור generateFollowupMessage
```javascript
async function generateFollowupMessage(client, attempt, summary) {
    const name = client.name || 'היי';
    
    // הודעה 1 - מותאמת לשלב השיחה
    if (attempt === 1) {
        if (summary?.conversation_stage === 'waiting_for_decision') {
            return { 
                type: 'text', 
                message: `${name}, חשבת על האימונים? ${getContextualFollowup(summary)}`
            };
        } else if (summary?.conversation_stage === 'waiting_for_payment') {
            return { 
                type: 'text', 
                message: `${name}, שלחתי לך קישור לתשלום - קיבלת?`
            };
        } else if (summary?.conversation_stage === 'stopped_responding') {
            return { 
                type: 'text', 
                message: `${name}, מה קרה? ${getContextualFollowup(summary)}`
            };
        } else {
            return { 
                type: 'text', 
                message: `היי ${name}, מה דעתך על מה שדיברנו?`
            };
        }
    }
    
    // הודעה 2 - GIF (ללא שינוי)
    if (attempt === 2) {
        return { type: 'gif', message: null };
    }
    
    // הודעה 3 - אני זמין
    if (attempt === 3) {
        return { 
            type: 'text', 
            message: `היי ${name}, אני זמין לכל שאלה 😊`
        };
    }
    
    // הודעה 4 - אישית עם נקודות כאב
    if (attempt === 4) {
        if (summary?.pain_points?.length > 0) {
            const painPoint = summary.pain_points[0];
            const childName = summary.child_name || name;
            
            let message = `היי ${name}! 😊\n\n`;
            message += `אני זוכר שדיברנו על ${painPoint}. `;
            
            if (summary.isParentForChild) {
                message += `האימונים של דביר באמת יכולים לעזור ל${childName} עם זה.\n\n`;
            } else {
                message += `האימונים באמת יכולים לעזור לך עם זה.\n\n`;
            }
            
            message += `חבל לפספס את ההזדמנות הזו 💪`;
            
            return { type: 'text', message };
        }
    }
    
    // הודעות 5+ (ללא שינוי)
    // ...
}

function getContextualFollowup(summary) {
    if (!summary) return '';
    
    if (summary.pain_points?.length > 0) {
        const painPoint = summary.pain_points[0];
        if (summary.isParentForChild && summary.child_name) {
            return `זכור שדיברנו על ${painPoint} של ${summary.child_name} - זה ממש יכול לעזור`;
        } else {
            return `זכור שדיברנו על ${painPoint} - זה ממש יכול לעזור לך`;
        }
    }
    
    if (summary.last_topic) {
        return `אשמח להמשיך את השיחה שהתחלנו על ${summary.last_topic}`;
    }
    
    return 'אשמח לשמוע ממך';
}
```

### 5. עדכון checkAndStartFollowups
```javascript
async function checkAndStartFollowups() {
    // ... קוד קיים ...
    
    for (const client of clients) {
        try {
            // יצירת סיכום לפני התחלת פולואו-אפ
            const summary = await createConversationSummaryForFollowup(client.phone + '@c.us');
            
            const nextDate = calculateSmartFollowupStart();
            
            db.run(`UPDATE clients SET 
                    followup_enabled = TRUE,
                    followup_attempts = 0,
                    next_followup_date = ?,
                    updated_at = CURRENT_TIMESTAMP
                    WHERE phone = ?`,
                [nextDate.toISOString(), client.phone]);
            
            // ... המשך קוד ...
        } catch (error) {
            console.error('שגיאה ביצירת סיכום:', error);
        }
    }
}
```

## יתרונות
1. ✅ הודעות אישיות ורלוונטיות
2. ✅ התייחסות לנקודות כאב ספציפיות
3. ✅ התאמה לשלב השיחה
4. ✅ שיפור שיעור המרה

## דוגמאות לתרחישים

### תרחיש 1: הורה שדיבר על ביטחון עצמי
**שיחה מקורית:**
- הורה: "הבן שלי צריך ביטחון עצמי"
- אריאל: "איפה זה בא לידי ביטוי?"
- הורה: "הוא ביישן בבית הספר"
- [השיחה נעצרה]

**הודעת פולואו-אפ:**
"משה, חשבת על האימונים לדניאל? אני זוכר שדיברנו על הביטחון העצמי שלו - האימונים של דביר באמת יכולים לעזור לו עם זה 💪"

### תרחיש 2: מבוגר שרוצה לפרוק עצבים
**שיחה מקורית:**
- לקוח: "אני רוצה לפרוק עצבים"
- אריאל: "במה זה בא לידי ביטוי?"
- לקוח: "העבודה מלחיצה מאוד"
- [השיחה נעצרה]

**הודעת פולואו-אפ:**
"אריאל, מה דעתך על האימונים? זכור שדיברנו על הלחץ מהעבודה - האימונים באמת יכולים לעזור לך לפרוק את זה 🥊"

### תרחיש 3: קבע אימון אבל לא שילם
**שיחה מקורית:**
- אריאל: "הנה הקישור לתשלום: [קישור]"
- [אין תגובה]

**הודעת פולואו-אפ:**
"משה, שלחתי לך את הקישור לתשלום לאימון של דניאל ביום שני - הכל בסדר? 😊"

## סיכום
המערכת תיצור הודעות פולואו-אפ חכמות ומותאמות אישית שמתייחסות למה שנאמר בשיחה, במקום הודעות גנריות.
