/**
 * מנגנון Mutex פשוט למניעת Race Conditions
 * תיקון בעיה #1 - Race Conditions
 */

class SimpleMutex {
    constructor() {
        this.locks = new Map();
    }

    /**
     * נעילת session
     * @param {string} sessionId - מזהה ה-session
     * @param {number} timeout - timeout במילישניות (ברירת מחדל: 30 שניות)
     * @returns {Promise<boolean>} - האם הנעילה הצליחה
     */
    async acquire(sessionId, timeout = 30000) {
        const startTime = Date.now();
        
        while (this.locks.has(sessionId)) {
            if (Date.now() - startTime > timeout) {
                console.warn(`⚠️ Mutex timeout עבור session: ${sessionId}`);
                return false;
            }
            // המתן קצת לפני ניסיון חוזר
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        this.locks.set(sessionId, {
            acquiredAt: Date.now(),
            timeout: timeout
        });
        
        return true;
    }

    /**
     * שחרור נעילה
     * @param {string} sessionId - מזהה ה-session
     */
    release(sessionId) {
        this.locks.delete(sessionId);
    }

    /**
     * בדיקה האם session נעול
     * @param {string} sessionId - מזהה ה-session
     * @returns {boolean}
     */
    isLocked(sessionId) {
        return this.locks.has(sessionId);
    }

    /**
     * ניקוי נעילות שפג תוקפן
     */
    cleanupStale() {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [sessionId, lockInfo] of this.locks.entries()) {
            if (now - lockInfo.acquiredAt > lockInfo.timeout) {
                this.locks.delete(sessionId);
                cleaned++;
                console.log(`🧹 נעילה ישנה נוקתה: ${sessionId}`);
            }
        }
        
        if (cleaned > 0) {
            console.log(`🧹 נוקו ${cleaned} נעילות ישנות`);
        }
        
        return cleaned;
    }

    /**
     * קבלת מספר הנעילות הפעילות
     * @returns {number}
     */
    getActiveLocksCount() {
        return this.locks.size;
    }
}

/**
 * Wrapper לביצוע פעולה עם נעילה
 * @param {SimpleMutex} mutex - אובייקט ה-mutex
 * @param {string} sessionId - מזהה ה-session
 * @param {Function} fn - הפונקציה לביצוע
 * @param {number} timeout - timeout במילישניות
 * @returns {Promise<*>} - התוצאה של הפונקציה
 */
async function withLock(mutex, sessionId, fn, timeout = 30000) {
    const acquired = await mutex.acquire(sessionId, timeout);
    
    if (!acquired) {
        throw new Error(`Failed to acquire lock for session: ${sessionId}`);
    }
    
    try {
        return await fn();
    } finally {
        mutex.release(sessionId);
    }
}

// יצירת instance גלובלי
const messageMutex = new SimpleMutex();
const dbMutex = new SimpleMutex();

module.exports = {
    SimpleMutex,
    withLock,
    messageMutex,
    dbMutex
};







