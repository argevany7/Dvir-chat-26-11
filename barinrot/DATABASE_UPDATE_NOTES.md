# 📊 עדכון מערכת שמירת נתונים

## ✅ מה תוקן?

### 1. **עדכון טבלת appointments**
הוספנו עמודה חדשה:
```sql
ALTER TABLE appointments ADD COLUMN appointment_time TEXT
```

עכשיו הטבלה כוללת:
- `appointment_date` - תאריך (יחסי או מוחלט)
- `appointment_time` - שעה מדויקת
- `appointment_type` - סוג אימון (MMA/תאילנדי)
- `status` - סטטוס (scheduled/confirmed/cancelled)
- `payment_confirmed` - האם שילם

---

### 2. **שמירה מלאה של פרטי לקוח**
הפונקציה `saveAnalysisToDatabase` עכשיו שומרת:
- ✅ שם מלא
- ✅ שם פרטי
- ✅ גיל
- ✅ ניסיון קודם
- ✅ תאריך אימון
- ✅ שעת אימון
- ✅ lead_status = 'paid'
- ✅ payment_confirmed = TRUE

---

### 3. **שמירת appointments**
כל אימון ניסיון שמשולם נשמר בטבלה עם:
- מספר טלפון הלקוח
- תאריך מדויק
- שעה מדויקת
- סוג אימון
- סטטוס: 'confirmed'
- אישור תשלום: TRUE

---

### 4. **עדכון בזמן אמת במהלך השיחה**
פונקציה חדשה `extractAndUpdateClientInfo` מזהה ומעדכנת:

#### זיהוי שם:
```
בוט: "נעים להכיר דני"
→ name = "דני" נשמר למאגר
```

#### זיהוי גיל:
```
לקוח: "28"
→ age = 28 נשמר למאגר
```

#### זיהוי ניסיון:
```
לקוח: "שנתיים קראטה"
→ experience = "שנתיים קראטה" נשמר למאגר
```

---

## 🎯 זרימת עדכון נתונים

### שלב 1: הודעה ראשונה (Cold Lead)
```sql
INSERT INTO clients (phone, lead_status) VALUES ('972501234567', 'cold')
```

### שלב 2: במהלך השיחה (Warm Lead)
```sql
UPDATE clients SET 
    name = 'דני',
    age = 28,
    experience = 'שנתיים קראטה',
    lead_status = 'warm'
WHERE phone = '972501234567'
```

### שלב 3: קישור תשלום נשלח (Hot Lead)
```sql
UPDATE clients SET 
    lead_status = 'hot'
WHERE phone = '972501234567'
```

### שלב 4: לקוח אמר "שילמתי" (Paid)
```sql
-- עדכון בטבלת clients:
UPDATE clients SET 
    full_name = 'דני כהן',
    appointment_date = '10/10/2025',
    appointment_time = '20:15',
    lead_status = 'paid',
    payment_confirmed = TRUE
WHERE phone = '972501234567'

-- הוספה לטבלת appointments:
INSERT INTO appointments (
    client_phone,
    appointment_date,
    appointment_time,
    appointment_type,
    status,
    payment_confirmed
) VALUES (
    '972501234567',
    '10/10/2025',
    '20:15',
    'MMA',
    'confirmed',
    TRUE
)

-- שמירת סיכום JSON:
INSERT INTO chat_summaries (
    client_phone,
    summary_json
) VALUES (
    '972501234567',
    '{"fullName":"דני כהן","age":28,...}'
)
```

---

## 📋 שאילתות שימושיות

### צפייה בכל הלידים לפי סטטוס:
```sql
SELECT 
    phone,
    name,
    age,
    lead_status,
    payment_confirmed,
    created_at
FROM clients
ORDER BY 
    CASE lead_status
        WHEN 'paid' THEN 1
        WHEN 'hot' THEN 2
        WHEN 'warm' THEN 3
        WHEN 'cold' THEN 4
    END,
    updated_at DESC;
```

### צפייה בכל האפוינטמנטים:
```sql
SELECT 
    a.id,
    a.client_phone,
    c.name,
    c.age,
    a.appointment_date,
    a.appointment_time,
    a.appointment_type,
    a.status,
    a.payment_confirmed,
    a.created_at
FROM appointments a
LEFT JOIN clients c ON a.client_phone = c.phone
ORDER BY a.created_at DESC;
```

### ספירת לידים לפי סטטוס:
```sql
SELECT 
    lead_status,
    COUNT(*) as count
FROM clients
GROUP BY lead_status;
```

### צפייה בסיכומי שיחות אחרונים:
```sql
SELECT 
    cs.client_phone,
    c.name,
    json_extract(cs.summary_json, '$.fullName') as full_name,
    json_extract(cs.summary_json, '$.age') as age,
    json_extract(cs.summary_json, '$.conversationSummary') as summary,
    cs.created_at
FROM chat_summaries cs
LEFT JOIN clients c ON cs.client_phone = c.phone
ORDER BY cs.created_at DESC
LIMIT 10;
```

---

## 🎉 סיכום

המערכת עכשיו:
- ✅ **עוקבת אחר כל שלב** - cold → warm → hot → paid
- ✅ **שומרת פרטים מלאים** - שם, גיל, ניסיון, כל מה שצריך
- ✅ **מתעדת אפוינטמנטים** - בטבלה נפרדת עם כל הפרטים
- ✅ **מעדכנת בזמן אמת** - במהלך השיחה, לא רק בסוף
- ✅ **שומרת סיכומי JSON** - לניתוח מתקדם בעתיד

**כל הנתונים שמורים ומאורגנים! 🚀**

---

_עודכן: 5 באוקטובר 2025_



