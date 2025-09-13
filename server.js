// Chatternet backend (Express + Postgres sessions)
// Drop-in replacement for server.js

const path = require("path");
const express = require("express");
const cors = require("cors");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const {
  PORT = 10000,
  DATABASE_URL,
  PGSSLMODE,
  SESSION_SECRET = "change-me",
  CT_FRONTEND_ORIGIN = ""
} = process.env;

const isProd =
  process.env.NODE_ENV === "production" || process.env.RENDER === "true";

// --- Postgres pool ---
const useSSL =
  (PGSSLMODE && PGSSLMODE.toLowerCase() === "require") || isProd;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false
});

// Make sure core tables exist
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      passhash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
}

// --- App ---
const app = express();
app.set("trust proxy", 1); // so secure cookies work behind Render proxy

// CORS (allow your site to call the API and send cookies)
const allowed = new Set(
  [CT_FRONTEND_ORIGIN, `https://${process.env.RENDER_EXTERNAL_HOSTNAME || ""}`]
    .filter(Boolean)
);
app.use(
  cors({
    origin(origin, cb) {
      // Allow exact origin in env, same-origin (no Origin), and localhost during dev
      if (!origin) return cb(null, true);
      if (allowed.has(origin)) return cb(null, true);
      if (!isProd && /^https?:\/\/localhost(:\d+)?$/.test(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true
  })
);

app.use(express.json());

// Sessions stored in Postgres (no MemoryStore warning)
app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true
    }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProd // true on Render (https)
    }
  })
);

// --- Static files ---
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use(express.static(path.join(__dirname, "public")));

// --- Helpers ---
function userSafe(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, email: row.email, created_at: row.created_at };
}

// --- Health & info ---
app.get("/ping", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get("/healthz", (_req, res) => res.type("text").send("ok"));
app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get("/api/db/health", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// --- Auth API ---
app.post("/api/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ ok: false, error: "name, email, password required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ ok: false, error: "password must be at least 6 characters" });
    }

    const exists = await pool.query("SELECT id FROM users WHERE email=$1", [email.toLowerCase()]);
    if (exists.rowCount) {
      return res.status(409).json({ ok: false, error: "email already registered" });
    }

    const hash = await bcrypt.hash(password, 10);
    const ins = await pool.query(
      "INSERT INTO users(name,email,passhash) VALUES($1,$2,$3) RETURNING id,name,email,created_at",
      [name, email.toLowerCase(), hash]
    );

    req.session.userId = ins.rows[0].id;
    res.json({ ok: true, user: userSafe(ins.rows[0]) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "email and password required" });
    }
    const q = await pool.query("SELECT * FROM users WHERE email=$1", [email.toLowerCase()]);
    if (!q.rowCount) return res.status(401).json({ ok: false, error: "invalid credentials" });

    const u = q.rows[0];
    const ok = await bcrypt.compare(password, u.passhash);
    if (!ok) return res.status(401).json({ ok: false, error: "invalid credentials" });

    req.session.userId = u.id;
    res.json({ ok: true, user: userSafe(u) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", async (req, res) => {
  try {
    const id = req.session.userId;
    if (!id) return res.json({ ok: true, user: null });
    const q = await pool.query("SELECT id,name,email,created_at FROM users WHERE id=$1", [id]);
    res.json({ ok: true, user: userSafe(q.rows[0]) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// --- Root page (simple index) ---
app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html><head><meta charset="utf-8"/><title>Chatternet backend ✓</title>
<style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;padding:26px} a{display:block;margin:6px 0}</style>
</head><body>
<h1>Chatternet backend ✓</h1>
<ul>
  <li><a href="/healthz">/healthz</a></li>
  <li><a href="/api/health">/api/health</a></li>
  <li><a href="/api/db/health">/api/db/health</a></li>
  <li><a href="/ping">/ping</a></li>
  <li><a href="/assets/messenger.js">/assets/messenger.js</a></li>
</ul>
</body></html>`);
});

// --- Start ---
ensureTables()
  .then(() => {
    app.listen(PORT, () => {
      console.log("Chatternet backend listening on", PORT);
    });
  })
  .catch((e) => {
    console.error("Failed to init tables:", e);
    process.exit(1);
  });
