// ===================================
// סקריפט בדיקה - מערכת פולואו אפ נוכחית
// ===================================
// שימוש:
//   node test_followup_current.js <מספר_טלפון> [מספר_ניסיון]
//   node test_followup_current.js 0501234567 3
//   node test_followup_current.js 0501234567 1-10  (שליחת רצף)
// ===================================

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const qrcode = require('qrcode-terminal');

// פתיחת מסד נתונים
const db = new sqlite3.Database('./dvir_basson_clients.db');

// הגדרת WhatsApp Client
const whatsappClient = new Client({
    authStrategy: new LocalAuth({
        dataPath: './whatsapp-session'
    }),
    puppeteer: {
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ]
    }
});

let isReady = false;

whatsappClient.on('qr', (qr) => {
    console.log('📱 סרוק את קוד ה-QR:');
    qrcode.generate(qr, { small: true });
});

whatsappClient.on('authenticated', () => {
    console.log('🔐 אימות הושלם');
});

whatsappClient.on('ready', () => {
    console.log('✅ WhatsApp Client מוכן!');
    isReady = true;
});

// ===============================
// פונקציות מהשרת הנוכחי
// ===============================

function getContextualFollowup(summary) {
    if (!summary) return '';
    
    if (summary.pain_points && summary.pain_points.length > 0) {
        const painPoint = summary.pain_points[0];
        if (summary.isParentForChild && summary.child_name) {
            return `זכור שדיברנו על ${painPoint} של ${summary.child_name} - זה ממש יכול לעזור`;
        } else {
            return `זכור שדיברנו על ${painPoint} - זה ממש יכול לעזור לך`;
        }
    }
    
    if (summary.last_topic) {
        return `אשמח להמשיך את השיחה שהתחלנו על ${summary.last_topic}`;
    }
    
    return 'אשמח לשמוע ממך';
}

async function generateFollowupMessage(client, attempt, summary) {
    const name = client.name || 'היי';
    
    // הודעה 1 - מותאמת לשלב השיחה עם הקשר
    if (attempt === 1) {
        // אם יש סיכום - השתמש בו ליצירת הודעה מותאמת
        if (summary) {
            if (summary.conversation_stage === 'waiting_for_decision') {
                const contextual = getContextualFollowup(summary);
                return { 
                    type: 'text', 
                    message: `היי ${name}, חשבת על האימונים? ${contextual}`
                };
            } else if (summary.conversation_stage === 'waiting_for_payment') {
                const childName = summary.child_name || 'האימון';
                const target = summary.isParentForChild ? `לאימון של ${childName}` : 'לאימון';
                return { 
                    type: 'text', 
                    message: `היי ${name}, שלחתי לך קישור לתשלום ${target} - קיבלת? 😊`
                };
            } else if (summary.conversation_stage === 'stopped_responding') {
                const contextual = getContextualFollowup(summary);
                return { 
                    type: 'text', 
                    message: `היי ${name}, מה קרה? ${contextual}`
                };
            } else if (summary.last_topic) {
                return { 
                    type: 'text', 
                    message: `היי ${name}, מה דעתך על ${summary.last_topic}?`
                };
            }
        }
        
        // אם אין סיכום או שלא התאים - הודעות ברירת מחדל
        const variations = [
            `היי ${name}, מה דעתך?`,
            `היי ${name}, מה דעתך על מה שדיברנו?`,
            `${name}, מה המצב?`,
            `היי ${name}, חשבת על זה?`
        ];
        return { type: 'text', message: variations[Math.floor(Math.random() * variations.length)] };
    }
    
    // הודעה 2 - GIF בלבד
    if (attempt === 2) {
        return { type: 'gif', message: null };
    }
    
    // הודעה 3 - פשוטה וקצרה
    if (attempt === 3) {
        const variations = [
            `${name}, עדיין רלוונטי? 😊`,
            `היי ${name}, עדיין מעניין? 😊`,
            `${name}, מה דעתך? עדיין רלוונטי?`
        ];
        return { type: 'text', message: variations[Math.floor(Math.random() * variations.length)] };
    }
    

    // הודעה 4 - אישית עם סיכום (משופרת עם הקשר)
    if (attempt === 4) {
        let personalMessage = `היי ${name}! 😊\n\n`;
        
        if (summary && summary.pain_points && summary.pain_points.length > 0) {
            const painPoint = summary.pain_points[0];
            const childName = summary.child_name || summary.name || name;
            
            // בניית הודעה מותאמת אישית לפי נקודת הכאב
            if (painPoint.includes('ביטחון') || painPoint.includes('ביישן')) {
                if (summary.isParentForChild) {
                    personalMessage += `אני זוכר שסיפרת ש${childName} ${painPoint.includes('ביישן') ? 'ביישן' : 'צריך ביטחון עצמי'}. `;
                    personalMessage += `דרך אומנויות הלחימה דביר שם דגש ענק על בניית ביטחון עצמי וכוח פנימי בילדים.\n\n`;
                    personalMessage += `חבל לפספס את ההזדמנות הזו לשנות ל${childName} את החיים מקצה לקצה 💪`;
                } else {
                    personalMessage += `אני זוכר שדיברנו על ${painPoint}. `;
                    personalMessage += `דרך אומנויות הלחימה דביר עוזר לבנות ביטחון עצמי וכוח פנימי.\n\n`;
                    personalMessage += `זו באמת הזדמנות לשנות דברים מקצה לקצה 💪`;
                }
            } else if (painPoint.includes('לחץ') || painPoint.includes('עצבים') || painPoint.includes('סטרס')) {
                personalMessage += `אני זוכר שדיברנו על לחץ ועצבים. אומנויות לחימה זה בדיוק הכלי להתמודד עם זה - שחרור, התמקדות וחיזוק מנטלי.\n\nזה יכול לעשות הבדל אמיתי 🥊`;
            } else if (painPoint.includes('אנרגיה') || painPoint.includes('היפראקטיבי')) {
                const target = summary.isParentForChild ? summary.child_name || 'הילד' : 'התלמיד';
                personalMessage += `אני זוכר שדיברנו על עודף אנרגיות. האימונים של דביר הם בדיוק המקום לתעל את זה לכיוון חיובי ובונה.\n\nזה יכול לעזור ל${target} באופן משמעותי 💪`;
            } else if (painPoint.includes('בריונות') || painPoint.includes('הטרדה')) {
                const target = summary.isParentForChild ? summary.child_name || 'הילד' : 'התלמיד';
                personalMessage += `אני זוכר שדיברנו על בריונות. האימונים לא רק מלמדים להתגונן, אלא גם בונים ביטחון פנימי שגורם לבריונים לא להתקרב בכלל.\n\nזה יכול לעשות שינוי אמיתי עבור ${target} 🥋`;
            } else {
                // במקום "אני זוכר" כללי, נעדיף להראות את נקודת הכאב הספציפית
                personalMessage += `אני זוכר שדיברנו על "${painPoint}". אומנויות הלחימה של דביר יכולות לעזור בדיוק עם זה.\n\nחבל לפספס את ההזדמנות הזו 💪`;
            }
        } else {
            // אין סיכום או נקודות כאב - הודעה גנרית
            personalMessage += `האימונים עדיין רלוונטיים?\n\nאם יש בעיה כלשהי בחיים כמו לחץ, חוסר ביטחון או כל אתגר אחר - זה בדיוק מה שהאימונים עוזרים לפתור 💪`;
        }
        
        return { type: 'text', message: personalMessage };
    }
    
    // הודעה 5 - FOMO + התייחסות להודעה הקודמת
    if (attempt === 5) {
        const childName = summary?.child_name || summary?.name || name;
        let message = `${name}, מה דעתך על מה שדיברנו? `;
        
        if (summary && summary.pain_points && summary.pain_points.length > 0) {
            const painPoint = summary.pain_points[0];
            message += `זו באמת הזדמנות לטפל ב"${painPoint}" ולשנות דברים מקצה לקצה 💪\n\n`;
        }
        
        if (summary?.isParentForChild) {
            message += `אני בטוח שזה יכול לעזור ל${childName}, לא כדאי לפספס את זה. מה דעתך?`;
        } else {
            message += `אני בטוח שזה יכול לעזור, לא כדאי לפספס את זה. מה דעתך?`;
        }
        
        return { type: 'text', message };
    }
    
    // הודעה 6+ - הצעת ערך אמיתי
    const isChild = summary?.isParentForChild;
    const childName = summary?.child_name || 'הילד/ה';
    
    const variations = isChild ? [
        `היי ${name}, אני יודע שזה לא קל להחליט 😊\n\nאבל רציתי להגיד - האימונים האלה יכולים לשנות ל${childName} את הביטחון העצמי, המשמעת והאנרגיה. \n\nמה דעתך שנדבר על זה?`,
        `${name}, רק רציתי לחזור - ראינו כבר עשרות ילדים שההורים שלהם התלבטו, אבל אחרי כמה אימונים ראו שינוי משמעותי 💪\n\n${childName} ממש יכול/ה להרוויח מזה. מה דעתך?`,
        `היי ${name}, אני מבין שיש הרבה דברים לחשוב עליהם 😊\n\nאבל האימונים האלה זו באמת השקעה ב${childName} - לא רק פיזית, גם מנטלית וחברתית.\n\nעדיין מעניין?`
    ] : [
        `היי ${name}, אני יודע שזה לא קל להחליט 😊\n\nאבל רציתי להגיד - האימונים האלה יכולים לשנות לך את הביטחון העצמי, הכושר והאיזון המנטלי. \n\nמה דעתך שנדבר על זה?`,
        `${name}, רק רציתי לחזור - ראינו כבר מאות אנשים שהתלבטו, אבל אחרי כמה אימונים ראו שינוי משמעותי 💪\n\nזה באמת שווה את זה. מה דעתך?`,
        `היי ${name}, אני מבין שיש הרבה דברים בחיים 😊\n\nאבל האימונים האלה זו באמת השקעה בעצמך - לא רק פיזית, גם מנטלית וחברתית.\n\nעדיין מעניין?`
    ];
    
    return { type: 'text', message: variations[Math.floor(Math.random() * variations.length)] };
}

// ===============================
// פונקציות עזר
// ===============================

function normalizePhone(phone) {
    let cleanPhone = phone.replace('@c.us', '').replace(/[^\d+]/g, '').replace(/^\+/, '');
    
    if (cleanPhone.startsWith('0')) {
        cleanPhone = '972' + cleanPhone.substring(1);
    } else if (!cleanPhone.startsWith('972')) {
        cleanPhone = '972' + cleanPhone;
    }
    
    return cleanPhone;
}

// טעינת נתוני לקוח מה-DB
function loadClient(phone) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM clients WHERE phone = ?`, [phone], (err, client) => {
            if (err) {
                reject(err);
            } else {
                resolve(client);
            }
        });
    });
}

// טעינת סיכום שיחה מה-DB
function loadSummary(phone) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT summary_data FROM chat_summaries WHERE client_phone = ? ORDER BY created_at DESC LIMIT 1`, 
            [phone], 
            (err, row) => {
                if (err) {
                    reject(err);
                } else if (row && row.summary_data) {
                    try {
                        resolve(JSON.parse(row.summary_data));
                    } catch (e) {
                        console.warn('⚠️ שגיאה בפרסור סיכום:', e.message);
                        resolve(null);
                    }
                } else {
                    resolve(null);
                }
            }
        );
    });
}

// שליחת הודעה בודדת
async function sendMessage(chatId, messageData, attempt) {
    try {
        const chat = await whatsappClient.getChatById(chatId);
        
        if (messageData.type === 'gif') {
            const gifPath = path.join(__dirname, 'followUp.gif');
            if (fs.existsSync(gifPath)) {
                const media = MessageMedia.fromFilePath(gifPath);
                await chat.sendMessage(media);
                console.log(`✅ הודעה ${attempt}: GIF נשלח בהצלחה`);
            } else {
                console.log(`⚠️ הודעה ${attempt}: קובץ GIF לא נמצא, מדלג...`);
            }
        } else {
            await chat.sendMessage(messageData.message);
            console.log(`✅ הודעה ${attempt}: "${messageData.message.substring(0, 50)}..."`);
        }
        
        return true;
    } catch (error) {
        console.error(`❌ שגיאה בשליחת הודעה ${attempt}:`, error.message);
        return false;
    }
}

// ===============================
// לוגיקת הטסט הראשית
// ===============================

async function testFollowup(phone, attemptInput) {
    return new Promise((resolve, reject) => {
        const waitForReady = setInterval(async () => {
            if (isReady) {
                clearInterval(waitForReady);
                
                try {
                    const cleanPhone = normalizePhone(phone);
                    const chatId = cleanPhone + '@c.us';
                    
                    console.log(`\n📱 מספר טלפון: ${cleanPhone}`);
                    
                    // טעינת נתוני לקוח
                    const client = await loadClient(cleanPhone);
                    if (!client) {
                        console.log(`⚠️ לקוח לא נמצא ב-DB`);
                        reject(new Error('לקוח לא נמצא'));
                        return;
                    }
                    
                    console.log(`👤 שם לקוח: ${client.name || 'לא נמצא'}`);
                    
                    // טעינת סיכום שיחה
                    const summary = await loadSummary(cleanPhone);
                    if (summary) {
                        console.log(`📊 נמצא סיכום שיחה:`);
                        console.log(`   - שלב: ${summary.conversation_stage || 'לא צוין'}`);
                        console.log(`   - נקודות כאב: ${summary.pain_points?.join(', ') || 'אין'}`);
                        console.log(`   - הורה לילד: ${summary.isParentForChild ? 'כן' : 'לא'}`);
                        if (summary.child_name) {
                            console.log(`   - שם ילד: ${summary.child_name}`);
                        }
                    } else {
                        console.log(`⚠️ אין סיכום שיחה`);
                    }
                    
                    // קביעת טווח ניסיונות
                    let attempts = [];
                    if (attemptInput.includes('-')) {
                        const [start, end] = attemptInput.split('-').map(n => parseInt(n.trim()));
                        for (let i = start; i <= end; i++) {
                            attempts.push(i);
                        }
                    } else {
                        attempts = [parseInt(attemptInput)];
                    }
                    
                    console.log(`\n🚀 שולח ${attempts.length} הודעות...\n`);
                    
                    // שליחת הודעות
                    for (const attempt of attempts) {
                        console.log(`\n⏰ ${new Date().toLocaleTimeString('he-IL')} - הודעה ${attempt}:`);
                        
                        const messageData = await generateFollowupMessage(client, attempt, summary);
                        
                        if (messageData.type === 'text') {
                            console.log(`📝 תוכן ההודעה:\n${messageData.message}\n`);
                        } else {
                            console.log(`🎬 סוג: GIF\n`);
                        }
                        
                        await sendMessage(chatId, messageData, attempt);
                        
                        // המתנה בין הודעות (רק אם יש עוד הודעות)
                        if (attempt !== attempts[attempts.length - 1]) {
                            console.log('⏳ ממתין 5 שניות...');
                            await new Promise(r => setTimeout(r, 5000));
                        }
                    }
                    
                    console.log(`\n\n✅ סיימתי! נשלחו ${attempts.length} הודעות\n`);
                    resolve();
                    
                } catch (error) {
                    console.error('❌ שגיאה:', error.message);
                    reject(error);
                }
            }
        }, 1000);
    });
}

// ===============================
// הרצה
// ===============================

const phoneArg = process.argv[2];
const attemptArg = process.argv[3] || '1';

if (!phoneArg) {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║   🔥 בדיקת פולואו אפ - מערכת נוכחית                      ║
╚════════════════════════════════════════════════════════════╝

שימוש:
  node test_followup_current.js <מספר_טלפון> [מספר_ניסיון]

דוגמאות:
  node test_followup_current.js 0501234567 1      # הודעה ראשונה
  node test_followup_current.js 0501234567 3      # הודעה שלישית
  node test_followup_current.js 0501234567 1-10   # רצף 1-10

תכונות:
  ✅ הודעות מותאמות אישית לפי סיכום שיחה
  ✅ התייחסות לנקודות כאב ספציפיות
  ✅ הודעות מיוחדות להורים לילדים
  ✅ GIF בהודעה 2
  ✅ הודעות FOMO בהודעה 5
  ✅ הודעות מותאמות לשלב השיחה
    `);
    process.exit(1);
}

console.log(`
╔════════════════════════════════════════════════════════════╗
║   🔥 בדיקת פולואו אפ - מערכת נוכחית                      ║
╚════════════════════════════════════════════════════════════╝

📲 מתחבר ל-WhatsApp...
`);

whatsappClient.initialize();

whatsappClient.on('ready', async () => {
    try {
        await testFollowup(phoneArg, attemptArg);
        
        console.log('🎉 הכל הסתיים בהצלחה!');
        console.log('💡 סוגר את הדפדפן ומנתק...\n');
        
        setTimeout(() => {
            db.close();
            process.exit(0);
        }, 3000);
    } catch (error) {
        console.error('❌ שגיאה:', error.message);
        db.close();
        process.exit(1);
    }
});

whatsappClient.on('error', (error) => {
    console.error('❌ שגיאת WhatsApp:', error);
    process.exit(1);
});



