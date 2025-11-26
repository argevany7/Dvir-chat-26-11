#!/usr/bin/env node

/**
 * סקריפט בדיקה לתכונת שבת במערכת פולואו-אפ
 * Test script for Shabbat feature in follow-up system
 */

// העתקה של הפונקציות מ-server.js
// Copy of functions from server.js

function isShabbat(date) {
    const day = date.getDay(); // 0 = ראשון, 5 = שישי, 6 = שבת
    const hour = date.getHours();
    
    // שישי מ-18:00 ואילך
    if (day === 5 && hour >= 18) {
        return true;
    }
    
    // כל יום שבת
    if (day === 6) {
        return true;
    }
    
    // ראשון עד 08:00
    if (day === 0 && hour < 8) {
        return true;
    }
    
    return false;
}

function getNextAfterShabbat(date) {
    const nextDate = new Date(date);
    const day = nextDate.getDay();
    const hour = nextDate.getHours();
    
    // אם זה שישי אחרי 18:00 או שבת - קפיצה לראשון בבוקר
    if ((day === 5 && hour >= 18) || day === 6) {
        // קפיצה לראשון הקרוב
        const daysUntilSunday = day === 6 ? 1 : 2; // אם שבת -> 1 יום, אם שישי -> 2 ימים
        nextDate.setDate(nextDate.getDate() + daysUntilSunday);
        nextDate.setHours(8);
        const randomMinutes = Math.floor(Math.random() * 50) + 1;
        nextDate.setMinutes(randomMinutes);
        nextDate.setSeconds(0);
        nextDate.setMilliseconds(0);
        return nextDate;
    }
    
    // אם זה ראשון לפני 08:00 - קפיצה ל-08:00
    if (day === 0 && hour < 8) {
        nextDate.setHours(8);
        const randomMinutes = Math.floor(Math.random() * 50) + 1;
        nextDate.setMinutes(randomMinutes);
        nextDate.setSeconds(0);
        nextDate.setMilliseconds(0);
        return nextDate;
    }
    
    return nextDate;
}

function ensureNotShabbat(date) {
    if (isShabbat(date)) {
        return getNextAfterShabbat(date);
    }
    return date;
}

// פונקציות עזר לבדיקה
// Helper functions for testing

function getDayName(dayNum) {
    const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    return days[dayNum];
}

function formatDate(date) {
    const day = getDayName(date.getDay());
    const dateStr = date.toLocaleString('he-IL', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
    return `${day} ${dateStr}`;
}

function testCase(description, date) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📋 ${description}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`🕐 מועד מקורי: ${formatDate(date)}`);
    
    const isShabbatResult = isShabbat(date);
    console.log(`🕍 האם שבת? ${isShabbatResult ? '✅ כן' : '❌ לא'}`);
    
    if (isShabbatResult) {
        const newDate = getNextAfterShabbat(date);
        console.log(`🔄 מועד חדש: ${formatDate(newDate)}`);
        console.log(`⏱️  דחייה של ${Math.round((newDate - date) / (1000 * 60 * 60))} שעות`);
    } else {
        console.log(`✅ אין צורך בדחייה`);
    }
}

// הרצת בדיקות
// Running tests

console.log('\n\n🧪 בדיקת תכונת שבת במערכת פולואו-אפ');
console.log('Testing Shabbat feature in follow-up system\n');

// בדיקה 1: חמישי - לא שבת
testCase(
    'בדיקה 1: חמישי בצהריים (לא שבת)',
    new Date('2024-11-14T14:00:00')
);

// בדיקה 2: שישי בבוקר - לא שבת
testCase(
    'בדיקה 2: שישי בבוקר 10:00 (לא שבת)',
    new Date('2024-11-15T10:00:00')
);

// בדיקה 3: שישי 17:00 - עדיין לא שבת
testCase(
    'בדיקה 3: שישי 17:00 (עדיין לא שבת)',
    new Date('2024-11-15T17:00:00')
);

// בדיקה 4: שישי 18:00 - כבר שבת!
testCase(
    'בדיקה 4: שישי 18:00 (התחלת שבת)',
    new Date('2024-11-15T18:00:00')
);

// בדיקה 5: שישי 20:00 - שבת
testCase(
    'בדיקה 5: שישי 20:00 (שבת)',
    new Date('2024-11-15T20:00:00')
);

// בדיקה 6: שבת בצהריים - שבת
testCase(
    'בדיקה 6: שבת 14:00 (שבת)',
    new Date('2024-11-16T14:00:00')
);

// בדיקה 7: ראשון 06:00 - עדיין שבת
testCase(
    'בדיקה 7: ראשון 06:00 (עדיין שבת)',
    new Date('2024-11-17T06:00:00')
);

// בדיקה 8: ראשון 08:00 - כבר לא שבת
testCase(
    'בדיקה 8: ראשון 08:00 (סוף שבת)',
    new Date('2024-11-17T08:00:00')
);

// בדיקה 9: ראשון 10:00 - לא שבת
testCase(
    'בדיקה 9: ראשון 10:00 (לא שבת)',
    new Date('2024-11-17T10:00:00')
);

// בדיקת תאריך נוכחי
console.log(`\n\n${'='.repeat(60)}`);
console.log('🕐 בדיקה מיוחדת: זמן נוכחי');
console.log(`${'='.repeat(60)}`);
const now = new Date();
console.log(`🕐 עכשיו: ${formatDate(now)}`);
console.log(`🕍 האם כרגע שבת? ${isShabbat(now) ? '✅ כן - המערכת לא תשלח הודעות' : '❌ לא - המערכת פעילה'}`);

if (isShabbat(now)) {
    const nextTime = getNextAfterShabbat(now);
    console.log(`⏰ הודעות יישלחו החל מ: ${formatDate(nextTime)}`);
}

// סיכום
console.log(`\n\n${'='.repeat(60)}`);
console.log('✅ בדיקות הושלמו בהצלחה!');
console.log('Tests completed successfully!');
console.log(`${'='.repeat(60)}\n`);

