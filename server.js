// server.js
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();

// Simple request log
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// CORS (allow all by default; restrict with ALLOW_ORIGINS="https://site1.com,https://site2.com")
const allowed = process.env.ALLOW_ORIGINS ? process.env.ALLOW_ORIGINS.split(',') : ['*'];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowed.includes('*') || allowed.includes(origin)) return cb(null, true);
    return cb(new Error('CORS blocked'));
  }
}));

app.use(express.json({ limit: '2mb' }));

// Health check
app.get('/ping', (req, res) => {
  res.json({ ok: true, app: 'chatternet-backend', time: Date.now() });
});

// Serve static files from /public (overlay at /assets/messenger.js)
const ONE_HOUR = 60 * 60;
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    if (/\.(js|css|png|jpe?g|gif|webp|svg)$/i.test(filePath)) {
      res.setHeader('Cache-Control', `public, max-age=${ONE_HOUR}`);
    }
  }
}));

// Root
app.get('/', (req, res) => res.type('text/plain').send('chatternet-backend OK'));

// 404 for unknown routes (non-static)
app.use((req, res) => {
  if (req.method === 'GET') return res.status(404).type('text/plain').send('Not found');
  res.status(404).json({ ok: false, error: 'Not found' });
});

// Start
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Chatternet backend running on :${PORT}`));
