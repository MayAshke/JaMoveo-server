import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config(); // טוען משתנים מקובץ .env
const { Pool } = pkg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL // משתמש במשתנה DATABASE_URL מקובץ .env לחיבור מסד הנתונים 
});

// בדיקת חיבור למסד הנתונים
pool.connect()
    .then(() => {
        console.log('Connected to the database successfully'); // הודעת הצלחה אם החיבור הצליח
    })
    .catch((err) => {
        console.error('Error connecting to the database:', err.message); // הודעת שגיאה אם החיבור נכשל
    });

export default pool;