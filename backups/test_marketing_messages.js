// ===============================
// סקריפט לבדיקת הודעות מומחה השיווק
// ===============================
require('dotenv').config();
const OpenAI = require('openai');
const { Client, LocalAuth } = require('whatsapp-web.js');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// פונקציה ליצירת הודעה עם מומחה השיווק
async function generateMarketingFollowupMessage(clientName, attemptNumber) {
    try {
        const marketingPrompt = `אתה מומחה השיווק והמכירות הגדול בעולם, מתמחה בהחזרת לקוחות ויצירת הודעות פולואו-אפ מושלמות.

המשימה שלך: צור הודעת פולואו-אפ מדהימה שתעזור להחזיר את הלקוח.

פרטים:
- שם הלקוח: ${clientName}
- ניסיון פולואו-אפ: ${attemptNumber}
- תחום: אימוני אומנויות לחימה (אגרוף תאילנדי, MMA)

⚠️ כללים קריטיים:
- כתוב **רק משפט אחד עד 2 משפטים** - לא יותר!
- אל תזכיר דברים אישיים (גיל, ילדים, משפחה, וכו')
- תשתמש בעקרונות שיווק מתקדמים (FOMO, סקרנות, ערך)
- תהיה חברי וטבעי כמו בווטסאפ
- השתמש ב-1-2 אימוג'י רלוונטיים
- גרום ללקוח לרצות להגיב!

דוגמאות לסגנון:
"היי רועי! יש לי משהו מיוחד לספר לך על האימונים - פנוי לשיחה קצרה? 🥊"
"רועי, ראיתי משהו שיכול להתאים לך מושלם. מעניין לשמוע? 💪"

כתוב רק את ההודעה, בלי הסברים.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{
                role: "system",
                content: marketingPrompt
            }],
            max_tokens: 150,
            temperature: 0.9
        });
        
        return completion.choices[0].message.content.trim();
        
    } catch (error) {
        console.error('❌ שגיאה ביצירת הודעה:', error.message);
        return null;
    }
}

// פונקציה ליצירת הודעת Early Rejection
async function generateEarlyRejectionMessage(clientName, attemptNumber) {
    try {
        const marketingPrompt = `אתה מומחה השיווק והמכירות הגדול בעולם, מתמחה בהחזרת לקוחות ויצירת הודעות פולואו-אפ מושלמות.

המשימה שלך: צור הודעת פולואו-אפ מדהימה ללקוח שדחה בשלב מוקדם.

פרטים:
- שם הלקוח: ${clientName}
- ניסיון פולואו-אפ: ${attemptNumber}
- תחום: אימוני אומנויות לחימה (אגרוף תאילנדי, MMA)
- הלקוח התלבט/דחה בהתחלה

⚠️ כללים קריטיים:
- כתוב **רק משפט אחד עד 2 משפטים** - לא יותר!
- אל תזכיר דברים אישיים (גיל, ילדים, משפחה, וכו')
- תשתמש בעקרונות שיווק מתקדמים (FOMO, סקרנות, ערך, הוכחה חברתית)
- תהיה חברי וטבעי כמו בווטסאפ
- השתמש ב-1-2 אימוג'י רלוונטיים
- גרום ללקוח לרצות להגיב ולתת צ'אנס!

דוגמאות לסגנון:
"היי דני! ראיתי אנשים שהתלבטו בדיוק כמוך ואחרי כמה אימונים אמרו שזה שינה להם את החיים 💪 מה דעתך?"
"דני, יש לי הרגשה טובה לגביך - אני חושב שהאימונים יכולים להתאים לך מושלם 🥊"

כתוב רק את ההודעה, בלי הסברים.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{
                role: "system",
                content: marketingPrompt
            }],
            max_tokens: 150,
            temperature: 0.9
        });
        
        return completion.choices[0].message.content.trim();
        
    } catch (error) {
        console.error('❌ שגיאה ביצירת הודעה:', error.message);
        return null;
    }
}

// פונקציה ראשית
async function runTest() {
    console.log('🎯 מתחיל יצירת 10 הודעות מומחה השיווק...\n');
    
    const clientName = 'אריאל';
    const messages = [];
    
    // יצירת 5 הודעות פולואו-אפ רגיל
    console.log('📤 יוצר 5 הודעות פולואו-אפ רגיל:\n');
    for (let i = 1; i <= 5; i++) {
        const message = await generateMarketingFollowupMessage(clientName, i);
        if (message) {
            messages.push({ type: 'רגיל', attempt: i, message });
            console.log(`${i}. ${message}\n`);
        }
        // המתנה קטנה למניעת rate limit
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // יצירת 5 הודעות Early Rejection
    console.log('\n📨 יוצר 5 הודעות Early Rejection:\n');
    for (let i = 1; i <= 5; i++) {
        const message = await generateEarlyRejectionMessage(clientName, i);
        if (message) {
            messages.push({ type: 'Early Rejection', attempt: i, message });
            console.log(`${i}. ${message}\n`);
        }
        // המתנה קטנה למניעת rate limit
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n✅ סיימתי ליצור 10 הודעות!\n');
    console.log('🚀 עכשיו מתחבר לווטסאפ כדי לשלוח אליך...\n');
    
    // אתחול WhatsApp Client
    const whatsappClient = new Client({
        authStrategy: new LocalAuth({
            clientId: 'test-marketing-messages'
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        }
    });
    
    whatsappClient.on('qr', (qr) => {
        console.log('⚠️ צריך סריקת QR - פתח את הקובץ test_qr.txt או הדפס:');
        console.log(qr);
    });
    
    whatsappClient.on('ready', async () => {
        console.log('✅ WhatsApp מוכן!\n');
        
        try {
            const targetPhone = '972532861226'; // המספר שלך
            const chatId = targetPhone + '@c.us';
            
            // שליחת הודעת כותרת
            await whatsappClient.sendMessage(chatId, '🎯 *בדיקת הודעות מומחה השיווק*\n\nהנה 10 הודעות שנוצרו:');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // שליחת כל ההודעות
            for (let i = 0; i < messages.length; i++) {
                const msg = messages[i];
                const header = `\n*הודעה ${i + 1}* (${msg.type} - ניסיון ${msg.attempt}):\n`;
                await whatsappClient.sendMessage(chatId, header + msg.message);
                console.log(`✅ נשלחה הודעה ${i + 1}/10`);
                
                // המתנה קטנה בין הודעות
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            // הודעת סיום
            await whatsappClient.sendMessage(chatId, '\n✅ *סיום!* כל 10 ההודעות נשלחו בהצלחה 🎉');
            
            console.log('\n🎉 כל ההודעות נשלחו בהצלחה!');
            console.log('👀 בדוק את הווטסאפ שלך למספר 0532861226\n');
            
            // סגירה
            setTimeout(() => {
                console.log('👋 סוגר את התהליך...');
                process.exit(0);
            }, 3000);
            
        } catch (error) {
            console.error('❌ שגיאה בשליחת הודעות:', error.message);
            process.exit(1);
        }
    });
    
    whatsappClient.on('auth_failure', () => {
        console.error('❌ כשל באימות');
        process.exit(1);
    });
    
    console.log('🔄 מאתחל WhatsApp Client...');
    whatsappClient.initialize();
}

// הרצת הבדיקה
runTest().catch(error => {
    console.error('❌ שגיאה:', error);
    process.exit(1);
});

