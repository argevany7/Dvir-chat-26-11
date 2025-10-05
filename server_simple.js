
const express = require('express');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');
const { Client, NoAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// יצירת מאגר מידע
const db = new sqlite3.Database('./dvir_basson_clients.db', (err) => {
    if (err) {
        console.error('❌ שגיאה בחיבור למאגר מידע:', err.message);
    } else {
        console.log('✅ חיבור למאגר מידע הושלם בהצלחה');
        initializeDatabase();
    }
});

// יצירת הטבלאות הנדרשות
function initializeDatabase() {
    // טבלת לקוחות - מאגר מידע מצומצם לפי הדרישות החדשות
    db.run(`CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT UNIQUE NOT NULL,
        name TEXT,
        full_name TEXT,
        age INTEGER,
        experience TEXT,
        coming_to_trial BOOLEAN DEFAULT FALSE,
        lead_status TEXT DEFAULT 'conversation_started',
        appointment_date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // טבלת שיחות
    db.run(`CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_phone TEXT,
        message_role TEXT,
        message_content TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_phone) REFERENCES clients (phone)
    )`);
    
    // טבלת פגישות
    db.run(`CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_phone TEXT,
        appointment_date TEXT,
        appointment_type TEXT,
        status TEXT DEFAULT 'scheduled',
        payment_confirmed BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_phone) REFERENCES clients (phone)
    )`);
    
    // Chat summaries table for advanced analytics
    db.run(`CREATE TABLE IF NOT EXISTS chat_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_phone TEXT,
        summary_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_phone) REFERENCES clients (phone)
    )`);
    
    console.log('✅ Database tables created successfully');

    // מיגרציה: הוספת העמודה coming_to_trial אם חסרה (DB קיים ישן)
    db.run(`ALTER TABLE clients ADD COLUMN coming_to_trial BOOLEAN DEFAULT FALSE`, (err) => {
        if (err) {
            if (/duplicate column name/i.test(err.message)) {
                console.log('ℹ️ העמודה coming_to_trial כבר קיימת');
            } else {
                console.error('⚠️ שגיאה במיגרציה של coming_to_trial:', err.message);
            }
        } else {
            console.log('✅ נוספה עמודה coming_to_trial לטבלת clients');
        }
    });

    // מיגרציה: הוספת עמודות חדשות
    const newColumns = [
        { name: 'full_name', type: 'TEXT' },
        { name: 'lead_status', type: 'TEXT DEFAULT "conversation_started"' },
        { name: 'appointment_date', type: 'TEXT' }
    ];

    newColumns.forEach(column => {
        db.run(`ALTER TABLE clients ADD COLUMN ${column.name} ${column.type}`, (err) => {
            if (err) {
                if (/duplicate column name/i.test(err.message)) {
                    console.log(`ℹ️ העמודה ${column.name} כבר קיימת`);
                } else {
                    console.error(`⚠️ שגיאה במיגרציה של ${column.name}:`, err.message);
                }
            } else {
                console.log(`✅ נוספה עמודה ${column.name} לטבלת clients`);
            }
        });
    });
}

// פונקציות מאגר מידע - UPSERT מתקדם
function saveClientToDB(sessionId, profile) {
    const phone = sessionId.replace('@c.us', '');
    
    // בדיקה קודם של מה שקיים במאגר
    db.get(`SELECT * FROM clients WHERE phone = ?`, [phone], (err, existingClient) => {
        if (err) {
            console.error('❌ שגיאה בבדיקת לקוח קיים:', err.message);
            return;
        }
        
        // רק עדכון שדות שיש בהם שינוי
        const fieldsToUpdate = [];
        const valuesToUpdate = [];
        
        if (profile.name && (!existingClient || existingClient.name !== profile.name)) {
            fieldsToUpdate.push('name = ?');
            valuesToUpdate.push(profile.name);
        }
        
        if (profile.fullName && (!existingClient || existingClient.full_name !== profile.fullName)) {
            fieldsToUpdate.push('full_name = ?');
            valuesToUpdate.push(profile.fullName);
        }
        
        // Improved age handling - prioritize specific age fields
        const age = profile.age || profile.childAge;
        if (age && (!existingClient || existingClient.age !== age)) {
            fieldsToUpdate.push('age = ?');
            valuesToUpdate.push(age);
            console.log('📏 Updating age in database:', age);
        }
        
        const experience = profile.experienceDuration || 'ללא ניסיון';
        if (!existingClient || existingClient.experience !== experience) {
            fieldsToUpdate.push('experience = ?');
            valuesToUpdate.push(experience);
        }
        
        if (profile.leadStatus && (!existingClient || existingClient.lead_status !== profile.leadStatus)) {
            fieldsToUpdate.push('lead_status = ?');
            valuesToUpdate.push(profile.leadStatus);
        }
        
        if (profile.appointmentDate && (!existingClient || existingClient.appointment_date !== profile.appointmentDate)) {
            fieldsToUpdate.push('appointment_date = ?');
            valuesToUpdate.push(profile.appointmentDate);
        }
        
        if (typeof profile.comingToTrial === 'boolean' && (!existingClient || existingClient.coming_to_trial !== profile.comingToTrial)) {
            fieldsToUpdate.push('coming_to_trial = ?');
            valuesToUpdate.push(profile.comingToTrial ? 1 : 0);
        }
        
        // If no fields to update, don't do anything
        if (fieldsToUpdate.length === 0 && existingClient) {
            console.log('ℹ️ No changes detected for client:', maskSensitiveData(phone));
            return; // No changes, don't save
        }
        
        if (!existingClient) {
            // לקוח חדש - יצירה
            db.run(`INSERT INTO clients 
                (phone, name, full_name, age, experience, coming_to_trial, lead_status, appointment_date, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [phone, profile.name, profile.fullName, age, experience, profile.comingToTrial || false, profile.leadStatus || 'conversation_started', profile.appointmentDate || profile.fullAppointmentDetails],
                function(err) {
                    if (err) {
                        console.error('❌ Error creating new client:', err.message);
                    } else {
                        console.log('✅ New client created in database:', maskSensitiveData(phone));
                    }
                });
        } else {
            // עדכון של שדות שהשתנו בלבד
            fieldsToUpdate.push('updated_at = CURRENT_TIMESTAMP');
            valuesToUpdate.push(phone);
            
            const query = `UPDATE clients SET ${fieldsToUpdate.join(', ')} WHERE phone = ?`;
            
            db.run(query, valuesToUpdate, function(err) {
                if (err) {
                    console.error('❌ Error updating client:', err.message);
                } else {
                    console.log(`✅ Client updated (${fieldsToUpdate.length-1} fields):`, maskSensitiveData(phone));
                }
            });
        }
    });
}

function saveConversationToDB(sessionId, role, content) {
    return new Promise((resolve) => {
        const phone = sessionId.replace('@c.us', '');
        
        db.run(`INSERT INTO conversations (client_phone, message_role, message_content) VALUES (?, ?, ?)`,
            [phone, role, content], function(err) {
                if (err) {
                    console.error('❌ Error saving conversation:', err.message);
                } else {
                    console.log('💾 Message saved:', role);
                }
                resolve();
            });
    });
}

function saveAppointmentToDB(sessionId, appointmentType, appointmentDate) {
    const phone = sessionId.replace('@c.us', '');
    
    db.run(`INSERT INTO appointments (client_phone, appointment_date, appointment_type) VALUES (?, ?, ?)`,
        [phone, appointmentDate, appointmentType], function(err) {
        if (err) {
            console.error('❌ Error saving appointment:', err.message);
        } else {
            console.log('✅ Appointment saved to database:', maskSensitiveData(phone));
        }
        });
}

// הפונקציה הוסרה - משתמשים ב-loadClientInfo במקום

// טעינת בסיס הידע
let knowledgeBase = null;
try {
    const knowledgeData = fs.readFileSync(path.join(__dirname, 'dvir_basson_knowledge_base.json'), 'utf8');
    knowledgeBase = JSON.parse(knowledgeData);
    console.log('✅ בסיס הידע נטען בהצלחה');
} catch (error) {
    console.error('❌ שגיאה בטעינת בסיס הידע:', error.message);
    process.exit(1);
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Create WhatsApp client
const whatsappClient = new Client({
    authStrategy: new NoAuth(),
    puppeteer: {
        headless: false,
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--user-data-dir=/tmp/chrome-user-data',
            '--remote-debugging-port=9222'
        ]
    }
});

// משתנה לשמירת QR code
let qrCodeData = '';
let isWhatsAppReady = false;
let messageCount = 0;

// אירועי הווטסאפ
whatsappClient.on('qr', async (qr) => {
    console.log('📱 קוד QR נוצר - סרוק עם הווטסאפ שלך');
    console.log('🍎 מאק זוהה - אם חלון כרום ריק, נסה את כתובת הקוד QR למטה:');
    qrCodeData = await qrcode.toDataURL(qr);
    console.log('🔗 קוד QR זמין בכתובת: http://localhost:' + PORT + '/qr');
    console.log('💡 טיפ למאק: אם חלון כרום מציג דף ריק, סגור אותו והשתמש בכתובת למעלה');
});

whatsappClient.on('ready', () => {
    console.log('✅ לקוח ווטסאפ מוכן לפעולה');
    console.log('🎯 הבוט מאזין כעת להודעות נכנסות...');
    isWhatsAppReady = true;
});

whatsappClient.on('authenticated', () => {
    console.log('🔐 אימות ווטסאפ הושלם');
    console.log('⏳ ממתין לאירוע מוכנות... (זה אמור לקרות תוך 30 שניות)');
    
    // זמן קצוב לזיהוי תקיעות
    setTimeout(() => {
        if (!isWhatsAppReady) {
            console.error('⚠️ אזהרה: עדיין לא מוכן אחרי 45 שניות! החיבור עלול להיות תקוע.');
            console.log('💡 נסה לסגור חלונות כרום ולהפעיל את השרת מחדש.');
        }
    }, 45000);
});

whatsappClient.on('loading_screen', (percent, message) => {
    console.log('📶 ווטסאפ נטען:', percent + '%', message);
    if (percent === 100) {
        console.log('⏳ טעינה הושלמה, ממתין לאירוע מוכנות...');
    }
});

whatsappClient.on('auth_failure', (msg) => {
    console.error('❌ שגיאת אימות ווטסאפ:', msg);
});

whatsappClient.on('disconnected', (reason) => {
    console.log('⚠️ לקוח ווטסאפ התנתק:', reason);
    isWhatsAppReady = false;
    // ניקוי קוד QR כשמתנתק כדי לאלץ יצירת חדש
    qrCodeData = '';
});

whatsappClient.on('change_state', (state) => {
    console.log('🔄 מצב ווטסאפ השתנה:', state);
});

whatsappClient.on('contact_changed', (message, oldId, newId, isContact) => {
    console.log('👤 איש קשר השתנה:', message.from);
});

whatsappClient.on('group_join', (notification) => {
    console.log('👥 התווסף לקבוצה:', notification);
});

whatsappClient.on('media_uploaded', (message) => {
    console.log('📎 מדיה הועלתה:', message.type);
});

// טיפול בשגיאות
whatsappClient.on('error', (error) => {
    console.error('❌ שגיאת לקוח ווטסאפ:', error);
});

// מעקב סטטוס חיבור
whatsappClient.on('remote_session_saved', () => {
    console.log('💾 הפגישה המרוחקת נשמרה');
});

// Function to check if current time is within working hours
function isWorkingHours() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const hour = now.getHours();
    
    // Saturday (6) - no response
    if (dayOfWeek === 6) {
        return false;
    }
    
    // Sunday (0) to Thursday (4) - 7:00 to 23:00
    if (dayOfWeek >= 0 && dayOfWeek <= 4) {
        return hour >= 7 && hour < 23;
    }
    
    // Friday (5) - 7:00 to 16:00
    if (dayOfWeek === 5) {
        return hour >= 7 && hour < 16;
    }
    
    return false;
}

// Function to get working hours message
function getWorkingHoursMessage() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    
    if (dayOfWeek === 6) { // Saturday
        return 'שבת שלום 🙏\nאני זמין לענות על הודעות מיום ראשון עד חמישי בין השעות 7:00-23:00, ובימי שישי עד 16:00.\nאשיב במהלך שעות הפעילות';
    } else if (dayOfWeek === 5 && now.getHours() >= 16) { // Friday after 16:00
        return 'שבת שלום 🙏\nאני זמין לענות על הודעות עד 16:00 בימי שישי.\nאשיב ביום ראשון החל מ-7:00 בבוקר';
    } else { // Other days outside working hours
        return 'היי 😊\nאני זמין לענות על הודעות בין השעות 7:00-23:00 מיום ראשון עד חמישי, ובימי שישי עד 16:00.\nאשיב במהלך שעות הפעילות';
    }
}

// Function to send appointment summary to Dvir
async function sendAppointmentSummary(clientInfo, appointmentDetails) {
    try {
        const dvirNumber = '0532861226@c.us'; // WhatsApp format
        const currentDate = new Date().toLocaleString('he-IL', {
            timeZone: 'Asia/Jerusalem',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const summary = `סיכום פגישה שנקבעה
תאריך קביעה: ${currentDate}
${clientInfo.appointmentDate ? `תאריך אימון: ${clientInfo.appointmentDate}` : ''}
שם לקוח: ${clientInfo.name || 'לא צוין'}
מספר לקוח: ${clientInfo.phone || 'לא ידוע'}
סוג אימון: ${appointmentDetails.type || 'לא צוין'}
גיל: ${clientInfo.age || clientInfo.childAge || 'לא צוין'}
${clientInfo.personalNeeds && clientInfo.personalNeeds.length > 0 ? `צרכים אישיים: ${clientInfo.personalNeeds.join(', ')}` : ''}
פרטים נוספים: ${appointmentDetails.details || 'אין'}`;
        
        await whatsappClient.sendMessage(dvirNumber, summary);
        console.log('📨 נשלח סיכום פגישה לדביר');
    } catch (error) {
        console.error('❌ שגיאה בשליחת סיכום לדביר:', error);
    }
}

// Function to send payment confirmation to the specified number
async function sendPaymentConfirmation(clientInfo, paymentDetails) {
    try {
        const managerNumber = '972559925657@c.us'; // WhatsApp format with country code
        const currentDate = new Date().toLocaleString('he-IL', {
            timeZone: 'Asia/Jerusalem',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const paymentSummary = `אישור תשלום התקבל
תאריך: ${currentDate}
שם לקוח: ${clientInfo.name || 'לא צוין'}
מספר לקוח: ${clientInfo.phone || 'לא ידוע'}
סוג אימון: ${paymentDetails.type || 'אימון ניסיון'}
גיל: ${clientInfo.age || clientInfo.childAge || 'לא צוין'}
סטטוס: הלקוח אישר ביצוע תשלום
הערות: ${paymentDetails.notes || 'הלקוח עדכן שהוא ביצע תשלום לאימון ניסיון'}`;
        
        await whatsappClient.sendMessage(managerNumber, paymentSummary);
        console.log('📨 נשלח אישור תשלום למנהל');
    } catch (error) {
        console.error('❌ שגיאה בשליחת אישור תשלום:', error);
    }
}

// Function to send appointment notification to Dvir when client books trial
async function sendAppointmentNotificationToDvir(clientInfo, appointmentDetails) {
    try {
        const dvirNumber = '0532861226@c.us'; // WhatsApp format
        const currentDate = new Date().toLocaleString('he-IL', {
            timeZone: 'Asia/Jerusalem',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // קביעת קבוצת גיל
        const age = clientInfo.age || clientInfo.childAge;
        let ageGroup = 'לא צוין';
        if (age) {
            if (age <= 12) ageGroup = 'ילדים';
            else if (age <= 17) ageGroup = 'נוער';
            else ageGroup = 'בוגרים';
        }
        
        const notification = `HOT LEAD ALERT! New Client Incoming!

Client Name: ${clientInfo.name || 'Not specified'}
Age: ${age || 'Not specified'} (${ageGroup} group)
Client Phone: ${clientInfo.phone || 'Unknown'}
Experience Level: ${clientInfo.experience || 'Fresh beginner - perfect!'}
Training Session: ${appointmentDetails.date || 'TBD - need to schedule'}
Price Point: ${appointmentDetails.price || '25 NIS'}

STATUS: Payment link sent - waiting for that sweet confirmation!

Lead captured: ${currentDate}`;
        
        await whatsappClient.sendMessage(dvirNumber, notification);
        console.log('📨 Message sent to Dvir about new client');
        
    } catch (error) {
        console.error('❌ Error sending message to Dvir about new client:', error.message);
    }
}

// Function to send payment notification to Dvir with client details
async function sendPaymentNotificationToDvir(clientInfo, paymentDetails) {
    try {
        const dvirNumber = '0532861226@c.us'; // WhatsApp format
        const currentDate = new Date().toLocaleString('he-IL', {
            timeZone: 'Asia/Jerusalem',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // קביעת קבוצת גיל
        const age = clientInfo.age || clientInfo.childAge;
        let ageGroup = 'לא צוין';
        if (age) {
            if (age <= 12) ageGroup = 'ילדים';
            else if (age <= 17) ageGroup = 'נוער';
            else ageGroup = 'בוגרים';
        }
        
        // Enhanced notification format - exciting but professional
        const notification = `MONEY ALERT! Payment Confirmed!

Client Name: ${clientInfo.fullName || clientInfo.name || 'Not specified'}
Age: ${age || 'Not specified'}
Phone: ${clientInfo.phone || 'Unknown'}
Experience: ${clientInfo.experience || 'No previous experience'}
Trial Session Date: ${clientInfo.appointmentDate || clientInfo.fullAppointmentDetails || 'Not scheduled yet'}
Age Group: ${ageGroup}
Client Notes: ${paymentDetails.notes || 'No special notes'}

CLIENT SAYS PAYMENT COMPLETED! Please verify in payment system - this could be our next success story!

Direct contact: ${clientInfo.phone || 'Unknown'}

Report Date: ${currentDate}`;
        
        await whatsappClient.sendMessage(dvirNumber, notification);
        console.log('📨 נשלחה הודעה לדביר עם פרטי הלקוח');
        
        // Send exciting summary to manager in international format
        const managerIntl = '972559925657@c.us';
        const closingMessage = `CA-CHING! PAYMENT CONFIRMED! Client: ${clientInfo.fullName || clientInfo.name || 'Not specified'} - Show me the money! Another successful conversion!`;
        await whatsappClient.sendMessage(managerIntl, closingMessage);
        console.log('📨 Summary message sent to 972559925657');
        
    } catch (error) {
        console.error('❌ Error sending message to Dvir:', error.message);
    }
}

// טיפול בהודעות ווטסאפ נכנסות
whatsappClient.on('message', async (message) => {
    messageCount++;
    console.log('📬 התקבלה הודעת ווטסאפ מספר ' + messageCount);
        console.log('📨 Content:', maskSensitiveData(message.body));
        console.log('👤 From:', maskSensitiveData(message.from));
        console.log('📱 Type:', message.type);
    
    try {
        // התעלמות מהודעות יוצאות
        if (message.fromMe) {
            console.log('⬅️ מתעלם מהודעה יוצאת');
            return;
        }
        
        // התעלמות מהודעות קבוצה (אופציונלי)
        const chat = await message.getChat();
        if (chat.isGroup) {
            console.log('👥 מתעלם מהודעת קבוצה');
            return;
        }
        
        // בדיקת שעות פעילות
        if (!isWorkingHours()) {
            const workingHoursMessage = getWorkingHoursMessage();
            await message.reply(workingHoursMessage);
            console.log('⏰ הודעה נשלחה מחוץ לשעות פעילות');
            return;
        }
        
        console.log('✅ Processing private message...');
        
        // שימוש במספר טלפון כמזהה הפגישה
        const sessionId = message.from;
        
        // קריאה לפונקציית עיבוד הודעה הקיימת
        const response = await processMessage(message.body, sessionId);
        
        // שליחת תגובה רק אם יש תשובה (לא ריק/null)
        if (response) {
            await message.reply(response);
            console.log('📤 WhatsApp response sent:', maskSensitiveData(response));
            
            // בדיקה אם התשובה מכילה קישור תשלום - אז נשלח הודעה לדביר
            if (response.includes('letts.co.il/payment/')) {
                console.log('💰 Payment link detected - sending notification to Dvir about new client');
                
                // טעינת מידע הלקוח
                const clientInfo = await loadClientInfo(sessionId);
                const phone = sessionId.replace('@c.us', '');
                const currentProfile = userProfiles[sessionId] || {};
                
                // עדכון סטטוס הליד
                currentProfile.leadStatus = 'awaiting_payment';
                currentProfile.comingToTrial = true;
                
                console.log('📋 Client info for Dvir notification:', maskSensitiveData(JSON.stringify(clientInfo)));
                
                // קביעת קבוצת גיל
                const age = clientInfo.age || clientInfo.childAge;
                let ageGroup = 'לא צוין';
                if (age) {
                    if (age <= 12) ageGroup = 'ילדים';
                    else if (age <= 17) ageGroup = 'נוער';
                    else ageGroup = 'בוגרים';
                }
                
                const appointmentDetails = {
                    type: 'אימון ניסיון',
                    date: currentProfile.appointmentDate || clientInfo.appointmentDate || 'לא נקבע עדיין',
                    price: response.includes('OEVGZEpZaktQ') ? '10 שח (ילדים/נוער)' : '25 שח (בוגרים)',
                    ageGroup: ageGroup
                };
                
                // שליחת הודעה לדביר על לקוח חדש
                try {
                    await sendAppointmentNotificationToDvir({
                        ...clientInfo,
                        phone: phone
                    }, appointmentDetails);

                    // הודעת סיכום למנהל בפורמט בינלאומי
                    const managerIntl = '972559925657@c.us';
                    const managerMsg = `NEW CLIENT - PAYMENT LINK SENT\n\nName: ${clientInfo.name || 'Not specified'}\nAge: ${clientInfo.age || clientInfo.childAge || 'Not specified'}\nTraining Date: ${appointmentDetails.date}\nGroup: ${appointmentDetails.ageGroup || 'Not specified'}\nNext: Wait for payment confirmation`;
                    await whatsappClient.sendMessage(managerIntl, managerMsg);
                    console.log('✅ Messages sent to Dvir and manager successfully');
                } catch (error) {
                    console.error('❌ Error sending messages to Dvir/manager:', error.message);
                    // Don't report success when there's an error
                }
            }
        } else {
            console.log('📤 No response sent (empty/null message)');
        }
        
    } catch (error) {
        console.error('❌ Error handling WhatsApp message:', error.message);
        // Don't send error message - just log the error
        console.log('📤 No response sent due to error');
    }
});

// פונקציה לזיהוי תשלום בהודעה
function detectPaymentConfirmation(message) {
    const lowerMessage = message.toLowerCase().trim();
    
    console.log('🔍 Checking message for payment detection:', lowerMessage);
    
    // ביטויים ברורים - לא צריך לשאול שוב
    const clearPaymentPatterns = [
        /שילמתי/, /כן שילמתי/, /בטח שילמתי/, /ביצעתי תשלום/,
        /הכסף הועבר/, /התשלום בוצע/, /עברתי תשלום/, /שלחתי/,
        /סיימתי לשלם/, /עשיתי תשלום/, /כבר שילמתי/, /תשלמתי/,
        /כבר ביצעתי/, /ביצעתי כבר/
    ];
    
    // ביטויים לא ברורים - צריך לשאול לוודא
    const unclearPaymentPatterns = [
        /^עדכן$/, /^סגרתי$/, /^בוצע$/, /^נעשה$/, /^הועבר$/,
        /^סגור$/, /^מוכן$/, /הכל בסדר/, /^זה$/
    ];
    
    const isClearPayment = clearPaymentPatterns.some(pattern => {
        const match = pattern.test(lowerMessage);
        if (match) console.log('✅ Clear payment expression detected:', pattern.source);
        return match;
    });
    
    const isUnclearPayment = unclearPaymentPatterns.some(pattern => {
        const match = pattern.test(lowerMessage);
        if (match) console.log('⚠️ Unclear payment expression detected:', pattern.source);
        return match;
    });
    
    const result = {
        detected: isClearPayment || isUnclearPayment,
        isClear: isClearPayment,
        isUnclear: isUnclearPayment
    };
    
    console.log('📊 Payment detection result:', result);
    return result;
}

// פונקציה לזיהוי אישור תשלום (כן/לא)
function detectPaymentConfirmationResponse(message) {
    const lowerMessage = message.toLowerCase().trim();
    
    const positiveResponses = [
        /^כן$/, /^בטח$/, /^ודאי$/, /^נכון$/, /^כמובן$/,
        /^כן שילמתי$/, /^כן ביצעתי$/, /^בטח שכן$/,
        /^אמת$/, /^נכון לגמרי$/, /^בוודאי$/
    ];
    
    const negativeResponses = [
        /^לא$/, /^עדיין לא$/, /^לא עדיין$/, /^לא שילמתי$/,
        /^טרם$/, /^עוד לא$/, /^לא ביצעתי$/
    ];
    
    const isPositive = positiveResponses.some(pattern => pattern.test(lowerMessage));
    const isNegative = negativeResponses.some(pattern => pattern.test(lowerMessage));
    
    return { isPositive, isNegative };
}

// פונקציה לעיבוד הודעה - ארכיטקטורה חדשה: כל הלוגיקה ב-GPT
async function processMessage(message, sessionId = 'default') {
    if (!message || message.trim() === '') {
        return null;
    }

    console.log('📨 מעבד הודעה:', message);

    // בדיקה אם השיחה הסתיימה (אחרי "נתראה באימון")
    const userProfile = userProfiles[sessionId] || {};
    if (userProfile.conversationEnded) {
        // בדיקה אם זו שאלה ספציפית (מכילה סימן שאלה או מילות שאלה)
        const isQuestion = message.includes('?') || message.includes('איך') || message.includes('מה') || 
                          message.includes('מתי') || message.includes('איפה') || message.includes('למה') ||
                          message.includes('כמה') || message.includes('מי') || message.includes('האם');
        
        if (!isQuestion) {
            console.log('🔚 השיחה הסתיימה ולא זוהתה שאלה ספציפית - לא עונה');
            return null; // לא עונה על הודעות רגילות אחרי סגירה
        } else {
            console.log('❓ זוהתה שאלה ספציפית אחרי סגירת השיחה - עונה');
        }
    }

    // חילוץ מידע אישי מההודעה
    extractPersonalInfo(message, sessionId);
    
    // עדכון סטטוס ליד בהתאם לשלב בשיחה
    if (!userProfiles[sessionId]) {
        userProfiles[sessionId] = {};
    }
    if (!userProfiles[sessionId].leadStatus) {
        userProfiles[sessionId].leadStatus = 'conversation_started';
    }

    // בדיקה אם זה אישור תשלום
    const paymentDetection = detectPaymentConfirmation(message);
    const paymentConfirmation = detectPaymentConfirmationResponse(message);
    
    console.log('🔍 זיהוי תשלום:', {
        detected: paymentDetection.detected,
        isClear: paymentDetection.isClear,
        isUnclear: paymentDetection.isUnclear,
        positiveConfirmation: paymentConfirmation.isPositive,
        negativeConfirmation: paymentConfirmation.isNegative
    });
    
    // טעינת היסטוריית השיחה מהמאגר
    const conversationHistory = await loadConversationHistory(sessionId);
    
    // בדיקה אם ההודעה הקודמת הייתה שאלה על תשלום
    const lastMessage = conversationHistory[conversationHistory.length - 1];
    const wasAskedAboutPayment = lastMessage && lastMessage.role === 'assistant' && 
        (lastMessage.content.includes('האם שילמת') || 
         lastMessage.content.includes('האם ביצעת את התשלום') ||
         lastMessage.content.includes('שילמת') ||
         lastMessage.content.includes('ביצעת את התשלום') ||
         lastMessage.content.includes('תשלום'));

    // יצירת הודעות למודל GPT (system + כל ההיסטוריה + הודעה חדשה)
    const messages = await buildGPTMessages(conversationHistory, message, sessionId);

    console.log('🔍 שולח ל-GPT עם', messages.length, 'הודעות');

    const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: messages,
        temperature: 0.3,
        presence_penalty: 0.3,
        frequency_penalty: 0.3
    });

    const response = completion.choices[0].message.content;

    console.log('📤 תשובה מ-GPT:', response);
    
    // Enhanced date detection from GPT responses with better saving
    const gptDatePatterns = [
        /ביום\s+(\w+)\s+הקרוב\s+בשעה\s+(\d{1,2}):(\d{2})/, // "ביום חמישי הקרוב בשעה 20:15"
        /ביום\s+(\w+)\s+בשעה\s+(\d{1,2}):(\d{2})/, // "ביום חמישי בשעה 20:15"  
        /ב(\w+)\s+הקרוב\s+בשעה\s+(\d{1,2}):(\d{2})/, // "בחמישי הקרוב בשעה 20:15"
        /ב(\w+)\s+בשעה\s+(\d{1,2}):(\d{2})/, // "בחמישי בשעה 20:15"
        /(\w+)\s+הקרוב\s+בשעה\s+(\d{1,2}):(\d{2})/, // "חמישי הקרוב בשעה 20:15"
        /(\w+)\s+בשעה\s+(\d{1,2}):(\d{2})/ // "חמישי בשעה 20:15"
    ];
    
    for (const pattern of gptDatePatterns) {
        const match = response.match(pattern);
        if (match) {
            const day = match[1];
            const hour = match[2] || match[3]; // Handle different capture groups
            const minute = match[3] || match[4];
            
            const fullAppointmentDetails = `יום ${day} הקרוב בשעה ${hour}:${minute}`;
            
            if (!userProfiles[sessionId]) {
                userProfiles[sessionId] = {};
            }
            userProfiles[sessionId].appointmentDate = fullAppointmentDetails;
            userProfiles[sessionId].appointmentTime = `בשעה ${hour}:${minute}`;
            userProfiles[sessionId].fullAppointmentDetails = fullAppointmentDetails;
            userProfiles[sessionId].leadStatus = 'appointment_scheduled';
            
            console.log('📅 Date detected from GPT response:', fullAppointmentDetails);
            
            // Force save to database immediately when appointment date is set
            saveClientToDB(sessionId, userProfiles[sessionId]);
            break;
        }
    }

    // Check if this is a closing message and generate chat summary
    if (response.includes('נתראה ב') || response.includes('נתראה באימון') || response.includes('נתראה ביום')) {
        console.log('🔚 Closing message detected - conversation ending');
        // Mark conversation as ended
        if (!userProfiles[sessionId]) {
            userProfiles[sessionId] = {};
        }
        userProfiles[sessionId].conversationEnded = true;
        
        // Generate and save chat summary
        await generateChatSummary(sessionId, conversationHistory, message, response);
    }

    // שמירת ההודעות החדשות במאגר
    await saveConversationToDB(sessionId, 'user', message);
    await saveConversationToDB(sessionId, 'assistant', response);

    // טיפול באישור תשלום ובקשת שם מלא
    const currentProfile = userProfiles[sessionId] || {};
    
        // אם קיבלנו שם מלא - שמור אפוינטמנט ושלח סיכום
    if (currentProfile.waitingForFullName === false && currentProfile.fullName && currentProfile.paymentConfirmed) {
        console.log('💰 Full name received - saving appointment and sending summary');
        
        // שמירת אפוינטמנט
        const phone = sessionId.replace('@c.us', '');
        const appointmentDate = currentProfile.appointmentDate || currentProfile.fullAppointmentDetails || 'Not scheduled';
        
        // עדכון סטטוס האפוינטמנט מ-awaiting_payment ל-confirmed
        db.run(`UPDATE appointments SET status = 'confirmed', payment_confirmed = true WHERE client_phone = ? AND status = 'awaiting_payment'`,
            [phone], 
            function(err) {
                if (err) {
                    console.error('❌ Error updating appointment status:', err.message);
                    // אם אין אפוינטמנט קיים, יצור חדש
                    db.run(`INSERT INTO appointments (client_phone, appointment_date, appointment_type, status, payment_confirmed) VALUES (?, ?, ?, ?, ?)`,
                        [phone, appointmentDate, 'אימון ניסיון', 'confirmed', true], 
                        function(err) {
                            if (err) {
                                console.error('❌ Error saving appointment:', err.message);
                            } else {
                                console.log('✅ Appointment saved:', appointmentDate);
                            }
                        });
                } else {
                    console.log('✅ Appointment status updated to confirmed:', appointmentDate);
                }
            });

        // עדכון סטטוס ליד
        currentProfile.leadStatus = 'paid_and_confirmed';
        currentProfile.comingToTrial = true;
        
        // שליחת סיכום לדביר ולמנהל
        const clientInfo = await loadClientInfo(sessionId);
        const paymentDetails = {
            type: 'אימון ניסיון',
            notes: 'הלקוח שילם ואישר פרטים'
        };
        
        try {
            await sendPaymentNotificationToDvir({
                ...clientInfo,
                phone: phone,
                fullName: currentProfile.fullName
            }, paymentDetails);
            console.log('✅ Message sent to Dvir and manager successfully');
            
            // שליחת הודעת אישור תשלום ללקוח
            const age = clientInfo.age || clientInfo.childAge;
            const price = (age && age <= 17) ? '10 ש"ח' : '25 ש"ח';
            const confirmationMessage = `מדהים! התשלום שלך התקבל בהצלחה 🎉

פרטי האימון:
📅 תאריך: ${appointmentDate}
📍 מיקום: הרצוג 12, הרצליה
💰 מחיר: ${price}

מה להביא:
• בגדי ספורט (בלי רוכסניי מתכת)
• מים
• מגבת

יש ציוד מיגון במכון לאימון הראשון.

נשמח לראות אותך באימון! אם יש שאלות, תרגיש חופשי לשאול 😊`;
            
            await whatsappClient.sendMessage(sessionId, confirmationMessage);
            console.log('✅ Payment confirmation sent to client');
            
        } catch (error) {
            console.error('❌ Error sending message to Dvir and manager:', error.message);
            // Don't report success when there's an error
        }
        
        // איפוס דגלים
        currentProfile.paymentConfirmed = false;
        
    } else {
        // לוגיקה קיימת לזיהוי תשלום - רק אם יש הקשר ברור לתשלום
        const shouldAskForFullName = 
            (paymentDetection.isClear) || // ביטוי ברור כמו "שילמתי"
            (wasAskedAboutPayment && paymentConfirmation.isPositive); // או תשובה חיובית לשאלה על תשלום
        
        // Enhanced protection: Don't treat simple "yes" as payment confirmation without context
        const isSimpleYes = /^(כן|בטח|ודאי|נכון)$/.test(message.trim().toLowerCase());
        if (isSimpleYes && !wasAskedAboutPayment) {
            console.log('ℹ️ Simple affirmative response without payment context - not treating as payment confirmation');
            // Don't do anything - not confirming payment
        }
        
        // Only ask for full name if payment is clearly confirmed and not already waiting
        if (shouldAskForFullName && !currentProfile.waitingForFullName && !isSimpleYes) {
            console.log('💰 Payment confirmation detected - marking to ask for full name');
            currentProfile.paymentConfirmed = true;
            currentProfile.waitingForFullName = true;
            currentProfile.leadStatus = 'payment_confirmed';
            currentProfile.comingToTrial = true;
            
            // שמירה מיידית של האפוינטמנט עם סטטוס awaiting_payment
            const phone = sessionId.replace('@c.us', '');
            const appointmentDate = currentProfile.appointmentDate || currentProfile.fullAppointmentDetails || 'Not scheduled';
            
            db.run(`INSERT INTO appointments (client_phone, appointment_date, appointment_type, status, payment_confirmed) VALUES (?, ?, ?, ?, ?)`,
                [phone, appointmentDate, 'אימון ניסיון', 'awaiting_payment', true], 
                function(err) {
                    if (err) {
                        console.error('❌ Error saving appointment with awaiting_payment status:', err.message);
                    } else {
                        console.log('✅ Appointment saved with awaiting_payment status:', appointmentDate);
                    }
                });
        } else {
            console.log('ℹ️ Payment confirmation not detected or already handled');
        }
    }

    // Save client info to database only if there's new or updated information
    const hasNewInfo = currentProfile.name || currentProfile.age || currentProfile.childAge || 
                      currentProfile.appointmentDate || currentProfile.leadStatus;
    
    if (hasNewInfo) {
        console.log('💾 Saving client info to database');
        saveClientToDB(sessionId, currentProfile);
    }

    return response;
}

// Advanced chat summary system using GPT
async function generateChatSummary(sessionId, conversationHistory, lastUserMessage, lastBotResponse) {
    try {
        console.log('📋 Generating chat summary for session:', maskSensitiveData(sessionId));
        
        const currentProfile = userProfiles[sessionId] || {};
        const phone = sessionId.replace('@c.us', '');
        
        // Create comprehensive chat analysis prompt
        const summaryPrompt = `You are an expert chat analyzer for a martial arts gym. Analyze this complete conversation and extract structured information.

Conversation History:
${conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}
user: ${lastUserMessage}
assistant: ${lastBotResponse}

Please extract and return ONLY a JSON object with the following structure:
{
  "clientName": "extracted full name or null",
  "clientAge": "extracted age as number or null",
  "isForChild": "true/false if training is for child",
  "childAge": "child age if applicable or null",
  "experienceLevel": "described experience level or 'beginner'",
  "appointmentDate": "specific date/time mentioned or null",
  "dayPreference": "preferred day mentioned or null",
  "timePreference": "preferred time mentioned or null",
  "trainingType": "MMA/Thai Boxing/etc or null",
  "paymentStatus": "link_sent/paid/pending/none",
  "leadStatus": "hot/warm/cold/converted",
  "personalNeeds": ["array of specific needs mentioned"],
  "phoneNumber": "${phone}",
  "conversationSummary": "2-3 sentence summary of the conversation",
  "nextAction": "what should happen next",
  "notes": "any important additional information"
}

Return ONLY the JSON object, no other text.`;
        
        const summaryCompletion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{
                role: "system",
                content: summaryPrompt
            }],
            temperature: 0.1
        });
        
        const summaryText = summaryCompletion.choices[0].message.content.trim();
        console.log('📊 Raw GPT summary response:', summaryText);
        
        // Parse the JSON response
        let chatSummary;
        try {
            chatSummary = JSON.parse(summaryText);
        } catch (parseError) {
            console.error('❌ Error parsing GPT summary JSON:', parseError.message);
            // Fallback to basic summary
            chatSummary = createFallbackSummary(currentProfile, phone);
        }
        
        // Save summary to database
        await saveChatSummary(sessionId, chatSummary);
        
        // Send enhanced summary to Dvir if conversation was successful
        if (chatSummary.leadStatus === 'converted' || chatSummary.paymentStatus === 'paid') {
            await sendChatSummaryToDvir(chatSummary);
            
            // יצירת סיכום לקוח מפורט לדביר
            await generateClientSummaryForDvir(chatSummary, sessionId);
        }
        
        console.log('✅ Chat summary generated and saved successfully');
        
    } catch (error) {
        console.error('❌ Error generating chat summary:', error.message);
    }
}

// Create fallback summary if GPT parsing fails
function createFallbackSummary(profile, phone) {
    return {
        clientName: profile.fullName || profile.name || null,
        clientAge: profile.age || profile.childAge || null,
        isForChild: !!profile.isForChild,
        childAge: profile.childAge || null,
        experienceLevel: profile.experienceDuration || 'beginner',
        appointmentDate: profile.appointmentDate || profile.fullAppointmentDetails || null,
        paymentStatus: profile.paymentConfirmed ? 'paid' : profile.leadStatus === 'payment_link_sent' ? 'link_sent' : 'none',
        leadStatus: profile.conversationEnded ? 'warm' : 'cold',
        personalNeeds: profile.personalNeeds || [],
        phoneNumber: phone,
        conversationSummary: 'Conversation completed with basic information collected',
        nextAction: 'Follow up if no payment received',
        notes: 'Auto-generated fallback summary'
    };
}

// Save chat summary to database
async function saveChatSummary(sessionId, summary) {
    return new Promise((resolve) => {
        const phone = sessionId.replace('@c.us', '');
        const summaryJson = JSON.stringify(summary);
        
        db.run(`INSERT OR REPLACE INTO chat_summaries 
                (client_phone, summary_data, created_at) 
                VALUES (?, ?, CURRENT_TIMESTAMP)`,
            [phone, summaryJson],
            function(err) {
                if (err) {
                    console.error('❌ Error saving chat summary:', err.message);
                } else {
                    console.log('✅ Chat summary saved to database');
                }
                resolve();
            });
    });
}

// Send structured summary to Dvir
async function sendChatSummaryToDvir(summary) {
    try {
        const dvirNumber = '0532861226@c.us';
        
        const structuredSummary = `CONVERSATION ANALYSIS REPORT

` +
            `Client: ${summary.clientName || 'Name not collected'}
` +
            `Age: ${summary.clientAge || summary.childAge || 'Not specified'} ${summary.isForChild ? '(for child)' : ''}
` +
            `Experience: ${summary.experienceLevel}
` +
            `Training: ${summary.trainingType || 'Not decided'}
` +
            `Session Date: ${summary.appointmentDate || 'Not scheduled'}
` +
            `Payment: ${summary.paymentStatus.toUpperCase()}
` +
            `Lead Quality: ${summary.leadStatus.toUpperCase()}
` +
            `Phone: ${summary.phoneNumber}
` +
            `\nSummary: ${summary.conversationSummary}
` +
            `Next Action: ${summary.nextAction}
` +
            `${summary.personalNeeds.length > 0 ? `\nSpecial Needs: ${summary.personalNeeds.join(', ')}` : ''}
` +
            `${summary.notes ? `\nNotes: ${summary.notes}` : ''}`;
        
        await whatsappClient.sendMessage(dvirNumber, structuredSummary);
        console.log('📨 Structured summary sent to Dvir');
        
    } catch (error) {
        console.error('❌ Error sending summary to Dvir:', error.message);
    }
}

// Generate detailed client summary for Dvir using GPT
async function generateClientSummaryForDvir(chatSummary, sessionId) {
    try {
        console.log('📋 Generating detailed client summary for Dvir');
        
        const currentProfile = userProfiles[sessionId] || {};
        const phone = sessionId.replace('@c.us', '');
        
        // Create a detailed prompt for GPT to generate client summary
        const clientSummaryPrompt = `You are analyzing a completed client conversation for a martial arts gym. Create a professional 3-sentence client summary in Hebrew.

Client Information:
- Name: ${chatSummary.clientName || 'Not provided'}
- Age: ${chatSummary.clientAge || chatSummary.childAge || 'Not specified'}
- Experience: ${chatSummary.experienceLevel}
- Training Type: ${chatSummary.trainingType || 'Not decided'}
- Appointment Date: ${chatSummary.appointmentDate || 'Not scheduled'}
- Payment Status: ${chatSummary.paymentStatus}
- Personal Needs: ${chatSummary.personalNeeds?.join(', ') || 'None specified'}
- Conversation Summary: ${chatSummary.conversationSummary}

Please create a concise 3-sentence summary in Hebrew that includes:
1. Client's age, experience level, and what they're looking for
2. Key details about the conversation and their needs
3. Current status (payment confirmed, appointment scheduled, etc.)

Return ONLY the 3 sentences in Hebrew, no additional text.`;
        
        const summaryCompletion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{
                role: "system",
                content: clientSummaryPrompt
            }],
            temperature: 0.3
        });
        
        const clientSummaryText = summaryCompletion.choices[0].message.content.trim();
        console.log('📊 Generated client summary:', clientSummaryText);
        
        // Send the summary to Dvir
        const dvirNumber = '0532861226@c.us';
        const summaryMessage = `סיכום לקוח חדש:
        
${clientSummaryText}

פרטי התקשרות:
📞 טלפון: ${phone}
📅 תאריך שיחה: ${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`;
        
        await whatsappClient.sendMessage(dvirNumber, summaryMessage);
        console.log('📨 Client summary sent to Dvir');
        
        // Also send to manager
        const managerNumber = '972559925657@c.us';
        const managerSummary = `CLIENT SUMMARY:
${clientSummaryText}

Phone: ${phone}
Date: ${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`;
        
        await whatsappClient.sendMessage(managerNumber, managerSummary);
        console.log('📨 Client summary sent to manager');
        
    } catch (error) {
        console.error('❌ Error generating client summary:', error.message);
    }
}

// טעינת היסטוריית השיחה מהמאגר
async function loadConversationHistory(sessionId) {
    return new Promise((resolve) => {
        const phone = sessionId.replace('@c.us', '');
        
        db.all(`SELECT message_role, message_content, timestamp 
                FROM conversations 
                WHERE client_phone = ? 
                ORDER BY timestamp ASC`, 
                [phone], 
                (err, rows) => {
                    if (err) {
                        console.error('❌ Error loading conversation history:', err.message);
                        resolve([]);
                    } else {
                        const history = rows.map(row => ({
                            role: row.message_role,
                            content: row.message_content,
                            timestamp: row.timestamp
                        }));
                        console.log(`📚 Loaded ${history.length} messages from history`);
                        resolve(history);
                    }
                });
    });
}

// בניית הודעות למודל GPT
async function buildGPTMessages(conversationHistory, newMessage, sessionId) {
    const messages = [];
    
    // הודעת מערכת עם כל המידע
    const systemPrompt = await createComprehensiveSystemPrompt(sessionId);
    messages.push({
        role: "system",
        content: systemPrompt
    });
    
    // הוספת כל ההיסטוריה
    conversationHistory.forEach(msg => {
        messages.push({
            role: msg.role,
            content: msg.content
        });
    });
    
    // הודעה חדשה
    messages.push({
        role: "user",
        content: newMessage
    });
    
    return messages;
}

// יצירת פרומפט מערכת מקיף
async function createComprehensiveSystemPrompt(sessionId) {
    const now = new Date();
    const currentDateTime = now.toLocaleString('he-IL', {
        timeZone: 'Asia/Jerusalem',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    // טעינת מידע לקוח מהמאגר
    const clientInfo = await loadClientInfo(sessionId);
    
    let prompt = `אתה דביר בסון - מאמן אומנויות לחימה מקצועי.

תאריך ושעה נוכחיים: ${currentDateTime} (Asia/Jerusalem)

=== הוראות מערכת חשובות ===
1. אתה דביר בסון - מאמן אומנויות לחימה. תמיד תציג את עצמך כך בתחילת השיחה
2. מטרתך: לקבוע אימון ניסיון עם הלקוח בגישה חברית וחמה
3. תמיד תענה בעברית בלבד, בטון חברי, חם ואנושי, וללא סימני קריאה בכלל
4. אל תחשוף שאתה בוט - אתה דביר האמיתי
5. זכור מידע שכבר נמסר - אל תשאל שוב על דברים ידועים
6. **חובה לשאול שם ואז גיל! בלי גיל אי אפשר להתאים קבוצה או מחיר**
7. לעולם לא לומר שאתה צ'אטבוט - אם נשאל ישירות, הכחש ותגיד שאתה דביר
8. שימוש בשם: השתמש בשם הלקוח מקסימום פעם אחת בכל השיחה (מותר פעם נוספת בסיום אם מתבקש)
9. לא לשאול "איך אפשר לעזור" - תוביל את השיחה לשם→גיל→עבור מי→סוג אימון→ניסיון
10. ניהול שיחה: תהיה כמו חבר טוב שממליץ, חם ואנושי, לא איש מכירות קר

=== מידע על הלקוח (אם ידוע) ===`;

    if (clientInfo) {
        if (clientInfo.name) prompt += `\nשם: ${clientInfo.name}`;
        if (clientInfo.age) prompt += `\nגיל: ${clientInfo.age}`;
        if (clientInfo.experience) prompt += `\nניסיון: ${clientInfo.experience}`;
    }

    prompt += `

=== סוגי אימונים שאתה מציע ===
1. אומנויות לחימה מעורבות (MMA) - משלב סטרייקינג וגראפלינג
2. אגרוף תאילנדי/קיקבוקס - סטרייקינג בלבד
3. בימי שלישי: רק אגרוף תאילנדי (נוער 18:30, בוגרים 19:30)

=== לוחות זמנים ===
שני וחמישי:
- גילאי 4-6: 17:00-17:45
- גילאי 6-9: 17:45-18:30  
- גילאי 9-12: 18:30-19:15
- נוער 12-16: 19:15-20:15
- בוגרים 16+: 20:15-21:15

שלישי (תאילנדי בלבד):
- נוער: 18:30-19:30
- בוגרים: 19:30-20:30

=== מחירי אימון ניסיון ===
- ילדים/נוער: 10 שקלים
- בוגרים: 25 שקלים

=== מחירי מנוי (רק כשמבקשים!) ===
- מנוי פעם בשבוע: 250 ש"ח (עד 5 כניסות בחודש)
- פעמיים בשבוע: 350 ש"ח (עד 9 כניסות)
- ללא הגבלה: 420 ש"ח (נוער/בוגרים)
- שיעור בודד: 100 ש"ח (לא מועדף)
- הנחה לחיילים בסדיר: ללא הגבלה ב-99₪ (לא לקבע/מילואים)

=== אמצעי תשלום ===
- מנויים: אשראי בלבד (אפשר כרטיס אחר/שיקים 6 מראש)
- חנות: גם מזומן (העדפה אשראי)
- ביט: הופסק

=== קישורי תשלום ===
ילדים/נוער (10 שקלים): https://letts.co.il/payment/OEVGZEpZaktQbFFSVUYrVXREMVcrdz09
בוגרים (25 שקלים): https://letts.co.il/payment/TVhqVTYxTUpCUkxHa3BTMmJmQ0YxQT09

=== מיקום ===
הרצוג 12, הרצליה
סרטון הגעה: https://youtube.com/shorts/_Bk2vYeGQTQ?si=n1wgv8-3t7_hEs45
חניה: כן, לרוב בערב. יש גם 2 חניות פרטיות צמודות למכון

=== ציוד ===
- באימון ראשון: יש ציוד מיגון
- בהמשך לרכוש: כפפות, מגני שוק, מגן שיניים, מגן אשכים (לגברים)
- מגיל 6+
- לבוא עם: בגדי ספורט (בלי רוכסניי מתכת), מים, מגבת
- יש מכירת ציוד במכון

=== זרימת השיחה ===
1. תמיד תציג את עצמך: "היי! אני דביר, מאמן אומנויות לחימה" (אלא אם הלקוח פנה אליך בשם)
2. שאל שם (אם לא ידוע) - "איך קוראים לך?"
3. אחרי קבלת השם: "נעים להכיר [שם]" - רק פעם אחת!
4. **שאל גיל - זה קריטי! בלי גיל אי אפשר להתאים קבוצה**
   - תמיד שאל "בן/בת כמה?"
   - אם לא ברור אם עבור עצמו או ילד - שאל "האימונים עבורך או עבור ילד?"
5. שאל עבור מי האימונים (עצמו/ילד) - אם לא ברור
6. הסבר על סוגי האימונים
7. שאל על ניסיון קודם - אם יש ניסיון: "למה הפסקת? ומה גרם לך לרצות לחזור עכשיו?"
8. התאם קבוצה לפי גיל - חובה לדעת גיל לפני זה!
9. הובל לקביעת אימון ניסיון - כלול תאריך ושעה ספציפיים
10. כשמקבעים - תן כתובת, סרטון הגעה, מה להביא
11. שלח קישור תשלום מתאים (לפי גיל!) - כלול תאריך האימון בהודעה
12. אחרי אישור תשלום - בקש שם מלא לרישום מדויק
13. לאחר קבלת שם מלא - שמור אפוינטמנט ושלח סיכום למנהלים

=== מבנה אימון ===
- חימום וכושר: 10-15 דקות
- תרגול טכני
- קרבות תרגול (רמת קושי עולה)
- ילדים מסיימים במשחק קצר

=== תוכן אימונים ===
- MMA: משלב סטרייקינג (אגרופים/בעיטות) וגראפלינג (הפלות/קרקע)
- תאילנדי/קיקבוקס: סטרייקינג בלבד
- יתרונות MMA: מענה מלא להגנה עצמית, מגוון
- יתרונות תאילנדי: קצב התקדמות מהיר, עומק יסודות בסטרייקינג

=== בטיחות ===
- גבולות ברורים, ציוד מיגון איכותי
- "נגיעה" בלבד בספארינג
- עזרה ראשונה זמינה
- התאמות לפי חומרה
- במקרים חמורים: אישור רופא

=== התאמה אישית ===
- ללא צורך בניסיון קודם
- ללא חלוקה מגדרית
- מי שמעדיף פחות קרקע: תאילנדי/קיקבוקס
- כושר נבנה בתהליך, מתאימים רמה
- מתאים גם לגילאי 40+/50+

=== רמות ===
- אין חלוקה רשמית
- רובם חדשים (פחות משנה)
- מתקדמים עוזרים ומקבלים משימות מתקדמות
- סרטוני בסיס זמינים
- יותר ליווי בהתחלה

=== הוראות מיוחדות ===
- אימוג'י: מקסימום אחד לכל 5-7 הודעות
- קישורים: שלח רק את ה-URL בשורה נפרדת, בלי הטקסט "מצרף קישור"
- אל תשתמש בהדגשות (**bold** או _italic_)
- אל תשתמש בסימני קריאה כלל
- שעות פעילות: א'-ה' 7:00-23:00, ו' עד 16:00, שבת סגור
- אם מתחיל משפט ב-MMA, כתוב "אומנויות לחימה מעורבות (MMA)"

=== זיהוי תשלום - חשוב מאוד! ===
אם הלקוח מעדכן שהוא שילם, זהה את זה בביטויים הבאים:

**ביטויים ברורים (לא צריך לשאול שוב):**
- "שילמתי", "כן שילמתי", "בטח שילמתי", "ביצעתי תשלום"
- "הכסף הועבר", "התשלום בוצע", "עברתי תשלום", "שלחתי"
- "סיימתי לשלם", "עשיתי תשלום", "כבר שילמתי"

**ביטויים לא ברורים (צריך לשאול לוודא):**
- "עדכן", "סגרתי", "בוצע", "נעשה", "הועבר", "סגור", "מוכן", "הכל בסדר", "זה"

כשמזוהה תשלום:
1. **אם הביטוי ברור** (כולל "שילמתי") - תגיב ישירות:
   "מדהים! בואו נוודא שיש לי את כל הפרטים. איך השם המלא שלך? אני רוצה לוודא שהרישום יהיה מדויק"
   
2. **אם הביטוי לא ברור** - שאל לאישור:
   "האם שילמת?" או "האם ביצעת את התשלום?"

לאחר קבלת השם המלא מהלקוח - שמור את המועד בטבלת הפגישות עם סטטוס "paid" ושלח הודעת סיכום למספר 0532861226 ולמספר 972559925657@c.us, כולל שם מלא, טלפון, גיל, ניסיון, סוג אימון, תאריך ושעה. אם יש ניסיון – לציין באיזו אומנות וכמה זמן.

=== התנהלות עם ילדים ===
- מותאם אישית, גבולות ברורים, סבלנות
- טריקים לקשב: שאלות לכל הכיתה
- ADHD: לא מעירים כל הזמן, מושכים קשב עם משחקים/שאלות
- התפרצויות: גבול ברור + עידוד
- חוסר כבוד/קללות: גבול חד וברור
- בניית ביטחון עצמי: הצלחות מותאמות רמה, חיזוקים חיוביים

=== הסבר על אלימות לילדים ===
- לומדים להגנה עצמית בלבד
- אם אפשר - לצאת/לדבר
- אם אין ברירה - להגן ולעצור כשאפשר
- "the best defense = no be there"

=== התנהלות עם מבוגרים ===
- בלי כושר: כושר נבנה בתהליך, נתאים רמה
- עם ניסיון: מדהים! איזה אימונים? כמה זמן? מתי? למה הפסקת? ומה גרם לך לרצות לחזור עכשיו?
- ללא ניסיון: בסדר גמור, רבים מתחילים כך
- פציעה בעבר: איך מרגיש עכשיו? נתאים את האימון

=== קישורים חברתיים ===
פייסבוק: https://www.facebook.com/profile.php?id=61553372323760
אינסטגרם: https://www.instagram.com/dvir_basson/

=== מדיניות מחירים ===
- אל תציג מחירי מנוי עד שהמשתמש מבקש ספציפית
- מטרת העל: להוביל לאימון ניסיון קודם
- אם מתעקשים לקבל מחיר עכשיו - תן בניסוח נעים וקצר

=== סגירת עסקאות ===
- הצע 2 אופציות קרובות: "נקבע לאימון היכרות ב{יום קרוב} או ב{יום שני}?"
- לפני קישור: כתובת + סרטון + מה להביא
- הדגש: כדי לשמור ולשריין מקום נדרש תשלום לאימון ניסיון
- ואז רק "מצרף קישור:" ובשורה הבאה הקישור המתאים (ללא טקסט נוסף)
- בקש מהלקוח לעדכן אחרי שביצע תשלום

=== התנגדויות ===
- יקר/אין זמן/אחשוב: לא עונים בהתגוננות
- שאל: "מה התקציב החודשי?" / "כמה זמן בשבוע אפשר להשקיע?" / "מה תרצה לחשוב בדיוק?"

=== תיעוד לקוח ===
- שם מלא, גיל, עבור מי, רקע (איזו אומנות/כמה זמן/מתי/למה הפסיק)
- למה רוצה להתחיל עכשיו, מטרות/העדפות
- השתמש בזה בהתאמה אישית

=== סגנון כתיבה - חשוב מאוד! ===
כתוב כמו חבר טוב וחם שממליץ - אנושי, נעים וטבעי.
תהיה כמו מישהו שבאמת אכפת לו ורוצה לעזור, לא קר או מכני.
השפה צריכה להיות פשוטה, ישירה, חברית וחמה.
תשדר חמימות, אמינות וכנות אמיתית.
אל תחזור על השם של הלקוח יותר מפעם אחת בכל השיחה.

אסור להשתמש במילים/ביטויים הבאים:
- סימני קריאה בכלל
- "אשמח לעזור לך"
- "בוודאי" או "בהחלט" יותר מדי  
- חזרה על השם יותר מפעם אחת
- ביטויים פורמליים של איש מכירות

השתמש במילים חמות ונעימות:
- "מדהים"
- "מהמם" 
- "נשמע טוב"
- "בסדר גמור"
- "יופי"
- "נחמד"
- "נהדר"

תתנהג כמו חבר חם שממליץ על מקום שהוא מאוד אוהב!

=== הוראות מיוחדות לתאריכים ושעות - חשוב מאוד! ===
- **תמיד כלול תאריך ושעה ספציפיים** כאשר מציע אימון ניסיון
- כאשר שולח קישור תשלום, **חובה להזכיר** את התאריך והשעה בהודעה:
  "האימון יתקיים ביום [יום] בתאריך [תאריך] בשעה [שעה]"
- דוגמה: "האימון יתקיים ביום שלישי הקרוב בשעה 19:30"
- לפני שליחת קישור, תמיד אשר עם הלקוח: "מתאים לך להגיע לאימון ביום [יום] בשעה [שעה]?"
- אחרי אישור תשלום, חזור על התאריך: "רשמתי את הפרטים שלך לאימון ביום [יום] בשעה [שעה]"
- **תמיד זכור ושמור את התאריך שהוצע והתקבל** - זה קריטי לרישום נכון`;

    return prompt;
}

// טעינת מידע לקוח מהמאגר ומהזיכרון
async function loadClientInfo(sessionId) {
    return new Promise((resolve) => {
        const phone = sessionId.replace('@c.us', '');
        
        db.get(`SELECT * FROM clients WHERE phone = ?`, [phone], (err, row) => {
            if (err) {
                console.error('❌ Error loading client info:', err.message);
                resolve(null);
            } else {
                // שילוב מידע מהמאגר ומהזיכרון הנוכחי
                const memoryProfile = userProfiles[sessionId] || {};
                const dbProfile = row || {};
                
                const combinedInfo = {
                    name: memoryProfile.name || dbProfile.name,
                    age: memoryProfile.age || dbProfile.age,
                    childAge: memoryProfile.childAge,
                    experience: memoryProfile.experienceDuration || dbProfile.experience,
                    appointmentDate: memoryProfile.appointmentDate,
                    phone: phone
                };
                
                resolve(combinedInfo);
            }
        });
    });
}

// אתחול לקוח ווטסאפ
console.log('🚀 מאתחל לקוח ווטסאפ...');
whatsappClient.initialize();

// בדיקת סטטוס כל 30 שניות
setInterval(() => {
    console.log('📊 סטטוס נוכחי - ווטסאפ מוכן:', isWhatsAppReady, '| יש QR:', !!qrCodeData, '| הודעות התקבלו:', messageCount);
    if (isWhatsAppReady) {
        console.log('✅ הבוט מוכן לקבלת הודעות ווטסאפ');
    } else {
        console.log('⏳ ממתין לחיבור ווטסאפ...');
    }
}, 30000);

// הפונקציה הוסרה - משתמשים ב-createComprehensiveSystemPrompt במקום


// זיכרון מידע אישי (השיחות נשמרות במאגר נתונים)
let userProfiles = {};

// Enhanced function to mask sensitive data in logs
function maskSensitiveData(text) {
    if (!text) return text;
    
    // Mask phone numbers (Israeli and international formats)
    const phonePattern = /(972\d{9}|05\d{8}|\d{10})/g;
    let maskedText = text.replace(phonePattern, (match) => {
        if (match.length <= 4) return match;
        return match.substring(0, 3) + '***' + match.substring(match.length - 2);
    });
    
    // Mask Hebrew names (first and last names)
    const hebrewNamePattern = /([א-ת]{2,}\s+[א-ת'\"]{2,})/g;
    maskedText = maskedText.replace(hebrewNamePattern, (match) => {
        const parts = match.split(' ');
        if (parts.length >= 2) {
            return parts[0].substring(0, 1) + '***' + ' ' + parts[1].substring(0, 1) + '***';
        }
        return match;
    });
    
    // Mask single Hebrew names (but not common words)
    const commonWords = ['שלום', 'היי', 'תודה', 'בסדר', 'כן', 'לא', 'מעולה', 'נהדר', 'דביר'];
    const singleNamePattern = /\b([א-ת]{3,})\b/g;
    maskedText = maskedText.replace(singleNamePattern, (match) => {
        if (!commonWords.includes(match.toLowerCase()) && match.length > 3) {
            return match.substring(0, 1) + '***';
        }
        return match;
    });
    
    return maskedText;
}

// פונקציה לחילוץ שם ומידע אישי
function extractPersonalInfo(message, sessionId) {
    const lowerMessage = message.toLowerCase();
    const originalMessage = message.trim();
    const userProfile = userProfiles[sessionId] || {};
    // אנחנו לא צריכים את ההיסטוריה כאן - נשתמש רק במידע הנוכחי
    
    // אם יש כבר שם - לא נחפש שם חדש (למנוע החלפה בטעות)
    if (userProfile.name) {
        console.log('👤 שם קיים:', userProfile.name, '- מדלג על זיהוי שם חדש');
    } else {
        // חילוץ שם פרטי - רק אם אין שם
        const namePatterns = [
            /קוראים לי (.+?)(?:\s|$|\.|!|\?)/,
            /שמי (.+?)(?:\s|$|\.|!|\?)/,
            /אני (.+?)\s+ואני/,
            /(.+?)\s+קוראים לי/,
            /אני (.+?)(?:\s+ואני|\s+מעוניין|\s+רוצה|\s+מחפש|\s+באתי|\s+הגעתי)/
        ];
        
        // זיהוי שם פשוט (מילה אחת) - רק אם אין היסטוריה או שזו הודעה ראשונה/שנייה
        const simpleNamePattern = /^[א-ת]{2,15}$/;
        const commonWords = ['מעוניין', 'רוצה', 'מחפש', 'באתי', 'הגעתי', 'שלום', 'היי', 'שלומי', 'כן', 'לא', 'תודה', 'בסדר', 'מצוין', 'נהדר', 'מעולה', 'מדהים', 'מהמם', 'שילמתי', 'ביצעתי', 'עדכן', 'סגרתי', 'תשלמתי', 'עברתי', 'שלחתי', 'התשלום', 'הכסף', 'עבורי', 'עבור', 'בשבילי', 'לעצמי'];
        
        // זיהוי שם פשוט - רק אם עדיין אין שם ולא מילה נפוצה או פנייה לדביר
        const isDvirGreeting = /^(היי|שלום|היי\s+דביר|שלום\s+דביר|דביר)$/i.test(originalMessage.trim());
        if (simpleNamePattern.test(originalMessage) && !commonWords.includes(lowerMessage) && !isDvirGreeting) {
            if (!userProfiles[sessionId]) {
                userProfiles[sessionId] = {};
            }
            userProfiles[sessionId].name = originalMessage;
            console.log('👤 Simple name detected:', maskSensitiveData(originalMessage));
            return;
        }
        
        // חיפוש לפי פטרנים מורכבים
        for (const pattern of namePatterns) {
            const match = lowerMessage.match(pattern);
            if (match && match[1] && match[1].length < 20) {
                const name = match[1].trim();
                
                if (!commonWords.includes(name.toLowerCase())) {
                    if (!userProfiles[sessionId]) {
                        userProfiles[sessionId] = {};
                    }
                    userProfiles[sessionId].name = name;
                    console.log('👤 זוהה שם:', name);
                    break;
                }
            }
        }
        
        // זיהוי שם בתגובות מיידיות כמו "אני X" - עם הגנה מפני "היי דביר"
        const immediateNamePatterns = [
            /^אני ([א-ת]+)(?:\s|$)/, // "אני דני"
            /^אני ([א-ת]+) ([א-ת]+)(?:\s|$)/, // "אני דני כהן" 
            /^([א-ת]+)(?:\s|$)(?:נעים|שלום|היי)/, // "דני נעים מאוד"
            /נעים(?:\s+מאוד)?,?\s*([א-ת]+)/, // "נעים מאוד, דני"
            /^([א-ת]+)\s+נעים/ // "דני נעים מאוד"
        ];
        
        for (const pattern of immediateNamePatterns) {
            const match = originalMessage.match(pattern);
            if (match && match[1] && match[1].length >= 2) {
                const name = match[1].trim();
                
                // הגנה מפני זיהוי "דביר" כשם לקוח
                if (!commonWords.includes(name.toLowerCase()) && name.toLowerCase() !== 'דביר') {
                    if (!userProfiles[sessionId]) {
                        userProfiles[sessionId] = {};
                    }
                    userProfiles[sessionId].name = name;
                    console.log('👤 Name detected from response:', maskSensitiveData(name));
                    break;
                }
            }
        }
    }
    
    // זיהוי אם האימונים עבור ילד
    const childPatterns = [
        /בשביל הילד/,
        /בשביל הבן/,
        /בשביל הבת/,
        /לילד שלי/,
        /לבן שלי/,
        /לבת שלי/,
        /בן שלי/,
        /בת שלי/,
        /הילד שלי/,
        /בשביל ילד/,
        /לילד/,
        /הוא בן/,
        /היא בת/
    ];
    
    for (const pattern of childPatterns) {
        if (lowerMessage.match(pattern)) {
            if (!userProfiles[sessionId]) {
                userProfiles[sessionId] = {};
            }
            userProfiles[sessionId].isForChild = true;
            userProfiles[sessionId].targetIdentified = true;
            console.log('👶 זוהה: אימונים עבור ילד');
            break;
        }
    }
    
    // זיהוי אם האימונים עבור עצמו
    const selfPatterns = [
        /בשביל עצמי/, /בשבילי/, /אני רוצה/, /אני מעוניין/, /עבור עצמי/, /עבורי/
    ];
    
    for (const pattern of selfPatterns) {
        if (lowerMessage.match(pattern)) {
            if (!userProfiles[sessionId]) {
                userProfiles[sessionId] = {};
            }
            userProfiles[sessionId].isForSelf = true;
            userProfiles[sessionId].targetIdentified = true;
            console.log('👨 זוהה: אימונים עבור עצמו');
            break;
        }
    }
    
    // זיהוי מגדר (גברים)
    const maleIndicators = [
        /אני גבר/, /בן \d+/, /אני בן/, /גבר/, /זכר/,
        userProfile.name && /^(אור|רון|עומר|איתי|יונתן|דניאל|מיכאל|דוד|משה|אברהם|יוסף|אריאל|אלון|גיא|תומר|עידן|שי|עמית|יובל|נתן|אדם|בר|נועם|יאיר|אלעד|דן)$/i.test(userProfile.name)
    ];
    
    for (const indicator of maleIndicators) {
        if (indicator && (typeof indicator === 'boolean' ? indicator : lowerMessage.match(indicator))) {
            if (!userProfiles[sessionId]) {
                userProfiles[sessionId] = {};
            }
            userProfiles[sessionId].isMale = true;
            console.log('👨 זוהה מגדר: גבר');
            break;
        }
    }
    
    // זיהוי צרכים ומטרות
    const needPatterns = [
        /ביטחון עצמי/, /הגנה עצמית/, /כושר/, /בניית שרירים/,
        /ירידה במשקל/, /משמעת/, /ריכוז/, /התמודדות עם בריונות/,
        /אגרסיביות/, /חברות/, /בעיות התנהגות/, /פעילות/,
        /בעיות עצביות/, /מתח/, /סטרס/, /ביישנות/, /פחדים/,
        /אמון עצמי/, /חוסר ביטחון/, /דימוי עצמי/, /חברתיות/
    ];
    
    for (const pattern of needPatterns) {
        if (lowerMessage.match(pattern)) {
            if (!userProfiles[sessionId]) {
                userProfiles[sessionId] = {};
            }
            userProfiles[sessionId].needIdentified = true;
            const needText = pattern.source.replace(/\//g, '');
            if (!userProfiles[sessionId].personalNeeds) {
                userProfiles[sessionId].personalNeeds = [];
            }
            if (!userProfiles[sessionId].personalNeeds.includes(needText)) {
                userProfiles[sessionId].personalNeeds.push(needText);
            }
            userProfiles[sessionId].mainNeed = needText;
            console.log('🎯 זוהה צורך:', needText);
            break;
        }
    }
    
    // זיהוי תאריכי פגישות ואישור מועדים - מותאם לתבניות המוזכרות בקוד
    const datePatterns = [
        { pattern: /יום (\w+)/, normalize: (match) => `יום ${match[1]}` },
        { pattern: /ב(\w+) הקרוב/, normalize: (match) => `יום ${match[1]} הקרוב` },
        { pattern: /(\w+) הקרוב/, normalize: (match) => `יום ${match[1]} הקרוב` },
        { pattern: /(\w+) בערב/, normalize: (match) => `יום ${match[1]} בערב` },
        { pattern: /(\w+) בבוקר/, normalize: (match) => `יום ${match[1]} בבוקר` },
        { pattern: /מחר/, normalize: () => 'מחר' },
        { pattern: /היום/, normalize: () => 'היום' },
        { pattern: /עוד (\d+) ימים/, normalize: (match) => `בעוד ${match[1]} ימים` },
        { pattern: /בעוד (\d+) ימים/, normalize: (match) => `בעוד ${match[1]} ימים` },
        { pattern: /השבוע/, normalize: () => 'השבוע' },
        { pattern: /השבוע הבא/, normalize: () => 'השבוע הבא' },
        { pattern: /(\d{1,2})\/(\d{1,2})/, normalize: (match) => `${match[1]}/${match[2]}` },
        { pattern: /יום שלישי/, normalize: () => 'יום שלישי' },
        { pattern: /שלישי/, normalize: () => 'יום שלישי' },
        { pattern: /יום שני/, normalize: () => 'יום שני' },
        { pattern: /שני/, normalize: () => 'יום שני' },
        { pattern: /יום רביעי/, normalize: () => 'יום רביעי' },
        { pattern: /רביעי/, normalize: () => 'יום רביעי' },
        { pattern: /יום חמישי/, normalize: () => 'יום חמישי' },
        { pattern: /חמישי/, normalize: () => 'יום חמישי' },
        { pattern: /יום ראשון/, normalize: () => 'יום ראשון' },
        { pattern: /ראשון/, normalize: () => 'יום ראשון' }
    ];
    
    // זיהוי שעות
    const timePatterns = [
        { pattern: /בשעה (\d{1,2}):(\d{2})/, normalize: (match) => `בשעה ${match[1]}:${match[2]}` },
        { pattern: /בשעה (\d{1,2})/, normalize: (match) => `בשעה ${match[1]}:00` },
        { pattern: /(\d{1,2}):(\d{2})/, normalize: (match) => `בשעה ${match[1]}:${match[2]}` },
        { pattern: /בערב/, normalize: () => 'בערב' },
        { pattern: /בבוקר/, normalize: () => 'בבוקר' },
        { pattern: /צהריים/, normalize: () => 'בצהריים' }
    ];
    
    // זיהוי תאריך
    for (const dateItem of datePatterns) {
        const match = lowerMessage.match(dateItem.pattern);
        if (match) {
            if (!userProfiles[sessionId]) {
                userProfiles[sessionId] = {};
            }
            const normalizedDate = dateItem.normalize(match);
            userProfiles[sessionId].appointmentDate = normalizedDate;
            console.log('📅 זוהה תאריך פגישה:', normalizedDate);
            break;
        }
    }
    
    // זיהוי שעה
    for (const timeItem of timePatterns) {
        const match = originalMessage.match(timeItem.pattern);
        if (match) {
            if (!userProfiles[sessionId]) {
                userProfiles[sessionId] = {};
            }
            const normalizedTime = timeItem.normalize(match);
            userProfiles[sessionId].appointmentTime = normalizedTime;
            
            // שילוב תאריך ושעה אם יש שניהם
            if (userProfiles[sessionId].appointmentDate) {
                userProfiles[sessionId].fullAppointmentDetails = `${userProfiles[sessionId].appointmentDate} ${normalizedTime}`;
            }
            console.log('⏰ זוהתה שעת פגישה:', normalizedTime);
            break;
        }
    }
    
    // זיהוי אישור מועד ("כן", "בסדר", "מתאים")
    const confirmationPatterns = [
        /^כן$/, /^בסדר$/, /^מתאים$/, /^טוב$/, /^נהדר$/, /^מעולה$/,
        /מתאים לי/, /בסדר בשבילי/, /זה טוב/
    ];
    
    const isConfirmingAppointment = confirmationPatterns.some(pattern => lowerMessage.match(pattern));
    
    if (isConfirmingAppointment && userProfile.appointmentProposed) {
        if (!userProfiles[sessionId]) {
            userProfiles[sessionId] = {};
        }
        userProfiles[sessionId].appointmentConfirmed = true;
        userProfiles[sessionId].leadStatus = 'appointment_confirmed';
        console.log('✅ לקוח אישר מועד אימון');
    }
    
    // הלוגיקה של דירוג 1-10 הוסרה
    
    // זיהוי זמן לא נוח לשיחה
    const badTimingPatterns = [
        /זמן לא טוב/, /לא זמן טוב/, /לא נוח עכשיו/, /לא נוח לשיחה/,
        /עסוק עכשיו/, /לא יכול עכשיו/, /מאוחר יותר/, /אחר כך/,
        /בעבודה/, /בפגישה/, /לא זמין/, /תתקשר מאוחר יותר/
    ];
    
    for (const pattern of badTimingPatterns) {
        if (lowerMessage.match(pattern)) {
            if (!userProfiles[sessionId]) {
                userProfiles[sessionId] = {};
            }
            userProfiles[sessionId].badTiming = true;
            console.log('⏰ זוהה זמן לא נוח לשיחה');
            break;
        }
    }
    
    // זיהוי אם הלקוח מכיר את השם שלי
    const mentionsMyName = lowerMessage.includes('דביר') || lowerMessage.includes('היי דביר') || lowerMessage.includes('שלום דביר');
    if (mentionsMyName) {
        if (!userProfiles[sessionId]) {
            userProfiles[sessionId] = {};
        }
        userProfiles[sessionId].knowsMyName = true;
        console.log('👋 הלקוח מכיר את השם שלי');
    }
    
    // זיהוי אישור תשלום
    const paymentConfirmationPatterns = [
        /שילמתי/, /ביצעתי תשלום/, /עדכן/, /סגרתי/, /תשלמתי/,
        /הכסף הועבר/, /התשלום בוצע/, /עברתי תשלום/, /שלחתי תשלום/,
        /התשלום עבר/, /השלמתי/, /סיימתי את התשלום/, /העברתי/
    ];
    
    const confirmedPayment = paymentConfirmationPatterns.some(pattern => lowerMessage.match(pattern));
    
    if (confirmedPayment && userProfile.name) {
        // סימון שזוהה אישור תשלום - הבוט ישאל לוודא
        if (!userProfiles[sessionId]) {
            userProfiles[sessionId] = {};
        }
        userProfiles[sessionId].paymentClaimDetected = true;
        userProfiles[sessionId].paymentClaimMessage = originalMessage;
        
        console.log('💰 זוהה טענת תשלום מהלקוח - הבוט ישאל לוודא');
    }
    
    // זיהוי שם מלא - גם אחרי תשלום וגם באופן כללי
    const fullNamePatterns = [
        /^([א-ת]+ [א-ת'\']+)(?:\s|$)/, // שם פרטי ומשפחה
        /שמי ([א-ת]+ [א-ת'\']+)/, // "שמי דני כהן"
        /אני ([א-ת]+ [א-ת'\']+)/, // "אני דני כהן"
        /^([א-ת]+ [א-ת'\']+) נעים/, // "דני כהן נעים מאוד"
    ];
    
    // מילים שצריך להימנע מהן בזיהוי שם מלא
    const excludeFromFullName = ['היי דביר', 'שלום דביר', 'דביר שלום', 'תודה דביר', 'דביר היי', 'דביר שלום'];
    
    // זיהוי שם מלא אחרי תשלום
    if (userProfile.waitingForFullName && originalMessage.length > 3 && originalMessage.length < 50) {
        if (!userProfiles[sessionId]) {
            userProfiles[sessionId] = {};
        }
        userProfiles[sessionId].fullName = originalMessage;
        userProfiles[sessionId].waitingForFullName = false;
        userProfiles[sessionId].leadStatus = 'paid_and_confirmed';
        console.log('👤 נקלט שם מלא:', originalMessage);
    } else if (!userProfile.fullName) {
        // זיהוי שם מלא באופן כללי אם עדיין אין
        for (const pattern of fullNamePatterns) {
            const match = originalMessage.match(pattern);
            if (match && match[1] && match[1].length > 5 && match[1].length < 40) {
                const fullName = match[1].trim();
                
                // בדיקה שזה לא ביטוי רגיל או ביטוי שצריך להימנע ממנו
                if (!fullName.includes('שלום') && 
                    !fullName.includes('נעים מאוד') && 
                    !fullName.includes('דביר') &&
                    fullName.includes(' ') &&
                    !excludeFromFullName.includes(originalMessage.trim())) {
                    if (!userProfiles[sessionId]) {
                        userProfiles[sessionId] = {};
                    }
                    userProfiles[sessionId].fullName = fullName;
                    console.log('👤 Full name detected:', maskSensitiveData(fullName));
                    break;
                }
            }
        }
    }
    
    // זיהוי אישור חיובי לשאלת תשלום - זה מטופל עכשיו ב-processMessage
    
    // Enhanced age extraction with improved detection and saving
    try {
        // זיהוי גיל פשוט - רק מספר (אם זה הגיוני כגיל)
        const simpleAgePattern = /^(\d+)$/;
        const simpleAgeMatch = originalMessage.match(simpleAgePattern);
        if (simpleAgeMatch) {
            const age = parseInt(simpleAgeMatch[1]);
            if (age >= 3 && age <= 80) { // גילאים הגיוניים
                if (!userProfiles[sessionId]) {
                    userProfiles[sessionId] = {};
                }
                
                // Determine if age is for child or self based on context
                if (userProfiles[sessionId].isForChild) {
                    userProfiles[sessionId].childAge = age;
                    console.log('📏 Simple child age detected:', age);
                } else {
                    userProfiles[sessionId].age = age;
                    console.log('📏 Simple age detected:', age);
                }
                
                // Force save age to database immediately
                saveClientToDB(sessionId, userProfiles[sessionId]);
                return; // מצאנו גיל, סיימנו
            }
        }
        
        // Extended age patterns for better detection
        const agePatterns = [
            /(בן)\s*(\d{1,2})/,
            /(בת)\s*(\d{1,2})/,
            /גיל\s*(\d{1,2})/,
            /אני\s+בן\s+(\d{1,2})/,
            /אני\s+בת\s+(\d{1,2})/,
            /הוא\s+בן\s+(\d{1,2})/,
            /היא\s+בת\s+(\d{1,2})/,
            /בני\s+(\d{1,2})/,
            /בת\s+(\d{1,2})/
        ];
        
        for (const pattern of agePatterns) {
            const ageMatch = lowerMessage.match(pattern);
            if (ageMatch) {
                const value = parseInt(ageMatch[2] || ageMatch[1] || ageMatch[0]?.replace(/[^0-9]/g, ''), 10);
                if (!isNaN(value) && value > 0 && value < 100) {
                    if (!userProfiles[sessionId]) {
                        userProfiles[sessionId] = {};
                    }
                    
                    // Better logic for determining if age is for child or self
                    const isChildContext = userProfiles[sessionId].isForChild || 
                                         /(הוא|היא|(ילד|בן|בת)\s+שלי)\s*(בן|בת)/.test(lowerMessage) ||
                                         /בשביל\s+(ילד|בן|בת)/.test(lowerMessage);
                    
                    if (isChildContext) {
                        userProfiles[sessionId].childAge = value;
                        console.log('📏 Child age detected:', value);
                    } else {
                        userProfiles[sessionId].age = value;
                        console.log('📏 Age detected:', value);
                    }
                    
                    // Force save age to database immediately
                    saveClientToDB(sessionId, userProfiles[sessionId]);
                    break;
                }
            }
        }
    } catch (e) {
        console.log('⚠️ Error in age detection:', e?.message);
    }

    return userProfiles[sessionId] || {};
}

// הפונקציה הוסרה - לא נקראת

// כל הפונקציות הוסרו - לא נקראות

app.post('/api/chat', async (req, res) => {
    try {
        const { message, sessionId = 'default' } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'הודעה ריקה' });
        }

        console.log('📨 הודעה נכנסת מהווב:', message);

        // בדיקת שעות פעילות גם לצ'אט הווב
        if (!isWorkingHours()) {
            return res.json({ 
                response: getWorkingHoursMessage(),
                isMultiple: false
            });
        }

        // השתמש בפונקציה המשותפת לעיבוד הודעה
        const cleanResponse = await processMessage(message, sessionId);

        res.json({ 
            response: cleanResponse,
            isMultiple: false
        });

    } catch (error) {
        console.error('❌ שגיאה ב-API:', error);
        res.status(500).json({ error: 'שגיאה פנימית בשרת' });
    }
});

// Endpoint להצגת QR Code
app.get('/qr', (req, res) => {
    if (!qrCodeData) {
        return res.send(`
            <html>
                <head>
                    <title>ווטסאפ QR - דביר בסון בוט</title>
                    <meta charset="utf-8">
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        .status { padding: 20px; margin: 20px; border-radius: 10px; }
                        .waiting { background-color: #fff3cd; color: #856404; }
                        .ready { background-color: #d4edda; color: #155724; }
                    </style>
                </head>
                <body>
                    <h1>דביר בסון - בוט ווטסאפ</h1>
                    <div class="status ${isWhatsAppReady ? 'ready' : 'waiting'}">
                        ${isWhatsAppReady ? 
                            '✅ הבוט מחובר לווטסאפ ומוכן לקבל הודעות!' : 
                            '⏳ מחכה ל-QR קוד... רענן את הדף'
                        }
                    </div>
                    <script>
                        if (!${isWhatsAppReady}) {
                            setTimeout(() => window.location.reload(), 3000);
                        }
                    </script>
                </body>
            </html>
        `);
    }
    
    res.send(`
        <html>
            <head>
                <title>ווטסאפ QR - דביר בסון בוט</title>
                <meta charset="utf-8">
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                    .qr-container { margin: 30px auto; padding: 20px; border: 2px solid #25D366; border-radius: 15px; display: inline-block; }
                    .instructions { max-width: 600px; margin: 20px auto; padding: 20px; background-color: #f8f9fa; border-radius: 10px; }
                    .step { margin: 10px 0; text-align: right; direction: rtl; }
                </style>
            </head>
            <body>
                <h1>דביר בסון - בוט ווטסאפ</h1>
                <div class="qr-container">
                    <img src="${qrCodeData}" alt="QR Code" style="max-width: 300px;">
                </div>
                <div class="instructions">
                    <h3>הוראות חיבור:</h3>
                    <div class="step">1. פתח את אפליקציית ווטסאפ בטלפון</div>
                    <div class="step">2. לחץ על שלוש הנקודות (⋮) או הגדרות</div>
                    <div class="step">3. בחר "מכשירים מקושרים" או "WhatsApp Web"</div>
                    <div class="step">4. לחץ על "קשר מכשיר"</div>
                    <div class="step">5. סרוק את הקוד QR למעלה</div>
                </div>
                <p><strong>לאחר הסריקה הבוט יהיה מוכן לקבל הודעות!</strong></p>
                <script>
                    // רענון אוטומטי כל 30 שניות
                    setTimeout(() => window.location.reload(), 30000);
                </script>
            </body>
        </html>
    `);
});

// Endpoint לסטטוס הבוט
app.get('/status', (req, res) => {
    res.json({
        whatsappReady: isWhatsAppReady,
        hasQR: !!qrCodeData,
        timestamp: new Date().toISOString()
    });
});

// Endpoint לדוח ניהולי
app.get('/admin/report', (req, res) => {
    const reportData = {
        clients: [],
        appointments: [],
        conversations: []
    };

    // קבלת כל הלקוחות
    db.all(`SELECT * FROM clients ORDER BY created_at DESC`, [], (err, clients) => {
        if (err) {
            return res.status(500).json({ error: 'שגיאה בטעינת לקוחות' });
        }
        reportData.clients = clients;

        // קבלת כל הפגישות
        db.all(`SELECT * FROM appointments ORDER BY created_at DESC`, [], (err, appointments) => {
            if (err) {
                return res.status(500).json({ error: 'שגיאה בטעינת פגישות' });
            }
            reportData.appointments = appointments;

            // סיכום סטטיסטיקות
            const stats = {
                totalClients: clients.length,
                totalAppointments: appointments.length,
                clientsWithAppointments: appointments.filter(a => a.payment_confirmed).length,
                clientsByAge: {
                    children: clients.filter(c => c.child_age && c.child_age < 16).length,
                    adults: clients.filter(c => c.age && c.age >= 16).length
                }
            };

            res.json({
                stats,
                clients: reportData.clients,
                appointments: reportData.appointments
            });
        });
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 השרת פועל על http://localhost:${PORT}`);
    console.log('💡 ודא שיש לך קובץ .env עם OPENAI_API_KEY');
    console.log('📱 לחיבור ווטסאפ: היכנס ל-http://localhost:' + PORT + '/qr');
    console.log('📊 לבדיקת סטטוס: http://localhost:' + PORT + '/status');
    console.log('🌐 אפליקציית הווב: http://localhost:' + PORT);
});
