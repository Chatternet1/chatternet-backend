/* Sync Settings -> backend
   File: public/assets/ct-settings-sync.js */
(function(){
  "use strict";
  var API = (window.CT && CT.API_BASE) || (localStorage.getItem("ct_api_base")||"https://chatternet-backend-1.onrender.com");
  API = String(API).replace(/\/+$/,"");
  async function http(path,opts){ const r=await fetch(API+path,{credentials:"include",headers:{"Content-Type":"application/json"},...opts}); const t=await r.text(); let j=null; try{ j=t?JSON.parse(t):null; }catch(_){}
    if(!r.ok) throw new Error((j&&(j.error||j.message))||t||("HTTP "+r.status)); return j; }

  window.addEventListener("chatternet:settings-updated", async function(ev){
    var s = ev && ev.detail; if(!s) return;
    try{
      // profile basics
      if(s.profile){
        await http("/api/profile", { method:"PUT", body: JSON.stringify({
          displayName: s.profile.displayName || "",
          bio:         s.profile.bio || "",
          avatar:      s.profile.avatarUrl || "",
          cover:       s.profile.coverUrl || ""
        })});
      }
      // privacy
      if(s.privacy){
        await http("/api/privacy", { method:"PUT", body: JSON.stringify({
          profile: s.privacy.profile || "public",
          post:    s.privacy.post    || "public",
          dm:      s.privacy.dm      || "everyone",
          online:  !!s.privacy.online
        })});
      }
      // (monetization etc. could be added similarly)
      console.log("Settings synced.");
    }catch(e){ console.warn("Settings sync failed:", e.message||e); }
  });
})();
