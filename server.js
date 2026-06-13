import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import pg from 'pg';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '50mb' }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const distPath = path.join(__dirname, 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
}

app.get('/api/:key', async (req, res) => {
  try {
    const result = await pool.query('SELECT data FROM waqf_store WHERE key = $1', [req.params.key]);
    res.json(result.rows[0]?.data ?? []);
  } catch (e) {
    console.error('GET error:', e.message);
    res.status(500).json({ error: String(e) });
  }
});

app.post('/api/:key', async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO waqf_store (key, data) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data`,
      [req.params.key, JSON.stringify(req.body)]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('POST error:', e.message);
    res.status(500).json({ error: String(e) });
  }
});

app.delete('/api/reset', async (req, res) => {
  try {
    await pool.query('DELETE FROM waqf_store');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

if (existsSync(distPath)) {
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

async function main() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS waqf_store (
        key TEXT PRIMARY KEY,
        data JSONB NOT NULL DEFAULT '[]'::jsonb
      )
    `);
    console.log('✅ Database table ready');
  } catch (e) {
    console.error('❌ Database init failed:', e.message);
  }

  const PORT = Number(process.env.PORT) || 3001;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API server running on port ${PORT}`);
  });
}

main().catch(console.error);
