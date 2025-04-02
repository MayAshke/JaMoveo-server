import pool from './db.js';

async function testDB() {
    try {
        const res = await pool.query('SELECT NOW()');
        console.log('Database connected:', res.rows[0]);
    } catch (err) {
        console.error('Database connection error:', err);
    }
}

testDB();