/**
 * אופטימיזציה של קריאות GPT - איחוד בדיקות מרובות
 * תיקון בעיה #6 - קריאות GPT לא יעילות
 */

const { GPT, KEYWORDS } = require('../config/constants');

/**
 * זיהוי משולב - מבצע מספר בדיקות בקריאה אחת ל-GPT
 * חוסך זמן וכסף!
 * 
 * @param {Object} openai - OpenAI client
 * @param {string} message - הודעת המשתמש
 * @param {Array} conversationHistory - היסטוריית השיחה
 * @param {Object} options - אפשרויות הבדיקה
 * @returns {Object} - תוצאות כל הבדיקות
 */
async function combinedDetection(openai, message, conversationHistory = [], options = {}) {
    const {
        checkSpecialRequests = true,
        checkPayment = false,
        checkRejection = true,
        checkConversationState = true,
        paymentLinkSent = false
    } = options;

    // בניית הפרומפט המשולב
    const checksToPerform = [];
    
    if (checkSpecialRequests) {
        checksToPerform.push(`
1. personal_training: האם הלקוח מבקש אימון אישי/פרטי? (true/false)
2. human_response: האם הלקוח מבקש לדבר עם אדם אמיתי ולא בוט? (true/false)
3. phone_call: האם הלקוח מבקש שיתקשרו אליו? (true/false)
4. group_size: האם הלקוח שואל על גודל הקבוצות/כמה מתאמנים? (true/false)`);
    }

    if (checkPayment && paymentLinkSent) {
        checksToPerform.push(`
5. payment_confirmed: האם הלקוח מודיע שהוא שילם/העביר תשלום? (true/false)
6. full_name: האם יש שם מלא (פרטי + משפחה) בהודעה? אם כן, מה השם? (null או השם)`);
    }

    if (checkRejection) {
        checksToPerform.push(`
7. stop_request: האם הלקוח מביע חוסר עניין מוחלט או מבקש להפסיק? (true/false)
8. opt_out_followup: האם הלקוח מבקש להפסיק לקבל הודעות (אבל לא בהכרח לא מעוניין)? (true/false)
9. positive_response: האם זו תגובה חיובית שמראה עניין? (true/false)`);
    }

    if (checkConversationState) {
        checksToPerform.push(`
10. specific_question: האם יש שאלה ספציפית (מחיר, כתובת, שעות וכו')? (true/false)
11. renewed_interest: האם הלקוח מראה עניין מחודש אחרי שהשיחה נגמרה? (true/false)
12. time_confirmation: האם הלקוח מאשר שעה שהוצעה לו? (true/false)`);
    }

    if (checksToPerform.length === 0) {
        return {};
    }

    const systemPrompt = `אתה מנתח הודעות. נתח את ההודעה הבאה והחזר JSON עם התשובות.

הודעת הלקוח: "${message}"

${conversationHistory.length > 0 ? `
הקשר מהשיחה (${Math.min(conversationHistory.length, 5)} הודעות אחרונות):
${conversationHistory.slice(-5).map(m => `${m.role === 'user' ? 'לקוח' : 'בוט'}: ${m.content}`).join('\n')}
` : ''}

בדוק את הנקודות הבאות:
${checksToPerform.join('\n')}

⚠️ חשוב:
- החזר רק JSON תקין, ללא טקסט נוסף
- השתמש רק בשמות השדות המדויקים: personal_training, human_response, phone_call, group_size, payment_confirmed, full_name, stop_request, opt_out_followup, positive_response, specific_question, renewed_interest, time_confirmation
- ערכים בוליאניים חייבים להיות true או false (לא "כן" או "לא")`;

    try {
        const completion = await openai.chat.completions.create({
            model: GPT.MODELS.FAST,
            messages: [
                { role: "system", content: systemPrompt }
            ],
            temperature: GPT.TEMPERATURES.PRECISE,
            max_tokens: GPT.MAX_TOKENS.MEDIUM
        });

        let responseText = completion.choices[0].message.content.trim();
        
        // הסרת code fences אם יש
        if (responseText.startsWith('```')) {
            responseText = responseText.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
        }

        const result = JSON.parse(responseText);
        
        console.log('🤖 Combined Detection Results:', JSON.stringify(result, null, 2));
        
        return result;

    } catch (error) {
        console.error('❌ Combined detection failed, using fallback:', error.message);
        return fallbackDetection(message, options);
    }
}

/**
 * Fallback detection using keywords
 * @param {string} message - הודעת המשתמש
 * @param {Object} options - אפשרויות
 * @returns {Object} - תוצאות הבדיקות
 */
function fallbackDetection(message, options = {}) {
    const lowerMessage = message.toLowerCase().trim();
    const result = {};

    if (options.checkSpecialRequests) {
        result.personal_training = KEYWORDS.PERSONAL_TRAINING.some(k => lowerMessage.includes(k));
        result.human_response = KEYWORDS.HUMAN_RESPONSE.some(k => lowerMessage.includes(k));
        result.phone_call = KEYWORDS.PHONE_CALL.some(k => lowerMessage.includes(k));
        result.group_size = lowerMessage.includes('כמה מתאמנים') || 
                           lowerMessage.includes('גודל קבוצה') ||
                           lowerMessage.includes('כמה אנשים');
    }

    if (options.checkPayment && options.paymentLinkSent) {
        result.payment_confirmed = KEYWORDS.PAYMENT_CONFIRMATION.some(k => lowerMessage.includes(k));
        result.full_name = null; // Can't detect reliably with keywords
    }

    if (options.checkRejection) {
        result.stop_request = KEYWORDS.STOP_REQUEST.some(k => lowerMessage.includes(k));
        result.opt_out_followup = lowerMessage.includes('תפסיק לשלוח') || 
                                  lowerMessage.includes('אל תשלח');
        result.positive_response = KEYWORDS.POSITIVE_RESPONSE.some(k => lowerMessage.includes(k));
    }

    if (options.checkConversationState) {
        result.specific_question = KEYWORDS.SPECIFIC_QUESTION.some(k => lowerMessage.includes(k));
        result.renewed_interest = lowerMessage.includes('חזרתי') || 
                                  lowerMessage.includes('התחרטתי') ||
                                  KEYWORDS.POSITIVE_RESPONSE.some(k => lowerMessage.includes(k));
        result.time_confirmation = lowerMessage.includes('מתאים') ||
                                   lowerMessage.includes('בסדר') ||
                                   lowerMessage.includes('אוקי');
    }

    console.log('⚠️ Fallback Detection Results:', JSON.stringify(result, null, 2));
    
    return result;
}

/**
 * זיהוי Early Rejection בהודעות הראשונות
 * @param {Object} openai - OpenAI client
 * @param {string} message - הודעת המשתמש
 * @param {Array} conversationHistory - היסטוריית השיחה
 * @returns {Promise<boolean>}
 */
async function detectEarlyRejection(openai, message, conversationHistory = []) {
    // בדיקה אם זה עדיין מוקדם בשיחה (פחות מ-5 הודעות)
    if (conversationHistory.length > 10) {
        return false;
    }

    try {
        const completion = await openai.chat.completions.create({
            model: GPT.MODELS.FAST,
            messages: [{
                role: "system",
                content: `Answer only YES or NO.

Is this message an early rejection/disinterest in the FIRST few messages of a conversation?

Look for:
- Clear "not interested" statements
- "Maybe later" / "Not now" responses
- Quick dismissals without much engagement

Examples of YES:
- "לא מעוניין תודה"
- "לא רלוונטי"
- "אולי אחר כך"
- "לא כרגע"

Examples of NO:
- Questions about pricing/schedule (shows interest)
- Requests for more information
- Any engagement with the content

Message: "${message}"`
            }],
            temperature: GPT.TEMPERATURES.PRECISE,
            max_tokens: GPT.MAX_TOKENS.SHORT
        });

        const response = completion.choices[0].message.content.trim().toUpperCase();
        return response === 'YES';

    } catch (error) {
        console.error('❌ Early rejection detection failed:', error.message);
        return KEYWORDS.EARLY_REJECTION.some(k => message.toLowerCase().includes(k));
    }
}

/**
 * ניתוח שיחה לאחר תשלום - מחלץ את כל המידע בקריאה אחת
 * @param {Object} openai - OpenAI client
 * @param {Array} conversationHistory - היסטוריית השיחה המלאה
 * @returns {Promise<Object>} - מידע מנותח
 */
async function analyzeConversationForPayment(openai, conversationHistory) {
    const conversationText = conversationHistory
        .map(m => `${m.role === 'user' ? 'לקוח' : 'בוט'}: ${m.content}`)
        .join('\n');

    const systemPrompt = `נתח את השיחה הבאה וחלץ את כל המידע הרלוונטי.

השיחה:
${conversationText}

החזר JSON עם השדות הבאים:
- fullName: שם מלא (פרטי + משפחה) - או null אם לא נמצא
- age: גיל (מספר) - או null אם לא נמצא
- isParentForChild: true אם זה הורה שמדבר על ילד, false אחרת
- parentName: שם ההורה אם isParentForChild=true, אחרת null
- childName: שם הילד אם isParentForChild=true, אחרת null
- appointmentDate: תאריך האימון (למשל "יום ראשון", "מחר") - או null
- appointmentDateAbsolute: תאריך מוחלט אם צוין (למשל "15.1.2025") - או null
- appointmentTime: שעת האימון (למשל "17:00") - או null
- trainingType: סוג האימון (אגרוף תאילנדי, MMA, וכו') - או null
- experience: ניסיון קודם באומנויות לחימה - או null
- phoneNumber: מספר טלפון - או null
- conversationSummary: סיכום קצר של השיחה (2-3 משפטים)

⚠️ חשוב: החזר רק JSON תקין, ללא טקסט נוסף.`;

    try {
        const completion = await openai.chat.completions.create({
            model: GPT.MODELS.MAIN,
            messages: [{ role: "system", content: systemPrompt }],
            temperature: GPT.TEMPERATURES.LOW,
            max_tokens: GPT.MAX_TOKENS.ANALYSIS
        });

        let responseText = completion.choices[0].message.content.trim();
        
        if (responseText.startsWith('```')) {
            responseText = responseText.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
        }

        return JSON.parse(responseText);

    } catch (error) {
        console.error('❌ Conversation analysis failed:', error.message);
        return null;
    }
}

/**
 * יצירת סיכום שיחה לפולואו-אפ
 * @param {Object} openai - OpenAI client
 * @param {Array} conversationHistory - היסטוריית השיחה
 * @returns {Promise<Object>}
 */
async function createFollowupSummary(openai, conversationHistory) {
    const conversationText = conversationHistory
        .map(m => `${m.role === 'user' ? 'לקוח' : 'אריאל'}: ${m.content}`)
        .join('\n');

    const systemPrompt = `נתח את השיחה הבאה וצור סיכום JSON מובנה:

${conversationText}

החזר JSON עם השדות הבאים:
- name: שם הלקוח (אם נמצא, אחרת null)
- child_name: שם הילד אם מדובר בהורה עבור ילד (אחרת null)
- isParentForChild: true אם זה הורה שמדבר על ילד, false אחרת
- conversation_summary: סיכום קצר של השיחה (2-3 שורות)
- pain_points: מערך של נקודות כאב/בעיות שהלקוח הזכיר (למשל: "חוסר ביטחון עצמי", "לחץ בעבודה")
- motivations: מערך של סיבות למה הלקוח פנה (למשל: "לפרוק עצבים", "לבנות ביטחון")
- conversation_stage: אחד מהבאים:
  * "waiting_for_decision" - אם הלקוח אמר שצריך לחשוב
  * "waiting_for_payment" - אם קבעו אימון ונשלח קישור תשלום אבל לא שילם
  * "stopped_responding" - אם השיחה הייתה טובה אבל הלקוח פתאום הפסיק
  * "waiting_for_response" - אם הבוט שאל שאלה והלקוח לא ענה
- last_topic: נושא אחרון שדיברו עליו (קצר - 3-5 מילים)

⚠️ חשוב: החזר רק JSON תקין, ללא טקסט נוסף.`;

    try {
        const completion = await openai.chat.completions.create({
            model: GPT.MODELS.FAST,
            messages: [{ role: "system", content: systemPrompt }],
            temperature: GPT.TEMPERATURES.LOW
        });

        let responseText = completion.choices[0].message.content.trim();
        
        if (responseText.startsWith('```')) {
            responseText = responseText.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
        }

        return JSON.parse(responseText);

    } catch (error) {
        console.error('❌ Followup summary creation failed:', error.message);
        return null;
    }
}

module.exports = {
    combinedDetection,
    fallbackDetection,
    detectEarlyRejection,
    analyzeConversationForPayment,
    createFollowupSummary
};







