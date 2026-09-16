import { Pool } from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Create a connection pool
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432', 10),
});

// Function to test the connection
export const connectDB = async () => {
  try {
    const client = await pool.connect();
    console.log('[DATABASE] Connected to PostgreSQL (sm360_db) successfully! 🌍');
    client.release(); // Release the client back to the pool
  } catch (error) {
    console.error('[DATABASE] Connection failed:', error);
    process.exit(1); // Stop the server if database connection fails
  }
};

export default pool;