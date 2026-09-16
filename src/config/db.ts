import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  }
});

export const connectDB = async () => {
  try {
    const client = await pool.connect();
    console.log('[DATABASE] Connected successfully. ✅');
    client.release();
  } catch (error) {
    console.error('[DATABASE] Connection failed:', error);
    process.exit(1);
  }
};