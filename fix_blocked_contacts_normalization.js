const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// פונקציה לנרמול מספר טלפון (זהה לזו ב-server.js)
function normalizePhoneNumber(phone) {
    // הסרת @c.us אם קיים
    let cleanPhone = phone.replace('@c.us', '');
    
    // הסרת כל תווים שאינם ספרות (חוץ מ + בהתחלה)
    cleanPhone = cleanPhone.replace(/[^\d+]/g, '');
    
    // הסרת + מההתחלה אם קיים
    cleanPhone = cleanPhone.replace(/^\+/, '');
    
    // נרמול לפורמט 972XXXXXXXXX
    if (cleanPhone.startsWith('0')) {
        // אם מתחיל ב-0, החלף ל-972
        cleanPhone = '972' + cleanPhone.substring(1);
    } else if (cleanPhone.startsWith('972')) {
        // אם כבר מתחיל ב-972, השאר כמו שזה
        cleanPhone = cleanPhone;
    } else if (cleanPhone.length >= 9) {
        // אם אין קידומת ארץ, הוסף 972
        cleanPhone = '972' + cleanPhone;
    }
    
    return cleanPhone;
}

// יצירת גיבוי לפני התיקון
function createBackup(dbPath, callback) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${dbPath}.backup_${timestamp}`;
    
    console.log('💾 יוצר גיבוי...');
    fs.copyFile(dbPath, backupPath, (err) => {
        if (err) {
            console.error('❌ שגיאה ביצירת גיבוי:', err.message);
            callback(err);
        } else {
            console.log(`✅ גיבוי נוצר: ${backupPath}`);
            callback(null, backupPath);
        }
    });
}

// פתיחת מסד הנתונים
const dbPath = path.join(__dirname, 'dvir_basson_clients.db');

// יצירת גיבוי לפני תחילת העבודה
createBackup(dbPath, (backupErr, backupPath) => {
    if (backupErr) {
        console.error('❌ לא ניתן להמשיך ללא גיבוי!');
        process.exit(1);
    }
    
    const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('❌ שגיאה בפתיחת מסד הנתונים:', err.message);
            process.exit(1);
        } else {
            console.log('✅ מסד הנתונים נפתח בהצלחה');
        }
    });
    
    // קבלת כל המספרים החסומים
    db.all(`SELECT id, phone, full_name, reason, blocked_from_bot, blocked_from_followup FROM blocked_contacts ORDER BY id`, [], (err, rows) => {
        if (err) {
            console.error('❌ שגיאה בטעינת מספרים חסומים:', err.message);
            db.close();
            process.exit(1);
        }
        
        if (rows.length === 0) {
            console.log('ℹ️ לא נמצאו מספרים חסומים במסד הנתונים');
            db.close();
            return;
        }
        
        console.log(`\n📋 נמצאו ${rows.length} מספרים חסומים`);
        console.log('🔍 בודק אילו מספרים צריכים תיקון...\n');
        
        // בדיקה ראשונית - אילו מספרים צריכים תיקון
        const needsFix = [];
        const alreadyNormalized = [];
        
        rows.forEach(row => {
            const normalized = normalizePhoneNumber(row.phone);
            if (row.phone !== normalized) {
                needsFix.push({ ...row, normalizedPhone: normalized });
            } else {
                alreadyNormalized.push(row);
            }
        });
        
        console.log(`✅ ${alreadyNormalized.length} מספרים כבר בפורמט נכון`);
        console.log(`🔧 ${needsFix.length} מספרים צריכים תיקון\n`);
        
        if (needsFix.length === 0) {
            console.log('✨ כל המספרים כבר בפורמט נכון - אין צורך בתיקון!');
            db.close();
            return;
        }
        
        // הצגת רשימת המספרים שצריכים תיקון
        console.log('📝 מספרים שצריכים תיקון:');
        needsFix.forEach((item, idx) => {
            console.log(`   ${idx + 1}. ${item.phone} → ${item.normalizedPhone} (${item.full_name || 'ללא שם'})`);
        });
        console.log('');
        
        // תיקון המספרים
        let fixedCount = 0;
        let errorCount = 0;
        let processedCount = 0;
        
        needsFix.forEach((item, index) => {
            // בדיקה אם המספר המנורמל כבר קיים
            db.get(`SELECT id, phone, blocked_from_bot, blocked_from_followup FROM blocked_contacts WHERE phone = ?`, 
                [item.normalizedPhone], 
                (err, existing) => {
                    if (err) {
                        console.error(`❌ שגיאה בבדיקת כפילות עבור ${item.phone}:`, err.message);
                        errorCount++;
                        processedCount++;
                        checkIfDone();
                        return;
                    }
                    
                    if (existing && existing.id !== item.id) {
                        // המספר המנורמל כבר קיים - מאחד את המידע
                        console.log(`⚠️ המספר ${item.normalizedPhone} כבר קיים - מאחד רשומות`);
                        
                        // עדכון הרשומה הקיימת - שומר על החסימות החזקות ביותר
                        const newBlockedFromBot = (existing.blocked_from_bot === 1 || item.blocked_from_bot === 1) ? 1 : 0;
                        const newBlockedFromFollowup = (existing.blocked_from_followup === 1 || item.blocked_from_followup === 1) ? 1 : 0;
                        
                        db.run(`UPDATE blocked_contacts 
                                SET blocked_from_bot = ?,
                                    blocked_from_followup = ?,
                                    full_name = COALESCE(?, full_name),
                                    reason = COALESCE(?, reason)
                                WHERE phone = ?`,
                            [newBlockedFromBot, newBlockedFromFollowup, item.full_name, item.reason, item.normalizedPhone],
                            function(updateErr) {
                                if (updateErr) {
                                    console.error(`❌ שגיאה בעדכון רשומה קיימת ${item.normalizedPhone}:`, updateErr.message);
                                    errorCount++;
                                } else {
                                    console.log(`✅ רשומה קיימת עודכנה: ${item.normalizedPhone}`);
                                    
                                    // מחק את הרשומה הישנה (הכפולה)
                                    db.run(`DELETE FROM blocked_contacts WHERE id = ?`, [item.id], (deleteErr) => {
                                        if (deleteErr) {
                                            console.error(`❌ שגיאה במחיקת רשומה כפולה ${item.phone}:`, deleteErr.message);
                                            errorCount++;
                                        } else {
                                            fixedCount++;
                                            console.log(`✅ נמחקה רשומה כפולה: ${item.phone} → ${item.normalizedPhone}`);
                                        }
                                        processedCount++;
                                        checkIfDone();
                                    });
                                }
                            }
                        );
                    } else {
                        // עדכון המספר למנורמל
                        db.run(`UPDATE blocked_contacts SET phone = ? WHERE id = ?`, 
                            [item.normalizedPhone, item.id], 
                            function(updateErr) {
                                if (updateErr) {
                                    console.error(`❌ שגיאה בעדכון מספר ${item.phone}:`, updateErr.message);
                                    errorCount++;
                                } else {
                                    fixedCount++;
                                    console.log(`✅ תוקן: ${item.phone} → ${item.normalizedPhone} (${item.full_name || 'ללא שם'})`);
                                }
                                processedCount++;
                                checkIfDone();
                            }
                        );
                    }
                }
            );
        });
        
        function checkIfDone() {
            if (processedCount === needsFix.length) {
                console.log(`\n📊 סיכום:`);
                console.log(`   ✅ תוקנו: ${fixedCount} מספרים`);
                console.log(`   ❌ שגיאות: ${errorCount} מספרים`);
                console.log(`   📋 סה"כ: ${needsFix.length} מספרים`);
                console.log(`\n💾 גיבוי נשמר ב: ${backupPath}`);
                console.log('✨ התיקון הושלם!');
                db.close();
            }
        }
    });
});
