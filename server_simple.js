
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
    const phone = sessionId.replace('@c.us', '');
    
    db.run(`INSERT INTO conversations (client_phone, message_role, message_content) VALUES (?, ?, ?)`,
        [phone, role, content], function(err) {
            if (err) {
                console.error('❌ שגיאה בשמירת שיחה:', err.message);
            }
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

function loadClientFromDB(sessionId, callback) {
    const phone = sessionId.replace('@c.us', '');
    
    db.get(`SELECT * FROM clients WHERE phone = ?`, [phone], (err, row) => {
        if (err) {
            console.error('❌ שגיאה בטעינת לקוח:', err.message);
            callback(null);
        } else if (row) {
            const profile = {
                name: row.name,
                age: row.age,
                experienceDuration: row.experience,
                comingToTrial: row.coming_to_trial
            };
            console.log('✅ לקוח נטען מהמאגר:', phone);
            callback(profile);
        } else {
            callback(null);
        }
    });
}

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
            const now = new Date();
            const dayOfWeek = now.getDay();
            let workingHoursMessage = '';
            
            if (dayOfWeek === 6) { // Saturday
                workingHoursMessage = 'שבת שלום! 🙏\nאני זמין לענות על הודעות מיום ראשון עד חמישי בין השעות 7:00-23:00, ובימי שישי עד 16:00.\nאשמח לענות לך במהלך שעות הפעילות!';
            } else if (dayOfWeek === 5 && now.getHours() >= 16) { // Friday after 16:00
                workingHoursMessage = 'שבת שלום! 🙏\nאני זמין לענות על הודעות עד 16:00 בימי שישי.\nאשמח לענות לך ביום ראשון החל מ-7:00 בבוקר!';
            } else { // Other days outside working hours
                workingHoursMessage = 'היי! 😊\nאני זמין לענות על הודעות בין השעות 7:00-23:00 מיום ראשון עד חמישי, ובימי שישי עד 16:00.\nאשמח לענות לך במהלך שעות הפעילות!';
            }
            
            await message.reply(workingHoursMessage);
            console.log('⏰ הודעה נשלחה מחוץ לשעות פעילות');
            return;
        }
        
        console.log('✅ Processing private message...');
        
        // Use phone number as sessionId
        const sessionId = message.from;
        
        // Call existing message processing function
        const response = await processMessage(message.body, sessionId);
        
        // Send reply
        await message.reply(response);
        
        console.log('📤 WhatsApp response sent:', response);
        
    } catch (error) {
        console.error('❌ Error handling WhatsApp message:', error);
        try {
            await message.reply('סליחה, יש לי עומס רגע. נסה שוב בעוד רגע 🙏');
        } catch (replyError) {
            console.error('❌ Error sending error message:', replyError);
        }
    }
});

// פונקציה לעיבוד הודעה (משותפת לווטסאפ ולאפליקציית הווב)
async function processMessage(message, sessionId = 'default') {
    if (!message) {
        throw new Error('הודעה ריקה');
    }

    console.log('📨 Processing message:', message);

    // טעינת מידע קיים של הלקוח מהמאגר אם זו השיחה הראשונה
    if (!userProfiles[sessionId]) {
        await new Promise((resolve) => {
            loadClientFromDB(sessionId, (profile) => {
                if (profile) {
                    userProfiles[sessionId] = profile;
                    console.log('✅ נטען מידע קיים של לקוח:', sessionId.replace('@c.us', ''));
                }
                resolve();
            });
        });
    }

    // חילוץ מידע אישי מההודעה
    extractPersonalInfo(message, sessionId);
    
    // קבלת היסטוריית השיחה
    const conversationHistory = conversationMemory[sessionId] || [];
    
    // יצירת prompt אנושי ודינמי
    const humanPrompt = createHumanPrompt(message, conversationHistory, sessionId);
    
    console.log('🔍 הפרומפט שנשלח ל-AI:');
    console.log('='.repeat(50));
    console.log(humanPrompt);
    console.log('='.repeat(50));

    const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content: humanPrompt
            },
            {
                role: "user",
                content: message
            }
        ],
        // ללא מגבלת טוקנים קשיחה כדי למנוע חיתוך פרטים חשובים
        temperature: 0.3, // יותר עקבי ומדויק
        presence_penalty: 0.5, // פחות חזרות
        frequency_penalty: 0.7 // הימנעות חזקה מביטויים חוזרים
    });

    let response = completion.choices[0].message.content;
    
    // הוספת סרטון וקישורי תשלום אוטומטית כשיש עניין
    response = addVideoAndPaymentLinks(response, message, sessionId);
    
    // קביעת קהל יעד וקבוצת גיל לפני התאמות טקסט
    determineAudienceAndBracket(sessionId);

    // הוספת מגע אנושי
    response = addHumanTouch(response, message, sessionId);
    
    // הוספת שאלת תשלום אם זוהה אישור תשלום
    response = addPaymentQuestion(response, message, sessionId);
    
    // נרמול קישורים לכלול ירידת שורה וללא סוגריים מרובעים
    response = normalizeLinks(response);

    // מניעת שאלות חוזרות על עובדות שכבר ידועות
    response = preventRepeatedQuestions(response, sessionId);

    // הגבלה על שימוש בשם הלקוח (פעם אחת לכל השיחה)
    response = enforceNameUsagePolicy(response, sessionId);

    // מדיניות אימוג'ים: מקס' אחד לכל 5–7 הודעות + גיוון
    response = applyEmojiPolicy(response, sessionId);

    // סינון לפי גיל וקהל יעד כדי לא להציג קבוצות לא רלוונטיות
    response = filterByAudienceAndAge(response, sessionId);
    
    // ניקוי הודעה אחת
    const cleanResponse = cleanSingleMessage(response);
    
    console.log('📤 תשובה:', cleanResponse);

    // שמירת השיחה בזיכרון
    if (!conversationMemory[sessionId]) {
        conversationMemory[sessionId] = [];
    }
    
    // שמירת ההודעה
    conversationMemory[sessionId].push({ role: 'user', content: message });
    conversationMemory[sessionId].push({ role: 'assistant', content: cleanResponse });
    
    // שמירה במאגר מידע
    saveConversationToDB(sessionId, 'user', message);
    saveConversationToDB(sessionId, 'assistant', cleanResponse);
    
    // שמירת פרופיל הלקוח במאגר מידע אם יש מידע חדש
    const currentProfile = userProfiles[sessionId];
    if (currentProfile && (currentProfile.name || currentProfile.age || currentProfile.childAge)) {
        saveClientToDB(sessionId, currentProfile);
    }
    
    return cleanResponse;
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

// פונקציה ליצירת prompt אנושי ודינמי
function createHumanPrompt(userMessage, conversationHistory = [], sessionId = 'default') {
    const persona = knowledgeBase.persona;
    const userProfile = userProfiles[sessionId] || {};
    
    // מידע על התאריך והשעה הנוכחיים
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
    
    let prompt = `אתה דביר - מאמן אומנויות לחימה.

התאריך והשעה הנוכחיים: ${currentDateTime}

עקוב אחר ההוראות בבסיס הידע שלך בדיוק.
השתמש במידע מבסיס הידע כמקור יחיד להוראות והתנהגות.
השתמש במידע על התאריך הנוכחי כדי לענות על שאלות על זמנים ולקביעת פגישות.

בסיס הידע - עקוב אחר ההוראות האלה בדיוק:
${knowledgeBase.knowledge_base.map(item => 
    `${item.topic}: ${item.answer}`
).join('\n')}`;

    // מידע בסיסי על הלקוח מהפרופיל
    const profileFacts = [];
    if (userProfile.name) profileFacts.push(`שם: ${userProfile.name}`);
    if (typeof userProfile.age === 'number') profileFacts.push(`גיל: ${userProfile.age}`);
    if (typeof userProfile.childAge === 'number') profileFacts.push(`גיל ילד: ${userProfile.childAge}`);
    if (userProfile.isForSelf) profileFacts.push('האימונים עבור עצמו');
    if (userProfile.isForChild) profileFacts.push('האימונים עבור ילד');
    if (userProfile.ageBracket) profileFacts.push(`קבוצת גיל רלוונטית: ${userProfile.ageBracket}`);
    if (userProfile.preferredStyle) profileFacts.push(`סוג אימון מועדף: ${userProfile.preferredStyle}`);
    if (userProfile.hasExperience) profileFacts.push('יש ניסיון קודם');
    if (userProfile.experienceDuration) profileFacts.push(`משך ניסיון: ${userProfile.experienceDuration}`);
    if (userProfile.lastTrainedAgo) profileFacts.push(`מתי התאמן לאחרונה: לפני ${userProfile.lastTrainedAgo}`);
    if (userProfile.mainNeed) profileFacts.push(`מטרה מרכזית: ${userProfile.mainNeed}`);
    if (profileFacts.length) {
        prompt += `\n\nפרטי לקוח (זכור והשתמש, אל תשאל שוב על ידוע):\n- ${profileFacts.join('\n- ')}`;
    }

    // הקשר מהשיחה
    prompt += `\n\nמצב השיחה: ${conversationHistory.length} הודעות עד כה`;
    if (conversationHistory.length > 0) {
        prompt += '\n\nהקשר מהשיחה (מלא):\n';
        conversationHistory.forEach(msg => {
            prompt += `${msg.role}: ${msg.content}\n`;
        });
    } else {
        prompt += ' - זו השיחה הראשונה';
    }

    prompt += `\n\nהודעת המשתמש: "${userMessage}"`;

    return prompt;
}


// זיכרון שיחה פשוט (במקום אמיתי זה יהיה בבסיס נתונים)
let conversationMemory = {};

// זיכרון מידע אישי
let userProfiles = {};

// פונקציה לחילוץ שם ומידע אישי
function extractPersonalInfo(message, sessionId) {
    const lowerMessage = message.toLowerCase();
    const originalMessage = message.trim();
    const userProfile = userProfiles[sessionId] || {};
    const conversationHistory = conversationMemory[sessionId] || [];
    
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
        
        // זיהוי שם פשוט רק בהודעות הראשונות (לא תשובות לשאלות)
        if (conversationHistory.length <= 2 && simpleNamePattern.test(originalMessage) && !commonWords.includes(lowerMessage)) {
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
    
    // זיהוי אישור חיובי לשאלת תשלום
    const positiveConfirmationPatterns = [
        /^כן$/, /^כן,/, /כן שילמתי/, /כן ביצעתי/, /כן עשיתי/, /כן השלמתי/,
        /בטח/, /ודאי/, /בוודאי/, /כמובן/, /בהחלט/
    ];
    
    const confirmedPaymentPositive = positiveConfirmationPatterns.some(pattern => lowerMessage.match(pattern));
    
    if (confirmedPaymentPositive && userProfile.paymentClaimDetected && userProfile.name) {
        // שליחת הודעה לדביר עם פרטי הלקוח
        const clientInfo = {
            name: userProfile.name,
            phone: sessionId.replace('@c.us', ''), // הסרת הסיומת של WhatsApp
            age: userProfile.age,
            childAge: userProfile.childAge,
            experience: userProfile.experienceDuration || 'לא צוין',
            appointmentDate: userProfile.appointmentDate || 'לא נקבע עדיין'
        };
        
        const paymentDetails = {
            type: userProfile.preferredStyle || userProfile.ageBracket || 'אימון ניסיון',
            notes: `הלקוח אמר: "${userProfile.paymentClaimMessage}" ואישר בחיוב כשנשאל`
        };
        
        // שליחה אסינכרונית של ההודעה לדביר
        sendPaymentNotificationToDvir(clientInfo, paymentDetails).catch(err => 
            console.error('❌ שגיאה בשליחת הודעה לדביר:', err)
        );
        
        // איפוס הסימון
        userProfiles[sessionId].paymentClaimDetected = false;
        
        console.log('✅ נשלחה הודעה לדביר עם פרטי הלקוח ואישור התשלום');
    }
    
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

// פונקציה לזיהוי עניין ולהוספת סרטון הגעה וקישור תשלום
function addVideoAndPaymentLinks(response, userMessage, sessionId) {
    const lowerMessage = userMessage.toLowerCase();
    const userProfile = userProfiles[sessionId] || {};
    const conversationHistory = conversationMemory[sessionId] || [];
    
    // לא שולחים קישורים בשיחות קצרות (מינימום 4 הודעות)
    if (conversationHistory.length < 4) {
        return response;
    }
    
    // זיהוי בקשה ספציפית לקביעת אימון - רק אחרי תהליך מכירה מלא!
    const schedulingPatterns = [
        /בואו נקבע/, /רוצה לקבוע/, /אשמח לקבוע/, /נקבע אימון/, 
        /תרצה שנקבע/, /מתי נוכל/, /איך נקבע/, /בואו נתאם/,
        /רוצה לנסות/, /מוכן לנסות/, /אני בפנים/, /בוא נתחיל/
    ];
    
    const wantsToSchedule = schedulingPatterns.some(pattern => lowerMessage.match(pattern));
    
    // שלח קישורים רק אם:
    // 1. יש בקשה ספציפית לקביעה
    // 2. יש שם של הלקוח 
    // 3. עברו את שלב זיהוי הצורך והדירוג
    // 4. הבוט הציע אימון ניסיון (התשובה כוללת "אימון")
    // 5. עוד אין קישורים בתשובה
    // בדיקה אם הבוט הציע אימון ניסיון במפורש
    const botOfferedTrial = response.includes('אימון ניסיון') || response.includes('אימון הכרות');
    
    if (wantsToSchedule && userProfile.name && userProfile.urgencyRated && botOfferedTrial && !response.includes('https://')) {
        let addition = '\n\n';

        // הוספת סרטון הגעה והנחיות מלאות בפורמט שורה נפרדת לקישור
        addition += 'מצרף קישור לסרטון הגעה:\n';
        addition += 'https://youtube.com/shorts/_Bk2vYeGQTQ?si=n1wgv8-3t7_hEs45\n\n';

        // הוספת הנחיות הגעה מלאות
        addition += 'מומלץ להגיע 5 דקות לפני עם בגדי ספורט נוחים (בלי רוכסן מתכת), בקבוק מים, מגבת ואנרגיות!\n\n';

        // הוספת הדגשה לגבי שריון מקום ותשלום ניסיון
        addition += 'כדי לשמור ולשריין מקום לאימון הניסיון נדרש לבצע תשלום מראש דרך הקישור.\n';
        // פירוט מחיר ניסיון לפי קהל יעד
        if (userProfile.name) {
            const isAdult = userProfile.isForSelf || lowerMessage.includes('20') || lowerMessage.includes('בוגר');
            if (isAdult) {
                addition += 'אימון ניסיון יעלה לך רק 25 שקלים.\n\n';
            } else {
                addition += 'אימון ניסיון לילדים/נוער – 10 שקלים.\n\n';
            }
        } else {
            addition += '\n';
        }

        // הוספת שאלה על שאלות נוספות
        addition += 'יש שאלות נוספות או דברים שתרצה לדעת לפני שאתה מגיע? אם כן אני זמין.\n\n';

        // הוספת קישור תשלום מתאים - שורה מעל + רק הקישור לבדו בשורה נפרדת
        if (userProfile.name) {
            // זיהוי אם זה ילד או בוגר
            const isAdult = userProfile.isForSelf || lowerMessage.includes('20') || lowerMessage.includes('בוגר');

            addition += 'מצרף קישור לתשלום:\n';
            if (isAdult) {
                addition += 'https://letts.co.il/payment/TVhqVTYxTUpCUkxHa3BTMmJmQ0YxQT09';
            } else {
                addition += 'https://letts.co.il/payment/OEVGZEpZaktQbFFSVUYrVXREMVcrdz09';
            }
            addition += '\n\nלאחר ביצוע התשלום, תעדכן כאן כדי שנשריין לך מקום.';
            
            // סימון שהלקוח מגיע לאימון ניסיון
            if (!userProfiles[sessionId]) {
                userProfiles[sessionId] = {};
            }
            userProfiles[sessionId].comingToTrial = true;
            
            // שליחת סיכום לדביר כשנקבעת פגישה
            const clientInfo = {
                name: userProfile.name,
                phone: sessionId.replace('@c.us', ''), // הסרת הסיומת של WhatsApp
                age: userProfile.age,
                childAge: userProfile.childAge,
                appointmentDate: userProfile.appointmentDate,
                personalNeeds: userProfile.personalNeeds
            };
            
            const appointmentDetails = {
                type: userProfile.preferredStyle || userProfile.ageBracket || 'אימון ניסיון',
                details: `בקשה לקביעת אימון ניסיון. עבור ${userProfile.isForSelf ? 'עצמו' : 'ילד'}.${userProfile.mainNeed ? ' מטרה: ' + userProfile.mainNeed : ''}`
            };
            
            // שליחה אסינכרונית של הסיכום (לא לחכות לתוצאה)
            sendAppointmentSummary(clientInfo, appointmentDetails).catch(err => 
                console.error('❌ שגיאה בשליחת סיכום:', err)
            );
            
            // שמירת הפגישה במאגר מידע
            saveAppointmentToDB(sessionId, appointmentDetails.type, userProfile.appointmentDate || 'לא צוין');
        }
        
        response += addition;
    }
    
    return response;
}

// פונקציה לניקוי הודעה בלבד - ללא הוספות מיותרות
function addHumanTouch(response, userMessage, sessionId) {
    let updated = response;
    const profile = userProfiles[sessionId] || {};
    const history = conversationMemory[sessionId] || [];

    // הגבלת "נעים להכיר" לפעם אחת בשיחה
    const hasSaidNaimLehakir = history.some(m => m.role === 'assistant' && typeof m.content === 'string' && m.content.includes('נעים להכיר'));
    if (hasSaidNaimLehakir) {
        updated = updated.replace(/\s*נעים להכיר[^\n]*\n?/g, '');
    }

    // אם המשתמש הזכיר "דביר" – להציג רק תפקיד בלי שם עצמי
    if (profile.knowsMyName) {
        // החלפות נפוצות של הצגה עצמית
        updated = updated
            // מקרים עם שם + תפקיד יחד
            .replace(/\bאני\s+דביר,?\s*מאמן\s+אומנויות\s+לחימה\b/g, 'אני מאמן אומנויות לחימה')
            .replace(/\b(שלום!?|היי!?)\s*אני\s+דביר,?\s*מאמן\s+אומנויות\s+לחימה\b/g, '$1 אני מאמן אומנויות לחימה')
            // דביר - מאמן...
            .replace(/דביר\s*-\s*מאמן\s+אומנויות\s+לחימה/g, 'מאמן אומנויות לחימה')
            // רק "אני דביר" ללא התפקיד
            .replace(/\bשלום!?\s*אני\s+דביר\b/g, 'שלום! אני מאמן אומנויות לחימה')
            .replace(/\bהיי!?\s*אני\s+דביר\b/g, 'היי! אני מאמן אומנויות לחימה')
            .replace(/\bאני\s+דביר\b/g, 'אני מאמן אומנויות לחימה')
            // הסרת כפילויות אם נוצרו
            .replace(/מאמן\s+אומנויות\s+לחימה\s*,\s*מאמן\s+אומנויות\s+לחימה/g, 'מאמן אומנויות לחימה')
            .replace(/מאמן\s+אומנויות\s+לחימה\s+מאמן\s+אומנויות\s+לחימה/g, 'מאמן אומנויות לחימה');
    }

    return updated;
}

// הוספת שאלת תשלום כשמזוהה אישור תשלום
function addPaymentQuestion(response, userMessage, sessionId) {
    const profile = userProfiles[sessionId] || {};
    
    // אם זוהה אישור תשלום ועדיין לא נשאל - להוסיף שאלה
    if (profile.paymentClaimDetected && !response.includes('האם שילמת') && !response.includes('האם ביצעת')) {
        return response + '\n\nהאם שילמת?';
    }
    
    return response;
}

// מניעת שאלות חוזרות על פרטים שכבר נמסרו (שם, גיל, יעד, ניסיון, סוג אימון)
function preventRepeatedQuestions(text, sessionId) {
    const profile = userProfiles[sessionId] || {};
    let t = text;

    if (profile.name) {
        t = t.replace(/איך\s+קוראים\s+לך\??/g, '');
    }
    if (typeof profile.age === 'number' || typeof profile.childAge === 'number') {
        t = t.replace(/בן\/בת\s*כמה\s*אתה\??/g, '');
        t = t.replace(/בן\s*כמה\s*את\??/g, '');
        t = t.replace(/מה\s+הגיל\??/g, '');
    }
    if (profile.isForSelf || profile.isForChild) {
        t = t.replace(/האימונים\s+עבורך\s+או\s+עבור\s+מישהו\s+אחר\??/g, '');
    }
    if (profile.preferredStyle) {
        t = t.replace(/איזה\s+סוג\s+אימון\s+מעניין\s+אותך\??/g, '');
    }
    if (profile.hasExperience || profile.experienceDuration) {
        t = t.replace(/יש\s+לך\s+ניסיון\s+קודם.*\??/g, '');
    }
    // ניקוי שורות ריקות עקב מחיקות
    t = t.replace(/\n{2,}/g, '\n');
    return t.trim();
}

// הגבלה קשיחה של שימוש בשם הלקוח: מקסימום פעם אחת בשיחה (ועוד פעם בסוף אם ממש נדרש)
function enforceNameUsagePolicy(text, sessionId) {
    const profile = userProfiles[sessionId] || {};
    if (!profile.name) return text;
    if (!userProfiles[sessionId]) userProfiles[sessionId] = {};
    if (typeof userProfiles[sessionId].nameUsageCount !== 'number') userProfiles[sessionId].nameUsageCount = 0;

    const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameRe = new RegExp(escapeRegExp(profile.name), 'g');

    // אם כבר השתמשנו בשם פעם אחת – להסיר הופעות נוספות
    if (userProfiles[sessionId].nameUsageCount >= 1) {
        return text.replace(nameRe, '').replace(/\s{2,}/g, ' ').trim();
    }

    // אם זו הפעם הראשונה שמופיע – נספור אותה
    if (nameRe.test(text)) {
        userProfiles[sessionId].nameUsageCount += 1;
        // איפוס ה-regexp
        nameRe.lastIndex = 0;
    }
    return text;
}

// מדיניות אימוג'ים: מקס' אחד כל 5–7 הודעות, לגוון אימוג'ים
function applyEmojiPolicy(text, sessionId) {
    if (!userProfiles[sessionId]) userProfiles[sessionId] = {};
    const profile = userProfiles[sessionId];
    if (typeof profile.assistantMessagesSinceEmoji !== 'number') profile.assistantMessagesSinceEmoji = 10; // לאפשר בהתחלה
    const diversify = ['👊🏻','💪🏻','😊','🙂','🔥','👏','✨'];

    const emojiRegex = /[\uD83C-\uDBFF][\uDC00-\uDFFF]/g; // רוב האימוג'ים (סרוגייט פייר)
    const matches = [...(text.match(emojiRegex) || [])];

    // אם עוד לא עברו 5 הודעות מאז האימוג'י האחרון – להסיר כל האימוג'ים
    if (profile.assistantMessagesSinceEmoji < 5) {
        const without = text.replace(emojiRegex, '');
        profile.assistantMessagesSinceEmoji += 1;
        return without;
    }

    if (matches.length === 0) {
        profile.assistantMessagesSinceEmoji += 1;
        return text;
    }

    // השאר רק אימוג'י ראשון; השאר להסיר
    let keptEmoji = matches[0];
    // גיוון: אם זהה לאחרון – החלף באחר
    if (profile.lastEmojiUsed === keptEmoji) {
        const alternative = diversify.find(e => e !== profile.lastEmojiUsed) || keptEmoji;
        keptEmoji = alternative;
    }

    let encountered = false;
    const limited = text.replace(emojiRegex, () => {
        if (!encountered) {
            encountered = true;
            return keptEmoji;
        }
        return '';
    });

    profile.assistantMessagesSinceEmoji = 0;
    profile.lastEmojiUsed = keptEmoji;
    return limited;
}
// פונקציה לניקוי הודעה אחת
function cleanSingleMessage(text) {
    // הסרת הדגשות שלא נראות טוב בווטסאפ
    text = text.replace(/\*\*(.*?)\*\*/g, '$1'); // הסרת **bold**
    text = text.replace(/\*(.*?)\*/g, '$1'); // הסרת *italic*
    text = text.replace(/_(.*?)_/g, '$1'); // הסרת _underline_
    
    // תיקון MMA להופיע כ"אומנויות לחימה מעורבות (MMA)"
    text = text.replace(/^MMA\b/gm, 'אומנויות לחימה מעורבות (MMA)');
    text = text.replace(/\bMMA\b/g, 'אומנויות לחימה מעורבות (MMA)');
    
    // הסרת מילים באנגלית ושמות זרים
    text = text.replace(/\bawesome\b/gi, 'מדהים');
    text = text.replace(/\bgreat\b/gi, 'נהדר');
    text = text.replace(/\bthanks?\b/gi, '');
    
    // ניקוי הטקסט
    text = text.replace(/\n\n/g, '\n').trim();
    
    // הסרת שורות ריקות מיותרות
    text = text.replace(/\n+/g, '\n');
    
    return text;
}

// נרמול קישורים: להימנע מסגנון [טקסט](קישור) ולהציג קישורים בשורה נפרדת
function normalizeLinks(text) {
    if (!text) return text;
    // המרה של קישורי מרקדאון ל"מצרף קישור" ואז URL בשורה הבאה
    text = text.replace(/\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/g, 'מצרף קישור:\n$1');
    // אם יש תגית עם נקודתיים ואז URL, העבר את ה-URL לשורה חדשה
    text = text.replace(/(:)\s+(https?:\/\/\S+)/g, ':\n$2');
    // הבטח ש-URL עומד בשורה בפני עצמו (מוסיף שורות ריקות מינימליות סביבו)
    text = text.replace(/([^\n])(https?:\/\/\S+)/g, '$1\n$2');
    text = text.replace(/(https?:\/\/\S+)([^\n])/g, '$1\n$2');
    // צמצום רווחי שורות עודפים
    text = text.replace(/\n{3,}/g, '\n\n');
    return text;
}

// קביעה אם מדובר בילד/בוגר וקבוצת גיל רלוונטית
function determineAudienceAndBracket(sessionId) {
    const profile = userProfiles[sessionId] || {};
    const childAge = profile.childAge;
    const selfAge = profile.age;
    let audience = null; // 'child' | 'adult' | null
    let bracket = null;  // '4-6' | '6-9' | '9-12' | 'נוער' | 'בוגרים' | null

    if (profile.isForChild || (typeof childAge === 'number')) {
        audience = 'child';
        if (typeof childAge === 'number') {
            if (childAge >= 4 && childAge <= 6) bracket = '4-6';
            else if (childAge > 6 && childAge <= 9) bracket = '6-9';
            else if (childAge > 9 && childAge <= 12) bracket = '9-12';
            else if (childAge >= 12 && childAge < 16) bracket = 'נוער';
            else if (childAge >= 16) { audience = 'adult'; bracket = 'בוגרים'; }
        }
    } else if (profile.isForSelf || (typeof selfAge === 'number')) {
        if (typeof selfAge === 'number' && selfAge < 16) {
            audience = 'child';
            if (selfAge >= 12) bracket = 'נוער';
            else if (selfAge > 9) bracket = '9-12';
            else if (selfAge > 6) bracket = '6-9';
            else if (selfAge >= 4) bracket = '4-6';
        } else {
            audience = 'adult';
            bracket = 'בוגרים';
        }
    }

    if (!userProfiles[sessionId]) userProfiles[sessionId] = {};
    userProfiles[sessionId].audience = audience;
    userProfiles[sessionId].ageBracket = bracket;
}

// סינון תשובה לפי קהל יעד וקבוצת גיל רלוונטית
function filterByAudienceAndAge(response, sessionId) {
    const profile = userProfiles[sessionId] || {};
    const audience = profile.audience;
    const bracket = profile.ageBracket;
    if (!audience) return response;

    const patterns = {
        '4-6': /(4\s*-\s*6|4׳?\s*[–-]\s*6)/,
        '6-9': /(6\s*-\s*9|6׳?\s*[–-]\s*9)/,
        '9-12': /(9\s*-\s*12|9׳?\s*[–-]\s*12)/,
        'נוער': /(נוער|12\s*-\s*16|12׳?\s*[–-]\s*16)/,
        'בוגרים': /(בוגרים|16\+|מבוגרים)/
    };

    const lines = response.split('\n');

    const isLineRelevant = (line) => {
        const hasChild = patterns['4-6'].test(line) || patterns['6-9'].test(line) || patterns['9-12'].test(line) || patterns['נוער'].test(line) || /ילדים|נערים|נוער/.test(line);
        const hasAdult = patterns['בוגרים'].test(line) || /מבוגרים/.test(line);

        if (audience === 'adult') {
            // למבוגרים – לא להזכיר קבוצות ילדים/נוער
            if (hasChild) return false;
            return true;
        }

        // audience === 'child'
        if (hasAdult) return false;

        // אם יש לנו ברקט מוגדר – להשאיר רק אותו
        if (bracket && patterns[bracket]) {
            // אם הקו מזכיר ברקט אחר – להסיר
            const mentionsSomeBracket = Object.keys(patterns).some(k => patterns[k].test(line));
            if (mentionsSomeBracket) {
                return patterns[bracket].test(line);
            }
        }

        return true;
    };

    const filtered = lines.filter(isLineRelevant).join('\n');
    return filtered;
}

app.post('/api/chat', async (req, res) => {
    try {
        const { message, sessionId = 'default' } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'הודעה ריקה' });
        }

        console.log('📨 הודעה נכנסת מהווב:', message);

        // Check working hours for web chat too
        if (!isWorkingHours()) {
            const now = new Date();
            const dayOfWeek = now.getDay();
            let workingHoursMessage = '';
            
            if (dayOfWeek === 6) { // Saturday
                workingHoursMessage = 'שבת שלום! 🙏\nאני זמין לענות על הודעות מיום ראשון עד חמישי בין השעות 7:00-23:00, ובימי שישי עד 16:00.\nאשמח לענות לך במהלך שעות הפעילות!';
            } else if (dayOfWeek === 5 && now.getHours() >= 16) { // Friday after 16:00
                workingHoursMessage = 'שבת שלום! 🙏\nאני זמין לענות על הודעות עד 16:00 בימי שישי.\nאשמח לענות לך ביום ראשון החל מ-7:00 בבוקר!';
            } else { // Other days outside working hours
                workingHoursMessage = 'היי! 😊\nאני זמין לענות על הודעות בין השעות 7:00-23:00 מיום ראשון עד חמישי, ובימי שישי עד 16:00.\nאשמח לענות לך במהלך שעות הפעילות!';
            }
            
            return res.json({ 
                response: workingHoursMessage,
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
