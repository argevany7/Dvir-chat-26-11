/**
 * טיפול מאוחד בתשלומים
 * תיקון בעיה #5 - שכפול קוד
 */

const { GPT, PAYMENT } = require('../config/constants');

/**
 * טיפול באישור תשלום - פונקציה מאוחדת
 * מטפלת בכל המקרים: תשלום רגיל, תשלום אחרי תמונה, מספר אנשים
 * 
 * @param {Object} params - פרמטרים
 * @param {string} params.sessionId - מזהה השיחה
 * @param {string} params.phone - מספר טלפון
 * @param {Object} params.client - אובייקט הלקוח מהDB
 * @param {string} params.message - הודעת הלקוח
 * @param {Array} params.conversationHistory - היסטוריית השיחה
 * @param {Object} params.analysis - ניתוח השיחה (אופציונלי, יחושב אם לא קיים)
 * @param {Object} params.db - חיבור לDB
 * @param {Object} params.openai - OpenAI client
 * @param {Function} params.saveConversation - פונקציה לשמירת שיחה
 * @param {Function} params.markConversationEnded - פונקציה לסימון סוף שיחה
 * @param {Function} params.sendSummaryToManagers - פונקציה לשליחת סיכום למנהלים
 * @param {Function} params.updateClientLeadStatus - פונקציה לעדכון סטטוס ליד
 * @returns {Promise<Object>} - תוצאת הטיפול
 */
async function handlePaymentConfirmation(params) {
    const {
        sessionId,
        phone,
        client,
        message,
        conversationHistory,
        analysis: providedAnalysis,
        db,
        openai,
        saveConversation,
        markConversationEnded,
        sendSummaryToManagers,
        updateClientLeadStatus,
        loadConversationHistory,
        extractAppointmentTimeFromHistory,
        generateAvailableTimes,
        getSuggestedTimeByAge,
        saveAnalysisToDatabase,
        createMultipleClientsAndAppointments,
        detectMultiplePeopleWithGPT,
        detectPaymentCountWithGPT
    } = params;

    console.log('💰 התחלת טיפול באישור תשלום');

    // הוסף את ההודעה האחרונה להיסטוריה
    const fullHistory = [...conversationHistory, { role: 'user', content: message }];

    // =========================================
    // שלב 1: בדיקת מספר אנשים בשיחה
    // =========================================
    
    let multiplePeopleDetected = client.multiple_people_detected || 0;
    let peopleList = client.people_list ? JSON.parse(client.people_list) : [];
    
    // זיהוי מספר אנשים אם עדיין לא זוהו
    if (!multiplePeopleDetected || multiplePeopleDetected === 0) {
        console.log('🔍 בודק אם יש מספר אנשים בשיחה...');
        
        if (detectMultiplePeopleWithGPT) {
            const peopleDetection = await detectMultiplePeopleWithGPT(fullHistory);
            
            if (peopleDetection.count > 1) {
                console.log(`✅ זוהו ${peopleDetection.count} אנשים בשיחה!`);
                multiplePeopleDetected = peopleDetection.count;
                peopleList = peopleDetection.people;
                
                // עדכון ב-DB
                await dbRun(db, `UPDATE clients SET 
                    multiple_people_detected = ?,
                    people_list = ?,
                    payments_required = ?
                    WHERE phone = ?`,
                    [multiplePeopleDetected, JSON.stringify(peopleList), multiplePeopleDetected, phone]
                );
            }
        }
    }

    // =========================================
    // שלב 2: טיפול במספר אנשים
    // =========================================
    
    if (multiplePeopleDetected > 1) {
        console.log(`\n🔔 ========== טיפול במספר אנשים (${multiplePeopleDetected}) ==========`);
        
        // בדיקה: האם הלקוח ממתין לווידוא מספר תשלומים?
        if (client.waiting_for_payment_count) {
            console.log('⏳ לקוח ממתין לווידוא מספר תשלומים...');
            
            if (detectPaymentCountWithGPT) {
                const paymentCheck = await detectPaymentCountWithGPT(
                    message, 
                    fullHistory, 
                    client.payments_required
                );
                
                if (paymentCheck.paymentsConfirmed === client.payments_required && paymentCheck.confidenceLevel !== 'low') {
                    console.log(`✅ אושר! כל ${client.payments_required} התשלומים בוצעו`);
                    
                    // עדכון DB
                    await dbRun(db, `UPDATE clients SET 
                        payments_confirmed = ?,
                        waiting_for_payment_count = 0,
                        payment_confirmed = 1
                        WHERE phone = ?`,
                        [client.payments_required, phone]
                    );
                    
                    // יצירת רשומות מרובות ושליחה למנהלים
                    if (createMultipleClientsAndAppointments) {
                        await createMultipleClientsAndAppointments(client, peopleList, fullHistory);
                    }
                    
                    // הודעת אישור ללקוח
                    const confirmResponse = `מעולה! קיבלתי את ${client.payments_required} התשלומים 🎉

כל המקומות שמורים לאימון!

דביר קיבל את כל הפרטים ומחכה לראות אתכם באימון!

📍 כתובת: הרצוג 12, הרצליה

https://youtube.com/shorts/_Bk2vYeGQTQ?si=n1wgv8-3t7_hEs45`;
                    
                    await saveConversation(sessionId, 'user', message);
                    await saveConversation(sessionId, 'assistant', confirmResponse);
                    await markConversationEnded(sessionId);
                    
                    return { response: confirmResponse, handled: true };
                    
                } else if (paymentCheck.needsToAsk) {
                    console.log('❓ לא ברור כמה תשלומים - שואל את הלקוח');
                    
                    await dbRun(db, `UPDATE clients SET waiting_for_payment_count = 1 WHERE phone = ?`, [phone]);
                    
                    const askResponse = `מעולה! רק לווידוא - ביצעת ${client.payments_required} תשלומים נפרדים (אחד עבור כל אחד)? 🙂`;
                    
                    await saveConversation(sessionId, 'user', message);
                    await saveConversation(sessionId, 'assistant', askResponse);
                    
                    return { response: askResponse, handled: true };
                    
                } else {
                    console.log(`⚠️ אושר רק ${paymentCheck.paymentsConfirmed} תשלומים מתוך ${client.payments_required}`);
                    
                    const remaining = client.payments_required - paymentCheck.paymentsConfirmed;
                    const partialResponse = `קיבלתי! עדיין צריך ${remaining} תשלומים נוספים באותו קישור. תעדכן כשתסיים? 😊`;
                    
                    await saveConversation(sessionId, 'user', message);
                    await saveConversation(sessionId, 'assistant', partialResponse);
                    
                    return { response: partialResponse, handled: true };
                }
            }
        }
        
        // הודעה ראשונה אחרי זיהוי תשלום - שאלה אם שילם בעבור כולם
        console.log('💬 שואל את הלקוח אם שילם בעבור כולם...');
        
        await dbRun(db, `UPDATE clients SET waiting_for_payment_count = 1 WHERE phone = ?`, [phone]);
        
        const initialAskResponse = `מעולה! רק לווידוא - ביצעת ${multiplePeopleDetected} תשלומים נפרדים (אחד עבור כל אחד)? 🙂`;
        
        await saveConversation(sessionId, 'user', message);
        await saveConversation(sessionId, 'assistant', initialAskResponse);
        
        return { response: initialAskResponse, handled: true };
    }

    // =========================================
    // שלב 3: תהליך רגיל - אדם אחד בלבד
    // =========================================
    
    console.log('👤 מדובר באדם אחד - ממשיך בתהליך רגיל');
    
    // ניתוח השיחה אם לא סופק
    let analysis = providedAnalysis;
    if (!analysis) {
        const { analyzeConversationForPayment } = require('../utils/gptOptimizer');
        analysis = await analyzeConversationForPayment(openai, fullHistory);
    }
    
    if (!analysis) {
        console.error('❌ ניתוח נכשל');
        return await handlePaymentAnalysisFailure({
            sessionId, phone, client, message, db,
            saveConversation, markConversationEnded, sendSummaryToManagers, updateClientLeadStatus
        });
    }
    
    // שמירה למאגר
    if (saveAnalysisToDatabase) {
        await saveAnalysisToDatabase(sessionId, analysis);
    }
    
    // שליחה למנהלים
    await sendSummaryToManagers(analysis);

    // בדיקה אם השעה נקבעה
    const appointmentTimeIsSet = analysis.appointmentTime && 
                                 analysis.appointmentTime !== 'לא נקבעה' && 
                                 analysis.appointmentTime.trim() !== '';

    let response;

    if (!appointmentTimeIsSet) {
        console.log('⚠️ התראה: השעה לא נקבעה - מנסה לחלץ מההיסטוריה');
        
        // נסיון לחלץ שעה מההיסטוריה
        if (extractAppointmentTimeFromHistory && loadConversationHistory) {
            const fullHistory = await loadConversationHistory(sessionId);
            const extractedTime = await extractAppointmentTimeFromHistory(fullHistory);
            
            if (extractedTime && extractedTime !== 'לא נקבעה') {
                console.log(`✅ השעה חולצה מההיסטוריה: ${extractedTime}`);
                analysis.appointmentTime = extractedTime;
                
                await dbRun(db, `UPDATE clients SET appointment_time = ? WHERE phone = ?`, [extractedTime, phone]);
            } else if (analysis.age && getSuggestedTimeByAge) {
                // הצעת שעה לפי גיל
                const suggestedTime = getSuggestedTimeByAge(analysis.age, analysis.trainingType);
                
                if (suggestedTime) {
                    console.log(`💡 מציע שעה לפי גיל ${analysis.age}: ${suggestedTime}`);
                    
                    await dbRun(db, `UPDATE clients SET 
                        waiting_for_time_confirmation = 1,
                        suggested_time = ?
                        WHERE phone = ?`,
                        [suggestedTime, phone]
                    );
                    
                    // שליחת הודעה ששואלת אישור
                    const confirmationMessage = analysis.isParentForChild && analysis.name
                        ? `מעולה! קיבלתי את אישור התשלום 🎉

רק רציתי לוודא - מדובר על אימון ב${analysis.appointmentDateAbsolute || analysis.appointmentDate} בשעה ${suggestedTime}.

תאשר לי שאוכל לרשום את ${analysis.name} לשעה הזו?`
                        : `מעולה! קיבלתי את אישור התשלום 🎉

רק רציתי לוודא - מדובר על אימון ב${analysis.appointmentDateAbsolute || analysis.appointmentDate} בשעה ${suggestedTime}.

תאשר לי שאוכל לרשום אותך לשעה הזו?`;
                    
                    await saveConversation(sessionId, 'user', message);
                    await saveConversation(sessionId, 'assistant', confirmationMessage);
                    
                    // לא מסמנים את השיחה כהסתיימה - ממתינים לאישור
                    console.log('⏳ ממתין לאישור שעה מהלקוח...');
                    return { response: confirmationMessage, handled: true, waitingForTimeConfirmation: true };
                }
            }
        }
    }
    
    // בניית הודעת אישור סופית
    response = buildPaymentConfirmationMessage(analysis);
    
    await saveConversation(sessionId, 'user', message);
    await saveConversation(sessionId, 'assistant', response);
    
    // עדכון סטטוס
    await updateClientLeadStatus(sessionId, 'hot', {
        payment_confirmed: true,
        conversation_ended: true
    });
    
    // סימון השיחה כהסתיימה
    console.log('🏁 תשלום אושר - מסמן את השיחה כהסתיימה');
    await markConversationEnded(sessionId);
    
    return { response, handled: true };
}

/**
 * טיפול בכשל ניתוח
 */
async function handlePaymentAnalysisFailure(params) {
    const { sessionId, phone, client, message, db, saveConversation, markConversationEnded, sendSummaryToManagers, updateClientLeadStatus } = params;
    
    console.error('❌ ניתוח נכשל - לא ניתן לעבד את התשלום');
    console.log('⚠️ שולח הודעה בסיסית למנהלים למרות כשל בניתוח...');
    
    const basicNotification = {
        phoneNumber: phone,
        fullName: client?.full_name || client?.name || 'לא צוין',
        age: client?.age || 'לא צוין',
        conversationSummary: 'תשלום אושר אך הניתוח נכשל - יש לבדוק ידנית',
        appointmentDateAbsolute: client?.appointment_date || 'לא נקבע',
        appointmentTime: client?.appointment_time || 'לא נקבעה',
        trainingType: 'לא צוין',
        experience: 'לא צוין',
        isParentForChild: false,
        parentName: null
    };
    
    await sendSummaryToManagers(basicNotification);
    
    const response = `תודה רבה! קיבלתי את אישור התשלום 🎉

דביר קיבל את הפרטים שלך ומחכה לראות אותך באימון!

📍 כתובת: הרצוג 12, הרצליה

https://youtube.com/shorts/_Bk2vYeGQTQ?si=n1wgv8-3t7_hEs45`;
    
    await saveConversation(sessionId, 'user', message);
    await saveConversation(sessionId, 'assistant', response);
    
    await updateClientLeadStatus(sessionId, 'hot', {
        payment_confirmed: true,
        conversation_ended: true
    });
    
    await markConversationEnded(sessionId);
    
    return { response, handled: true };
}

/**
 * בניית הודעת אישור תשלום
 * @param {Object} analysis - ניתוח השיחה
 * @returns {string} - הודעת האישור
 */
function buildPaymentConfirmationMessage(analysis) {
    const hasTime = analysis.appointmentTime && 
                    analysis.appointmentTime !== 'לא נקבעה' && 
                    analysis.appointmentTime.trim() !== '';
    
    const date = analysis.appointmentDateAbsolute || analysis.appointmentDate;
    const timeStr = hasTime ? ` בשעה ${analysis.appointmentTime}` : '';
    
    if (analysis.isParentForChild && analysis.name) {
        return `מעולה! קיבלתי את אישור התשלום 🎉

המקום של ${analysis.name} שמור לאימון ב${date}${timeStr}.

דביר קיבל את הפרטים ומחכה לראות את ${analysis.name} באימון!

📍 כתובת: הרצוג 12, הרצליה

https://youtube.com/shorts/_Bk2vYeGQTQ?si=n1wgv8-3t7_hEs45`;
    }
    
    return `מעולה! קיבלתי את אישור התשלום 🎉

המקום שלך שמור לאימון ב${date}${timeStr}.

דביר קיבל את הפרטים שלך ומחכה לראות אותך באימון!

📍 כתובת: הרצוג 12, הרצליה

https://youtube.com/shorts/_Bk2vYeGQTQ?si=n1wgv8-3t7_hEs45`;
}

/**
 * Helper function for DB operations
 */
function dbRun(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) {
                console.error('❌ DB Error:', err.message);
                reject(err);
            } else {
                resolve(this);
            }
        });
    });
}

module.exports = {
    handlePaymentConfirmation,
    handlePaymentAnalysisFailure,
    buildPaymentConfirmationMessage
};





