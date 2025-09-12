/* --- Hard guard against blank page --- */
(function () {
  const show = (msg) => {
    const o = document.getElementById('errOv');
    const t = document.getElementById('errText');
    if (!o || !t) return;
    t.textContent = String(msg || 'Unknown');
    o.style.display = 'flex';
  };
  window.addEventListener('error', (e) =>
    show(e.error ? (e.error.stack || e.error.message || e.message) : e.message)
  );
  window.addEventListener('unhandledrejection', (e) =>
    show(e.reason && (e.reason.stack || e.reason.message || String(e.reason)))
  );
})();

/* ===== Core keys & helpers (match your stack) ===== */
const LS = {
  USERS: 'ct_users_v3',
  PROFILE: 'ct_profile_data_v1',
  ROLES: 'ct_roles_v1',
  BLOCK: 'ct_blocked_users_v1',
  NOTIF: 'ct_notifications_v1',
  INBOX: 'ct_inbox_v1',
  PRIV: 'ct_privacy_prefs_v1',
  NOTIFP: 'ct_notify_prefs_v1',
  DATING: 'ct_dating_posts_v2',
  GLOBAL: 'ct_global_feed_v1',
  ARCHIVE: 'ct_removed_content_v1',
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const load = (k, f) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : f;
  } catch {
    return f;
  }
};
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const nowISO = () => new Date().toISOString();
const uid = (p = 'id') =>
  p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
const esc = (s) =>
  String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
const face = (n) => `https://i.pravatar.cc/100?u=${encodeURIComponent(n || 'me')}`;
function addNotif(t) {
  const a = load(LS.NOTIF, []);
  a.unshift({ id: uid('n'), text: t, time: nowISO() });
  save(LS.NOTIF, a);
}
function addInbox(t) {
  const a = load(LS.INBOX, []);
  a.unshift({ id: uid('m'), text: t, time: nowISO() });
  save(LS.INBOX, a);
}

/* ===== Seed users if missing ===== */
const DEMO = [
  'Grace Lee',
  'Liam Adams',
  'Ava Morgan',
  'Noah Walker',
  'Sophia Turner',
  'Mason Hill',
  'Emma Davis',
  'Ethan Brooks',
  'Olivia Perez',
  'Logan Price',
  'Mia Carter',
  'Lucas Reed',
  'Chloe Evans',
  'Henry Scott',
  'Amelia Ross',
  'Elijah Gray',
  'Isabella Wood',
  'James Hall',
  'Luna Kelly',
  'Benjamin Ward',
  'Aria King',
  'Michael Reed',
  'Kate White',
  'Bill Thomas',
];

(function seed() {
  let users = load(LS.USERS, null);
  if (!users || !Array.isArray(users) || users.length < 1) {
    users = [{ name: 'Me', avatar: face('Me') }];
    DEMO.forEach((n) => users.push({ name: n, avatar: face(n) }));
    save(LS.USERS, users);
  }
  // Bootstrap admin if none
  const roles = load(LS.ROLES, {});
  if (!Object.values(roles).includes('admin')) {
    roles['Me'] = 'admin';
    save(LS.ROLES, roles);
  }
})();

/* ===== Header & modals ===== */
(function header() {
  const meImg = $('#meAvatar');
  if (meImg) {
    meImg.src = (load(LS.PROFILE, {}))['Me']?.avatar || face('Me');
    meImg.onclick = () => {
      try {
        localStorage.setItem('ct_profile_view_v1', JSON.stringify({ name: 'Me' }));
      } catch {}
      location.href = 'profile.html';
    };
  }

  // Messages overlay bubble or fallback
  $('#btnMsgs')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (window.ctOpen) ctOpen();
    else location.href = 'messages.html';
  });

  // Notifications modal
  const nbg = $('#notifBg'),
    nlist = $('#notifList');
  function rN() {
    const arr = load(LS.NOTIF, []);
    nlist.innerHTML = arr.length
      ? arr
          .map(
            (n) =>
              `<div class="item"><div class="title">${new Date(n.time).toLocaleString()}</div><div>${esc(
                n.text
              )}</div></div>`
          )
          .join('')
      : '<div class="muted">No notifications.</div>';
  }
  $('#btnNotif')?.addEventListener('click', () => {
    rN();
    if (nbg) nbg.style.display = 'flex';
  });
  $('#clearNotif')?.addEventListener('click', () => {
    save(LS.NOTIF, []);
    rN();
  });
  $('#closeNotif')?.addEventListener('click', () => {
    if (nbg) nbg.style.display = 'none';
  });

  // Inbox modal
  const ibg = $('#inboxBg'),
    ilist = $('#inboxList');
  function rI() {
    const arr = load(LS.INBOX, []);
    ilist.innerHTML = arr.length
      ? arr
          .map(
            (n) =>
              `<div class="item"><div class="title">${new Date(n.time).toLocaleString()}</div><div>${esc(
                n.text
              )}</div></div>`
          )
          .join('')
      : '<div class="muted">Inbox empty.</div>';
  }
  $('#btnInbox')?.addEventListener('click', () => {
    rI();
    if (ibg) ibg.style.display = 'flex';
  });
  $('#closeInbox')?.addEventListener('click', () => {
    if (ibg) ibg.style.display = 'none';
  });
})();

/* ===== Permission gate ===== */
function myRole() {
  return load(LS.ROLES, {})['Me'] || 'user';
}
function ensureAdmin() {
  if (myRole() !== 'admin') {
    const g = $('#guard'),
      a = $('#app');
    if (g) g.style.display = 'block';
    if (a) a.style.display = 'none';
    return false;
  }
  return true;
}

/* ===== Tabs ===== */
$('#tabs')?.addEventListener('click', (e) => {
  const t = e.target.closest('.tab');
  if (!t) return;
  $$('.tab').forEach((x) => x.classList.toggle('active', x === t));
  $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'p-' + t.dataset.tab));
});

/* ===== Users tab ===== */
function users() {
  return load(LS.USERS, []);
}
function roles() {
  return load(LS.ROLES, {});
}
function setRole(name, role) {
  const r = roles();
  r[name] = role;
  save(LS.ROLES, r);
}
function blocked() {
  return new Set(load(LS.BLOCK, []));
}
function toggleBlock(name) {
  const s = blocked();
  s.has(name) ? s.delete(name) : s.add(name);
  save(LS.BLOCK, Array.from(s));
}

function renderUsers() {
  const list = $('#uList');
  if (!list) return;
  list.innerHTML = '';
  const q = ($('#uSearch')?.value || '').toLowerCase();
  const rs = roles();
  const bl = blocked();
  const all = users().filter((u) => !q || String(u.name).toLowerCase().includes(q));
  const uc = $('#uCount');
  if (uc) uc.textContent = `${all.length} users`;

  all.forEach((u) => {
    const row = document.createElement('div');
    row.className = 'item';
    row.innerHTML = `
      <img class="ava" src="${esc(u.avatar || face(u.name))}">
      <div style="flex:1;min-width:0">
        <div class="title">${esc(u.name)} ${u.name === 'Me' ? '<span class="pill">You</span>' : ''}</div>
        <div class="meta">Role: 
          <select data-role style="width:auto">
            <option value="user">User</option>
            <option value="mod">Moderator</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>
      <div class="row" style="flex:0 0 auto;gap:6px">
        <button class="btn" data-profile>Profile</button>
        <button class="btn" data-msg>Message</button>
        <button class="btn" data-block>${bl.has(u.name) ? 'Unblock' : 'Block'}</button>
      </div>`;
    row.querySelector('[data-role]').value = rs[u.name] || 'user';
    row.querySelector('[data-role]').onchange = (e) => {
      setRole(u.name, e.target.value);
      addNotif(`Role for ${u.name} set to ${e.target.value}`);
    };
    row.querySelector('[data-profile]').onclick = () => {
      try {
        localStorage.setItem('ct_profile_view_v1', JSON.stringify({ name: u.name }));
      } catch {}
      location.href = 'profile.html';
    };
    row.querySelector('[data-msg]').onclick = () => {
      if (window.ctMessage) ctMessage(u.name);
      else location.href = 'messages.html';
    };
    row.querySelector('[data-block]').onclick = () => {
      toggleBlock(u.name);
      renderUsers();
    };
    list.appendChild(row);
  });
}
$('#uSearch')?.addEventListener('input', renderUsers);
$('#uAdd')?.addEventListener('click', () => {
  const bg = $('#addUserBg');
  if (bg) bg.style.display = 'flex';
});
$('#addUserClose')?.addEventListener('click', () => {
  const bg = $('#addUserBg');
  if (bg) bg.style.display = 'none';
});
$('#addUserGo')?.addEventListener('click', () => {
  const name = ($('#addUserName')?.value || '').trim();
  if (!name) return alert('Enter a name');
  const avatar = ($('#addUserAvatar')?.value || '').trim() || face(name);
  const all = users();
  if (all.find((u) => u.name === name)) return alert('User exists');
  all.push({ name, avatar });
  save(LS.USERS, all);
  const bg = $('#addUserBg');
  if ($('#addUserName')) $('#addUserName').value = '';
  if ($('#addUserAvatar')) $('#addUserAvatar').value = '';
  if (bg) bg.style.display = 'none';
  addNotif(`Admin added user: ${name}`);
  renderUsers();
});

/* ===== Content tab ===== */
function ensureShape(p) {
  return {
    id: p.id || uid('post'),
    title: p.title || '',
    content: p.content || p.text || p.body || '',
    authorName: p.authorName || p.author || p.name || 'Me',
    createdAt: p.createdAt || p.time || p.date || nowISO(),
    media: p.media || null,
    _raw: p,
  };
}

// Finds arrays in localStorage that look like posts
function scanContent() {
  const out = [];
  // Dating posts (known)
  const dating = (load(LS.DATING, []) || []).map((x) => ({
    ...ensureShape(x),
    _type: 'dating',
    _key: LS.DATING,
  }));
  out.push(...dating);
  // Global feed (known)
  const global = (load(LS.GLOBAL, []) || []).map((x) => ({
    ...ensureShape(x),
    _type: 'global',
    _key: LS.GLOBAL,
  }));
  out.push(...global);
  // Unknown arrays: best-effort parse
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (
      !k ||
      [LS.DATING, LS.GLOBAL, LS.NOTIF, LS.INBOX, LS.PROFILE, LS.USERS, LS.ROLES, LS.BLOCK, LS.PRIV, LS.NOTIFP, LS.ARCHIVE].includes(
        k
      )
    )
      continue;
    try {
      const v = JSON.parse(localStorage.getItem(k));
      if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
        const normalized = v.map((o) => ({
          ...ensureShape(o),
          _type: 'unknown',
          _key: k,
        }));
        if (normalized.some((n) => n.title || n.content)) out.push(...normalized);
      }
    } catch (e) {}
  }
  return out;
}
function archiveList() {
  return load(LS.ARCHIVE, []);
}
function setArchive(arr) {
  save(LS.ARCHIVE, arr);
}
function removeFromKey(key, id) {
  const arr = load(key, []);
  const idx = arr.findIndex((x) => (x.id || '') === id);
  if (idx > -1) {
    const [del] = arr.splice(idx, 1);
    save(key, arr);
    const ar = archiveList();
    ar.unshift({ deletedAt: nowISO(), key, item: del });
    setArchive(ar);
  }
}
function hideInKey(key, id, setHidden) {
  const arr = load(key, []);
  const idx = arr.findIndex((x) => (x.id || '') === id);
  if (idx > -1) {
    arr[idx].hidden = setHidden;
    save(key, arr);
  }
}
function shareToGlobal(item) {
  const g = load(LS.GLOBAL, []);
  const id = item.id || uid('g');
  if (!g.find((p) => p.id === id)) {
    g.unshift({
      id,
      title: item.title || '',
      content: item.content || '',
      authorName: item.authorName || 'Me',
      createdAt: item.createdAt || nowISO(),
      media: item.media || null,
      tags: [],
    });
    save(LS.GLOBAL, g);
  }
}

function renderContent() {
  const type = $('#cType')?.value || 'all';
  const q = ($('#cSearch')?.value || '').toLowerCase();
  const arc = archiveList().map((a) => ({
    ...ensureShape(a.item || {}),
    _type: 'archive',
    _key: a.key || 'unknown',
    _deletedAt: a.deletedAt,
  }));
  let items = type === 'archive' ? arc : scanContent().filter((x) => type === 'all' || x._type === type);
  items = items.filter(
    (x) =>
      !q ||
      String(x.title).toLowerCase().includes(q) ||
      String(x.content).toLowerCase().includes(q) ||
      String(x.authorName).toLowerCase().includes(q)
  );

  const cc = $('#cCount');
  if (cc) cc.textContent = `${items.length} items`;

  const box = $('#cList');
  if (!box) return;
  box.innerHTML = '';
  if (!items.length) {
    box.innerHTML = '<div class="muted">No content found.</div>';
    return;
  }

  items
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .forEach((p) => {
      const row = document.createElement('div');
      row.className = 'item';
      const prof = load(LS.PROFILE, {});
      const ava = (prof[p.authorName] && prof[p.authorName].avatar) || face(p.authorName);
      row.innerHTML = `
        <img class="ava" src="${esc(ava)}">
        <div style="flex:1;min-width:0">
          <div class="title">${esc(p.title || '(no title)')}</div>
          <div class="meta">${esc(p.authorName)} • ${new Date(p.createdAt).toLocaleString()} • <span class="${
        p._type === 'archive' ? 'bad' : 'muted'
      }">${p._type}</span> ${p._raw?.hidden ? '<span class="pill warn">hidden</span>' : ''}</div>
          <div style="margin-top:6px">${esc((p.content || '').slice(0, 220))}${(p.content || '').length > 220 ? '…' : ''}</div>
        </div>
        <div class="row" style="flex:0 0 auto;gap:6px">
          <button class="btn" data-profile="${esc(p.authorName)}">Profile</button>
          ${
            p._type !== 'archive'
              ? `<button class="btn" data-hide="${p.id}" data-key="${p._key}">${p._raw?.hidden ? 'Unhide' : 'Hide'}</button>
                 <button class="btn primary" data-share="${p.id}">Share → Feed</button>
                 <button class="btn bad" data-del="${p.id}" data-key="${p._key}">Delete</button>`
              : `<button class="btn" disabled title="Restore not implemented yet">Restore (coming)</button>`
          }
        </div>`;

      row.querySelector('[data-profile]')?.addEventListener('click', (e) => {
        const name = e.currentTarget.getAttribute('data-profile');
        try {
          localStorage.setItem('ct_profile_view_v1', JSON.stringify({ name }));
        } catch {}
        location.href = 'profile.html';
      });
      row.querySelector('[data-share]')?.addEventListener('click', () => {
        shareToGlobal(p);
        addNotif(`Shared to Feed: ${p.title || '(untitled)'}`);
        alert('Shared to Global Feed');
      });
      row.querySelector('[data-del]')?.addEventListener('click', (e) => {
        const key = e.currentTarget.getAttribute('data-key');
        if (!confirm('Delete this item? It will move to Archive.')) return;
        removeFromKey(key, p.id);
        renderContent();
      });
      row.querySelector('[data-hide]')?.addEventListener('click', (e) => {
        const key = e.currentTarget.getAttribute('data-key');
        hideInKey(key, p.id, !p._raw?.hidden);
        renderContent();
      });
      box.appendChild(row);
    });
}
$('#cType')?.addEventListener('change', renderContent);
$('#cSearch')?.addEventListener('input', renderContent);

/* ===== Broadcast ===== */
$('#bSend')?.addEventListener('click', () => {
  const title = ($('#bTitle')?.value || '').trim();
  const body = ($('#bBody')?.value || '').trim();
  if (!title && !body) return alert('Write something');
  const msg = title ? `${title} — ${body}` : body;
  addNotif(`[ADMIN] ${msg}`);
  addInbox(`[ADMIN] ${msg}`);
  const st = $('#bStatus');
  if (st) st.textContent = 'Sent';
});

/* ===== Tools ===== */
$('#tExport')?.addEventListener('click', () => {
  const dump = {
    users: load(LS.USERS, []),
    roles: load(LS.ROLES, {}),
    blocked: load(LS.BLOCK, []),
    profile: load(LS.PROFILE, {}),
    privacy: load(LS.PRIV, {}),
    notifyPrefs: load(LS.NOTIFP, {}),
    notifications: load(LS.NOTIF, []),
    inbox: load(LS.INBOX, []),
    dating: load(LS.DATING, []),
    global: load(LS.GLOBAL, []),
    archive: load(LS.ARCHIVE, []),
  };
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'chatternet-admin-export.json';
  a.click();
});

$('#tRebuild')?.addEventListener('click', () => {
  if (!confirm('Re-seed demo users?')) return;
  const u = [{ name: 'Me', avatar: face('Me') }];
  DEMO.forEach((n) => u.push({ name: n, avatar: face(n) }));
  save(LS.USERS, u);
  addNotif('Demo users re-seeded.');
  renderUsers();
});

$('#tWipe')?.addEventListener('click', () => {
  if (!confirm('This clears local data on THIS device (users, roles, posts, prefs). Continue?')) return;
  Object.values(LS)
    .concat(['ct_profile_view_v1'])
    .forEach((k) => localStorage.removeItem(k));
  alert('Cleared. Reloading…');
  location.reload();
});

/* ===== Boot ===== */
(function boot() {
  if (!ensureAdmin()) return;
  renderUsers();
  renderContent();
})();

/* ===== Messages overlay bubble (footer safety) ===== */
(function () {
  function ensureBubble() {
    if (!document.getElementById('btnMsgs')) {
      const b = document.createElement('button');
      b.id = 'btnMsgs';
      b.textContent = 'Messages';
      b.style.cssText =
        'position:fixed;right:14px;bottom:14px;z-index:2999;padding:10px 12px;border-radius:12px;background:#3498db;color:#fff;border:0;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer';
      b.onclick = () => {
        if (window.ctOpen) ctOpen();
        else location.href = 'messages.html';
      };
      document.body.appendChild(b);
    }
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', ensureBubble);
  else ensureBubble();
})();
