/**
 * סקריפט להוספת שדות אישור שעה למאגר הנתונים
 * 
 * שדות שמתווספים:
 * - waiting_for_time_confirmation: מצב "ממתין לאישור שעה" (0/1)
 * - suggested_time: השעה שהוצעה ללקוח
 */

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./dvir_basson_clients.db');

console.log('🔧 מתחיל הוספת שדות אישור שעה...\n');

// רשימת השדות שצריך להוסיף
const fieldsToAdd = [
    {
        name: 'waiting_for_time_confirmation',
        type: 'INTEGER DEFAULT 0',
        description: 'מצב "ממתין לאישור שעה" (0 = לא, 1 = כן)'
    },
    {
        name: 'suggested_time',
        type: 'TEXT DEFAULT NULL',
        description: 'השעה שהוצעה ללקוח (למשל "17:00")'
    }
];

let completed = 0;
let errors = 0;

fieldsToAdd.forEach((field, index) => {
    const query = `ALTER TABLE clients ADD COLUMN ${field.name} ${field.type}`;
    
    db.run(query, (err) => {
        if (err) {
            if (err.message.includes('duplicate column name')) {
                console.log(`✅ שדה "${field.name}" כבר קיים - מדלג`);
            } else {
                console.error(`❌ שגיאה בהוספת שדה "${field.name}":`, err.message);
                errors++;
            }
        } else {
            console.log(`✅ שדה "${field.name}" נוסף בהצלחה`);
            console.log(`   תיאור: ${field.description}\n`);
        }
        
        completed++;
        
        // אם סיימנו את כל השדות
        if (completed === fieldsToAdd.length) {
            if (errors === 0) {
                console.log('\n🎉 כל השדות נוספו בהצלחה!\n');
            } else {
                console.log(`\n⚠️ סיימתי עם ${errors} שגיאות\n`);
            }
            
            db.close();
        }
    });
});

