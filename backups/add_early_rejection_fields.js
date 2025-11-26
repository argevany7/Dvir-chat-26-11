const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./dvir_basson_clients.db', (err) => {
    if (err) {
        console.error('❌ שגיאה בחיבור למאגר:', err.message);
        process.exit(1);
    }
    console.log('✅ מחובר למאגר הנתונים');
});

const migrations = [
    { column: 'early_rejection_detected', type: 'BOOLEAN DEFAULT FALSE' },
    { column: 'early_rejection_why_asked', type: 'BOOLEAN DEFAULT FALSE' },
    { column: 'early_rejection_why_date', type: 'DATETIME' },
    { column: 'early_rejection_notified_managers', type: 'BOOLEAN DEFAULT FALSE' },
    { column: 'early_rejection_followup_enabled', type: 'BOOLEAN DEFAULT FALSE' },
    { column: 'early_rejection_followup_attempts', type: 'INTEGER DEFAULT 0' },
    { column: 'early_rejection_next_followup', type: 'DATETIME' }
];

console.log('🔧 מוסיף שדות חדשים לטבלת clients...\n');

let completed = 0;
migrations.forEach(({ column, type }) => {
    db.run(`ALTER TABLE clients ADD COLUMN ${column} ${type}`, (err) => {
        if (err) {
            if (err.message.includes('duplicate column')) {
                console.log(`ℹ️  ${column} - כבר קיים`);
            } else {
                console.error(`❌ ${column} - שגיאה: ${err.message}`);
            }
        } else {
            console.log(`✅ ${column} - נוסף בהצלחה`);
        }
        
        completed++;
        if (completed === migrations.length) {
            console.log('\n🎉 כל השדות נוספו בהצלחה!');
            db.close(() => {
                console.log('✅ חיבור למאגר נסגר');
                process.exit(0);
            });
        }
    });
});
