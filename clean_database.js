#!/usr/bin/env node

/**
 * סקריפט לניקוי מאגר הנתונים
 * מנקה את כל הטבלאות: clients, conversations, appointments
 * 
 * שימוש: node clean_database.js
 */

const sqlite3 = require('sqlite3').verbose();
const readline = require('readline');

// יצירת ממשק לקלט מהמשתמש
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// פונקציה לשאלת אישור מהמשתמש
function askConfirmation(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.toLowerCase().trim());
        });
    });
}

// פונקציה לניקוי מאגר הנתונים
async function cleanDatabase() {
    console.log('🧹 סקריפט ניקוי מאגר הנתונים');
    console.log('================================');
    console.log('⚠️  זה ימחק את כל הנתונים הבאים:');
    console.log('   • כל הלקוחות (טבלת clients)');
    console.log('   • כל השיחות (טבלת conversations)');
    console.log('   • כל הפגישות (טבלת appointments)');
    console.log('');
    
    // בקשת אישור ראשון
    const firstConfirm = await askConfirmation('האם אתה בטוח שברצונך למחוק את כל הנתונים? (כתוב "כן" לאישור): ');
    
    if (firstConfirm !== 'כן') {
        console.log('❌ הפעולה בוטלה על ידי המשתמש');
        rl.close();
        return;
    }
    
    // בקשת אישור שני (double confirmation)
    const secondConfirm = await askConfirmation('⚠️  זוהי פעולה בלתי הפיכה! כתוב "מחק הכל" לאישור סופי: ');
    
    if (secondConfirm !== 'מחק הכל') {
        console.log('❌ הפעולה בוטלה - לא הוזן האישור הנכון');
        rl.close();
        return;
    }
    
    console.log('');
    console.log('🔄 מתחיל ניקוי מאגר הנתונים...');
    
    // התחברות למאגר הנתונים
    const db = new sqlite3.Database('./dvir_basson_clients.db', (err) => {
        if (err) {
            console.error('❌ שגיאה בחיבור למאגר מידע:', err.message);
            rl.close();
            return;
        }
        console.log('✅ התחברות למאגר הנתונים הושלמה');
    });
    
    try {
        // ספירת רשומות לפני המחיקה
        await new Promise((resolve, reject) => {
            db.get("SELECT COUNT(*) as count FROM clients", (err, row) => {
                if (err) {
                    console.log('ℹ️  טבלת clients לא קיימת או ריקה');
                } else {
                    console.log(`📊 נמצאו ${row.count} לקוחות בטבלה`);
                }
                resolve();
            });
        });
        
        await new Promise((resolve, reject) => {
            db.get("SELECT COUNT(*) as count FROM conversations", (err, row) => {
                if (err) {
                    console.log('ℹ️  טבלת conversations לא קיימת או ריקה');
                } else {
                    console.log(`📊 נמצאו ${row.count} שיחות בטבלה`);
                }
                resolve();
            });
        });
        
        await new Promise((resolve, reject) => {
            db.get("SELECT COUNT(*) as count FROM appointments", (err, row) => {
                if (err) {
                    console.log('ℹ️  טבלת appointments לא קיימת או ריקה');
                } else {
                    console.log(`📊 נמצאו ${row.count} פגישות בטבלה`);
                }
                resolve();
            });
        });
        
        console.log('');
        console.log('🗑️  מוחק את כל הנתונים...');
        
        // מחיקת כל הטבלאות
        const tables = ['conversations', 'appointments', 'clients'];
        
        for (const table of tables) {
            await new Promise((resolve, reject) => {
                db.run(`DELETE FROM ${table}`, (err) => {
                    if (err) {
                        console.log(`⚠️  שגיאה במחיקת טבלת ${table}:`, err.message);
                    } else {
                        console.log(`✅ טבלת ${table} נוקתה בהצלחה`);
                    }
                    resolve();
                });
            });
        }
        
        // איפוס מונה ה-ID (AUTOINCREMENT)
        console.log('🔄 מאפס מונים...');
        for (const table of tables) {
            await new Promise((resolve, reject) => {
                db.run(`DELETE FROM sqlite_sequence WHERE name='${table}'`, (err) => {
                    if (err) {
                        console.log(`ℹ️  לא ניתן לאפס מונה עבור ${table} (זה בסדר)`);
                    } else {
                        console.log(`✅ מונה ${table} אופס`);
                    }
                    resolve();
                });
            });
        }
        
        console.log('');
        console.log('🎉 ניקוי מאגר הנתונים הושלם בהצלחה!');
        console.log('📋 סיכום:');
        console.log('   • כל הלקוחות נמחקו');
        console.log('   • כל השיחות נמחקו');
        console.log('   • כל הפגישות נמחקו');
        console.log('   • המונים אופסו');
        console.log('');
        console.log('💡 כעת תוכל להפעיל את הבוט מחדש עם מאגר נתונים נקי');
        
    } catch (error) {
        console.error('❌ שגיאה בתהליך הניקוי:', error);
    } finally {
        // סגירת החיבור למאגר
        db.close((err) => {
            if (err) {
                console.error('❌ שגיאה בסגירת מאגר הנתונים:', err.message);
            } else {
                console.log('✅ החיבור למאגר הנתונים נסגר');
            }
            rl.close();
        });
    }
}

// הפעלת הסקריפט
cleanDatabase().catch(error => {
    console.error('❌ שגיאה כללית:', error);
    rl.close();
});
