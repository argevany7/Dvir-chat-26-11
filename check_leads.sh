#!/bin/bash

# סקריפט בדיקת לידים ואפוינטמנטים

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 מערכת ניהול לידים - דביר בסון"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# מיקום מאגר הנתונים
DB="./dvir_basson_clients.db"

echo "🔍 סטטיסטיקות לידים:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
sqlite3 "$DB" << EOF
.mode column
.headers on
SELECT 
    lead_status as 'סטטוס',
    COUNT(*) as 'כמות'
FROM clients
GROUP BY lead_status
ORDER BY 
    CASE lead_status
        WHEN 'paid' THEN 1
        WHEN 'hot' THEN 2
        WHEN 'warm' THEN 3
        WHEN 'cold' THEN 4
    END;
EOF

echo ""
echo "👥 5 לידים אחרונים:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
sqlite3 "$DB" << EOF
.mode column
.headers on
SELECT 
    substr(phone, -4) as 'טלפון',
    COALESCE(name, '---') as 'שם',
    COALESCE(age, 0) as 'גיל',
    lead_status as 'סטטוס',
    datetime(updated_at, 'localtime') as 'עדכון אחרון'
FROM clients
ORDER BY updated_at DESC
LIMIT 5;
EOF

echo ""
echo "📅 אפוינטמנטים קרובים:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
sqlite3 "$DB" << EOF
.mode column
.headers on
SELECT 
    substr(a.client_phone, -4) as 'טלפון',
    COALESCE(c.name, '---') as 'שם',
    a.appointment_date as 'תאריך',
    a.appointment_time as 'שעה',
    a.appointment_type as 'סוג',
    a.status as 'סטטוס'
FROM appointments a
LEFT JOIN clients c ON a.client_phone = c.phone
ORDER BY a.created_at DESC
LIMIT 5;
EOF

echo ""
echo "💰 לידים ששילמו היום:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
sqlite3 "$DB" << EOF
.mode column
.headers on
SELECT 
    substr(c.phone, -4) as 'טלפון',
    COALESCE(c.full_name, c.name, '---') as 'שם מלא',
    c.age as 'גיל',
    c.appointment_date as 'תאריך אימון',
    datetime(c.updated_at, 'localtime') as 'שולם ב'
FROM clients c
WHERE c.lead_status = 'paid'
AND date(c.updated_at) = date('now', 'localtime')
ORDER BY c.updated_at DESC;
EOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ סיימתי!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

