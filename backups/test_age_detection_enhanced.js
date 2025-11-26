/**
 * בדיקות למערכת זיהוי הגיל המשופרת
 * Enhanced Age Detection System Tests
 * 
 * קובץ זה מכיל בדיקות ידניות למערכת זיהוי הגיל המשופרת
 */

console.log('🧪 בדיקות מערכת זיהוי הגיל המשופרת');
console.log('=' .repeat(60));

// דוגמאות לבדיקה ידנית
const testCases = {
    // זיהוי גיל ישיר
    directAge: [
        { input: 'הוא בן 12', expected: 12, description: 'גיל שלם במספר' },
        { input: 'היא בת 12.5', expected: 12.5, description: 'גיל עשרוני' },
        { input: 'בן ארבע', expected: 4, description: 'גיל במילים' },
        { input: 'שתיים עשרה', expected: 12, description: 'גיל במילים - שתי ספרות' },
        { input: 'תכף 12', expected: 12, description: 'גיל עם תכף' },
        { input: 'תכף שתיים עשרה', expected: 12, description: 'גיל עם תכף במילים' },
        { input: 'אחת עשרה וחצי', expected: 11.5, description: 'גיל חצי במילים' },
        { input: 'עשר וחצי', expected: 10.5, description: 'גיל חצי במילים - קצר' },
        { input: 'הוא בן 33', expected: 33, description: 'גיל מבוגר' }
    ],
    
    // זיהוי כיתה
    gradeDetection: [
        { input: 'הוא בכיתה ה', expected: 'ה', description: 'כיתה בעברית' },
        { input: 'כיתה ג\'', expected: 'ג', description: 'כיתה עם גרש' },
        { input: 'עולה לכיתה ד', expected: 'ד', description: 'עולה לכיתה' },
        { input: 'בכיתה 5', expected: '5', description: 'כיתה במספר' },
        { input: 'כיתה א', expected: 'א', description: 'כיתה א' }
    ],
    
    // המרת כיתה לגיל
    gradeToAge: [
        { grade: 'א', expected: 6, description: 'כיתה א → 6' },
        { grade: 'ה', expected: 10, description: 'כיתה ה → 10' },
        { grade: 'ז', expected: 12, description: 'כיתה ז → 12' },
        { grade: '5', expected: 10, description: 'כיתה 5 → 10' },
        { grade: 'יב', expected: 17, description: 'כיתה יב → 17' }
    ],
    
    // זיהוי אישור
    confirmation: [
        { input: 'כן', expected: 'yes', description: 'אישור פשוט' },
        { input: 'נכון', expected: 'yes', description: 'אישור - נכון' },
        { input: 'בדיוק', expected: 'yes', description: 'אישור - בדיוק' },
        { input: 'בערך', expected: 'yes', description: 'אישור - בערך' },
        { input: 'אוקיי', expected: 'yes', description: 'אישור - אוקיי' },
        { input: 'לא', expected: 'no', description: 'דחייה פשוטה' },
        { input: 'לא ממש', expected: 'no', description: 'דחייה - לא ממש' },
        { input: 'לא בדיוק', expected: 'no', description: 'דחייה - לא בדיוק' },
        { input: 'אני לא יודע', expected: 'unclear', description: 'לא ברור' }
    ]
};

console.log('\n📝 מקרי בדיקה מוכנים:');
console.log(`   ✓ ${testCases.directAge.length} בדיקות זיהוי גיל ישיר`);
console.log(`   ✓ ${testCases.gradeDetection.length} בדיקות זיהוי כיתה`);
console.log(`   ✓ ${testCases.gradeToAge.length} בדיקות המרת כיתה לגיל`);
console.log(`   ✓ ${testCases.confirmation.length} בדיקות זיהוי אישור`);

console.log('\n🔍 להרצת בדיקות אמיתיות:');
console.log('   1. הפעל את השרת: node server.js');
console.log('   2. שלח הודעות WhatsApp עם הדוגמאות למעלה');
console.log('   3. בדוק את הלוגים במסוף');
console.log('   4. בדוק את המסד נתונים: sqlite3 dvir_basson_clients.db');

console.log('\n💾 שאילתות SQL לבדיקה:');
console.log('');
console.log('-- בדיקת גילאים שנשמרו');
console.log('SELECT phone, name, age, awaiting_age_confirmation, pending_estimated_age, grade_mentioned');
console.log('FROM clients WHERE age IS NOT NULL ORDER BY updated_at DESC LIMIT 10;');
console.log('');
console.log('-- בדיקת מצבי המתנה לאישור');
console.log('SELECT phone, name, awaiting_age_confirmation, pending_estimated_age, grade_mentioned');
console.log('FROM clients WHERE awaiting_age_confirmation = 1;');
console.log('');

console.log('\n📊 דוגמאות שיחה לבדיקה ידנית:');
console.log('');

// דוגמה 1: זיהוי גיל ישיר
console.log('🔹 דוגמה 1: זיהוי גיל ישיר');
console.log('   בוט: "בן כמה הוא?"');
console.log('   אתה: "12.5"');
console.log('   ✅ צפוי: המערכת תשמור age = 12.5');
console.log('');

// דוגמה 2: כיתה עם אישור
console.log('🔹 דוגמה 2: כיתה עם אישור');
console.log('   בוט: "בן כמה הוא?"');
console.log('   אתה: "הוא בכיתה ה"');
console.log('   בוט: "אז הוא בן 10 בערך, נכון?"');
console.log('   אתה: "כן"');
console.log('   ✅ צפוי: המערכת תשמור age = 10');
console.log('');

// דוגמה 3: כיתה עם דחייה
console.log('🔹 דוגמה 3: כיתה עם דחייה וגיל מתוקן');
console.log('   בוט: "בן כמה הוא?"');
console.log('   אתה: "בכיתה ז"');
console.log('   בוט: "אז הוא בן 12 בערך, נכון?"');
console.log('   אתה: "לא, הוא בן 13"');
console.log('   ✅ צפוי: המערכת תשמור age = 13');
console.log('');

// דוגמה 4: גיל במילים
console.log('🔹 דוגמה 4: גיל במילים');
console.log('   בוט: "בן כמה הוא?"');
console.log('   אתה: "שתיים עשרה"');
console.log('   ✅ צפוי: המערכת תשמור age = 12');
console.log('');

// דוגמה 5: גיל עם "תכף"
console.log('🔹 דוגמה 5: גיל עם "תכף"');
console.log('   בוט: "בן כמה הוא?"');
console.log('   אתה: "תכף 13"');
console.log('   ✅ צפוי: המערכת תשמור age = 13');
console.log('');

console.log('=' .repeat(60));
console.log('✨ סיימתי להכין את מקרי הבדיקה!');
console.log('📖 למידע נוסף ראה: AGE_DETECTION_ENHANCEMENT.md');
console.log('');

// ייצוא מקרי הבדיקה
module.exports = { testCases };

