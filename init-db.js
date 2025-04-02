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

            CREATE TABLE IF NOT EXISTS rehearsals (
                id SERIAL PRIMARY KEY,
                admin_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS participants (
                id SERIAL PRIMARY KEY,
                rehearsal_id INTEGER REFERENCES rehearsals(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        console.log("Tables created successfully!");
    } catch (err) {
        console.error("Error creating tables:", err);
    } finally {
        pool.end();
    }
}

createTables();
