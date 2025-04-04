import pool from './db.js';

async function createTables() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                password TEXT NOT NULL,
                instrument VARCHAR(50) NOT NULL,
                role VARCHAR(10) CHECK (role IN ('singer', 'player')) NOT NULL,
                type VARCHAR(10) CHECK (type IN ('admin', 'user')) NOT NULL DEFAULT 'user'
            );
        `);
    } catch (err) {
        console.error("Error creating tables:", err);
    } finally {
        pool.end();
    }
}

createTables();