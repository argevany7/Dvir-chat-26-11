// ===================================
// סקריפט בדיקה - שליחת 10 הודעות פולואו אפ דרך WhatsApp
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

// פונקציה ליצירת הודעת פולואו אפ (מסונכרנת עם server.js)
function generateFollowupMessage(name, attempt) {
    // הודעה 1 - פשוטה וסקרנית
    if (attempt === 1) {
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
    
    // הודעה 3 - אני זמין
    if (attempt === 3) {
        const variations = [
            `היי ${name}, אני זמין לכל שאלה 😊`,
            `${name}, אני פה לרשותך לכל דבר 😊`,
            `היי ${name}, מוזמן לשאול אם יש שאלות 😊`
        ];
        return { type: 'text', message: variations[Math.floor(Math.random() * variations.length)] };
    }
    
    // הודעה 4 - אישית (בלי סיכום ב-live test)
    if (attempt === 4) {
        return {
            type: 'text',
            message: `היי ${name}! 😊\n\nהאימונים עדיין רלוונטיים?\n\nאם יש בעיה כלשהי בחיים כמו לחץ, חוסר ביטחון או כל אתגר אחר - זה בדיוק מה שהאימונים עוזרים לפתור 💪`
        };
    }
    
    // הודעה 5 - FOMO
    if (attempt === 5) {
        return {
            type: 'text',
            message: `${name}, מה דעתך על מה שדיברנו? זו באמת הזדמנות לשנות דברים מקצה לקצה 💪\n\nאני בטוח שזה יכול לעזור, לא כדאי לפספס את זה. מה דעתך?`
        };
    }
    
    // הודעה 6+ - וריאציות עדינות (בלי כפילויות!)
    const variations = [
        `היי ${name}, מה שלומך? 😊`,
        `${name}, מה נשמע? עדיין רלוונטי?`,
        `היי ${name}, שלום! חשבת על האימונים? 🥊`,
        `${name}, מה המצב? זה עדיין בתוכנית?`,
        `היי ${name}, מה קורה? יש עניין באימונים?`,
        `${name}, איך זה הולך? האימונים עדיין מעניינים?`,
        `היי ${name}, מה חדש? רלוונטי עדיין?`
    ];
    return { type: 'text', message: variations[Math.floor(Math.random() * variations.length)] };
}

// פונקציה לשליחת הודעה בודדת
async function sendMessage(chatId, messageData, attempt) {
    try {
        const chat = await whatsappClient.getChatById(chatId);
        
        if (messageData.type === 'gif') {
            const gifPath = path.join(__dirname, 'followUp.gif');
            if (fs.existsSync(gifPath)) {
                const media = MessageMedia.fromFilePath(gifPath);
                await chat.sendMessage(media);
                console.log(`✅ הודעה ${attempt}/10: GIF נשלח בהצלחה`);
            } else {
                console.log(`⚠️ הודעה ${attempt}/10: קובץ GIF לא נמצא, מדלג...`);
            }
        } else {
            await chat.sendMessage(messageData.message);
            console.log(`✅ הודעה ${attempt}/10: "${messageData.message.substring(0, 40)}..."`);
        }
        
        return true;
    } catch (error) {
        console.error(`❌ שגיאה בשליחת הודעה ${attempt}:`, error.message);
        return false;
    }
}

// פונקציה לשליחת הודעות ברצף
async function sendFollowupSequence(phone) {
    return new Promise((resolve, reject) => {
        // המתנה לחיבור WhatsApp
        const waitForReady = setInterval(() => {
            if (isReady) {
                clearInterval(waitForReady);
                
                // נרמול מספר טלפון
                let cleanPhone = phone.replace('@c.us', '').replace(/[^\d+]/g, '').replace(/^\+/, '');
                
                if (cleanPhone.startsWith('0')) {
                    cleanPhone = '972' + cleanPhone.substring(1);
                } else if (!cleanPhone.startsWith('972')) {
                    cleanPhone = '972' + cleanPhone;
                }
                
                const chatId = cleanPhone + '@c.us';
                console.log(`\n📱 שולח ל: ${cleanPhone}`);
                
                // טעינת נתוני לקוח
                db.get(`SELECT * FROM clients WHERE phone = ?`, [cleanPhone], async (err, client) => {
                    if (err) {
                        console.error('❌ שגיאה בטעינת לקוח:', err.message);
                        reject(err);
                        return;
                    }
                    
                    const clientName = client?.name || client?.full_name || 'היי';
                    console.log(`👤 שם לקוח: ${clientName}`);
                    console.log(`\n🚀 מתחיל שליחת 10 הודעות עם הפרש של 5 שניות...\n`);
                    
                    // שליחת 10 הודעות
                    for (let i = 1; i <= 10; i++) {
                        console.log(`\n⏰ ${new Date().toLocaleTimeString('he-IL')} - הודעה ${i}/10:`);
                        
                        const messageData = generateFollowupMessage(clientName, i);
                        await sendMessage(chatId, messageData, i);
                        
                        // המתנה של 5 שניות (חוץ מאחרי ההודעה האחרונה)
                        if (i < 10) {
                            console.log('⏳ ממתין 5 שניות...');
                            await new Promise(r => setTimeout(r, 5000));
                        }
                    }
                    
                    console.log(`\n\n✅ סיימתי! נשלחו 10 הודעות פולואו אפ ל-${clientName}\n`);
                    resolve();
                });
            }
        }, 1000);
    });
}

// הרצה
const phoneArg = process.argv[2];

if (!phoneArg) {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║   🔥 בדיקת פולואו אפ LIVE - שליחה דרך WhatsApp           ║
╚════════════════════════════════════════════════════════════╝

שימוש:
  node test_followup_live.js <מספר_טלפון>

דוגמה:
  node test_followup_live.js 0501234567
  node test_followup_live.js 972501234567

⚠️ הסקריפט ישלח 10 הודעות אמיתיות דרך WhatsApp!
   הפרש של 5 שניות בין כל הודעה.
    `);
    process.exit(1);
}

console.log(`
╔════════════════════════════════════════════════════════════╗
║   🔥 בדיקת פולואו אפ LIVE                                ║
║   שליחת 10 הודעות אמיתיות דרך WhatsApp                   ║
╚════════════════════════════════════════════════════════════╝

📲 מתחבר ל-WhatsApp...
`);

whatsappClient.initialize();

// המתנה לחיבור ואז שליחה
whatsappClient.on('ready', async () => {
    try {
        await sendFollowupSequence(phoneArg);
        
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


