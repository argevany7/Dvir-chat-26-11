/**
 * קובץ קונסטנטות מרכזי - כל הערכים הקבועים במקום אחד
 * תיקון בעיה #7 - Hardcoded Values
 */

// מספרי מנהלים
const MANAGER_PHONES = [
    '972559925657',
    '972508422092'
];

// מספרי מנהלים עם סיומת וואטסאפ
const MANAGER_WHATSAPP_IDS = MANAGER_PHONES.map(phone => `${phone}@c.us`);

// הגדרות תזמון
const TIMING = {
    // Message batching
    BATCH_DELAY: 12000, // 12 שניות
    SEEN_DELAY_MIN: 20000, // 20 שניות מינימום לseen
    SEEN_DELAY_MAX: 100000, // 100 שניות מקסימום לseen
    TYPING_DELAY_AFTER_SEEN: { MIN: 500, MAX: 1500 }, // 0.5-1.5 שניות אחרי seen
    TYPING_INTERVAL: 5000, // כל 5 שניות לשמור על typing
    
    // Follow-up timing
    FOLLOWUP_CHECK_INTERVAL: 30 * 60 * 1000, // 30 דקות
    FOLLOWUP_START_HOURS: 10, // התחל פולואו אפ אחרי 10 שעות
    STOP_RESPONSE_TIMEOUT_HOURS: 12, // המתנה לתשובה על "למה?"
    EARLY_REJECTION_TIMEOUT_HOURS: 5, // המתנה לתשובה על "למה?" בearly rejection
    
    // Payment reminders
    PAYMENT_REMINDER_HOURS: 2, // תזכורת אחרי 2 שעות
    UNPAID_MIGRATION_HOURS: 24, // העברה לפולואו-אפ רגיל אחרי 24 שעות
    
    // GPT timeouts
    GPT_TIMEOUT: 30000, // 30 שניות timeout לGPT
    
    // Admin state cleanup
    ADMIN_STATE_CLEANUP_MINUTES: 30, // ניקוי state מנהל אחרי 30 דקות
    
    // Message processing
    MAX_PROCESSING_ITERATIONS: 5, // מקסימום איטרציות עיבוד
    
    // Cleanup intervals
    MEMORY_CLEANUP_INTERVAL: 5 * 60 * 1000, // ניקוי זיכרון כל 5 דקות
    STALE_BATCH_TIMEOUT: 10 * 60 * 1000 // Batch נחשב stale אחרי 10 דקות
};

// הגדרות פולואו-אפ
const FOLLOWUP = {
    // ימים להוספה לפי ניסיון
    DAYS_BY_ATTEMPT: {
        1: 1, // ניסיונות 1-3: יום אחד
        2: 1,
        3: 1,
        4: 2, // ניסיונות 4-5: יומיים
        5: 2,
        DEFAULT: 3 // ניסיון 6+: 3 ימים
    },
    
    // שעות לשליחת הודעות
    HOURS_RANGE: { MIN: 8, MAX: 20 },
    
    // Early rejection bi-weekly
    BI_WEEKLY_DAYS: 14
};

// הגדרות שבת
const SHABBAT = {
    // שעות כניסה ויציאה (בקירוב)
    FRIDAY_ENTRY_HOUR: 18, // 18:00 ביום שישי
    SATURDAY_EXIT_HOUR: 20, // 20:00 ביום שבת
    SUNDAY_START_HOUR: 8 // 8:00 ביום ראשון
};

// קישורי תשלום
const PAYMENT = {
    BASE_URL: 'https://letts.co.il/payment/',
    LINK_ID: '67ba0c9c4acbed4d960a3ed2'
};

// הגדרות GPT
const GPT = {
    MODELS: {
        MAIN: 'gpt-4o',
        FAST: 'gpt-4o-mini'
    },
    TEMPERATURES: {
        PRECISE: 0, // לזיהויים מדויקים (YES/NO)
        LOW: 0.1, // לתגובות עקביות
        MEDIUM: 0.7, // לתגובות מגוונות
        HIGH: 0.8, // ליצירתיות
        VERY_HIGH: 0.95 // לגיוון מקסימלי
    },
    MAX_TOKENS: {
        SHORT: 5, // לתשובות YES/NO
        BRIEF: 60, // להודעות קצרות
        MEDIUM: 150, // להודעות רגילות
        LONG: 500, // להודעות ארוכות
        ANALYSIS: 1000 // לניתוחים מקיפים
    }
};

// מילות מפתח לזיהוי (Fallback)
const KEYWORDS = {
    STOP_REQUEST: [
        'די', 'מספיק', 'תפסיק', 'עזוב', 'לא מעוניין', 'לא רוצה',
        'תפסיק לשלוח', 'תפסיק לכתוב', 'אל תשלח', 'לא רלוונטי',
        'פחות רלוונטי', 'stop', 'די תודה', 'לא תודה', 'תודה לא',
        'לא בשבילי', 'לא מתאים', 'לא מעוניין יותר', 'לא רוצה עוד',
        'הפסיק', 'הפסיקו', 'תעזוב', 'תעזבו אותי', 'עזבו אותי'
    ],
    
    POSITIVE_RESPONSE: [
        'כן', 'yes', 'בטח', 'בוודאי', 'אשמח', 'מעוניין', 'רוצה',
        'בואו', 'יאללה', 'אוקיי', 'ok', 'סבבה', 'נשמע טוב',
        'אני פנוי', 'אני זמין', 'בא לי', 'למה לא'
    ],
    
    CONVERSATION_ENDING: [
        'נתראה', 'להתראות', 'מחכה לראות', 'מחכים לך', 'תתראו',
        'נראה אותך', 'נפגש', 'ביי', 'שלום', 'יאללה ביי',
        'מצפה לראות', 'נתראה באימון'
    ],
    
    SPECIFIC_QUESTION: [
        'איפה', 'מתי', 'כמה', 'מה', 'איך', 'למה', 'האם', 'אפשר',
        'יש', 'כתובת', 'מחיר', 'עלות', 'שעות', 'ימים', '?'
    ],
    
    PAYMENT_CONFIRMATION: [
        'שילמתי', 'העברתי', 'ביצעתי תשלום', 'שולם', 'התשלום עבר',
        'הועבר', 'סיימתי לשלם', 'הכל בסדר', 'אישור תשלום'
    ],
    
    EARLY_REJECTION: [
        'לא מעוניין', 'לא רלוונטי', 'לא מתאים', 'לא בשבילי',
        'תודה לא', 'לא תודה', 'לא צריך', 'פחות רלוונטי',
        'לא כרגע', 'אולי אחר כך', 'לא עכשיו'
    ],
    
    PERSONAL_TRAINING: [
        'אימון אישי', 'פרטי', 'אחד על אחד', '1 על 1', 'רק אני',
        'פרסונלי', 'אישי', 'לבד'
    ],
    
    HUMAN_RESPONSE: [
        'אדם אמיתי', 'בן אדם', 'לא בוט', 'נציג', 'מישהו אמיתי',
        'אתה בוט', 'זה בוט', 'רובוט', 'תשלח מישהו אמיתי'
    ],
    
    PHONE_CALL: [
        'להתקשר', 'טלפון', 'שיחה', 'תתקשר', 'תצלצל',
        'אפשר לדבר', 'לשוחח בטלפון'
    ]
};

// קבוצות גיל ושעות אימון
const AGE_GROUPS = {
    'kids_4_6': {
        label: 'ילדים 4-6',
        minAge: 4,
        maxAge: 6,
        times: {
            'ראשון': '17:00',
            'שני': '17:00',
            'רביעי': '17:00'
        }
    },
    'kids_7_9': {
        label: 'ילדים 7-9',
        minAge: 7,
        maxAge: 9,
        times: {
            'ראשון': '17:00',
            'שני': '17:00',
            'רביעי': '17:00'
        }
    },
    'kids_10_13': {
        label: 'ילדים 10-13',
        minAge: 10,
        maxAge: 13,
        times: {
            'ראשון': '18:00',
            'שני': '18:00',
            'רביעי': '18:00'
        }
    },
    'teens_14_17': {
        label: 'נוער 14-17',
        minAge: 14,
        maxAge: 17,
        times: {
            'ראשון': '19:00',
            'שני': '19:00',
            'רביעי': '19:00'
        }
    },
    'adults': {
        label: 'מבוגרים 18+',
        minAge: 18,
        maxAge: 120,
        times: {
            'ראשון': '20:00',
            'שני': '20:00',
            'שלישי': '20:00',
            'רביעי': '20:00',
            'חמישי': '20:00'
        }
    }
};

// Robotic phrases לתיקון אוטומטי
const ROBOTIC_PHRASES = [
    { pattern: /אני כאן (כדי )?לעזור( לך)?/gi, replacement: '' },
    { pattern: /אני כאן (כדי )?לענות/gi, replacement: '' },
    { pattern: /תרגיש חופשי לשאול/gi, replacement: 'יש עוד משהו שמעניין אותך?' },
    { pattern: /יש לך שאלות נוספות\?/gi, replacement: '' },
    { pattern: /אם יש לך שאלות/gi, replacement: '' },
    { pattern: /\s*😊\s*$/, replacement: ' 😊' }
];

// Database indexes to create
const DB_INDEXES = [
    'CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone)',
    'CREATE INDEX IF NOT EXISTS idx_clients_followup ON clients(followup_enabled, next_followup_date)',
    'CREATE INDEX IF NOT EXISTS idx_clients_payment ON clients(payment_confirmed, payment_link_sent_date)',
    'CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id)',
    'CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_blocked_phone ON blocked_contacts(phone)',
    'CREATE INDEX IF NOT EXISTS idx_chat_summaries_phone ON chat_summaries(client_phone)'
];

module.exports = {
    MANAGER_PHONES,
    MANAGER_WHATSAPP_IDS,
    TIMING,
    FOLLOWUP,
    SHABBAT,
    PAYMENT,
    GPT,
    KEYWORDS,
    AGE_GROUPS,
    ROBOTIC_PHRASES,
    DB_INDEXES
};







