# 🧪 מדריך בדיקה מהירה - חסימת לקוחות

## בדיקה 1: סימולציה של לקוח שמבקש להפסיק

### צעדים:

1. **צור שיחה עם לקוח:**
   - שלח הודעה מלקוח בודק
   - השרת יתחיל שיחה

2. **אל תענה 10 שעות:**
   - עדכן ידנית את `last_message_date`:
   ```sql
   UPDATE clients 
   SET last_message_date = datetime('now', '-11 hours') 
   WHERE phone = '972501234567';
   ```
   
   - הפעל בדיקה מיידית:
   ```bash
   curl -X POST http://localhost:3001/api/check-followups
   ```

3. **הלקוח יקבל הודעת follow-up:**
   ```
   "היי [שם]! 😊 עדיין מעוניין באימונים?"
   ```

4. **תגובת הלקוח: "די, לא מעוניין"**
   - השרת ישלח: "למה? אשמח להבין..."
   
5. **הלקוח לא עונה (או עונה שוב שלא מעוניין):**
   - אחרי 12 שעות (או עדכון ידני):
   ```sql
   UPDATE clients 
   SET stop_request_date = datetime('now', '-13 hours') 
   WHERE phone = '972501234567';
   ```
   
   - הפעל:
   ```bash
   curl -X POST http://localhost:3001/api/check-followups
   ```

### מה צריך לקרות:

**בלוגים תראה:**
```
🚫 חוסם לקוח לחלוטין: [שם הלקוח]
✅ 972501234567 נוסף ל-blocked_contacts
✅ כל סוגי הפולואו-אפ נעצרו עבור 972501234567
✅ לקוח 972501234567 נחסם לחלוטין ולא יקבל עוד הודעות
```

**במסד הנתונים:**
```sql
-- בדיקה 1: הלקוח ב-blocked_contacts
SELECT * FROM blocked_contacts WHERE phone = '972501234567';
-- צריך להיות שם!

-- בדיקה 2: כל הפולואו-אפים נעצרו
SELECT phone, followup_stopped, followup_enabled, 
       early_rejection_followup_enabled 
FROM clients 
WHERE phone = '972501234567';
-- צריך לראות:
-- followup_stopped = 1 (TRUE)
-- followup_enabled = 0 (FALSE)
-- early_rejection_followup_enabled = 0 (FALSE)
```

---

## בדיקה 2: ודא שלקוחות חסומים לא מקבלים הודעות

### צעדים:

1. **בדוק רשימת לקוחות בפולואו-אפ:**
   ```bash
   curl http://localhost:3001/api/followup-list
   ```

2. **הלקוח החסום לא צריך להיות ברשימה!**

3. **נסה לשלוח ידנית (לבדיקה):**
   ```bash
   curl -X POST http://localhost:3001/api/test-followup \
     -H "Content-Type: application/json" \
     -d '{"phone": "0501234567"}'
   ```
   
   **צריך לראות:**
   ```json
   {
     "error": "Client is blocked or followup stopped"
   }
   ```

---

## בדיקה 3: לקוח בפולואו-אפ שבועי

### תרחיש:
לקוח שנדחה מוקדם נמצא בפולואו-אפ שבועי ומבקש להפסיק.

### צעדים:

1. **הפעל פולואו-אפ שבועי ללקוח:**
   ```sql
   UPDATE clients 
   SET early_rejection_followup_enabled = 1,
       early_rejection_next_followup = datetime('now', '-1 hour')
   WHERE phone = '972501234567';
   ```

2. **הפעל בדיקה:**
   ```bash
   curl -X POST http://localhost:3001/api/check-followups
   ```

3. **הלקוח יקבל הודעה שבועית**

4. **הלקוח עונה: "די בבקשה"**
   - השרת צריך **מיד** לחסום לחלוטין
   - לא מחכה 12 שעות!

### מה צריך לקרות:

**בלוגים:**
```
📨 לקוח נמצא בפולואו-אפ שבועי (early rejection) - בודק תגובה...
✋ לקוח ביקש להפסיק - חוסם לחלוטין
🚫 חוסם לקוח לחלוטין: [שם]
✅ 972501234567 נוסף ל-blocked_contacts
✅ כל סוגי הפולואו-אפ נעצרו
```

**במסד הנתונים:**
```sql
SELECT * FROM blocked_contacts WHERE phone = '972501234567';
-- הלקוח שם!

SELECT early_rejection_followup_enabled, followup_stopped 
FROM clients 
WHERE phone = '972501234567';
-- שניהם FALSE/TRUE (נעצרו)
```

---

## בדיקה 4: API endpoints

### 1. סטטוס לקוח:
```bash
curl http://localhost:3001/api/followup-status/0501234567
```

**אם חסום:**
```json
{
  "success": true,
  "client": {
    "followupEnabled": false,
    "followupStopped": true,
    "status": "חסום"
  }
}
```

### 2. רשימת כל הלקוחות בפולואו-אפ:
```bash
curl http://localhost:3001/api/followup-list
```

**לקוחות חסומים לא צריכים להופיע ברשימה!**

---

## תיקון מהיר אם משהו לא עובד

### בעיה: לקוח לא נחסם

**פתרון ידני:**
```sql
-- הוסף ידנית ל-blocked_contacts
INSERT OR IGNORE INTO blocked_contacts (phone, full_name, reason)
VALUES ('972501234567', 'שם הלקוח', 'חסימה ידנית');

-- עצור את כל הפולואו-אפים
UPDATE clients SET
  followup_stopped = 1,
  followup_enabled = 0,
  early_rejection_followup_enabled = 0,
  awaiting_stop_response = 0
WHERE phone = '972501234567';
```

### בעיה: לקוח ממשיך לקבל הודעות

**בדוק:**
1. האם הוא ב-`blocked_contacts`?
   ```sql
   SELECT * FROM blocked_contacts WHERE phone = '972501234567';
   ```

2. האם כל הפולואו-אפים נעצרו?
   ```sql
   SELECT followup_enabled, early_rejection_followup_enabled, followup_stopped
   FROM clients WHERE phone = '972501234567';
   ```

3. בדוק לוגים - האם `blockClientCompletely()` נקראה?

---

## לוגים שכדאי לחפש

### לוגים טובים (הכל עובד):
```
🚫 חוסם לקוח לחלוטין: דני
✅ 972501234567 נוסף ל-blocked_contacts
✅ כל סוגי הפולואו-אפ נעצרו עבור 972501234567
✅ לקוח 972501234567 נחסם לחלוטין ולא יקבל עוד הודעות
```

### לוגים רעים (בעיה):
```
❌ שגיאה בהוספה ל-blocked_contacts: [שגיאה]
❌ שגיאה בעצירת כל סוגי הפולואו-אפ: [שגיאה]
```

אם אתה רואה שגיאות כאלה - בדוק את מסד הנתונים.

---

## סיכום מהיר ✅

✅ **לקוח שמבקש להפסיק:**
- נוסף ל-`blocked_contacts`
- כל הפולואו-אפים נעצרים
- לא מקבל עוד הודעות

✅ **בדיקות אוטומטיות:**
- מדלגות על לקוחות ב-`blocked_contacts`
- בלוגים ברורים

✅ **API:**
- מראה סטטוס נכון
- לקוחות חסומים לא ברשימה

---

**תאריך:** 11 בנובמבר 2025  
**גרסה:** 1.0

