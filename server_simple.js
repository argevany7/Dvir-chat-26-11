
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
        age INTEGER,
        experience TEXT,
        coming_to_trial BOOLEAN DEFAULT FALSE,
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
    
    console.log('✅ טבלאות מאגר מידע הוקמו בהצלחה');

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
}

// פונקציות מאגר מידע
function saveClientToDB(sessionId, profile) {
    const phone = sessionId.replace('@c.us', '');
    
    // שמירת רק הפרטים הנדרשים: שם, גיל, ניסיון, האם מגיע לאימון ניסיון
    db.run(`INSERT OR REPLACE INTO clients 
        (phone, name, age, experience, coming_to_trial, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [phone, profile.name, profile.age || profile.childAge, profile.experienceDuration || 'ללא ניסיון', profile.comingToTrial || false],
        function(err) {
            if (err) {
                console.error('❌ שגיאה בשמירת לקוח:', err.message);
            } else {
                console.log('✅ לקוח נשמר במאגר מידע:', phone);
            }
        });
}

function saveConversationToDB(sessionId, role, content) {
    return new Promise((resolve) => {
        const phone = sessionId.replace('@c.us', '');
        
        db.run(`INSERT INTO conversations (client_phone, message_role, message_content) VALUES (?, ?, ?)`,
            [phone, role, content], function(err) {
                if (err) {
                    console.error('❌ שגיאה בשמירת שיחה:', err.message);
                } else {
                    console.log('💾 נשמרה הודעה:', role);
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
                console.error('❌ שגיאה בשמירת פגישה:', err.message);
            } else {
                console.log('✅ פגישה נשמרה במאגר מידע:', phone);
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

// WhatsApp client events
whatsappClient.on('qr', async (qr) => {
    console.log('📱 QR Code generated - scan with your WhatsApp');
    console.log('🍎 Mac detected - if Chrome window is empty, try the QR code URL below:');
    qrCodeData = await qrcode.toDataURL(qr);
    console.log('🔗 QR Code available at: http://localhost:' + PORT + '/qr');
    console.log('💡 Mac tip: If Chrome window shows blank, close it and use the URL above');
});

whatsappClient.on('ready', () => {
    console.log('✅ WhatsApp client is ready!');
    console.log('🎯 Bot is now listening for incoming messages...');
    isWhatsAppReady = true;
});

whatsappClient.on('authenticated', () => {
    console.log('🔐 WhatsApp authentication completed');
    console.log('⏳ Waiting for ready event... (this should happen within 30 seconds)');
    
    // Timeout to detect if we're stuck
    setTimeout(() => {
        if (!isWhatsAppReady) {
            console.error('⚠️ WARNING: Still not ready after 45 seconds! Connection might be stuck.');
            console.log('💡 Try closing Chrome windows and restart the server.');
        }
    }, 45000);
});

whatsappClient.on('loading_screen', (percent, message) => {
    console.log('📶 WhatsApp loading:', percent + '%', message);
    if (percent === 100) {
        console.log('⏳ Loading complete, waiting for ready event...');
    }
});

whatsappClient.on('auth_failure', (msg) => {
    console.error('❌ WhatsApp authentication error:', msg);
});

whatsappClient.on('disconnected', (reason) => {
    console.log('⚠️ WhatsApp client disconnected:', reason);
    isWhatsAppReady = false;
    // Clear QR code when disconnected to force new one
    qrCodeData = '';
});

whatsappClient.on('change_state', (state) => {
    console.log('🔄 WhatsApp state changed:', state);
});

whatsappClient.on('contact_changed', (message, oldId, newId, isContact) => {
    console.log('👤 Contact changed:', message.from);
});

whatsappClient.on('group_join', (notification) => {
    console.log('👥 Added to group:', notification);
});

whatsappClient.on('media_uploaded', (message) => {
    console.log('📎 Media uploaded:', message.type);
});

// Add error handling
whatsappClient.on('error', (error) => {
    console.error('❌ WhatsApp client error:', error);
});

// Add connection status monitoring
whatsappClient.on('remote_session_saved', () => {
    console.log('💾 Remote session saved');
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
        return 'שבת שלום! 🙏\nאני זמין לענות על הודעות מיום ראשון עד חמישי בין השעות 7:00-23:00, ובימי שישי עד 16:00.\nאשמח לענות לך במהלך שעות הפעילות!';
    } else if (dayOfWeek === 5 && now.getHours() >= 16) { // Friday after 16:00
        return 'שבת שלום! 🙏\nאני זמין לענות על הודעות עד 16:00 בימי שישי.\nאשמח לענות לך ביום ראשון החל מ-7:00 בבוקר!';
    } else { // Other days outside working hours
        return 'היי! 😊\nאני זמין לענות על הודעות בין השעות 7:00-23:00 מיום ראשון עד חמישי, ובימי שישי עד 16:00.\nאשמח לענות לך במהלך שעות הפעילות!';
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
        
        const summary = `🥊 סיכום פגישה שנקבעה:
📅 תאריך קביעה: ${currentDate}
${clientInfo.appointmentDate ? `📅 תאריך אימון: ${clientInfo.appointmentDate}` : ''}
👤 שם לקוח: ${clientInfo.name || 'לא צוין'}
📞 מספר לקוח: ${clientInfo.phone || 'לא ידוע'}
🎯 סוג אימון: ${appointmentDetails.type || 'לא צוין'}
👶 גיל: ${clientInfo.age || clientInfo.childAge || 'לא צוין'}
${clientInfo.personalNeeds && clientInfo.personalNeeds.length > 0 ? `🎯 צרכים אישיים: ${clientInfo.personalNeeds.join(', ')}` : ''}
💭 פרטים נוספים: ${appointmentDetails.details || 'אין'}

💡 טיפ: ניתן לשמור את הלקוח באנשי הקשר או להעביר לו הודעה ישירות במספר: ${clientInfo.phone || 'לא ידוע'}`;
        
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
        
        const paymentSummary = `💰 אישור תשלום התקבל:
📅 תאריך: ${currentDate}
👤 שם לקוח: ${clientInfo.name || 'לא צוין'}
📞 מספר לקוח: ${clientInfo.phone || 'לא ידוע'}
🎯 סוג אימון: ${paymentDetails.type || 'אימון ניסיון'}
👶 גיל: ${clientInfo.age || clientInfo.childAge || 'לא צוין'}
✅ סטטוס: הלקוח אישר ביצוע תשלום
💭 הערות: ${paymentDetails.notes || 'הלקוח עדכן שהוא ביצע תשלום לאימון ניסיון'}

💡 טיפ: ניתן לשמור את הלקוח באנשי הקשר או ליצור עמו קשר במספר: ${clientInfo.phone || 'לא ידוע'}`;
        
        await whatsappClient.sendMessage(managerNumber, paymentSummary);
        console.log('📨 נשלח אישור תשלום למנהל');
    } catch (error) {
        console.error('❌ שגיאה בשליחת אישור תשלום:', error);
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
        
        const notification = `🥊 עדכון תשלום מלקוח:
📅 תאריך: ${currentDate}
👤 שם לקוח: ${clientInfo.name || 'לא צוין'}
📞 מספר לקוח: ${clientInfo.phone || 'לא ידוע'}
👶 גיל: ${clientInfo.age || clientInfo.childAge || 'לא צוין'}
🥋 ניסיון: ${clientInfo.experience || 'לא צוין'}
📅 מתי יגיע לאימון: ${clientInfo.appointmentDate || 'לא נקבע עדיין'}
🎯 סוג אימון: ${paymentDetails.type || 'אימון ניסיון'}

💬 הלקוח אמר ששילם - רק תוודא האם שילם או לא

💭 פרטים נוספים: ${paymentDetails.notes || 'אין'}

📞 ניתן ליצור קשר ישיר עם הלקוח במספר: ${clientInfo.phone || 'לא ידוע'}`;
        
        await whatsappClient.sendMessage(dvirNumber, notification);
        console.log('📨 נשלחה הודעה לדביר עם פרטי הלקוח');
        
        // שליחת הודעת סגירה למספר שצוין (0559925657)
        const closingNumber = '0559925657@c.us';
        const closingMessage = `✅ הודעת סגירה - לקוח ${clientInfo.name || 'לא ידוע'} (${clientInfo.phone || 'לא ידוע'}) אישר תשלום והודעה נשלחה לדביר לבדיקה.`;
        
        await whatsappClient.sendMessage(closingNumber, closingMessage);
        console.log('📨 נשלחה הודעת סגירה למספר הנדרש');
        
    } catch (error) {
        console.error('❌ שגיאה בשליחת הודעה לדביר:', error);
    }
}

// Handle incoming WhatsApp messages
whatsappClient.on('message', async (message) => {
    messageCount++;
    console.log('📬 Received WhatsApp message #' + messageCount + '!');
    console.log('📨 Content:', message.body);
    console.log('👤 From:', message.from);
    console.log('📱 Type:', message.type);
    
    try {
        // Ignore outgoing messages
        if (message.fromMe) {
            console.log('⬅️ Ignoring outgoing message');
            return;
        }
        
        // Ignore group messages (optional)
        const chat = await message.getChat();
        if (chat.isGroup) {
            console.log('👥 Ignoring group message');
            return;
        }
        
        // Check working hours
        if (!isWorkingHours()) {
            const workingHoursMessage = getWorkingHoursMessage();
            await message.reply(workingHoursMessage);
            console.log('⏰ הודעה נשלחה מחוץ לשעות פעילות');
            return;
        }
        
        console.log('✅ Processing private message...');
        
        // Use phone number as sessionId
        const sessionId = message.from;
        
        // Call existing message processing function
        const response = await processMessage(message.body, sessionId);
        
        // Send reply only if there's a response (not null/empty)
        if (response) {
            await message.reply(response);
            console.log('📤 WhatsApp response sent:', response);
        } else {
            console.log('📤 No response sent (empty/null message)');
        }
        
    } catch (error) {
        console.error('❌ Error handling WhatsApp message:', error);
        // לא שולחים הודעת שגיאה - פשוט לוגים את השגיאה
        console.log('📤 No response sent due to error');
    }
});

// פונקציה לזיהוי תשלום בהודעה
function detectPaymentConfirmation(message) {
    const lowerMessage = message.toLowerCase().trim();
    
    console.log('🔍 בודק הודעה לזיהוי תשלום:', lowerMessage);
    
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
        if (match) console.log('✅ זוהה ביטוי ברור:', pattern.source);
        return match;
    });
    
    const isUnclearPayment = unclearPaymentPatterns.some(pattern => {
        const match = pattern.test(lowerMessage);
        if (match) console.log('⚠️ זוהה ביטוי לא ברור:', pattern.source);
        return match;
    });
    
    const result = {
        detected: isClearPayment || isUnclearPayment,
        isClear: isClearPayment,
        isUnclear: isUnclearPayment
    };
    
    console.log('📊 תוצאת זיהוי תשלום:', result);
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

    console.log('📨 Processing message:', message);

    // חילוץ מידע אישי מההודעה
    extractPersonalInfo(message, sessionId);

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
        (lastMessage.content.includes('האם שילמת') || lastMessage.content.includes('האם ביצעת את התשלום'));

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

    // שמירת ההודעות החדשות במאגר
    await saveConversationToDB(sessionId, 'user', message);
    await saveConversationToDB(sessionId, 'assistant', response);

    // טיפול באישור תשלום
    const shouldSendNotification = 
        (paymentDetection.isClear) || // ביטוי ברור כמו "שילמתי"
        (wasAskedAboutPayment && paymentConfirmation.isPositive); // או תשובה חיובית לשאלה
    
    if (shouldSendNotification) {
        console.log('💰 זוהה אישור תשלום - שולח הודעה לדביר');
        
        // טעינת מידע הלקוח
        const clientInfo = await loadClientInfo(sessionId);
        const phone = sessionId.replace('@c.us', '');
        
        console.log('📋 מידע לקוח לשליחה לדביר:', clientInfo);
        
        const paymentDetails = {
            type: 'אימון ניסיון',
            notes: paymentDetection.isClear ? 'הלקוח אמר שהוא שילם' : 'הלקוח אישר ביצוע תשלום'
        };
        
        // שליחת הודעה לדביר
        try {
            await sendPaymentNotificationToDvir({
                ...clientInfo,
                phone: phone
            }, paymentDetails);
            console.log('✅ הודעה נשלחה לדביר בהצלחה');
        } catch (error) {
            console.error('❌ שגיאה בשליחת הודעה לדביר:', error);
        }
    } else {
        console.log('ℹ️ לא זוהה אישור תשלום או חסר מידע');
    }

    // שמירת מידע הלקוח במאגר נתונים (אם יש מידע חדש)
    const currentProfile = userProfiles[sessionId] || {};
    if (currentProfile.name || currentProfile.age || currentProfile.childAge) {
        console.log('💾 שומר מידע לקוח במאגר נתונים');
        saveClientToDB(sessionId, currentProfile);
    }

    return response;
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
                        console.error('❌ שגיאה בטעינת היסטוריה:', err.message);
                        resolve([]);
                    } else {
                        const history = rows.map(row => ({
                            role: row.message_role,
                            content: row.message_content,
                            timestamp: row.timestamp
                        }));
                        console.log(`📚 נטענו ${history.length} הודעות מההיסטוריה`);
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
1. אתה מנהל שיחה חברית ואנושית לאימוני אומנויות לחימה
2. מטרתך: לקבוע אימון ניסיון עם הלקוח בגישה חברית
3. תמיד תענה בעברית בלבד, בטון חברי, נינוח ואנושי
4. אל תחשוף שאתה בוט - אתה דביר האמיתי
5. זכור מידע שכבר נמסר - אל תשאל שוב על דברים ידועים
6. **חובה לשאול שם ואז גיל! בלי גיל אי אפשר להתאים קבוצה או מחיר**
7. לעולם לא לומר שאתה צ'אטבוט - אם נשאל ישירות, הכחש ותגיד שאתה דביר
8. שימוש בשם: השתמש בשם הלקוח מקסימום פעם אחת בכל השיחה
9. לא לשאול "איך אפשר לעזור" - תוביל את השיחה לשם→גיל→עבור מי→סוג אימון→ניסיון
10. ניהול שיחה: תהיה כמו חבר נחמד שממליץ, לא איש מכירות טיפיקלי

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
- לבוא עם: בגדי ספורט (בלי רוכסנים מתכת), מים, מגבת
- יש מכירת ציוד במכון

=== זרימת השיחה ===
1. אם הלקוח פנה בשם "דביר" - אל תציג את עצמך שוב, רק תגיד שאתה מאמן
2. שאל שם (אם לא ידוע)
3. **שאל גיל - זה קריטי! בלי גיל אי אפשר להתאים קבוצה**
   - אם לא ידוע הגיל - תמיד שאל "בן/בת כמה?"
   - אם לא ברור אם עבור עצמו או ילד - שאל "האימונים עבורך או עבור ילד?"
4. שאל עבור מי האימונים (עצמו/ילד) - אם לא ברור
5. הסבר על סוגי האימונים
6. שאל על ניסיון קודם
7. התאם קבוצה לפי גיל - חובה לדעת גיל לפני זה!
8. הובל לקביעת אימון ניסיון
9. כשמקבעים - תן כתובת, סרטון הגעה, מה להביא
10. שלח קישור תשלום מתאים (לפי גיל!)
11. בקש עדכון לאחר התשלום

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
- קישורים: פורמט "מצרף קישור:" ואז URL בשורה נפרדת
- אל תשתמש בהדגשות (**bold** או _italic_)
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
   "מעולה! קיבלתי את העדכון. המקום שמור לך. נתראה ב[יום] ב[שעה] בהרצוג 12, הרצליה!"
   
2. **אם הביטוי לא ברור** - שאל לאישור:
   "האם שילמת?" או "האם ביצעת את התשלום?"

**בכל המקרים - אוטומטית תישלח הודעת סיכום למספר 0532861226 עם פרטי הלקוח**

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
- עם ניסיון: מצוין! איזה אימונים? כמה זמן? מתי? למה הפסקת?
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
כתוב כמו חבר טוב שממליץ - חם, אנושי וטבעי.
תהיה כמו מישהו שבאמת אכפת לו ורוצה לעזור.
הימנע מביטויים של איש מכירות טיפיקלי.
אל תחזור על השם של הלקוח יותר מפעם אחת בכל השיחה.
השפה צריכה להיות פשוטה, ישירה וחברית.
תשדר חמימות, אמינות וכנות.

אסור להשתמש במילים/ביטויים הבאים:
- "מעולה!" חוזר ונשנה
- "אשמח לעזור לך"
- "בוודאי" או "בהחלט" יותר מדי
- חזרה על השם יותר מפעם אחת
- ביטויים פורמליים של איש מכירות

במקום זה:
- "נשמע טוב"
- "בסדר גמור"
- "אוקיי, אז..."
- "יופי"
- "נחמד"

תתנהג כמו חבר שממליץ על מקום שהוא אוהב!`;

    return prompt;
}

// טעינת מידע לקוח מהמאגר ומהזיכרון
async function loadClientInfo(sessionId) {
    return new Promise((resolve) => {
        const phone = sessionId.replace('@c.us', '');
        
        db.get(`SELECT * FROM clients WHERE phone = ?`, [phone], (err, row) => {
            if (err) {
                console.error('❌ שגיאה בטעינת מידע לקוח:', err.message);
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

// Initialize WhatsApp client
console.log('🚀 Initializing WhatsApp client...');
whatsappClient.initialize();

// Status check every 30 seconds
setInterval(() => {
    console.log('📊 Current status - WhatsApp ready:', isWhatsAppReady, '| Has QR:', !!qrCodeData, '| Messages received:', messageCount);
    if (isWhatsAppReady) {
        console.log('✅ Bot ready to receive WhatsApp messages!');
    } else {
        console.log('⏳ Waiting for WhatsApp connection...');
    }
}, 30000);

// הפונקציה הוסרה - משתמשים ב-createComprehensiveSystemPrompt במקום


// זיכרון מידע אישי (השיחות נשמרות במאגר נתונים)
let userProfiles = {};

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
        const commonWords = ['מעוניין', 'רוצה', 'מחפש', 'באתי', 'הגעתי', 'שלום', 'היי', 'שלומי', 'כן', 'לא', 'תודה', 'בסדר', 'מצוין', 'נהדר', 'מעולה', 'עבורי', 'עבור', 'בשבילי', 'לעצמי'];
        
        // זיהוי שם פשוט - רק אם עדיין אין שם ולא מילה נפוצה
        if (simpleNamePattern.test(originalMessage) && !commonWords.includes(lowerMessage)) {
            if (!userProfiles[sessionId]) {
                userProfiles[sessionId] = {};
            }
            userProfiles[sessionId].name = originalMessage;
            console.log('👤 זוהה שם פשוט:', originalMessage);
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
    
    // זיהוי תאריכי פגישות
    const datePatterns = [
        /יום (\w+)/, /ב(\w+)/, /(\w+) בערב/, /(\w+) בבוקר/,
        /מחר/, /היום/, /עוד (\d+) ימים/, /בעוד (\d+) ימים/,
        /השבוע/, /השבוע הבא/, /(\d{1,2})\/(\d{1,2})/
    ];
    
    for (const pattern of datePatterns) {
        if (lowerMessage.match(pattern)) {
            if (!userProfiles[sessionId]) {
                userProfiles[sessionId] = {};
            }
            userProfiles[sessionId].appointmentDate = lowerMessage.match(pattern)[0];
            console.log('📅 זוהה תאריך פגישה:', userProfiles[sessionId].appointmentDate);
            break;
        }
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
    
    // זיהוי אישור חיובי לשאלת תשלום - זה מטופל עכשיו ב-processMessage
    
    // חילוץ גיל (משתמש או ילד) ושמירה בפרופיל
    try {
        const agePatterns = [
            /(בן)\s*(\d{1,2})/,
            /(בת)\s*(\d{1,2})/,
            /גיל\s*(\d{1,2})/
        ];
        for (const pattern of agePatterns) {
            const ageMatch = lowerMessage.match(pattern);
            if (ageMatch) {
                const value = parseInt(ageMatch[2] || ageMatch[1] || ageMatch[0]?.replace(/[^0-9]/g, ''), 10);
                if (!isNaN(value) && value > 0 && value < 100) {
                    if (!userProfiles[sessionId]) {
                        userProfiles[sessionId] = {};
                    }
                    // אם עבור ילד – נשמור childAge, אחרת age למתאמן עצמו
                    if (userProfiles[sessionId].isForChild || /(הוא|היא)\s*(בן|בת)/.test(lowerMessage)) {
                        userProfiles[sessionId].childAge = value;
                    } else {
                        userProfiles[sessionId].age = value;
                    }
                    console.log('📏 זוהה גיל:', value, 'isForChild:', !!userProfiles[sessionId].isForChild);
                    break;
                }
            }
        }
    } catch (e) {
        console.log('⚠️ שגיאה בזיהוי גיל:', e?.message);
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

        // Check working hours for web chat too
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
