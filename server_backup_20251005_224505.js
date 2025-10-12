const express = require('express');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');
const { Client, NoAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ===============================
// DATABASE SETUP
// ===============================

const db = new sqlite3.Database('./dvir_basson_clients.db', (err) => {
    if (err) {
        console.error('❌ שגיאה בחיבור למאגר מידע:', err.message);
    } else {
        console.log('✅ חיבור למאגר מידע הושלם בהצלחה');
        initializeDatabase();
    }
});

function initializeDatabase() {
    // טבלת לקוחות - מבנה חדש ומסודר
    db.run(`CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT UNIQUE NOT NULL,
        name TEXT,
        full_name TEXT,
        age INTEGER,
        experience TEXT,
        lead_status TEXT DEFAULT 'cold',
        appointment_date TEXT,
        appointment_time TEXT,
        payment_confirmed BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // טבלת שיחות - ללא שינוי
    db.run(`CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_phone TEXT,
        message_role TEXT,
        message_content TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_phone) REFERENCES clients (phone)
    )`);
    
    // טבלת appointments - עם appointment_time
    db.run(`CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_phone TEXT,
        appointment_date TEXT,
        appointment_time TEXT,
        appointment_type TEXT,
        status TEXT DEFAULT 'scheduled',
        payment_confirmed BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_phone) REFERENCES clients (phone)
    )`);
    
    // טבלת סיכומים - summary_data (לא summary_json)
    db.run(`CREATE TABLE IF NOT EXISTS chat_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_phone TEXT,
        summary_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_phone) REFERENCES clients (phone)
    )`);
    
    console.log('✅ טבלאות נוצרו בהצלחה');
    
    // מיגרציות - הוספת עמודות חסרות אם קיימות
    const migrations = [
        { table: 'clients', column: 'appointment_time', type: 'TEXT' },
        { table: 'clients', column: 'payment_confirmed', type: 'BOOLEAN DEFAULT FALSE' },
        { table: 'appointments', column: 'appointment_time', type: 'TEXT' }
    ];
    
    migrations.forEach(({ table, column, type }) => {
        db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`, (err) => {
            if (err) {
                if (err.message.includes('duplicate column')) {
                    console.log(`ℹ️ העמודה ${column} כבר קיימת ב-${table}`);
                } else {
                    console.error(`⚠️ שגיאה בהוספת ${column} ל-${table}:`, err.message);
                }
            } else {
                console.log(`✅ נוספה עמודה ${column} ל-${table}`);
            }
        });
    });
}

// ===============================
// LOAD GEORGE PROMPT
// ===============================

let georgePrompt = null;
try {
    const promptData = fs.readFileSync(path.join(__dirname, 'george_system_prompt.json'), 'utf8');
    georgePrompt = JSON.parse(promptData);
    console.log('✅ פרומפט ג\'ורג\' נטען בהצלחה');
} catch (error) {
    console.error('❌ שגיאה בטעינת פרומפט ג\'ורג\':', error.message);
    process.exit(1);
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// ===============================
// WHATSAPP CLIENT
// ===============================

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

let qrCodeData = '';
let isWhatsAppReady = false;
let messageCount = 0;

// WhatsApp Events
whatsappClient.on('qr', async (qr) => {
    console.log('📱 קוד QR נוצר - סרוק עם הווטסאפ שלך');
    qrCodeData = await qrcode.toDataURL(qr);
    console.log('🔗 קוד QR זמין בכתובת: http://localhost:' + PORT + '/qr');
});

whatsappClient.on('ready', () => {
    console.log('✅ לקוח ווטסאפ מוכן לפעולה');
    console.log('🎯 הבוט מאזין כעת להודעות נכנסות...');
    isWhatsAppReady = true;
});

whatsappClient.on('authenticated', () => {
    console.log('🔐 אימות ווטסאפ הושלם');
});

whatsappClient.on('disconnected', (reason) => {
    console.log('⚠️ לקוח ווטסאפ התנתק:', reason);
    isWhatsAppReady = false;
    qrCodeData = '';
});

whatsappClient.on('error', (error) => {
    console.error('❌ שגיאת לקוח ווטסאפ:', error);
});

// ===============================
// HELPER FUNCTIONS
// ===============================

// פונקציות שעות פעילות הוסרו - ג'ורג' זמין 24/7!

// ===============================
// DATABASE FUNCTIONS
// ===============================

async function getOrCreateClient(sessionId) {
    return new Promise((resolve) => {
        const phone = sessionId.replace('@c.us', '');
        
        db.get(`SELECT * FROM clients WHERE phone = ?`, [phone], (err, row) => {
            if (err) {
                console.error('❌ שגיאה בטעינת לקוח:', err.message);
                resolve(null);
            } else if (row) {
                console.log('📋 לקוח קיים נמצא:', phone);
                resolve(row);
            } else {
                // לקוח חדש - יצירה עם סטטוס cold
                db.run(`INSERT INTO clients (phone, lead_status) VALUES (?, 'cold')`,
                    [phone], function(err) {
                    if (err) {
                        console.error('❌ שגיאה ביצירת לקוח חדש:', err.message);
                        resolve(null);
                    } else {
                        console.log('✅ לקוח חדש נוצר (Cold Lead):', phone);
                        resolve({ id: this.lastID, phone: phone, lead_status: 'cold' });
                    }
                });
            }
        });
    });
}

async function updateClientLeadStatus(sessionId, status, additionalFields = {}) {
    return new Promise((resolve) => {
        const phone = sessionId.replace('@c.us', '');
        
        const fields = Object.keys(additionalFields);
        const values = Object.values(additionalFields);
        
        let query = `UPDATE clients SET lead_status = ?, updated_at = CURRENT_TIMESTAMP`;
        const params = [status];
        
        fields.forEach(field => {
            query += `, ${field} = ?`;
        });
        params.push(...values);
        
        query += ` WHERE phone = ?`;
        params.push(phone);
        
        db.run(query, params, function(err) {
            if (err) {
                console.error('❌ שגיאה בעדכון סטטוס ליד:', err.message);
            } else {
                console.log(`✅ סטטוס ליד עודכן ל-${status}:`, phone);
            }
            resolve();
        });
    });
}

async function saveConversation(sessionId, role, content) {
    return new Promise((resolve) => {
        const phone = sessionId.replace('@c.us', '');
        
        db.run(`INSERT INTO conversations (client_phone, message_role, message_content) 
                VALUES (?, ?, ?)`,
            [phone, role, content], function(err) {
            if (err) {
                console.error('❌ שגיאה בשמירת שיחה:', err.message);
            } else {
                console.log('💾 הודעה נשמרה:', role);
            }
            resolve();
        });
    });
}

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
                        content: row.message_content
                    }));
                    console.log(`📚 נטענו ${history.length} הודעות מההיסטוריה`);
                    resolve(history);
                }
            });
    });
}

// ===============================
// GPT PROMPT BUILDER
// ===============================

function buildGeorgeSystemPrompt(hasConversationHistory = false, clientName = null) {
    // בדיקת תקינות של georgePrompt
    if (!georgePrompt) {
        console.error('❌ georgePrompt לא נטען כהלכה - הוא null או undefined');
        throw new Error('georgePrompt is null or undefined');
    }
    
    // בדיקת כל השדות החיוניים
    const requiredFields = [
        'character',
        'about_dvir',
        'core_instructions',
        'conversation_flow',
        'dvir_gym_knowledge',
        'sales_tactics',
        'communication_style',
        'payment_detection',
        'special_rules'
    ];
    
    for (const field of requiredFields) {
        if (!georgePrompt[field]) {
            console.error(`❌ השדה georgePrompt.${field} חסר`);
            throw new Error(`Missing required field: georgePrompt.${field}`);
        }
    }

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

    // בניית הפרומפט מה-JSON
    let prompt = `אתה ${georgePrompt.character.name} - ${georgePrompt.character.role}

${georgePrompt.character.description}

תאריך ושעה נוכחיים: ${currentDateTime} (Asia/Jerusalem)

=== אודות דביר בסון ===
רקע: ${georgePrompt.about_dvir.background}
שירות צבאי: ${georgePrompt.about_dvir.military_service}
כישורים: ${georgePrompt.about_dvir.qualifications}
מיקוד בהוראה: ${georgePrompt.about_dvir.teaching_focus}

גישה לעבודה עם ילדים:
פילוסופיה: ${georgePrompt.about_dvir.approach_with_kids.philosophy}

גבולות:
- נוקשים: ${georgePrompt.about_dvir.approach_with_kids.boundaries.strict_boundaries}
- גמישים: ${georgePrompt.about_dvir.approach_with_kids.boundaries.flexible_approach}

טריקים לקשב:
${georgePrompt.about_dvir.approach_with_kids.attention_tricks.methods.map(m => `- ${m}`).join('\n')}
${georgePrompt.about_dvir.approach_with_kids.attention_tricks.note}

טיפול בהתפרצויות:
- ילד מתוסכל: ${georgePrompt.about_dvir.approach_with_kids.dealing_with_outbursts.frustrated_child}
- ילד לא מכבד: ${georgePrompt.about_dvir.approach_with_kids.dealing_with_outbursts.disrespectful_child}
- עיקרון: ${georgePrompt.about_dvir.approach_with_kids.dealing_with_outbursts.principle}

בניית ביטחון עצמי:
הגדרה: ${georgePrompt.about_dvir.approach_with_kids.building_confidence.definition}
4 דרכים לבניית ביטחון:
${georgePrompt.about_dvir.approach_with_kids.building_confidence.four_ways.map(w => `- ${w}`).join('\n')}
מיקוד: ${georgePrompt.about_dvir.approach_with_kids.building_confidence.focus}

תקשורת עם הורים:
${georgePrompt.about_dvir.approach_with_kids.parent_communication.methods.map(m => `- ${m}`).join('\n')}

חינוך לגבי אלימות:
מסר מרכזי: ${georgePrompt.about_dvir.approach_with_kids.violence_education.main_message}
מתי להשתמש:
${georgePrompt.about_dvir.approach_with_kids.violence_education.when_to_use.map(w => `- ${w}`).join('\n')}
ציטוט מפורסם: ${georgePrompt.about_dvir.approach_with_kids.violence_education.famous_quote}
מתי נדבר על זה: ${georgePrompt.about_dvir.approach_with_kids.violence_education.when_discussed}

=== הוראות ליבה ===
${georgePrompt.core_instructions.map((inst, i) => `${i+1}. ${inst}`).join('\n')}

=== זרימת שיחה ===

פתיחה:
${hasConversationHistory ? 
`⚠️ חשוב! הלקוח הזה כבר שוחח איתך בעבר - אל תציג את עצמך שוב!
- אם זיהית את השם מההיסטוריה: "היי ${clientName || '[שם]'}! מה נשמע? יש משהו שתרצה לשאול? 😊"
- אם אין שם בהיסטוריה: "היי! מה נשמע? איך אפשר לעזור? 😊"
- תהיה חברי וקליל, כאילו אתם כבר מכירים
- אל תגיד "אני ג'ורג'" או תציג את עצמך שוב` 
: 
`- אם הלקוח מכיר את דביר: "${georgePrompt.conversation_flow.opening.if_client_knows_dvir}"
- אם זה קשר קר: "${georgePrompt.conversation_flow.opening.if_cold_contact}"
- ${georgePrompt.conversation_flow.opening.rules.join('\n- ')}`}

איסוף מידע (בסדר העדיפות):
${georgePrompt.conversation_flow.information_gathering.priority_order.map((item, i) => `${i+1}. ${item}`).join('\n')}

מעקב סטטוס לידים:
- Cold Lead (ליד קר): ${georgePrompt.conversation_flow.information_gathering.lead_status_tracking.cold_lead}
- Warm Lead (ליד חם): ${georgePrompt.conversation_flow.information_gathering.lead_status_tracking.warm_lead}
- Hot Lead (ליד רותח): ${georgePrompt.conversation_flow.information_gathering.lead_status_tracking.hot_lead}
- Paid (שילם): ${georgePrompt.conversation_flow.information_gathering.lead_status_tracking.paid}

סגירת אימון ניסיון:
${georgePrompt.conversation_flow.closing_trial_session.steps.map((step, i) => `${i+1}. ${step}`).join('\n')}

⚠️ חשוב מאוד - כללים לסגירת עסקה:
${georgePrompt.conversation_flow.closing_trial_session.important_notes.map(note => `${note}`).join('\n')}

=== מידע על המכון של דביר ===

מיקום:
- כתובת: ${georgePrompt.dvir_gym_knowledge.location.address}
- חניה: ${georgePrompt.dvir_gym_knowledge.location.parking}
- סרטון הגעה (שלח רק את הקישור בשורה נפרדת): ${georgePrompt.dvir_gym_knowledge.location.directions_video}

סוגי אימונים:
1. ${georgePrompt.dvir_gym_knowledge.training_types.MMA.name}
   ${georgePrompt.dvir_gym_knowledge.training_types.MMA.description}
   יתרונות: ${georgePrompt.dvir_gym_knowledge.training_types.MMA.benefits}
   ימים: ${georgePrompt.dvir_gym_knowledge.training_types.MMA.days}

2. ${georgePrompt.dvir_gym_knowledge.training_types.thai_boxing.name}
   ${georgePrompt.dvir_gym_knowledge.training_types.thai_boxing.description}
   יתרונות: ${georgePrompt.dvir_gym_knowledge.training_types.thai_boxing.benefits}
   ימים: ${georgePrompt.dvir_gym_knowledge.training_types.thai_boxing.days}

המלצה: ${georgePrompt.dvir_gym_knowledge.training_types.recommendation}

לוח זמנים:
שני וחמישי (MMA):
- גילאי 4-6: ${georgePrompt.dvir_gym_knowledge.schedule.monday_thursday.ages_4_6}
- גילאי 6-9: ${georgePrompt.dvir_gym_knowledge.schedule.monday_thursday.ages_6_9}
- גילאי 9-12: ${georgePrompt.dvir_gym_knowledge.schedule.monday_thursday.ages_9_12}
- נוער 12-16: ${georgePrompt.dvir_gym_knowledge.schedule.monday_thursday.youth_12_16}
- בוגרים 16+: ${georgePrompt.dvir_gym_knowledge.schedule.monday_thursday.adults_16_plus}

שלישי (${georgePrompt.dvir_gym_knowledge.schedule.tuesday_thai_boxing_only.note}):
- נוער: ${georgePrompt.dvir_gym_knowledge.schedule.tuesday_thai_boxing_only.youth}
- בוגרים: ${georgePrompt.dvir_gym_knowledge.schedule.tuesday_thai_boxing_only.adults}

מחירים:
אימון ניסיון:
- ילדים/נוער: ${georgePrompt.dvir_gym_knowledge.pricing.trial_session.kids_youth}
- בוגרים: ${georgePrompt.dvir_gym_knowledge.pricing.trial_session.adults}

מנויים חודשיים:
- ${georgePrompt.dvir_gym_knowledge.pricing.monthly_packages.once_week}
- ${georgePrompt.dvir_gym_knowledge.pricing.monthly_packages.twice_week}
- ${georgePrompt.dvir_gym_knowledge.pricing.monthly_packages.unlimited}
- ${georgePrompt.dvir_gym_knowledge.pricing.monthly_packages.single_class}
- ${georgePrompt.dvir_gym_knowledge.pricing.monthly_packages.soldiers_discount}

מתי להזכיר מחירים: ${georgePrompt.dvir_gym_knowledge.pricing.when_to_mention}

קישורי תשלום (שלח רק את הקישור בשורה נפרדת, ללא טקסט נוסף):
- ילדים/נוער (10 ש"ח): ${georgePrompt.dvir_gym_knowledge.payment_links.kids_youth_10nis}
- בוגרים (25 ש"ח): ${georgePrompt.dvir_gym_knowledge.payment_links.adults_25nis}

ציוד:
- אימון ראשון: ${georgePrompt.dvir_gym_knowledge.equipment.first_session}
- לרכישה: ${georgePrompt.dvir_gym_knowledge.equipment.to_purchase}
- גיל: ${georgePrompt.dvir_gym_knowledge.equipment.age_requirement}
- מה להביא: ${georgePrompt.dvir_gym_knowledge.equipment.what_to_bring}
- מכירה במכון: ${georgePrompt.dvir_gym_knowledge.equipment.sale_at_gym}

מבנה אימון:
- ${georgePrompt.dvir_gym_knowledge.training_structure.warmup}
- ${georgePrompt.dvir_gym_knowledge.training_structure.technical}
- ${georgePrompt.dvir_gym_knowledge.training_structure.sparring}
- ${georgePrompt.dvir_gym_knowledge.training_structure.kids_ending}

בטיחות:
- ${georgePrompt.dvir_gym_knowledge.safety.boundaries}
- ${georgePrompt.dvir_gym_knowledge.safety.sparring}
- ${georgePrompt.dvir_gym_knowledge.safety.first_aid}
- ${georgePrompt.dvir_gym_knowledge.safety.injuries}

=== טיפול בהתנגדויות ===
${Object.entries(georgePrompt.sales_tactics.objection_handling).map(([key, obj]) => 
    `- ${key}: ${obj.response}`
).join('\n')}

=== סגנון תקשורת ===
טון: ${georgePrompt.communication_style.tone}
שפה: ${georgePrompt.communication_style.language}
פורמליות: ${georgePrompt.communication_style.formality}

תגובות טבעיות (במקום "תודה על המידע"):
${georgePrompt.communication_style.natural_responses.examples.map(ex => `- ${ex}`).join('\n')}
${georgePrompt.communication_style.natural_responses.note}

⚠️ שימוש בשם הלקוח:
${georgePrompt.communication_style.name_usage.rule}
סיבה: ${georgePrompt.communication_style.name_usage.why}

⚠️ סיומות הודעות:
${georgePrompt.communication_style.message_endings.rule}
${georgePrompt.communication_style.message_endings.examples.map(ex => `- ${ex}`).join('\n')}

מילים חיוביות: ${georgePrompt.communication_style.positive_words.join(', ')}

אימוג'ים:
${georgePrompt.communication_style.emojis.usage}
מגוון: ${georgePrompt.communication_style.emojis.variety.join(' ')}
${georgePrompt.communication_style.emojis.note}

⚠️ הימנע לחלוטין מהביטויים הבאים (שיח AI):
${georgePrompt.communication_style.avoid_phrases_completely.map(phrase => `  × ${phrase}`).join('\n')}

למה להימנע: ${georgePrompt.communication_style.why_avoid}

${georgePrompt.communication_style.no_formatting}

=== זיהוי תשלום ===
ביטויים ברורים (פעולה מיידית):
${georgePrompt.payment_detection.clear_phrases.join(', ')}

ביטויים לא ברורים (שאל לאישור):
${georgePrompt.payment_detection.unclear_phrases.join(', ')}

=== כללים מיוחדים ===
${Object.entries(georgePrompt.special_rules).map(([key, rule]) => `- ${rule}`).join('\n')}

⚠️ חשוב: כאשר אתה שולח קישורים (תשלום, סרטון הגעה, וכו') - שלח רק את הקישור עצמו בשורה נפרדת, ללא טקסט תיאורי לפניו כמו "מצרף סרטון הגעה:" או "[סרטון הגעה]:" או "[קישור לתשלום]". פשוט שלח את הקישור.

זמינות:
- ${georgePrompt.dvir_gym_knowledge.working_hours.always_available}

קישורים חברתיים:
- פייסבוק: ${georgePrompt.dvir_gym_knowledge.social_links.facebook}
- אינסטגרם: ${georgePrompt.dvir_gym_knowledge.social_links.instagram}
`;

    return prompt;
}

// ===============================
// PAYMENT DETECTION
// ===============================

function detectPaymentConfirmation(message) {
    const lowerMessage = message.toLowerCase().trim();
    
    const clearPaymentPatterns = georgePrompt.payment_detection.clear_phrases.map(
        phrase => new RegExp(phrase, 'i')
    );
    
    const unclearPaymentPatterns = georgePrompt.payment_detection.unclear_phrases.map(
        phrase => new RegExp(`^${phrase}$`, 'i')
    );
    
    const isClear = clearPaymentPatterns.some(pattern => pattern.test(lowerMessage));
    const isUnclear = unclearPaymentPatterns.some(pattern => pattern.test(lowerMessage));
    
    return {
        detected: isClear || isUnclear,
        isClear: isClear,
        isUnclear: isUnclear
    };
}

// ===============================
// GPT ANALYSIS AFTER PAYMENT
// ===============================

async function analyzeConversationAfterPayment(sessionId, conversationHistory) {
    try {
        console.log('📊 מנתח שיחה אחרי תשלום...');
        
        const phone = sessionId.replace('@c.us', '');
        
        // בניית הפרומפט לניתוח
        const analysisPrompt = `אתה מנתח מומחה לשיחות מכירה. נתח את השיחה הבאה וחלץ מידע מובנה.

היסטוריית השיחה:
${conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

חלץ את המידע הבא ובנה JSON:
1. fullName - שם מלא של הלקוח (אם צוין)
2. name - שם פרטי
3. age - גיל (מספר)
4. experience - ניסיון קודם באומנויות לחימה (טקסט חופשי)
5. appointmentDate - תאריך האימון המתוכנן
6. appointmentTime - שעה של האימון
7. appointmentDateAbsolute - המר תאריך יחסי (כמו "שני הקרוב") לתאריך מוחלט בפורמט DD/MM/YYYY
8. conversationSummary - סיכום השיחה ב-3 שורות מקסימום
9. trainingType - סוג האימון (MMA / אגרוף תאילנדי)
10. phoneNumber - "${phone}"

התאריך הנוכחי: ${new Date().toLocaleDateString('he-IL', {timeZone: 'Asia/Jerusalem'})}

החזר **רק** JSON תקין, ללא טקסט נוסף:`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{
                role: "system",
                content: analysisPrompt
            }],
            temperature: 0.1
        });
        
        let responseText = completion.choices[0].message.content.trim();
        
        // הסרת code fences אם יש
        if (responseText.startsWith('```')) {
            responseText = responseText.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '').trim();
        }
        
        console.log('📋 תשובת GPT:', responseText);
        
        const analysis = JSON.parse(responseText);
        
        console.log('✅ ניתוח הושלם בהצלחה:', analysis);
        
        return analysis;
        
    } catch (error) {
        console.error('❌ שגיאה בניתוח שיחה:', error.message);
        return null;
    }
}

// ===============================
// SEND SUMMARY TO DVIR
// ===============================

async function sendSummaryToDvir(analysis) {
    try {
        const dvirNumber = '972559925657@c.us';
        
        const summaryMessage = `🎯 לקוח חדש שילם!

שם מלא: ${analysis.fullName || analysis.name || 'לא צוין'}
גיל: ${analysis.age || 'לא צוין'}
ניסיון: ${analysis.experience || 'אין ניסיון קודם'}
סוג אימון: ${analysis.trainingType || 'לא צוין'}

📅 תאריך אימון: ${analysis.appointmentDateAbsolute || analysis.appointmentDate || 'לא נקבע'}
🕐 שעה: ${analysis.appointmentTime || 'לא נקבעה'}

📞 טלפון: ${analysis.phoneNumber}

סיכום:
${analysis.conversationSummary}

---
נשלח ע"י ג'ורג' - מערכת ניהול לידים 🤖`;

        await whatsappClient.sendMessage(dvirNumber, summaryMessage);
        console.log('✅ סיכום נשלח לדביר');
        
    } catch (error) {
        console.error('❌ שגיאה בשליחת סיכום לדביר:', error.message);
    }
}

// ===============================
// SAVE ANALYSIS TO DB
// ===============================

async function saveAnalysisToDatabase(sessionId, analysis) {
    return new Promise((resolve) => {
        const phone = sessionId.replace('@c.us', '');
        const summaryJson = JSON.stringify(analysis, null, 2);
        
        // שמירת הסיכום
        db.run(`INSERT INTO chat_summaries (client_phone, summary_data) VALUES (?, ?)`,
            [phone, summaryJson], function(err) {
            if (err) {
                console.error('❌ שגיאה בשמירת סיכום:', err.message);
            } else {
                console.log('✅ סיכום נשמר למאגר');
            }
        });
        
        // עדכון מלא של פרטי הלקוח
        db.run(`UPDATE clients SET 
                full_name = ?,
                name = ?,
                age = ?,
                experience = ?,
                appointment_date = ?,
                appointment_time = ?,
                lead_status = 'paid',
                payment_confirmed = TRUE,
                updated_at = CURRENT_TIMESTAMP
                WHERE phone = ?`,
            [
                analysis.fullName || analysis.name,
                analysis.name,
                analysis.age,
                analysis.experience,
                analysis.appointmentDateAbsolute || analysis.appointmentDate,
                analysis.appointmentTime,
                phone
            ], function(err) {
            if (err) {
                console.error('❌ שגיאה בעדכון לקוח:', err.message);
            } else {
                console.log('✅ פרטי לקוח עודכנו - סטטוס: PAID');
            }
        });
        
        // שמירת האפוינטמנט בטבלה נפרדת
        const appointmentDate = analysis.appointmentDateAbsolute || analysis.appointmentDate;
        const appointmentTime = analysis.appointmentTime;
        const trainingType = analysis.trainingType || 'אימון ניסיון';
        
        db.run(`INSERT INTO appointments 
                (client_phone, appointment_date, appointment_time, appointment_type, status, payment_confirmed, created_at) 
                VALUES (?, ?, ?, ?, 'confirmed', TRUE, CURRENT_TIMESTAMP)`,
            [phone, appointmentDate, appointmentTime, trainingType],
            function(err) {
                if (err) {
                    console.error('❌ שגיאה בשמירת אפוינטמנט:', err.message);
                } else {
                    console.log('✅ אפוינטמנט נשמר בהצלחה:', appointmentDate, appointmentTime);
                }
                resolve();
            });
    });
}

// ===============================
// EXTRACT AND UPDATE CLIENT INFO
// ===============================

async function extractAndUpdateClientInfo(sessionId, userMessage, botResponse, conversationHistory) {
    const phone = sessionId.replace('@c.us', '');
    const updateFields = {};
    
    // חילוץ שם - אם הבוט אמר "נעים להכיר {שם}"
    const nameMatch = botResponse.match(/נעים להכיר ([א-ת]+)/);
    if (nameMatch && nameMatch[1]) {
        updateFields.name = nameMatch[1];
        console.log('📝 זיהוי שם:', nameMatch[1]);
    }
    
    // חילוץ גיל - אם המשתמש ענה עם מספר בלבד או "בן/בת X"
    const ageMatch = userMessage.match(/^(\d{1,2})$/) || userMessage.match(/בן\s*(\d{1,2})/) || userMessage.match(/בת\s*(\d{1,2})/);
    if (ageMatch && ageMatch[1]) {
        const age = parseInt(ageMatch[1]);
        if (age >= 3 && age <= 80) {
            updateFields.age = age;
            console.log('📝 זיהוי גיל:', age);
        }
    }
    
    // חילוץ ניסיון - אם הבוט שאל על ניסיון והמשתמש ענה
    if (conversationHistory.some(msg => msg.content.includes('ניסיון קודם'))) {
        const experienceIndicators = ['שנה', 'שנתיים', 'שנים', 'חודש', 'חודשים', 'קראטה', 'ג\'ודו', 'קונג פו', 'טאיקוונדו', 'MMA', 'תאילנדי'];
        if (experienceIndicators.some(indicator => userMessage.includes(indicator))) {
            updateFields.experience = userMessage;
            console.log('📝 זיהוי ניסיון:', userMessage);
        } else if (userMessage.match(/^(לא|אין|ללא)$/i)) {
            updateFields.experience = 'אין ניסיון קודם';
            console.log('📝 זיהוי: אין ניסיון קודם');
        }
    }
    
    // אם יש שדות לעדכן - עדכן את הטבלה
    if (Object.keys(updateFields).length > 0) {
        const fields = Object.keys(updateFields);
        const values = Object.values(updateFields);
        
        let query = `UPDATE clients SET updated_at = CURRENT_TIMESTAMP`;
        fields.forEach(field => {
            query += `, ${field} = ?`;
        });
        query += ` WHERE phone = ?`;
        values.push(phone);
        
        db.run(query, values, function(err) {
            if (err) {
                console.error('❌ שגיאה בעדכון מידע לקוח:', err.message);
            } else {
                console.log(`✅ עודכנו ${fields.length} שדות עבור הלקוח`);
            }
        });
    }
}

// ===============================
// MAIN MESSAGE PROCESSING
// ===============================

async function processMessage(message, sessionId) {
    if (!message || message.trim() === '') {
        return null;
    }

    console.log('📨 מעבד הודעה:', message);

    // יצירה או טעינת לקוח
    await getOrCreateClient(sessionId);

    // טעינת היסטוריית שיחה
    const conversationHistory = await loadConversationHistory(sessionId);
    
    // בדיקה אם נשלח קישור תשלום בעבר
    const paymentLinkSent = conversationHistory.some(msg => 
        msg.role === 'assistant' && msg.content.includes('letts.co.il/payment/')
    );
    
    // זיהוי תשלום - רק אם נשלח קישור תשלום לפני כן
    const paymentDetection = detectPaymentConfirmation(message);
    
    if (paymentDetection.isClear && paymentLinkSent) {
        console.log('💰 תשלום זוהה (אחרי שליחת קישור)! מתחיל ניתוח שיחה...');
        
        conversationHistory.push({ role: 'user', content: message });
        
        // ניתוח עם GPT
        const analysis = await analyzeConversationAfterPayment(sessionId, conversationHistory);
        
        if (analysis) {
            // שמירה למאגר
            await saveAnalysisToDatabase(sessionId, analysis);
            
            // שליחה לדביר
            await sendSummaryToDvir(analysis);
            
            // תשובה ללקוח
            const response = `מעולה! קיבלתי את אישור התשלום 🎉

המקום שלך שמור לאימון ב${analysis.appointmentDateAbsolute || analysis.appointmentDate} בשעה ${analysis.appointmentTime}.

דביר קיבל את הפרטים שלך ומחכה לראות אותך באימון!

📍 כתובת: הרצוג 12, הרצליה

https://youtube.com/shorts/_Bk2vYeGQTQ?si=n1wgv8-3t7_hEs45

נתראה שם! 😊`;
            
            await saveConversation(sessionId, 'user', message);
            await saveConversation(sessionId, 'assistant', response);
            
            return response;
        }
    } else if (paymentDetection.isClear && !paymentLinkSent) {
        console.log('⚠️ הלקוח אמר "שילמתי" אבל עדיין לא נשלח קישור תשלום - ממשיך שיחה רגילה');
    }

    // שיחה רגילה - GPT מטפל (ההיסטוריה כבר נטענה למעלה)
    
    // בדיקה אם יש שם בהיסטוריה
    const phone = sessionId.replace('@c.us', '');
    const clientInfo = await new Promise((resolve) => {
        db.get(`SELECT name FROM clients WHERE phone = ?`, [phone], (err, row) => {
            if (err || !row) resolve(null);
            else resolve(row);
        });
    });
    
    const hasHistory = conversationHistory.length > 0;
    const clientName = clientInfo?.name || null;
    
    const messages = [
        {
            role: "system",
            content: buildGeorgeSystemPrompt(hasHistory, clientName)
        },
        ...conversationHistory,
        {
            role: "user",
            content: message
        }
    ];

    const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: messages,
        temperature: 0.3
    });

    const response = completion.choices[0].message.content;

    console.log('📤 תשובה מ-GPT:', response);

    // חילוץ מידע מהשיחה ועדכון הלקוח
    await extractAndUpdateClientInfo(sessionId, message, response, conversationHistory);

    // עדכון סטטוס ליד לפי תוכן התשובה
    if (response.includes('letts.co.il/payment/')) {
        await updateClientLeadStatus(sessionId, 'hot');
        console.log('🔥 ליד עודכן ל-HOT (קיבל קישור תשלום)');
    } else if (conversationHistory.length > 2) {
        // אם יש יותר מ-2 הודעות, זה warm lead
        await updateClientLeadStatus(sessionId, 'warm');
    }

    // שמירת ההודעות
    await saveConversation(sessionId, 'user', message);
    await saveConversation(sessionId, 'assistant', response);

    return response;
}

// ===============================
// WHATSAPP MESSAGE HANDLER
// ===============================

whatsappClient.on('message', async (message) => {
    messageCount++;
    console.log('📬 התקבלה הודעת ווטסאפ מספר ' + messageCount);
    console.log('📨 תוכן:', message.body);
    console.log('👤 מאת:', message.from);
    
    try {
        // התעלמות מהודעות יוצאות
        if (message.fromMe) {
            console.log('⬅️ מתעלם מהודעה יוצאת');
            return;
        }
        
        // התעלמות מהודעות קבוצה
        const chat = await message.getChat();
        if (chat.isGroup) {
            console.log('👥 מתעלם מהודעת קבוצה');
            return;
        }
        
        console.log('✅ מעבד הודעה פרטית...');
        
        const sessionId = message.from;
        const response = await processMessage(message.body, sessionId);
        
        if (response) {
            await message.reply(response);
            console.log('📤 תשובת ווטסאפ נשלחה');
        }
        
    } catch (error) {
        console.error('❌ שגיאה בטיפול בהודעת ווטסאפ:', error.message);
    }
});

// ===============================
// WEB API
// ===============================

app.post('/api/chat', async (req, res) => {
    try {
        const { message, sessionId = 'default' } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'הודעה ריקה' });
        }

        console.log('📨 הודעה נכנסת מהווב:', message);

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

// ===============================
// QR CODE ENDPOINT
// ===============================

app.get('/qr', (req, res) => {
    if (!qrCodeData) {
        return res.send(`
            <html>
                <head>
                    <title>ווטסאפ QR - ג'ורג' (עוזר דביר בסון)</title>
                    <meta charset="utf-8">
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        .status { padding: 20px; margin: 20px; border-radius: 10px; }
                        .waiting { background-color: #fff3cd; color: #856404; }
                        .ready { background-color: #d4edda; color: #155724; }
                    </style>
                </head>
                <body>
                    <h1>ג'ורג' - עוזר דביר בסון</h1>
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
                <title>ווטסאפ QR - ג'ורג' (עוזר דביר בסון)</title>
                <meta charset="utf-8">
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                    .qr-container { margin: 30px auto; padding: 20px; border: 2px solid #25D366; border-radius: 15px; display: inline-block; }
                    .instructions { max-width: 600px; margin: 20px auto; padding: 20px; background-color: #f8f9fa; border-radius: 10px; }
                    .step { margin: 10px 0; text-align: right; direction: rtl; }
                </style>
            </head>
            <body>
                <h1>ג'ורג' - עוזר דביר בסון</h1>
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
                    setTimeout(() => window.location.reload(), 30000);
                </script>
            </body>
        </html>
    `);
});

app.get('/status', (req, res) => {
    res.json({
        whatsappReady: isWhatsAppReady,
        hasQR: !!qrCodeData,
        timestamp: new Date().toISOString()
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ===============================
// START SERVER
// ===============================

whatsappClient.initialize();

app.listen(PORT, () => {
    console.log(`🚀 השרת פועל על http://localhost:${PORT}`);
    console.log('💡 ודא שיש לך קובץ .env עם OPENAI_API_KEY');
    console.log('📱 לחיבור ווטסאפ: http://localhost:' + PORT + '/qr');
    console.log('🤖 ג\'ורג\' - עוזר דביר בסון מוכן לפעולה!');
});

