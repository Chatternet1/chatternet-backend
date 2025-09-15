// Chatternet backend (Express + Postgres sessions)
// Full server with Users + Presence + Messages + Media + Posts + Events + Overlay assets

const path = require("path");
const express = require("express");
const cors = require("cors");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const compression = require("compression");
const helmet = require("helmet");
const crypto = require("crypto");

const {
  PORT = 10000,
  DATABASE_URL,
  PGSSLMODE,
  SESSION_SECRET = "change-me",

  // VERY IMPORTANT: must be your real site origin (no trailing slash)
  // e.g. https://www.chatterfiends-movies.com
  CT_FRONTEND_ORIGIN = "",
  // optionally allow multiple editors/preview domains, comma separated
  ALLOWED_ORIGINS = ""
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

// Create / evolve tables we need
async function ensureTables() {
  // users
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      passhash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      last_seen TIMESTAMPTZ
    );
  `);
  // (in case this runs against an older schema)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;`);

  // images (dev-friendly: we store URL only)
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

  // messages (DMs)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id BIGSERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_messages_pair_time
    ON messages (LEAST(sender_id,recipient_id), GREATEST(sender_id,recipient_id), created_at DESC);
  `);

  // events (store your event JSON as-is, keyed by client id)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
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
    ...ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    // Render "same app" host (optional)
    process.env.RENDER_EXTERNAL_HOSTNAME
      ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
      : ""
  ].filter(Boolean)
);

app.use(
  cors({
    origin(origin, cb) {
      // allow same-origin (no Origin header) and exact allowed origins
      if (!origin) return cb(null, true);
      if (allowedSet.has(origin)) return cb(null, true);
      if (!isProd && /^https?:\/\/localhost(?::\d+)?$/.test(origin)) return cb(null, true);
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
      secure: true,        // Render serves HTTPS
      sameSite: "none"     // needed for cross-site XHR with credentials
    }
  })
);

// ---------- Static ----------
app.use(
  "/assets",
  express.static(path.join(__dirname, "assets"), {
    maxAge: "7d",
    immutable: true
  })
);
app.use(express.static(path.join(__dirname, "public")));

// ---------- Helpers ----------
const userSafe = (row) =>
  row
    ? {
        id: row.id,
        name: row.name,
        email: row.email,
        created_at: row.created_at,
        last_seen: row.last_seen || null
      }
    : null;

const nowISO = () => new Date().toISOString();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ ok: false, error: "unauthorized" });
  next();
}

function pravatarFor(name, email) {
  const u = email || name || "user";
  return `https://i.pravatar.cc/120?u=${encodeURIComponent(u)}`;
}

function slugish(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "user";
}

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

// ---------- Auth (email+password; unchanged) ----------
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
      "INSERT INTO users(name,email,passhash,last_seen) VALUES($1,$2,$3,now()) RETURNING id,name,email,created_at,last_seen",
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
    await pool.query("UPDATE users SET last_seen=now() WHERE id=$1", [u.id]);
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
    const q = await pool.query("SELECT id,name,email,created_at,last_seen FROM users WHERE id=$1", [id]);
    res.json({ ok: true, user: userSafe(q.rows[0]) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ---------- Anonymous / quick join (optional) ----------
app.post("/api/anon-login", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim().slice(0, 60);
    if (!name) return res.status(400).json({ ok: false, error: "name required" });

    // synth email so row passes constraints, stays unique
    const email = (req.body?.email || "").trim().toLowerCase()
      || `${slugish(name)}-${crypto.randomBytes(3).toString("hex")}@anon.local`;
    const passhash = await bcrypt.hash(crypto.randomBytes(10).toString("hex"), 8);

    let userRow;
    const exists = await pool.query("SELECT id,name,email,last_seen FROM users WHERE email=$1", [email]);
    if (exists.rowCount) {
      userRow = exists.rows[0];
      await pool.query("UPDATE users SET name=$1,last_seen=now() WHERE id=$2", [name, userRow.id]);
    } else {
      const ins = await pool.query(
        "INSERT INTO users(name,email,passhash,last_seen) VALUES($1,$2,$3,now()) RETURNING id,name,email,last_seen,created_at",
        [name, email, passhash]
      );
      userRow = ins.rows[0];
    }

    req.session.userId = userRow.id;
    res.json({ ok: true, user: userSafe(userRow) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ---------- Presence ----------
app.post("/api/presence/ping", requireAuth, async (req, res) => {
  try {
    await pool.query("UPDATE users SET last_seen=now() WHERE id=$1", [req.session.userId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Directory
app.get("/api/users", requireAuth, async (_req, res) => {
  try {
    const q = await pool.query("SELECT id,name,email,last_seen FROM users ORDER BY name ASC LIMIT 500");
    const now = Date.now();
    const list = q.rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      avatar: pravatarFor(u.name, u.email),
      online: u.last_seen ? (now - new Date(u.last_seen).getTime()) < 15000 : false
    }));
    res.json({ ok: true, users: list });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ---------- Messages ----------
async function findUserByIdOrName(idOrName) {
  if (!idOrName) return null;
  if (/^\d+$/.test(String(idOrName))) {
    const q = await pool.query("SELECT id,name,email FROM users WHERE id=$1", [Number(idOrName)]);
    return q.rowCount ? q.rows[0] : null;
  }
  const q = await pool.query(
    "SELECT id,name,email FROM users WHERE name=$1 ORDER BY id ASC LIMIT 1",
    [String(idOrName)]
  );
  return q.rowCount ? q.rows[0] : null;
}

// GET /api/messages?with=ID_OR_NAME
app.get("/api/messages", requireAuth, async (req, res) => {
  try {
    const me = req.session.userId;
    const withParam = String(req.query.with || "").trim();
    if (!withParam) return res.status(400).json({ ok: false, error: "with required" });

    const other = await findUserByIdOrName(withParam);
    if (!other) return res.status(404).json({ ok: false, error: "user_not_found" });

    const q = await pool.query(
      `SELECT m.id, m.text, m.created_at, s.name AS from_name, r.name AS to_name, s.id AS from_id, r.id AS to_id
       FROM messages m
       JOIN users s ON s.id=m.sender_id
       JOIN users r ON r.id=m.recipient_id
       WHERE (m.sender_id=$1 AND m.recipient_id=$2) OR (m.sender_id=$2 AND m.recipient_id=$1)
       ORDER BY m.id ASC
       LIMIT 500`,
      [me, other.id]
    );
    res.json({
      ok: true,
      with: { id: other.id, name: other.name },
      items: q.rows.map((r) => ({
        id: r.id,
        from: { id: r.from_id, name: r.from_name },
        to: { id: r.to_id, name: r.to_name },
        text: r.text,
        createdAt: r.created_at
      }))
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// POST /api/messages { to: ID_OR_NAME, text }
app.post("/api/messages", requireAuth, async (req, res) => {
  try {
    const me = req.session.userId;
    const toParam = String(req.body?.to || "").trim();
    const text = String(req.body?.text || "").trim();
    if (!toParam || !text) return res.status(400).json({ ok: false, error: "to and text required" });

    const other = await findUserByIdOrName(toParam);
    if (!other) return res.status(404).json({ ok: false, error: "recipient_not_found" });

    const ins = await pool.query(
      "INSERT INTO messages(sender_id,recipient_id,text) VALUES($1,$2,$3) RETURNING id,created_at",
      [me, other.id, text]
    );
    res.json({
      ok: true,
      item: {
        id: ins.rows[0].id,
        from: { id: me },
        to: { id: other.id },
        text,
        createdAt: ins.rows[0].created_at
      }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ---------- Media: images & posts (unchanged) ----------
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

app.get("/api/posts", async (_req, res) => {
  const q = await pool.query("SELECT * FROM posts ORDER BY id DESC LIMIT 100");
  res.json({ ok: true, posts: q.rows });
});
app.get("/api/images", async (_req, res) => {
  const q = await pool.query("SELECT * FROM images ORDER BY id DESC LIMIT 100");
  res.json({ ok: true, images: q.rows });
});

// ---------- Events (DB-backed; used by your frontend calling /events) ----------
app.get("/events", async (_req, res) => {
  const q = await pool.query(`SELECT data FROM events ORDER BY created_at DESC LIMIT 1000`);
  res.json(q.rows.map((r) => r.data));
});

app.post("/events", async (req, res) => {
  const data = req.body || {};
  const id = String(data.id || "").trim();
  if (!id) return res.status(400).json({ ok: false, error: "id required" });
  await pool.query(
    `INSERT INTO events(id,data) VALUES($1,$2)
     ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data, created_at=now()`,
    [id, data]
  );
  res.json(data);
});

app.put("/events/:id", async (req, res) => {
  await pool.query(`UPDATE events SET data=$1 WHERE id=$2`, [req.body || {}, String(req.params.id)]);
  res.json(req.body || {});
});

app.delete("/events/:id", async (req, res) => {
  await pool.query(`DELETE FROM events WHERE id=$1`, [String(req.params.id)]);
  res.json({ ok: true });
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
  <li><a href="/api/users">/api/users</a> (requires login)</li>
  <li><a href="/api/messages?with=1">/api/messages?with=1</a> (requires login)</li>
  <li><a href="/api/images">/api/images</a></li>
  <li><a href="/api/posts">/api/posts</a></li>
  <li><a href="/events">/events</a></li>
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
      if (!CT_FRONTEND_ORIGIN) {
        console.warn("[WARN] CT_FRONTEND_ORIGIN is not set. Cross-site cookies will be rejected by CORS.");
      } else {
        console.log("Allowing origin:", CT_FRONTEND_ORIGIN);
      }
    });
  })
  .catch((e) => {
    console.error("Failed to init tables:", e);
    process.exit(1);
  });
