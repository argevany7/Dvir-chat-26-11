#!/usr/bin/env node

/**
 * סקריפט מהיר לניקוי מאגר הנתונים (ללא אישורים)
 * מנקה את כל הטבלאות: clients, conversations, appointments
 * 
 * שימוש: node quick_clean.js
 * או: npm run clean-db-quick
 */

const sqlite3 = require('sqlite3').verbose();

console.log('🧹 ניקוי מהיר של מאגר הנתונים...');

// התחברות למאגר הנתונים
const db = new sqlite3.Database('./dvir_basson_clients.db', (err) => {
    if (err) {
        console.error('❌ שגיאה בחיבור למאגר מידע:', err.message);
        process.exit(1);
    }
});

// מחיקת כל הטבלאות
const tables = ['conversations', 'appointments', 'clients'];
let completed = 0;

tables.forEach(table => {
    db.run(`DELETE FROM ${table}`, (err) => {
        if (err) {
            console.log(`⚠️  שגיאה במחיקת טבלת ${table}:`, err.message);
        } else {
            console.log(`✅ טבלת ${table} נוקתה`);
        }
        
        // איפוס מונה
        db.run(`DELETE FROM sqlite_sequence WHERE name='${table}'`, (err) => {
            completed++;
            if (completed === tables.length) {
                console.log('🎉 ניקוי הושלם בהצלחה!');
                db.close();
            }
        });
    });
});
