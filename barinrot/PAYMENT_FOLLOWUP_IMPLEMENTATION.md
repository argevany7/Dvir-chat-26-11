# תיעוד יישום מערכת תזכורת תשלום

## דרישות המשימה

1. **מניעת "נתראה באימון" ללקוחות שלא שילמו**
   - הבוט לא יאמר "נתראה באימון" או "נתראה שם" ללקוח שלא ביצע תשלום
   - הודעת האישור תישלח רק אחרי תשלום מאושר

2. **תזכורת לאחר שליחת סרטון הגעה**
   - אחרי שליחת קישור התשלום, בקש שם מלא
   - רק אחרי ששם מלא התקבל והתשלום אושר - שלח סרטון הגעה

3. **מערכת פולואו-אפ לתשלום**
   - הוספת שלב "ממתין לתשלום" (waiting_for_payment)
   - אחרי 5 שעות מקבלת השם המלא - שלח תזכורת
   - הודעת התזכורת: "מחכה לעדכון ששילמת"

4. **טיפול בסירוב**
   - אם לקוח אומר שהוא לא רוצה - אל תכניס אותו ללופ אינסופי
   - בצע פולואו-אפ מותאם לפי הלוגיקה הקיימת

## שינויים נדרשים

### 1. שדות חדשים ב-Database

```sql
ALTER TABLE clients ADD COLUMN payment_link_sent_date DATETIME;
ALTER TABLE clients ADD COLUMN full_name_received BOOLEAN DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN full_name_received_date DATETIME;
ALTER TABLE clients ADD COLUMN waiting_for_payment BOOLEAN DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN payment_reminder_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN payment_reminder_date DATETIME;
```

### 2. עדכון תהליך שליחת קישור תשלום

- כאשר נשלח קישור תשלום:
  - עדכן `payment_link_sent_date`
  - עדכן `lead_status` ל-'hot'
  - המתן לשם מלא

### 3. עדכון תהליך קבלת שם מלא

- כאשר התקבל שם מלא:
  - עדכן `full_name_received = TRUE`
  - עדכן `full_name_received_date`
  - עדכן `waiting_for_payment = TRUE`
  - התחל ספירה לאחור של 5 שעות

### 4. מערכת תזכורת תשלום (5 שעות)

```javascript
async function checkPaymentReminders() {
    const fiveHoursAgo = new Date(Date.now() - (5 * 60 * 60 * 1000)).toISOString();
    
    db.all(`SELECT * FROM clients 
            WHERE waiting_for_payment = TRUE 
            AND payment_confirmed = FALSE
            AND payment_reminder_sent = FALSE
            AND full_name_received_date IS NOT NULL
            AND full_name_received_date <= ?`,
        [fiveHoursAgo],
        async (err, clients) => {
            // שלח תזכורת לכל לקוח
        }
    );
}
```

### 5. הודעת תזכורת

```javascript
const reminderMessage = `היי ${client.name || ''}! מחכה לעדכון ששילמת 😊`;
```

### 6. עדכון הודעת אישור תשלום

הודעת "נתראה שם" תישלח **רק** אחרי אישור תשלום:

```javascript
if (isPayment && client.payment_confirmed === FALSE) {
    // עדכן payment_confirmed = TRUE
    // עדכן waiting_for_payment = FALSE
    // שלח הודעת אישור עם "נתראה שם" + כתובת + סרטון
}
```

### 7. טיפול בסירוב תשלום

אם לקוח אומר "אני לא רוצה" / "ביטלתי" / "לא מעוניין":
- עדכן `waiting_for_payment = FALSE`
- עדכן `followup_stopped = TRUE` (למנוע לופ)
- שלח הודעת סגירה מנומסת

## טיימרים

1. **טיימר קיים (30 דקות)**: בדיקת פולואו-אפ רגיל
2. **טיימר חדש (30 דקות)**: בדיקת תזכורות תשלום

## זרימת תהליך מלאה

```
1. לקוח מעוניין → שיחה → קביעת תאריך
2. לקוח מאשר תאריך → שליחת קישור תשלום
   ↓ (payment_link_sent_date מתעדכן)
3. בקשת שם מלא
   ↓
4. לקוח מספק שם מלא
   ↓ (full_name_received = TRUE, waiting_for_payment = TRUE)
5. המתנה 5 שעות
   ↓
6A. אם לקוח שילם → אישור + "נתראה שם" + כתובת + סרטון
6B. אם לא שילם → תזכורת "מחכה לעדכון ששילמת"
   ↓
7A. אם מאשר תשלום → אישור כמו 6A
7B. אם מסרב → סגירה מנומסת + עצירת פולואו-אפ
```

## הערות חשובות

- **אל תשלח "נתראה באימון" ללקוח שלא שילם**
- **שם מלא מתבקש רק אחרי שליחת קישור תשלום**
- **תזכורת נשלחת רק פעם אחת (5 שעות אחרי שם מלא)**
- **אם לקוח מסרב - אל תמשיך לשלוח תזכורות**
