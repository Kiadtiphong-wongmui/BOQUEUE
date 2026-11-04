import express, { type Express, type Request, type Response } from 'express';
import mysql from 'mysql2/promise';

const app: Express = express();
const port = Number(process.env.PORT ?? 3000);

export const pool = mysql.createPool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
});

app.get('/', (req: Request, res: Response) => {
  res.send('Hello World!');
});

app.get('/health', async (req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'unreachable' });
  }
});

app.listen(port, () => console.log(`Server listening on port ${port}`));
