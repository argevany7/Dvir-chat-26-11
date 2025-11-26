# Shabbat Follow-up Implementation
# יישום שבת במערכת הפולואו-אפ

## תיאור / Description

**עברית:**
נוספו כללים למניעת שליחת הודעות פולואו-אפ בשבת (מיום שישי בשעה 18:00 עד יום ראשון בשעה 08:00).

**English:**
Added rules to prevent sending follow-up messages on Shabbat (from Friday 18:00 to Sunday 08:00).

---

## שינויים שבוצעו / Changes Made

### 1. פונקציות עזר חדשות / New Helper Functions

#### `isShabbat(date)`
בודקת האם תאריך נתון הוא בשבת.

Checks if a given date is during Shabbat.

**זמני שבת / Shabbat Times:**
- שישי מ-18:00 ואילך / Friday from 18:00 onwards
- כל יום שבת / All of Saturday
- ראשון עד 08:00 / Sunday until 08:00

#### `getNextAfterShabbat(date)`
מחזירה את המועד הבא אחרי שבת (ראשון 08:00 + דקות רנדומליות).

Returns the next time after Shabbat (Sunday 08:00 + random minutes).

#### `ensureNotShabbat(date)`
מוודאת שמועד נתון אינו בשבת, ואם כן - מחזירה את המועד לאחר השבת.

Ensures a given date is not during Shabbat, and if it is - returns the date after Shabbat.

---

### 2. פונקציות שעודכנו / Updated Functions

הפונקציות הבאות עודכנו להשתמש ב-`ensureNotShabbat()`:

The following functions were updated to use `ensureNotShabbat()`:

1. **`calculateSmartFollowupStart()`** - תזמון התחלת פולואו-אפ אוטומטי (10 שעות)
   - Scheduling automatic follow-up start (10 hours)

2. **`calculateNextFollowupDate(attempts)`** - חישוב מועד הפולואו-אפ הבא
   - Calculating next follow-up date

3. **`calculateBiWeeklyFollowup()`** - חישוב מועד פולואו-אפ שבועיים
   - Calculating bi-weekly follow-up date

4. **`calculateEarlyRejectionNextFollowup(attempt)`** - חישוב מועד פולואו-אפ לדחייה מוקדמת
   - Calculating early rejection follow-up date

5. **`checkFollowupSchedule()`** - בדיקה ושליחת הודעות פולואו-אפ
   - Checking and sending follow-up messages
   - **הוספה:** בדיקה כפולה בתחילת הפונקציה וגם בעת שליחת כל הודעה
   - **Added:** Double check at the beginning of the function and when sending each message

---

## התנהגות המערכת / System Behavior

### לפני השינוי / Before Changes
- ❌ הודעות פולואו-אפ יכלו להישלח בשבת
- ❌ Follow-up messages could be sent on Shabbat

### אחרי השינוי / After Changes
- ✅ המערכת לא שולחת הודעות בשבת
- ✅ The system does not send messages on Shabbat

- ✅ אם מועד מתוכנן חל בשבת - הוא נדחה אוטומטית לראשון בשעה 08:00 (+ דקות רנדומליות)
- ✅ If a scheduled time falls on Shabbat - it is automatically postponed to Sunday at 08:00 (+ random minutes)

- ✅ הפונקציה `checkFollowupSchedule()` בודקת בתחילת ריצה האם זה שבת - אם כן, מדלגת על הבדיקה כולה
- ✅ The `checkFollowupSchedule()` function checks at the start if it's Shabbat - if so, skips the entire check

---

## דוגמאות / Examples

### דוגמה 1: תזמון בשישי אחה"צ
**Example 1: Scheduling on Friday afternoon**

```javascript
// נניח שעכשיו שישי 17:00
// Let's say it's Friday 17:00
const now = new Date('2024-11-15T17:00:00'); // שישי 17:00

// לקוח לא הגיב 10 שעות -> התחלת פולואו-אפ
// Client didn't respond for 10 hours -> starting follow-up
const followupDate = calculateSmartFollowupStart();
// תוצאה: ראשון 08:15 (נדחה מהשבת)
// Result: Sunday 08:15 (postponed from Shabbat)
```

### דוגמה 2: הודעה מתוזמנת לשבת
**Example 2: Message scheduled for Shabbat**

```javascript
// הודעה מתוזמנת לשבת 15:00
// Message scheduled for Saturday 15:00
const scheduledDate = new Date('2024-11-16T15:00:00'); // שבת 15:00

// המערכת מזהה שזה שבת ודוחה
// System detects it's Shabbat and postpones
if (isShabbat(scheduledDate)) {
    const newDate = getNextAfterShabbat(scheduledDate);
    // תוצאה: ראשון 08:23
    // Result: Sunday 08:23
}
```

---

## לוגים / Logs

המערכת כותבת לוגים ברורים:

The system writes clear logs:

- `🕍 זמן חל בשבת - דוחה לראשון בשעה 8:XX`
  - Time falls on Shabbat - postponing to Sunday at 8:XX

- `🕍 כרגע שבת - מדלג על בדיקת פולואו אפ`
  - Currently Shabbat - skipping follow-up check

- `🕍 הודעה ללקוח [שם] מתוכננת לשבת - דוחה לראשון בבוקר`
  - Message for client [name] scheduled for Shabbat - postponing to Sunday morning

- `🕍 המועד היה בשבת - הועבר ל: [תאריך]`
  - The date was on Shabbat - moved to: [date]

---

## בדיקות / Testing

כדי לבדוק את התכונה:

To test the feature:

1. **סימולציה ידנית / Manual Simulation:**
   ```javascript
   // בקונסול node
   // In node console
   const testDate = new Date('2024-11-15T19:00:00'); // שישי 19:00
   console.log(isShabbat(testDate)); // true
   console.log(getNextAfterShabbat(testDate)); // ראשון 08:XX
   ```

2. **מעקב בזמן אמת / Real-time Monitoring:**
   - עקוב אחר הלוגים בזמן שישי אחה"צ ושבת
   - Monitor logs on Friday afternoon and Saturday
   - וודא שאין הודעות פולואו-אפ נשלחות
   - Verify no follow-up messages are sent

3. **בדיקת DB / Database Check:**
   ```sql
   -- בדוק מועדי פולואו-אפ מתוזמנים
   -- Check scheduled follow-up dates
   SELECT phone, name, next_followup_date 
   FROM clients 
   WHERE followup_enabled = TRUE;
   
   -- וודא שאין מועדים בשבת
   -- Verify no dates on Shabbat
   ```

---

## שימור תאימות / Backward Compatibility

✅ השינויים לא משפיעים על לקוחות קיימים

✅ Changes do not affect existing clients

✅ מועדים שכבר תוזמנו לשבת יידחו אוטומטית

✅ Dates already scheduled for Shabbat will be automatically postponed

✅ אין צורך בעדכון DB או migration

✅ No DB update or migration needed

---

## תחזוקה עתידית / Future Maintenance

אם יש צורך לשנות את זמני השבת:

If you need to change Shabbat times:

**ערוך את הפונקציה `isShabbat()`:**

**Edit the `isShabbat()` function:**

```javascript
function isShabbat(date) {
    const day = date.getDay();
    const hour = date.getHours();
    
    // שישי מ-18:00 ← שנה כאן
    if (day === 5 && hour >= 18) {  // Change here
        return true;
    }
    
    // ראשון עד 08:00 ← שנה כאן  
    if (day === 0 && hour < 8) {  // Change here
        return true;
    }
    
    return false;
}
```

---

## סיכום / Summary

**עברית:**
- ✅ הודעות פולואו-אפ לא יישלחו בשבת
- ✅ מועדים שחלים בשבת נדחים אוטומטית לראשון בבוקר
- ✅ המערכת ממשיכה לפעול כרגיל בכל שאר הזמנים
- ✅ לוגים ברורים לניטור

**English:**
- ✅ Follow-up messages will not be sent on Shabbat
- ✅ Dates falling on Shabbat are automatically postponed to Sunday morning
- ✅ System continues to operate normally at all other times
- ✅ Clear logs for monitoring

---

**תאריך יישום / Implementation Date:** November 11, 2025

**מיקום בקוד / Location in Code:** 
- `server.js` lines 2118-2185 (Shabbat functions)
- `server.js` lines 3905-3947 (calculateSmartFollowupStart)
- `server.js` lines 3950-3994 (calculateNextFollowupDate)
- `server.js` lines 4756-4853 (checkFollowupSchedule)

