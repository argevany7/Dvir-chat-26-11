// ===================================
// סקריפט תיקון - נרמול מספרים קיימים
// ===================================

const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./dvir_basson_clients.db', (err) => {
    if (err) {
        console.error('❌ שגיאה בחיבור למאגר:', err.message);
        process.exit(1);
    } else {
        console.log('✅ חיבור למאגר הושלם');
        fixBlockedNumbers();
    }
});

// נרמול מספר טלפון לפורמט אחיד (972XXXXXXXXX)
function normalizePhoneNumber(phone) {
    let cleanPhone = phone.replace('@c.us', '');
    cleanPhone = cleanPhone.replace(/[^\d+]/g, '');
    cleanPhone = cleanPhone.replace(/^\+/, '');
    
    if (cleanPhone.startsWith('0')) {
        cleanPhone = '972' + cleanPhone.substring(1);
    } else if (cleanPhone.startsWith('972')) {
        cleanPhone = cleanPhone;
    } else if (cleanPhone.length >= 9) {
        cleanPhone = '972' + cleanPhone;
    }
    
    return cleanPhone;
}

async function fixBlockedNumbers() {
    console.log('\n🔧 מתחיל תיקון מספרים חסומים...\n');
    
    // קריאת כל המספרים החסומים
    db.all(`SELECT id, phone FROM blocked_contacts`, [], (err, rows) => {
        if (err) {
            console.error('❌ שגיאה בקריאת רשומות:', err.message);
            db.close();
            process.exit(1);
        }
        
        if (rows.length === 0) {
            console.log('ℹ️  אין מספרים חסומים במאגר');
            db.close();
            process.exit(0);
        }
        
        console.log(`📊 נמצאו ${rows.length} מספרים חסומים\n`);
        
        let updatedCount = 0;
        let processedCount = 0;
        
        rows.forEach((row, index) => {
            const oldPhone = row.phone;
            const normalizedPhone = normalizePhoneNumber(oldPhone);
            
            if (oldPhone !== normalizedPhone) {
                console.log(`${index + 1}. עדכון: ${oldPhone} → ${normalizedPhone}`);
                
                db.run(`UPDATE blocked_contacts SET phone = ? WHERE id = ?`, 
                    [normalizedPhone, row.id], 
                    (err) => {
                        processedCount++;
                        
                        if (err) {
                            console.error(`   ❌ שגיאה בעדכון: ${err.message}`);
                        } else {
                            console.log(`   ✅ עודכן בהצלחה`);
                            updatedCount++;
                        }
                        
                        if (processedCount === rows.length) {
                            finish(updatedCount, rows.length);
                        }
                    }
                );
            } else {
                console.log(`${index + 1}. ✓ תקין: ${oldPhone}`);
                processedCount++;
                
                if (processedCount === rows.length) {
                    finish(updatedCount, rows.length);
                }
            }
        });
    });
}

function finish(updatedCount, totalCount) {
    console.log('\n' + '='.repeat(50));
    console.log(`✅ תיקון הושלם!`);
    console.log(`📊 ${updatedCount} מתוך ${totalCount} מספרים עודכנו`);
    console.log(`📊 ${totalCount - updatedCount} מספרים היו תקינים`);
    console.log('='.repeat(50) + '\n');
    
    // הצגת רשימת חסומים אחרי התיקון
    db.all(`SELECT phone, reason, created_at FROM blocked_contacts ORDER BY created_at DESC`, [], (err, rows) => {
        if (!err && rows.length > 0) {
            console.log('📋 רשימת מספרים חסומים (אחרי תיקון):\n');
            rows.forEach((row, index) => {
                console.log(`   ${index + 1}. ${row.phone} - ${row.reason}`);
            });
            console.log('');
        }
        
        db.close();
        console.log('💡 כעת הפעל מחדש את הסרבר: node server.js\n');
        process.exit(0);
    });
}




