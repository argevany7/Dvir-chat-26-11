// מיגרציה: הוספת שדה opt_out_followup_only לטבלת clients
// הרץ סקריפט זה פעם אחת כדי להוסיף את השדה החדש למסד הנתונים הקיים

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'dvir_basson_clients.db');
const db = new sqlite3.Database(dbPath);

console.log('🔄 מתחיל מיגרציה: הוספת opt_out_followup_only');

db.run(`ALTER TABLE clients ADD COLUMN opt_out_followup_only BOOLEAN DEFAULT FALSE`, (err) => {
    if (err) {
        if (err.message.includes('duplicate column')) {
            console.log('✅ השדה opt_out_followup_only כבר קיים בטבלה');
        } else {
            console.error('❌ שגיאה בהוספת השדה:', err.message);
        }
    } else {
        console.log('✅ השדה opt_out_followup_only נוסף בהצלחה!');
    }
    
    // בדיקה שהשדה אכן קיים
    db.all(`PRAGMA table_info(clients)`, (err, columns) => {
        if (err) {
            console.error('❌ שגיאה בקריאת מבנה הטבלה:', err.message);
        } else {
            const optOutColumn = columns.find(col => col.name === 'opt_out_followup_only');
            if (optOutColumn) {
                console.log('✅ אימות: השדה opt_out_followup_only קיים בטבלה');
                console.log(`   סוג: ${optOutColumn.type}, ברירת מחדל: ${optOutColumn.dflt_value}`);
            } else {
                console.log('⚠️ השדה opt_out_followup_only לא נמצא בטבלה');
            }
        }
        
        db.close((err) => {
            if (err) {
                console.error('❌ שגיאה בסגירת מסד הנתונים:', err.message);
            } else {
                console.log('✅ מסד הנתונים נסגר בהצלחה');
            }
        });
    });
});

