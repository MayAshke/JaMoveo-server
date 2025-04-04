import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config(); 
const { Pool } = pkg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

pool.connect()
    .then(() => {
        console.log('Connected to the database successfully');
    })
    .catch((err) => {
        console.error('Error connecting to the database:', err.message);
    });

export default pool;