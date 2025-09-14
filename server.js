// Chatternet backend (Express + Postgres sessions)
// Full drop-in server with Media + Posts endpoints

const path = require("path");
const express = require("express");
const cors = require("cors");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const compression = require("compression");
const helmet = require("helmet");

const {
  PORT = 10000,
  DATABASE_URL,
  PGSSLMODE,
  SESSION_SECRET = "change-me",
  CT_FRONTEND_ORIGIN = "",       // e.g. https://www.chatterfiends-movies.com
  ALLOWED_ORIGINS = ""           // optional, comma-separated list
} = process.env;

const isProd =
  process.env.NODE_ENV === "production" || process.env.RENDER === "true";

// ---------- Postgres ----------
const useSSL =
  (PGSSLMODE && PGSSLMODE.toLowerCase() === "require") || isProd;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false
});

// Create minimal tables we need
async function ensureTables() {
  // users
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      passhash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  // images (dev-friendly: we store a URL; can be data:… or https://…)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS images (
      id BIGSERIAL PRIMARY KEY,
      url TEXT NOT NULL,
      kind TEXT DEFAULT 'image',
      created_at TIMESTAMPTZ DEFAULT now(),
      created_by TEXT
    );
  `);

  // posts (used by Media “Post to Feed”)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT,
      media_url TEXT,
      author_name TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
}

// ---------- App ----------
const app = express();
app.set("trust proxy", 1);

// security + perf
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(compression());

// JSON body (bigger limit for data: images from the Media page)
app.use(express.json({ limit: "15mb" }));

// ---------- CORS (with credentials) ----------
const allowedSet = new Set(
  [
    CT_FRONTEND_ORIGIN.trim(),
    ...ALLOWED_ORIGINS.split(",").map(s => s.trim()).filter(Boolean),
    // Render "same app" host (optional)
    process.env.RENDER_EXTERNAL_HOSTNAME
      ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
      : ""
  ].filter(Boolean)
);

app.use(
  cors({
    origin(origin, cb) {
      // Same-origin (no Origin header) → allow
      if (!origin) return cb(null, true);
      // Exact matches in env
      if (allowedSet.has(origin)) return cb(null, true);
      // Local dev convenience
      if (!isProd && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
        return cb(null, true);
      }
      return cb(null, false);
    },
    credentials: true
  })
);

// ---------- Sessions (Postgres store) ----------
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
      secure: true,        // Render is HTTPS → always true
      sameSite: "none"     // required for cross-site XHR with credentials
    }
  })
);

// ---------- Static ----------
app.use("/assets", express.static(path.join(__dirname, "assets"), {
  maxAge: "7d",
  immutable: true
}));
app.use(express.static(path.join(__dirname, "public")));

// ---------- Helpers ----------
const userSafe = (row) =>
  row ? { id: row.id, name: row.name, email: row.email, created_at: row.created_at } : null;

const nowISO = () => new Date().toISOString();

// ---------- Health ----------
app.get("/ping", (_req, res) => res.json({ ok: true, time: nowISO() }));
app.get("/healthz", (_req, res) => res.type("text").send("ok"));
app.get("/api/health", (_req, res) => res.json({ ok: true, time: nowISO() }));
app.get("/api/db/health", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ---------- Auth ----------
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

// ---------- Media: images & posts ----------
// NOTE: For production, replace this with real storage (S3/Cloudflare Images).
// Here we simply keep the URL (data:… or https:…) and return JSON.

app.post("/api/images", async (req, res) => {
  try {
    const { kind = "image", data } = req.body || {};
    if (!data) return res.status(400).json({ ok: false, error: "missing image data/url" });

    const by = req.session.userId ? `user:${req.session.userId}` : "anonymous";
    const ins = await pool.query(
      "INSERT INTO images(url,kind,created_by) VALUES($1,$2,$3) RETURNING id,url,kind,created_at,created_by",
      [String(data), String(kind || "image"), by]
    );
    res.json({ ok: true, url: ins.rows[0].url, image: ins.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.post("/api/posts", async (req, res) => {
  try {
    const { title = "Media", content = "", media = "", authorName = "Me" } = req.body || {};
    const ins = await pool.query(
      "INSERT INTO posts(title,content,media_url,author_name) VALUES($1,$2,$3,$4) RETURNING *",
      [String(title), String(content), String(media), String(authorName)]
    );
    res.json({ ok: true, post: ins.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Optional helpers to inspect data (safe to keep)
app.get("/api/posts", async (_req, res) => {
  const q = await pool.query("SELECT * FROM posts ORDER BY id DESC LIMIT 100");
  res.json({ ok: true, posts: q.rows });
});
app.get("/api/images", async (_req, res) => {
  const q = await pool.query("SELECT * FROM images ORDER BY id DESC LIMIT 100");
  res.json({ ok: true, images: q.rows });
});

// ---------- Root ----------
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
  <li><a href="/api/images">/api/images</a></li>
  <li><a href="/api/posts">/api/posts</a></li>
  <li><a href="/assets/messenger.js">/assets/messenger.js</a></li>
</ul>
</body></html>`);
});

// 404 JSON for /api/*
app.use("/api", (_req, res) => res.status(404).json({ ok: false, error: "not_found" }));

// ---------- Start ----------
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
