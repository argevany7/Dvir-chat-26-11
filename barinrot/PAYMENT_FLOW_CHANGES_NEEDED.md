# שינויים הנדרשים - מעגל תשלום משופר

## המטרה
למנוע מהבוט לומר "נתראה באימון" לפני שהלקוח שילם בפועל.

## השדות שהוספנו ל-DB (כבר קיימים!)
```sql
payment_link_sent_date DATETIME
full_name_received BOOLEAN DEFAULT FALSE
full_name_received_date DATETIME
waiting_for_payment BOOLEAN DEFAULT FALSE
payment_reminder_sent BOOLEAN DEFAULT FALSE
payment_reminder_date DATETIME
```

## השינויים הנדרשים בקוד

### 1. בפונקציה buildGeorgeSystemPrompt
**מיקום**: בסעיף "סדר פעולות - קריטי"

**מה לשנות**:
```
BEFORE:
1. הצע תאריכים ושעות
2. הלקוח מאשר תאריך ושעה
3. **שלח קישור תשלום**
4. אחרי שליחת הקישור, **עכשיו בקש שם מלא:**
5. הלקוח מספק שם מלא
6. הלקוח משלם
7. אישור ושליחת כתובת וסרטון הגעה

AFTER:
1. הצע תאריכים ושעות
2. הלקוח מאשר תאריך ושעה
3. **שלח קישור תשלום**
4. אחרי שליחת הקישור, **בקש שם מלא ממש עכשיו**
5. הלקוח מספק שם מלא
6. **אישור קבלת שם** - "תודה! עכשיו אחרי שתשלם המקום שלך ישמר"
7. **המתן לאישור תשלום**
8. הלקוח משלם
9. **רק עכשיו** - אישור ושליחת כתובת וסרטון הגעה + "נתראה באימון"
```

**חשוב**:
⚠️ אחרי שליחת קישור תשלום - הבוט לא אומר "נתראה באימון" עד שהלקוח אישר תשלום!

### 2. בפונקציה processMessage
**להוסיף לוגיקה חדשה אחרי איתור שנשלח קישור תשלום**:

```javascript
// אחרי השורה:
const paymentLinkSent = client && client.lead_status === 'hot' && !client.payment_confirmed;

// להוסיף:

// ====== בדיקה: האם זו בקשת שם מלא? ======
if (paymentLinkSent && !client.full_name_received && !client.waiting_for_payment) {
    // בדוק אם זו תשובה לבקשת שם מלא
    const isFullNameResponse = /* לוגיקה לזהות אם זה שם מלא */;
    
    if (isFullNameResponse) {
        // עדכן ב-DB
        await updateClient({
            full_name: message,
            full_name_received: true,
            full_name_received_date: new Date(),
            waiting_for_payment: true,
            payment_link_sent_date: new Date()
        });
        
        // תשובת הבוט - לא "נתראה באימון"!
        const response = "תודה! קיבלתי את השם. עכשיו כשהתשלום יאושר המקום שלך ישמר 😊";
        
        await saveConversation(sessionId, 'user', message);
        await saveConversation(sessionId, 'assistant', response);
        
        return response;
    }
}

// ====== בדיקה: האם הלקוח ממתין לתשלום? ======
if (paymentLinkSent && client.waiting_for_payment && !client.payment_confirmed) {
    // הלקוח כבר נתן שם מלא ועכשיו ממתין לאישור תשלום
    
    // בדוק אם זה אישור תשלום
    const isPayment = await detectPaymentWithGPT(message, conversationHistory);
    
    if (isPayment) {
        // עדכן DB
        await updateClient({
            payment_confirmed: true,
            waiting_for_payment: false
        });
        
        // **רק עכשיו** שולחים "נתראה באימון"
        const response = buildPaymentConfirmedMessage(client);
        return response;
    }
    
    // אם זה לא אישור תשלום - המשך רגיל אבל בלי "נתראה באימון"
}
```

### 3. תזכורת תשלום אחרי 5 שעות

**פונקציה חדשה**:
```javascript
async function checkPaymentReminders() {
    const fiveHoursAgo = new Date(Date.now() - (5 * 60 * 60 * 1000)).toISOString();
    
    db.all(`SELECT * FROM clients 
            WHERE waiting_for_payment = TRUE 
            AND payment_confirmed = FALSE
            AND payment_reminder_sent = FALSE
            AND payment_link_sent_date IS NOT NULL
            AND payment_link_sent_date <= ?`,
        [fiveHoursAgo],
        async (err, clients) => {
            if (err || !clients || clients.length === 0) return;
            
            for (const client of clients) {
                const name = client.name || 'היי';
                const reminderMessage = `${name}, עדכן אותי בבקשה כשתשלם כדי שנשמור את המקום שלך 😊`;
                
                await whatsappClient.sendMessage(client.phone + '@c.us', reminderMessage);
                
                // עדכון שנשלחה תזכורת
                db.run(`UPDATE clients SET 
                        payment_reminder_sent = TRUE,
                        payment_reminder_date = CURRENT_TIMESTAMP
                        WHERE phone = ?`,
                    [client.phone]
                );
                
                await saveConversation(client.phone + '@c.us', 'assistant', reminderMessage);
            }
        }
    );
}
```

**להוסיף לטיימר**:
```javascript
whatsappClient.on('ready', () => {
    // ...קוד קיים...
    
    // תזכורת תשלום כל 30 דקות
    setInterval(async () => {
        console.log('🔍 בדיקת תזכורות תשלום...');
        await checkPaymentReminders();
    }, 30 * 60 * 1000);
});
```

## סיכום התזרים החדש

1. **לקוח מאשר תאריך/שעה** → הבוט שולח קישור תשלום
2. **הבוט שואל שם מלא** → ממתין לשם מלא
3. **לקוח שולח שם מלא** → הבוט: "תודה! כשתשלם המקום שלך ישמר" (בלי "נתראה באימון"!)
4. **מערכת מעדכנת**: `waiting_for_payment = TRUE`
5. **אם עברו 5 שעות ללא תשלום** → תזכורת: "עדכן אותי כשתשלם"
6. **לקוח אומר ששילם** → הבוט מזהה תשלום עם GPT
7. **רק עכשיו** → "נתראה באימון!" + סרטון הגעה

## הערות חשובות

⚠️ **החוק החדש**: הבוט לא יגיד "נתראה באימון" עד שהלקוח אישר תשלום בפועל!

✅ **יתרונות**:
- שומר מקום רק למי ששילם
- ברור ללקוח שצריך לשלם
- תזכורת אוטומטית אחרי 5 שעות
- מונע בלבול
