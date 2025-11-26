const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./dvir_basson_clients.db', (err) => {
    if (err) {
        console.error('❌ שגיאה בחיבור למאגר מידע:', err.message);
        process.exit(1);
    }
    console.log('✅ חיבור למאגר מידע הושלם');
});

// הוספת שדות חדשים למערכת תזכורת תשלום
const fields = [
    { name: 'payment_link_sent_date', type: 'DATETIME' },
    { name: 'full_name_received', type: 'BOOLEAN DEFAULT FALSE' },
    { name: 'full_name_received_date', type: 'DATETIME' },
    { name: 'waiting_for_payment', type: 'BOOLEAN DEFAULT FALSE' },
    { name: 'payment_reminder_sent', type: 'BOOLEAN DEFAULT FALSE' },
    { name: 'payment_reminder_date', type: 'DATETIME' }
];

console.log('🔄 מוסיף שדות חדשים למערכת תזכורת תשלום...\n');

fields.forEach(({ name, type }) => {
    db.run(`ALTER TABLE clients ADD COLUMN ${name} ${type}`, (err) => {
        if (err) {
            if (err.message.includes('duplicate column')) {
                console.log(`ℹ️  השדה ${name} כבר קיים`);
            } else {
                console.error(`❌ שגיאה בהוספת ${name}:`, err.message);
            }
        } else {
            console.log(`✅ נוסף שדה ${name}`);
        }
    });
});

// סגירה אחרי 2 שניות (לתת זמן לכל הפקודות להסתיים)
setTimeout(() => {
    db.close((err) => {
        if (err) {
            console.error('❌ שגיאה בסגירת חיבור:', err.message);
        } else {
            console.log('\n✅ השדות נוספו בהצלחה!');
            console.log('📋 מערכת תזכורת תשלום מוכנה');
        }
    });
}, 2000);
