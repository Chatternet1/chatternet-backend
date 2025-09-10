const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// simple health check
app.get('/ping', (req, res) => res.json({ ok: true, time: Date.now() }));

// serve /public if you add it later (e.g., /public/assets/messenger.js)
app.use(express.static(path.join(__dirname, 'public')));

// fallback
app.get('/', (req, res) => res.type('text/plain').send('chatternet-backend OK'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server started on http://localhost:${PORT}`));
