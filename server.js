import fs from 'fs';
import path from 'path';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './db.js'; 
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';

dotenv.config(); 
const PORT = process.env.PORT || 3000; 
const app = express();
const server = http.createServer(app); 
const io = new Server(server, {  
    cors: {
        origin: '*', 
        methods: ['GET', 'POST']
    }
});
app.use(cors());
app.use(express.json());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let currentSong = null; 

const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1]; 
    if (!token) return res.status(401).json({ error: 'Token is required' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' });
        req.user = user; 
        next();
    });
};

app.get('/api/endpoint', (req, res) => {
    res.json({ message: "Success" });
});

app.post('/signup', async (req, res) => {
    const { username, password, instrument, role, type = 'user' } = req.body;

    try {
        const userCheck = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        const result = await pool.query(
            'INSERT INTO users (username, password, instrument, role, type) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, instrument, role, type',
            [username, password, instrument, role, type]
        );

        res.json(result.rows[0]);  

    } catch (err) {
        console.error('Error creating user:', err);

        if (err.code === '23505') { 
            console.error('Duplicate username error:', err.detail);
            return res.status(400).json({ error: 'Username already exists' });
        }

        res.status(500).json({ error: 'Error creating user, please try again later' });
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) return res.status(401).json({ error: "User not found" });

        const user = result.rows[0];
        const isMatch = password === user.password;
        if (!isMatch) return res.status(401).json({ error: "Invalid password" });

        res.json({ user: { id: user.id, username: user.username, instrument: user.instrument, role: user.role, type: user.type } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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

app.get('/song/:name', (req, res) => {
    const { name } = req.params;
    const songFilePath = path.join(__dirname, 'data-songs', `${name}.json`);

    fs.readFile(songFilePath, 'utf8', (err, data) => {
        if (err) {
            return res.status(404).json({ error: err });
        }

        try {
            const songData = JSON.parse(data);
            res.json(songData); 
        } catch (parseError) {
            return res.status(500).json({ error: 'Error parsing song data' });
        }
    });
});

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
                const songTitle = path.basename(file, '.json');

                if (Array.isArray(songData)) {
                    songData.forEach(song => {
                        if (!songs.some(existingSong => existingSong.title === songTitle && existingSong.chords === song.chords)) {
                            songs.push({ title: songTitle, ...song });
                        }
                    });
                } else {
                    if (!songs.some(existingSong => existingSong.title === songTitle && existingSong.chords === songData.chords)) {
                        songs.push({ title: songTitle, ...songData });
                    }
                }
            }
        });
        res.json(songs);
    });
});

io.on('connection', (socket) => {
    if (currentSong) {
        socket.emit('currentSong', { song: currentSong });
    }

    socket.on('getCurrentSong', () => {
        if (currentSong) {
            socket.emit('currentSong', { song: currentSong });
        }
    });

    socket.on('joinSession', (sessionId) => {
        socket.join(sessionId);  
    });

    socket.on('songSelected', ({ sessionId, song }) => {
        currentSong = song;
        io.to(sessionId).emit('changeStatus', { sessionId, status: "Live", song: currentSong });
        io.emit('songSelected', { song: currentSong }); 
    });

    socket.on('endSession', (sessionId) => {
        io.to(sessionId).emit('changeStatus');
    });

    socket.on('adminQuit', () => {
        io.emit('forceQuit'); 
    });
});

server.listen(PORT, () => {
});

export default app;