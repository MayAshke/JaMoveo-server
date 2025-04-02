import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './db.js'; // הוספנו את חיבור למסד הנתונים
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config(); // טוען משתנים מקובץ .env

const app = express(); // יוצרים מופע של השרת בעזרת express
const server = http.createServer(app); // יוצרים שרת HTTP מבוסס על Express
const io = new Server(server, {  // שיתאפשר חיבור מכל דומיין מגדירים WebSockets עם CORS פתוח
    cors: {
        origin: '*',  // מאפשר לכל דומיין לגשת
        methods: ['GET', 'POST']
    }
});

app.use(cors()); // מאפשר תקשורת בין שרתים ל-Frontend לתקשר עם ה-Backend
app.use(express.json()); // מאפשר לשלוח נתונים בפורמט JSON בבקשות POST ו-PUT

const sessions = {};

// Middleware לאימות JWT
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1]; // מקבלים את הטוקן מה-Authorization header
    if (!token) return res.status(401).json({ error: 'Token is required' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' });
        req.user = user;  // שומרים את המידע על המשתמש ב-req
        next();
    });
};

// מאזין לחיבורים חדשים ב-Socket.io
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // מצרף משתמש לחזרה לפי מזהה
    socket.on('joinSession', (sessionId) => {
        socket.join(sessionId);
        console.log(`User ${socket.id} joined session ${sessionId}`);
    });

    // כאשר האדמין בוחר שיר, כולם רואים אותו
    socket.on('songSelected', ({ sessionId, song }) => {
        io.to(sessionId).emit('updateSong', song);
        console.log(`Song updated in session ${sessionId}:`, song);
    });

    // כשהאדמין מסיים חזרה, כל המשתמשים מתנתקים
    socket.on('endSession', (sessionId) => {
        io.to(sessionId).emit('sessionEnded');
        console.log(`Session ${sessionId} ended.`);
    });
});

// 🟢 הרשמה של משתמש חדש
app.post('/signup', async (req, res) => {
    const { username, password, instrument, role, type = 'user' } = req.body;

    try {
        // בדוק אם שם המשתמש קיים כבר בטבלה
        const userCheck = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        
        if (userCheck.rows.length > 0) {
            // אם שם המשתמש כבר קיים, החזר הודעת שגיאה
            console.log('User already exists');  // הדפס ב-console כדי לוודא שהבעיה היא כאן
            return res.status(400).json({ error: 'Username already exists' });
        }



        // הוספת משתמש חדש
        const result = await pool.query(
            'INSERT INTO users (username, password, instrument, role, type) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, instrument, role, type',
            [username, password, instrument, role, type]
        );

        res.json(result.rows[0]);  // החזר את המשתמש החדש שנוצר

    } catch (err) {
        console.error('Error creating user:', err);  // הדפס את השגיאה כולה

        // טיפול בשגיאה של ייחודיות שם המשתמש (duplicate key)
        if (err.code === '23505') {  // '23505' הוא קוד השגיאה שמגיע כשיש violation של unique constraint
            console.error('Duplicate username error:', err.detail);  // הצגת פרטי השגיאה
            return res.status(400).json({ error: 'Username already exists' });
        }

        // טיפול בשגיאות אחרות
        res.status(500).json({ error: 'Error creating user, please try again later' });
    }
});

// 🔵 התחברות וקבלת טוקן
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        console.log("may is here!!!!s")
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) return res.status(401).json({ error: "User not found" });
        console.log("2")


        const user = result.rows[0];
        // const isMatch = await bcrypt.compare(password, user.password);
        const isMatch = password === user.password;
        if (!isMatch) return res.status(401).json({ error: "Invalid password" });
        console.log("3")

        // יצירת טוקן עם מידע על המשתמש
        // const token = jwt.sign({ id: user.id, type: user.type }, process.env.JWT_SECRET, { expiresIn: '2h' });
        console.log("4")
        // שליחת התפקיד כחלק מהתגובה
        res.json({ user: { id: user.id, username: user.username, instrument: user.instrument, role: user.role, type: user.type } });
    } catch (err) {
        res.status(500).json({ error: err.message });
        console.log("1")
    }
});

// 🟠 יצירת חזרה חדשה (Admin בלבד)
app.post('/rehearsals', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can create rehearsals' });
    }
    const { admin_id } = req.body;
    try {
        const result = await pool.query('INSERT INTO rehearsals (admin_id) VALUES ($1) RETURNING *', [admin_id]);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🟣 הצטרפות לחזרה
app.post('/join', authenticateToken, async (req, res) => {
    const { rehearsal_id, user_id } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO participants (rehearsal_id, user_id) VALUES ($1, $2) RETURNING *',
            [rehearsal_id, user_id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// נתיב בדיקה
app.get('/', (req, res) => {
    res.send('JaMoveo API is running');
});

// הפעלת השרת
server.listen(5000, () => {
    console.log('Server running on port 5000');
});