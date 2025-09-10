/* Chatternet Messenger (wide overlay, site-wide)
   File: public/assets/messenger.js
   Works on any page that includes: <script src="assets/messenger.js"></script>
   Default backend base: https://chatternet-backend-1.onrender.com
*/
(function () {
  "use strict";

  // ---------- tiny utils ----------
  var K = {
    USERS: "ct_users_v3",
    PROFILE: "ct_profile_data_v1",
    THREADS: "ct_threads_v3",
    ACTIVE: "ct_msg_active_v1",
    NOTIF: "ct_notifications_v1",
    INBOX: "ct_inbox_v1"
  };
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.from((el || document).querySelectorAll(s)); };
  function load(k, f) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch (_) { return f; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  function nowISO() { return new Date().toISOString(); }
  function esc(s) {
    s = String(s == null ? "" : s);
    return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
            .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }
  function face(n){ return "https://i.pravatar.cc/120?u="+encodeURIComponent(n||"user"); }

  // Global CT namespace (reused by pages)
  var CT = window.CT || (window.CT = {});
  CT.API_BASE = (localStorage.getItem("ct_api_base") || "https://chatternet-backend-1.onrender.com").replace(/\/+$/,"");

  // ---------- seed users (ensure Me + Echo Bot so list isn’t empty) ----------
  (function seedUsers(){
    var u = load(K.USERS, null);
    if (!u || !Array.isArray(u) || u.length < 1) {
      u = [{name:"Me", avatar: face("Me")}, {name:"Echo Bot", avatar: face("Echo Bot")}];
    } else {
      if (!u.find(function(x){return x.name==="Me";})) u.unshift({name:"Me", avatar: face("Me")});
      if (!u.find(function(x){return x.name==="Echo Bot";})) u.push({name:"Echo Bot", avatar: face("Echo Bot")});
    }
    save(K.USERS, u);
  })();

  function Users(){ return load(K.USERS, []); }
  function avatarFor(name){
    var p = load(K.PROFILE, {});
    return (p[name] && (p[name].avatar || p[name].avatarUrl)) ||
           (Users().find(function(u){return u.name===name;}) || {}).avatar ||
           face(name);
  }

  // ---------- threads store ----------
  function threads(){ return load(K.THREADS, []); }
  function setThreads(t){ save(K.THREADS, t); }
  function threadWith(who){
    var list = threads();
    var t = list.find(function(x){ return x.with === who; });
    if (!t){
      t = { id: "t_"+Date.now(), with: who, msgs: [], unread: 0, updatedAt: nowISO() };
      list.unshift(t);
      setThreads(list);
    }
    return t;
  }
  function pushMsg(who, from, text){
    var list = threads();
    var t = list.find(function(x){ return x.with===who; }) || threadWith(who);
    t.msgs.push({ from: from, text: text, time: nowISO() });
    t.updatedAt = nowISO();
    if (from !== "Me") t.unread = (t.unread || 0) + 1;
    setThreads(list);
    return t;
  }

  // Demo bot: Echo
  function maybeEcho(who, text){
    if (who !== "Echo Bot") return;
    setTimeout(function(){
      pushMsg("Echo Bot", "Echo Bot", text);
      if (isOpen()) renderRight();
      pingFavicon();
    }, 300);
  }

  // ---------- overlay UI ----------
  var root, left, right, input, sendBtn, closeBtn, searchBox, headTitle;
  var active = load(K.ACTIVE, "") || "";

  function injectCSS(){
    if ($("#ct-msg-css")) return;
    var css = document.createElement("style");
    css.id = "ct-msg-css";
    css.textContent = [
      ".ct-msg-bg{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;z-index:3000}",
      ".ct-msg-sheet{background:#fff;border-radius:16px;width:min(1100px,96vw);max-height:86vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden}",
      ".ct-msg-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #e5e7eb;font-weight:800}",
      ".ct-close{border:0;background:#f1f5f9;border-radius:10px;padding:6px 10px;cursor:pointer}",
      ".ct-msg-wrap{display:flex;min-height:520px;height:66vh}",
      ".ct-msg-left{width:320px;max-width:40vw;border-right:1px solid #e5e7eb;background:#fafafa;display:flex;flex-direction:column}",
      ".ct-msg-lhead{padding:10px;border-bottom:1px solid #e5e7eb}",
      ".ct-search{padding:10px 12px;border:1px solid #d8e0f0;border-radius:10px;width:100%}",
      ".ct-list{overflow:auto;padding:6px}",
      ".ct-item{display:flex;gap:10px;align-items:center;padding:10px;border-radius:10px;cursor:pointer}",
      ".ct-item:hover{background:#f1f5f9}",
      ".ct-item.active{background:#eaf4ff}",
      ".ct-ava{width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid #fff}",
      ".ct-meta{font-size:12px;color:#64748b}",
      ".ct-msg-right{flex:1;display:flex;flex-direction:column}",
      ".ct-rhead{padding:12px 16px;border-bottom:1px solid #e5e7eb;font-weight:800}",
      ".ct-stream{flex:1;overflow:auto;padding:14px;background:#fff}",
      ".ct-bub{max-width:72%;padding:10px 12px;border-radius:12px;margin:6px 0;line-height:1.45;word-break:break-word}",
      ".ct-me{background:#e6f4ff;margin-left:auto}",
      ".ct-them{background:#f3f4f6}",
      ".ct-input{display:flex;gap:8px;padding:12px;border-top:1px solid #e5e7eb;background:#fff}",
      ".ct-input input{flex:1;padding:12px;border:1px solid #d8e0f0;border-radius:10px}",
      ".ct-send{padding:10px 14px;border-radius:10px;background:#3498db;border:0;color:#fff;cursor:pointer}",
      "@media (max-width:720px){.ct-msg-left{width:260px}}"
    ].join("");
    document.head.appendChild(css);
  }

  function buildUI(){
    if ($("#ct-msg-root")) return;
    injectCSS();

    root = document.createElement("div");
    root.id = "ct-msg-root";
    root.className = "ct-msg-bg";
    root.innerHTML =
      '<div class="ct-msg-sheet" role="dialog" aria-modal="true">'+
        '<div class="ct-msg-head"><div id="ctMsgTitle">Messages</div><button class="ct-close" id="ctMsgClose" aria-label="Close">Close</button></div>'+
        '<div class="ct-msg-wrap">'+
          '<div class="ct-msg-left">'+
            '<div class="ct-msg-lhead"><input id="ctMsgSearch" class="ct-search" placeholder="Search…"></div>'+
            '<div id="ctMsgList" class="ct-list" aria-label="Conversations"></div>'+
          '</div>'+
          '<div class="ct-msg-right">'+
            '<div id="ctMsgRHead" class="ct-rhead">Select someone</div>'+
            '<div id="ctMsgStream" class="ct-stream"></div>'+
            '<div class="ct-input">'+
              '<input id="ctMsgInput" placeholder="Write a message…">'+
              '<button id="ctMsgSend" class="ct-send">Send</button>'+
            '</div>'+
          '</div>'+
        '</div>'+
      "</div>";

    document.body.appendChild(root);

    // compatibility anchor so diagnostics stop complaining if old pages expect it
    if (!$("#ctMessengerRoot")) {
      var compat = document.createElement("div");
      compat.id = "ctMessengerRoot";
      compat.style.display = "none";
      document.body.appendChild(compat);
    }

    left = $("#ctMsgList", root);
    right = $("#ctMsgStream", root);
    input = $("#ctMsgInput", root);
    sendBtn = $("#ctMsgSend", root);
    closeBtn = $("#ctMsgClose", root);
    searchBox = $("#ctMsgSearch", root);
    headTitle = $("#ctMsgRHead", root);

    closeBtn.addEventListener("click", close);
    sendBtn.addEventListener("click", send);
    input.addEventListener("keydown", function(e){ if (e.key === "Enter") send(); });
    searchBox.addEventListener("input", renderLeft);
    root.addEventListener("click", function(e){ if (e.target === root) close(); });

    renderLeft();
    renderRight();
  }

  function isOpen(){ return !!(root && root.style.display === "flex"); }
  function open(name){
    buildUI();
    if (name) active = name;
    save(K.ACTIVE, active || "");
    renderLeft(); renderRight();
    root.style.display = "flex";
    setTimeout(function(){ try{ input && input.focus(); }catch(_){}} , 40);
  }
  function close(){ if (root) root.style.display = "none"; }

  // left list
  function renderLeft(){
    if (!left) return;
    var q = (searchBox && (searchBox.value||"").trim().toLowerCase()) || "";
    var us = Users().filter(function(u){ return u.name !== "Me"; })
                    .filter(function(u){ return !q || u.name.toLowerCase().includes(q); });

    // order by recent activity
    us.sort(function(a,b){
      var ta = (threads().find(function(t){return t.with===a.name;}) || {}).updatedAt || "0";
      var tb = (threads().find(function(t){return t.with===b.name;}) || {}).updatedAt || "0";
      return tb.localeCompare(ta);
    });

    left.innerHTML = "";
    us.forEach(function(u){
      var t = threads().find(function(x){return x.with===u.name;});
      var unread = (t && t.unread) || 0;

      var row = document.createElement("div");
      row.className = "ct-item" + (active===u.name ? " active" : "");
      row.innerHTML =
        '<img class="ct-ava" alt="" src="'+esc(avatarFor(u.name))+'">'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-weight:700">'+esc(u.name)+'</div>'+
          '<div class="ct-meta">'+ (unread ? (unread+" unread") : (t ? "Viewed" : "No messages yet")) +'</div>'+
        "</div>";
      row.addEventListener("click", function(){
        active = u.name;
        save(K.ACTIVE, active);
        if (t){ t.unread = 0; setThreads(threads()); }
        renderLeft(); renderRight();
      });
      left.appendChild(row);
    });
  }

  // right pane
  function renderRight(){
    if (!right) return;
    headTitle.textContent = active || "Select someone";
    right.innerHTML = "";
    if (!active) return;
    var t = threadWith(active);
    t.unread = 0; setThreads(threads());

    t.msgs.forEach(function(m){
      var b = document.createElement("div");
      b.className = "ct-bub " + (m.from === "Me" ? "ct-me" : "ct-them");
      b.innerHTML = esc(m.text || "");
      right.appendChild(b);
    });
    right.scrollTop = right.scrollHeight;
  }

  function send(){
    var text = (input && (input.value||"").trim()) || "";
    if (!active || !text) return;
    pushMsg(active, "Me", text);
    input.value = "";
    renderRight();
    maybeEcho(active, text);
  }

  // ---------- site-wide helpers exposed ----------
  function looksLikeMessage(el){
    if (!el) return false;
    var txt = (el.textContent||"").trim().toLowerCase();
    var href = (el.getAttribute && el.getAttribute("href") || "").toLowerCase();
    return el.id==="btnMsgs" ||
           txt==="messages" || txt==="message" || txt.indexOf("message")>-1 ||
           href.endsWith("messages.html") || href.indexOf("messages.html")>-1 ||
           el.hasAttribute("data-message") || el.getAttribute("data-action")==="message" ||
           el.classList.contains("message") || el.classList.contains("btn-message");
  }

  // intercept ANY Messages link/button to open overlay instead of navigating
  document.addEventListener("click", function(e){
    var btn = e.target && e.target.closest && e.target.closest("a,button");
    if (!btn) return;
    if (looksLikeMessage(btn)){
      e.preventDefault(); e.stopPropagation();
      open("");
    }
  }, true);

  // favicon ping (tiny visual cue on new message)
  function pingFavicon(){
    try{
      var el = document.querySelector('link[rel="icon"]');
      if (!el) return;
      el.dataset._old = el.dataset._old || el.href;
      el.href = el.href + (el.href.indexOf("?")>-1?"&":"?") + "x=" + Date.now();
      setTimeout(function(){ el.href = el.dataset._old; }, 500);
    }catch(_){}
  }

  // Public API
  window.ChatternetMessenger = {
    open: open,
    close: close,
    isOpen: isOpen,
    version: "1.0.0"
  };

  // Small helpers other pages can call (header wiring + notifications)
  CT.bindMessageButtons = function(scope){
    scope = scope || document;
    $$("#btnMsgs", scope).forEach ? $$("#btnMsgs", scope).forEach(function(b){
      b.addEventListener("click", function(e){ e.preventDefault(); open(""); });
    }) : (function(){
      var b = $("#btnMsgs", scope);
      if (b) b.addEventListener("click", function(e){ e.preventDefault(); open(""); });
    })();
  };
  CT.wireHeader = function(scope){
    scope = scope || document;
    // Messages button
    var m = $("#btnMsgs", scope);
    if (m) m.onclick = function(e){ e.preventDefault(); open(""); };

    // Avatar -> profile
    var me = (load(K.PROFILE, {})["Me"] || {});
    var img = $("#myProfile", scope);
    if (img){
      img.src = me.avatar || me.avatarUrl || face("Me");
      img.alt = me.displayName || "Me";
      img.style.cursor = "pointer";
      img.onclick = function(){ try{ location.href = "profile.html"; }catch(_){} };
    }

    // Notifications/Inboxes are page-owned; we only provide helpers if needed
  };
  CT.addNotif = function(text){
    var arr = load(K.NOTIF, []);
    arr.unshift({ id:"n_"+Date.now(), text: String(text||""), time: nowISO() });
    save(K.NOTIF, arr);
  };
  CT.addInbox = function(text){
    var arr = load(K.INBOX, []);
    arr.unshift({ id:"m_"+Date.now(), text: String(text||""), time: nowISO() });
    save(K.INBOX, arr);
  };

  // Global compatibility shorthands many of your pages already use
  window.ctOpen = function(){ open(""); };
  window.ctMessage = function(name){ open(name || ""); };

  // Build once and auto-open if ?msg=Name is present
  buildUI();
  try {
    var u = new URL(location.href);
    var who = u.searchParams.get("msg");
    if (who) open(who);
  } catch (_) {}
})();
