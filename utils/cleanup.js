/**
 * מנגנון ניקוי זיכרון אוטומטי
 * תיקון בעיה #2 - Memory Leaks
 */

const { TIMING } = require('../config/constants');

/**
 * ניהול ניקוי Maps וזיכרון
 */
class MemoryCleanup {
    constructor() {
        this.maps = new Map(); // שמירת רפרנסים ל-Maps שצריך לנקות
        this.cleanupInterval = null;
        this.stats = {
            totalCleaned: 0,
            lastCleanup: null
        };
    }

    /**
     * רישום Map לניקוי אוטומטי
     * @param {string} name - שם ה-Map
     * @param {Map} map - ה-Map עצמו
     * @param {Object} options - אפשרויות ניקוי
     */
    register(name, map, options = {}) {
        this.maps.set(name, {
            map,
            maxAge: options.maxAge || TIMING.STALE_BATCH_TIMEOUT,
            getTimestamp: options.getTimestamp || ((entry) => entry.createdAt || entry.acquiredAt || Date.now()),
            onCleanup: options.onCleanup || null // callback לניקוי מיוחד
        });
        console.log(`📝 Map "${name}" נרשם לניקוי אוטומטי`);
    }

    /**
     * ביצוע ניקוי על כל ה-Maps הרשומים
     * @returns {Object} - סטטיסטיקות ניקוי
     */
    async cleanup() {
        const now = Date.now();
        const results = {};
        let totalCleaned = 0;

        for (const [name, config] of this.maps.entries()) {
            const { map, maxAge, getTimestamp, onCleanup } = config;
            let cleaned = 0;
            const keysToDelete = []; // אוסף מפתחות למחיקה

            // שלב 1: זיהוי entries ישנים
            for (const [key, value] of map.entries()) {
                const timestamp = getTimestamp(value);
                const age = now - timestamp;

                if (age > maxAge) {
                    keysToDelete.push({ key, value });
                }
            }

            // שלב 2: ניקוי עם תמיכה ב-async callbacks
            for (const { key, value } of keysToDelete) {
                // קריאה ל-callback אם קיים (תמיכה ב-async!)
                if (onCleanup) {
                    try {
                        await onCleanup(key, value);
                    } catch (err) {
                        console.error(`❌ שגיאה ב-cleanup callback עבור ${name}:`, err.message);
                    }
                }
                
                map.delete(key);
                cleaned++;
            }

            if (cleaned > 0) {
                console.log(`🧹 Map "${name}": נוקו ${cleaned} entries (נשארו ${map.size})`);
            }
            
            results[name] = cleaned;
            totalCleaned += cleaned;
        }

        this.stats.totalCleaned += totalCleaned;
        this.stats.lastCleanup = now;

        return results;
    }

    /**
     * התחלת ניקוי אוטומטי
     * @param {number} interval - מרווח בין ניקויים במילישניות
     */
    startAutoCleanup(interval = TIMING.MEMORY_CLEANUP_INTERVAL) {
        if (this.cleanupInterval) {
            console.log('⚠️ Auto cleanup כבר פועל');
            return;
        }

        this.cleanupInterval = setInterval(async () => {
            console.log('🔄 מריץ ניקוי זיכרון אוטומטי...');
            try {
                await this.cleanup();
            } catch (err) {
                console.error('❌ שגיאה בניקוי זיכרון אוטומטי:', err.message);
            }
        }, interval);

        console.log(`✅ Auto cleanup הופעל (כל ${interval / 1000} שניות)`);
    }

    /**
     * עצירת ניקוי אוטומטי
     */
    stopAutoCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            console.log('🛑 Auto cleanup הופסק');
        }
    }

    /**
     * קבלת סטטיסטיקות
     * @returns {Object}
     */
    getStats() {
        const mapStats = {};
        for (const [name, config] of this.maps.entries()) {
            mapStats[name] = config.map.size;
        }
        
        return {
            ...this.stats,
            maps: mapStats,
            autoCleanupActive: !!this.cleanupInterval
        };
    }

    /**
     * ניקוי ידני של Map ספציפי
     * @param {string} name - שם ה-Map
     */
    cleanupMap(name) {
        const config = this.maps.get(name);
        if (!config) {
            console.log(`⚠️ Map "${name}" לא נמצא`);
            return 0;
        }

        const sizeBefore = config.map.size;
        
        // ניקוי מלא עם callbacks
        for (const [key, value] of config.map.entries()) {
            if (config.onCleanup) {
                try {
                    config.onCleanup(key, value);
                } catch (err) {
                    console.error(`❌ שגיאה ב-cleanup callback:`, err.message);
                }
            }
        }
        
        config.map.clear();
        console.log(`🧹 Map "${name}": נוקה לחלוטין (${sizeBefore} entries)`);
        
        return sizeBefore;
    }
}

/**
 * ניקוי Admin States ישנים
 * @param {Map} adminStates - Map של admin states
 * @param {Map} adminStateTimers - Map של timers
 * @param {Map} pendingBlocks - Map של pending blocks
 * @param {number} maxAgeMs - גיל מקסימלי במילישניות
 */
function cleanupAdminStates(adminStates, adminStateTimers, pendingBlocks, maxAgeMs = 30 * 60 * 1000) {
    if (!adminStates || !adminStateTimers || !pendingBlocks) {
        return { cleaned: 0 };
    }

    const now = Date.now();
    let cleaned = 0;

    // ניקוי states ישנים (לפי lastActivity אם קיים)
    for (const [phone, state] of adminStates.entries()) {
        const lastActivity = state.lastActivity || now;
        if (now - lastActivity > maxAgeMs) {
            adminStates.delete(phone);
            
            // נקה גם את ה-timer המשויך
            if (adminStateTimers.has(phone)) {
                clearTimeout(adminStateTimers.get(phone));
                adminStateTimers.delete(phone);
            }
            
            // נקה גם pending blocks
            if (pendingBlocks.has(phone)) {
                pendingBlocks.delete(phone);
            }
            
            cleaned++;
        }
    }

    if (cleaned > 0) {
        console.log(`🧹 נוקו ${cleaned} admin states ישנים`);
    }

    return { cleaned };
}

/**
 * ניקוי Pending Messages שנתקעו
 * @param {Map} pendingMessages - Map של pending messages
 * @param {number} maxAgeMs - גיל מקסימלי במילישניות
 */
async function cleanupPendingMessages(pendingMessages, maxAgeMs = TIMING.STALE_BATCH_TIMEOUT) {
    if (!pendingMessages) {
        return { cleaned: 0 };
    }

    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, batch] of pendingMessages.entries()) {
        const batchAge = now - (batch.createdAt || 0);
        
        if (batchAge > maxAgeMs || !batch.createdAt) {
            // בטל את כל הטיימרים
            if (batch.timer) clearTimeout(batch.timer);
            if (batch.seenTimer) clearTimeout(batch.seenTimer);
            if (batch.typingTimer) clearTimeout(batch.typingTimer);
            if (batch.typingInterval) clearInterval(batch.typingInterval);
            
            // נסה לנקות את ה-chat state
            if (batch.chat) {
                try {
                    await batch.chat.clearState();
                } catch (err) {
                    console.log(`⚠️ לא ניתן לנקות chat state: ${err.message}`);
                }
            }
            
            pendingMessages.delete(sessionId);
            cleaned++;
            console.log(`🧹 Pending batch נוקה: ${sessionId}`);
        }
    }

    return { cleaned };
}

// יצירת instance גלובלי
const memoryCleanup = new MemoryCleanup();

module.exports = {
    MemoryCleanup,
    memoryCleanup,
    cleanupAdminStates,
    cleanupPendingMessages
};

