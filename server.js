// server.js — Chatternet backend with Postgres session auth
// Works on Render. Env needed: DATABASE_URL, SESSION_SECRET, CT_FRONTEND_ORIGIN, PGSSLMODE=require

const path = require("path");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const PgSession = require("connect-pg-simple")(session);

const app = express();

// ----- ENV / DB -----
const PORT = process.env.PORT || 10000;
const FRONT = (process.env.CT_FRONTEND_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
const useSSL = (process.env.PGSSLMODE || "").toLowerCase() === "require";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : undefined,
});

// Create users table + session table (auto) on boot
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS users_email_idx ON users (LOWER(email));
  `);
}
initDB().catch(err => console.error("DB init error:", err));

// ----- CORS / MIDDLEWARE -----
app.set("trust proxy", 1);

const corsOpt = {
  origin: function (origin, cb) {
    // allow same-origin (no origin header) and any origin listed in CT_FRONTEND_ORIGIN (comma-separated)
    if (!origin) return cb(null, true);
    if (FRONT.some(a => origin.startsWith(a))) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOpt));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true,
    }),
    name: "ct.sid",
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 3600 * 1000, // 30 days
      sameSite: "none", // for cross-site cookies (frontend on another domain)
      secure: true,     // Render uses HTTPS
    },
  })
);

// Static assets (messenger.js etc.)
app.use("/assets", express.static(path.join(__dirname, "assets"), { maxAge: "1h" }));

// ----- HELPERS -----
const pickUser = row => row && ({ id: row.id, email: row.email, displayName: row.display_name, avatar: row.avatar || null });

function requireBody(fields, body) {
  for (const f of fields) {
    if (!body || !String(body[f] || "").trim()) {
      const err = new Error(`Missing field: ${f}`);
      err.status = 400;
      throw err;
    }
  }
}

// ----- HEALTH -----
app.get("/healthz", (req, res) => res.type("text").send("ok"));
app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get("/api/db/health", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT NOW() as now");
    res.json({ ok: true, now: rows[0].now });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ----- AUTH -----

// Who am I
app.get("/api/me", async (req, res) => {
  if (!req.session.user) return res.json({ user: null });
  res.json({ user: req.session.user });
});

// Create account
app.post("/api/signup", async (req, res) => {
  try {
    requireBody(["displayName", "email", "password"], req.body);
    const displayName = String(req.body.displayName).trim();
    const email = String(req.body.email).trim().toLowerCase();
    const password = String(req.body.password);

    if (displayName.length < 2) throw Object.assign(new Error("Display name too short"), { status: 400 });
    if (!email.includes("@") || email.length < 5) throw Object.assign(new Error("Invalid email"), { status: 400 });
    if (password.length < 6) throw Object.assign(new Error("Password too short (min 6)"), { status: 400 });

    const { rows: exist } = await pool.query("SELECT id FROM users WHERE LOWER(email)=LOWER($1)", [email]);
    if (exist.length) throw Object.assign(new Error("Email already in use"), { status: 409 });

    const hash = await bcrypt.hash(password, 12);
    const avatar = `https://i.pravatar.cc/150?u=${encodeURIComponent(email)}`;

    const { rows } = await pool.query(
      "INSERT INTO users (email, password_hash, display_name, avatar) VALUES ($1,$2,$3,$4) RETURNING *",
      [email, hash, displayName, avatar]
    );

    const user = pickUser(rows[0]);
    req.session.user = user;
    res.json({ user });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "signup_failed" });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  try {
    requireBody(["email", "password"], req.body);
    const email = String(req.body.email).trim().toLowerCase();
    const password = String(req.body.password);

    const { rows } = await pool.query("SELECT * FROM users WHERE LOWER(email)=LOWER($1)", [email]);
    if (!rows.length) throw Object.assign(new Error("Invalid credentials"), { status: 401 });

    const row = rows[0];
    const ok = await bcrypt.compare(password, row.password_hash || "");
    if (!ok) throw Object.assign(new Error("Invalid credentials"), { status: 401 });

    const user = pickUser(row);
    req.session.user = user;
    res.json({ user });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "login_failed" });
  }
});

// Logout
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// ----- ROOT (small index page) -----
app.get("/", (req, res) => {
  res.type("html").send(`<!doctype html>
<html><head><meta charset="utf-8" />
<title>Chatternet backend ✓</title>
<style>body{font:16px system-ui,Arial;padding:30px}</style></head>
<body>
<h1>Chatternet backend ✓</h1>
<p>Running on <b>port ${PORT}</b>.</p>
<ul>
  <li><a href="/healthz">/healthz</a></li>
  <li><a href="/api/health">/api/health</a></li>
  <li><a href="/api/db/health">/api/db/health</a></li>
  <li><a href="/assets/messenger.js">/assets/messenger.js</a></li>
</ul>
</body></html>`);
});

// ----- START -----
app.listen(PORT, () => {
  console.log(`Chatternet backend on :${PORT}`);
  console.log("Allowed CORS origins:", FRONT.length ? FRONT.join(", ") : "(none set)");
});
