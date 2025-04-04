import fs from 'fs';
import path from 'path';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './db.js'; // הוספנו את חיבור למסד הנתונים
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';

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
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) return res.status(401).json({ error: "User not found" });

        const user = result.rows[0];
        // const isMatch = await bcrypt.compare(password, user.password);
        const isMatch = password === user.password;
        if (!isMatch) return res.status(401).json({ error: "Invalid password" });

        // יצירת טוקן עם מידע על המשתמש
        // const token = jwt.sign({ id: user.id, type: user.type }, process.env.JWT_SECRET, { expiresIn: '2h' });
        // שליחת התפקיד כחלק מהתגובה
        res.json({ user: { id: user.id, username: user.username, instrument: user.instrument, role: user.role, type: user.type } });
    } catch (err) {
        res.status(500).json({ error: err.message });
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
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Now you can use __dirname as usual
console.log(__dirname);

// Endpoint to get the song by name
app.get('/song/:name', (req, res) => {
    console.log("yovel here")
    const { name } = req.params;
    console.log("get song", {name})
    
    // Construct the path to the song JSON file
    const songFilePath = path.join(__dirname, 'data-songs', `${name}.json`); // Assuming your song files are in a 'songs' directory

    console.log("path", {songFilePath})
    
    // Check if the file exists
    fs.readFile(songFilePath, 'utf8', (err, data) => {
        if (err) {
            // Handle file read error (e.g., file not found)
            return res.status(404).json({ error: err });
        }

        try {
            // Parse the song data from the JSON file
            const songData = JSON.parse(data);
            res.json(songData); // Send the song data as JSON to the client
        } catch (parseError) {
            // Handle JSON parsing error
            return res.status(500).json({ error: 'Error parsing song data' });
        }
    });
});

// // Start the server
// app.listen(port, () => {
//     console.log(`Server is running on http://localhost:${port}`);
// });


app.get('/songs', (req, res) => {
    const songsDir = path.join(process.cwd(), 'data-songs');

    fs.readdir(songsDir, (err, files) => {
        if (err) {
            console.error('Error reading songs directory:', err);
            return res.status(500).json({ error: 'Failed to read songs' });
        }

        const songs = [];

        files.forEach((file) => {
            if (file.endsWith('.json')) {
                const filePath = path.join(songsDir, file);
                const rawData = fs.readFileSync(filePath, 'utf-8');
                const songData = JSON.parse(rawData);

                // הוספת שם השיר מהקובץ עצמו (ללא הסיומת .json)
                const songTitle = path.basename(file, '.json');

                // אם קובץ ה-JSON מכיל מערך של שירים, נוסיף לכל שיר את שם השיר
                if (Array.isArray(songData)) {
                    songData.forEach(song => {
                        // מניע כפילויות
                        if (!songs.some(existingSong => existingSong.title === songTitle && existingSong.chords === song.chords)) {
                            songs.push({ title: songTitle, ...song });
                        }
                    });
                } else {
                    // מניע כפילויות
                    if (!songs.some(existingSong => existingSong.title === songTitle && existingSong.chords === songData.chords)) {
                        songs.push({ title: songTitle, ...songData });
                    }
                }
            }
        });

        res.json(songs);
    });
});

let currentSong = null; // משתנה גלובלי לשמירת השיר הנבחר

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // שליחת השיר האחרון שנבחר למשתמש שמתחבר
    if (currentSong) {
        socket.emit('currentSong', { song: currentSong });
    }

    socket.on('getCurrentSong', () => {
        if (currentSong) {
            socket.emit('currentSong', { song: currentSong });
        }
    });

    // Join a session based on a sessionId
    socket.on('joinSession', (sessionId) => {
        socket.join(sessionId);  // Join the specified room/session
        console.log(`Socket ${socket.id} joined session ${sessionId}`);
    });

    // אזנים לאירוע 'songSelected' בתוך פונקציית החיבור
    socket.on('songSelected', ({ sessionId, song }) => {
        currentSong = song;
        io.to(sessionId).emit('changeStatus', { sessionId, status: "Live", song: currentSong });
        io.emit('songSelected', { song: currentSong }); // שליחת השיר לכל המשתמשים
        console.log(`changing status ${sessionId}:`, song);
    });

    // לאירועים אחרים שקשורים ל-socket
    socket.on('endSession', (sessionId) => {
        io.to(sessionId).emit('changeStatus');
        console.log(`Session ${sessionId} ended.`);
    });

    // כאשר אדמין לוחץ על Quit, משדר לכל המשתמשים לצאת
    socket.on('adminQuit', () => {
        console.log('Admin requested quit - broadcasting to all clients');
        io.emit('forceQuit'); // שולח לכל הלקוחות
    });
});

// נתיב בדיקה
app.get('/', (req, res) => {
    res.send('JaMoveo API is running');
});

// הפעלת השרת
//server.listen(5000, () => {
//    console.log('Server running on port 5000');
//});

export default app;