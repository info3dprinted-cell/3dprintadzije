/* ================= API i nalog ================= */
async function api(path,opts={}){
  const o={method:opts.method||"GET",headers:{},credentials:"same-origin"};
  if(opts.body!==undefined){o.headers["Content-Type"]="application/json";o.body=JSON.stringify(opts.body)}
  const r=await fetch("/api/"+path,o);let j={};try{j=await r.json()}catch{}
  if(!r.ok)throw Object.assign(new Error(j.error||`Greška (${r.status}). Pokušaj ponovo.`),{status:r.status});
  return j}
let ME=null,MESTATS=null;
async function loadMe(){try{ME=await api("me")}catch(e){ME=null}updAcct();return ME}
function updAcct(){const b=$("acctBtn");
  if(ME){b.textContent="👤 Moj profil";b.href="#moj"}else{b.textContent="Prijava";b.href="#prijava"}
  $("navMoj").textContent=ME?"Moj profil":"Prijava / Registracija";$("navMoj").href=ME?"#moj":"#prijava";
  $("navAdmin").classList.toggle("hide",!(ME&&ME.user.admin))}
function toast(t){const el=$("toast");el.textContent=t;el.classList.add("on");clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove("on"),2600)}
const errBox=(id,msg)=>{$(id).innerHTML=msg?`<div class="err">${esc(msg)}</div>`:""};
async function withBusy(btn,label,fn){const old=btn.textContent;btn.disabled=true;btn.textContent=label;try{await fn()}finally{btn.disabled=false;btn.textContent=old}}
const pwField=(id,label,ac)=>`<label>${label}</label><div class="pw"><input id="${id}" type="password" autocomplete="${ac}" minlength="8" required><button type="button" class="eye" onclick="const i=$('${id}');i.type=i.type==='password'?'text':'password'" aria-label="Prikaži lozinku">👁</button></div>`;
const authCard=h=>`<div class="card" style="max-width:460px;margin:0 auto">${h}</div>`;

/* ================= sačuvani oglasi (na ovom uređaju) ================= */
const SAVED_KEY="3dp_saved";
function getSaved(){try{return JSON.parse(localStorage.getItem(SAVED_KEY))||[]}catch{return []}}
function setSaved(a){try{localStorage.setItem(SAVED_KEY,JSON.stringify(a.slice(0,200)))}catch{}updSaved()}
const isSaved=id=>getSaved().includes(id);
window.toggleSave=(id,ev)=>{if(ev){ev.stopPropagation();ev.preventDefault()}const s=getSaved(),i=s.indexOf(id);i<0?s.unshift(id):s.splice(i,1);setSaved(s);
  document.querySelectorAll(`[data-save="${id}"]`).forEach(b=>{const on=isSaved(id);b.classList.toggle("on",on);b.innerHTML=b.dataset.long?(on?"♥ Sačuvano":"♡ Sačuvaj"):(on?"♥":"♡")});
  toast(isSaved(id)?"Oglas je sačuvan na ovom uređaju":"Uklonjeno iz sačuvanih")};
function updSaved(){const n=getSaved().length;$("savedCnt").textContent=n?`(${n})`:""}
const heart=(id,long)=>`<button type="button" class="heart${isSaved(id)?" on":""}" data-save="${esc(id)}"${long?' data-long="1"':""} onclick="toggleSave('${esc(id)}',event)" aria-label="Sačuvaj oglas">${long?(isSaved(id)?"♥ Sačuvano":"♡ Sačuvaj"):(isSaved(id)?"♥":"♡")}</button>`;
function viewSaved(){const ids=getSaved(),l=ids.map(id=>A.find(a=>a.id===id)).filter(Boolean),gone=ids.length-l.length;
  $("v-sacuvano").innerHTML=`<h1>♥ Sačuvani oglasi</h1><p class="sub">Čuvaju se samo na ovom uređaju – bez naloga.</p>
  ${l.map(adCard).join("")||`<div class="card empty">Nemaš sačuvanih oglasa. Dodirni ♡ na oglasu da ga sačuvaš.</div>`}
  ${gone?`<div class="meta" style="margin-top:8px">${gone} ${gone===1?"oglas više nije dostupan":"oglasa više nisu dostupna"} (prodano ili uklonjeno). <a href="#" onclick="setSaved(getSaved().filter(id=>A.some(a=>a.id===id)));viewSaved();return false">Ukloni ih</a></div>`:""}`}

/* ================= statistika posjeta ================= */
function hit(kind,ref,type="view"){const k=`hit:${kind}:${ref}:${type}`;
  try{if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,"1")}catch{}
  fetch("/api/hit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind,ref,type})}).catch(()=>{})}
window.hit=hit;

/* ================= slike ================= */
async function shrink(file,max,q){
  const url=URL.createObjectURL(file);
  try{const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error("Ne mogu otvoriti sliku"));i.src=url});
    const s=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)),cv=document.createElement("canvas");
    cv.width=Math.round(img.naturalWidth*s);cv.height=Math.round(img.naturalHeight*s);
    const g=cv.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,cv.width,cv.height);g.drawImage(img,0,0,cv.width,cv.height);
    return await new Promise(r=>cv.toBlob(r,"image/jpeg",q))}
  finally{URL.revokeObjectURL(url)}}
async function uploadImage(file,max=1280){
  if(!file.type.startsWith("image/"))throw new Error("To nije slika");
  const blob=await shrink(file,max,0.82),fd=new FormData();fd.append("file",blob,"slika.jpg");
  const r=await fetch("/api/slika",{method:"POST",body:fd,credentials:"same-origin"});const j=await r.json().catch(()=>({}));
  if(!r.ok||!j.url)throw new Error(j.error||"Slanje slike nije uspjelo");return j.url}
const upTile=(src,onDel)=>`<div class="u">${src?`<img src="${esc(src)}" alt="">`:"šaljem…"}${onDel?`<button type="button" onclick="${onDel}" aria-label="Ukloni">×</button>`:""}</div>`;

/* ================= prijava / registracija / reset ================= */
function viewLogin(){if(ME){location.hash="moj";return}
  $("v-prijava").innerHTML=authCard(`<h1>Prijava</h1><p class="sub">Za printadžije i prodavce. Klijentima nalog ne treba.</p>
  <form id="fLogin" novalidate><label>Email</label><input id="lE" type="email" autocomplete="email" required>${pwField("lP","Lozinka","current-password")}
  <div id="lErr"></div><button class="btn" id="lBtn" style="width:100%;margin-top:14px">Prijavi se</button></form>
  <p style="text-align:center;margin:14px 0 0"><a href="#zaboravljena">Zaboravljena lozinka?</a></p>
  <p style="text-align:center;margin:8px 0 0" class="meta">Nemaš nalog? <a href="#registracija"><b>Registruj se besplatno</b></a></p>`);
  $("fLogin").onsubmit=e=>{e.preventDefault();withBusy($("lBtn"),"Prijavljujem…",async()=>{
    try{await api("auth/login",{method:"POST",body:{email:$("lE").value.trim(),password:$("lP").value}});await loadMe();location.hash="moj"}catch(x){errBox("lErr",x.message)}})}}
function viewRegister(){if(ME){location.hash="moj";return}
  $("v-registracija").innerHTML=authCard(`<h1>Registracija</h1><p class="sub">Napravi nalog, pa popuni profil printadžije ili prodavača i objavljuj oglase. Besplatno.</p>
  <form id="fReg" novalidate><label>Email</label><input id="rE" type="email" autocomplete="email" required>
  ${pwField("rP","Lozinka (najmanje 8 znakova)","new-password")}${pwField("rP2","Ponovi lozinku","new-password")}
  <label class="chk"><input type="checkbox" id="rT"><span>Prihvatam <a href="#uslovi" target="_blank">Uslove korištenja</a> i pročitao/la sam <a href="#privatnost" target="_blank">Politiku privatnosti</a>.</span></label>
  <div id="rErr"></div><button class="btn" id="rBtn" style="width:100%;margin-top:8px">Napravi nalog</button></form>
  <p style="text-align:center;margin:14px 0 0" class="meta">Već imaš nalog? <a href="#prijava"><b>Prijavi se</b></a></p>`);
  $("fReg").onsubmit=e=>{e.preventDefault();const em=$("rE").value.trim(),p1=$("rP").value,p2=$("rP2").value;
    if(!/^\S+@\S+\.\S+$/.test(em))return errBox("rErr","Upiši ispravan email.");
    if(p1.length<8)return errBox("rErr","Lozinka mora imati najmanje 8 znakova.");
    if(p1!==p2)return errBox("rErr","Lozinke se ne podudaraju.");
    if(!$("rT").checked)return errBox("rErr","Potrebno je prihvatiti Uslove korištenja.");
    withBusy($("rBtn"),"Pravim nalog…",async()=>{try{const r=await api("auth/register",{method:"POST",body:{email:em,password:p1,password2:p2,terms:true}});
      await loadMe();mojTab="profil";location.hash="moj";toast(r.verifySent?"Nalog je napravljen – provjeri email za potvrdu":"Nalog je napravljen")}catch(x){errBox("rErr",x.message)}})}}
function viewForgot(){
  $("v-zaboravljena").innerHTML=authCard(`<h1>Zaboravljena lozinka</h1><p class="sub">Upiši email naloga i poslat ćemo ti link za novu lozinku.</p>
  <form id="fF" novalidate><label>Email</label><input id="fEm" type="email" autocomplete="email" required><div id="fErr2"></div>
  <button class="btn" id="fBtn" style="width:100%;margin-top:14px">Pošalji link</button></form>
  <p style="text-align:center;margin:14px 0 0"><a href="#prijava">← Nazad na prijavu</a></p>`);
  $("fF").onsubmit=e=>{e.preventDefault();withBusy($("fBtn"),"Šaljem…",async()=>{try{await api("auth/forgot",{method:"POST",body:{email:$("fEm").value.trim()}});
    $("fF").outerHTML=`<div class="okbox">Ako nalog s tim emailom postoji, poslali smo link za novu lozinku. Pogledaj i <b>Spam</b>. Link važi 1 sat.</div>`}catch(x){errBox("fErr2",x.message)}})}}
let RESET_TOKEN="";
function viewReset(){
  $("v-reset").innerHTML=authCard(`<h1>Nova lozinka</h1>${RESET_TOKEN?`<form id="fR" novalidate>${pwField("nP","Nova lozinka (najmanje 8 znakova)","new-password")}${pwField("nP2","Ponovi novu lozinku","new-password")}
  <div id="nErr"></div><button class="btn" id="nBtn" style="width:100%;margin-top:14px">Sačuvaj novu lozinku</button></form>`:`<div class="err">Link nije ispravan. <a href="#zaboravljena">Zatraži novi.</a></div>`}`);
  if(!RESET_TOKEN)return;
  $("fR").onsubmit=e=>{e.preventDefault();const p1=$("nP").value,p2=$("nP2").value;
    if(p1.length<8)return errBox("nErr","Lozinka mora imati najmanje 8 znakova.");if(p1!==p2)return errBox("nErr","Lozinke se ne podudaraju.");
    withBusy($("nBtn"),"Čuvam…",async()=>{try{await api("auth/reset",{method:"POST",body:{token:RESET_TOKEN,password:p1,password2:p2}});RESET_TOKEN="";await loadMe();location.hash="moj";toast("Nova lozinka je sačuvana")}catch(x){errBox("nErr",x.message)}})}}

/* ================= MOJ PROFIL ================= */
let mojTab="profil",PF=null,EDIT=null;
const ROLE_LBL={printer:"🖨️ Printam za druge",seller:"🛒 Prodajem plastiku, printere ili dijelove"};
const SELL_LBL={filament:"🧵 Filament",resin:"🧪 Resin",oprema:"🖨️ Printeri i oprema",dijelovi:"🔩 Rezervni dijelovi"};
async function viewMoj(){
  await loadMe();
  if(!ME){location.hash="prijava";return}
  const u=ME.user,p=ME.profile;
  let ban="";
  if(!u.verified)ban+=`<div class="banner warn">📧 Potvrdi email <b>${esc(u.email)}</b> – poslali smo ti link. ${u.mail?`<a href="#" onclick="resendVerify();return false">Pošalji ponovo</a>`:""}</div>`;
  if(p&&p.status==="pending")ban+=`<div class="banner info">⏳ Tvoj profil čeka odobrenje – obično isti ili sljedeći dan. Možeš već dodavati oglase; postaju javni kad odobrimo profil.</div>`;
  if(p&&p.status==="approved")ban+=`<div class="banner ok">✓ Profil je javan. <a href="#p-${esc(p.id)}">Pogledaj kako ga vide drugi →</a></div>`;
  if(p&&p.status==="hidden")ban+=`<div class="banner warn">Profil je trenutno sakriven. Za pitanja piši na info.3dprinted@gmail.com.</div>`;
  if(!p)ban+=`<div class="banner info">👋 Dobro došao/la! Popuni profil da te klijenti i kupci mogu pronaći.</div>`;
  const tabs=[["profil","Profil"],["oglasi",`Moji oglasi${ME.ads.length?` (${ME.ads.length})`:""}`],["statistika","Statistika"],["postavke","Postavke"]];
  $("v-moj").innerHTML=`<div class="row" style="justify-content:space-between"><div class="ph">${p?avatar({naziv:p.naziv,logo:p.logo}):'<div class="av">👤</div>'}<div><h1 style="font-size:22px">${p?esc(p.naziv):"Moj profil"}</h1><div class="meta">${esc(u.email)}</div></div></div>${u.admin?'<a class="btn sm lt" href="#admin">⚙️ Admin</a>':""}</div>
  <div style="margin-top:12px">${ban}</div>
  <div class="tabs">${tabs.map(([k,n])=>`<button class="${mojTab===k?"on":""}" onclick="mojTab='${k}';EDIT=null;viewMoj()">${n}</button>`).join("")}</div>
  <div id="mojBody"></div>`;
  ({profil:tabProfil,oglasi:tabOglasi,statistika:tabStats,postavke:tabSettings})[mojTab]()}
window.resendVerify=async()=>{try{await api("auth/resend",{method:"POST",body:{}});toast("Poslali smo novi link – pogledaj i Spam")}catch(x){toast(x.message)}};

/* ---------- profil ---------- */
function tabProfil(){
  const p=ME.profile;
  if(!PF||PF._for!==(p?p.id:"new")){const known=p?p.printeri.filter(n=>PRINTERS[n]):[],other=p?p.printeri.filter(n=>!PRINTERS[n]):[];
    PF={_for:p?p.id:"new",uloge:new Set(p?p.uloge:[]),naziv:p?p.naziv:"",grad:p?p.grad:"Sarajevo",telefon:p?p.telefon:"",email:p?p.email:ME.user.email,web:p?p.web:"",opis:p?p.opis:"",logo:p?p.logo:"",logoBusy:false,
      printeri:known,drugi:other.join(", "),plastika:p?p.plastika.map(x=>[...x]):[],prodaje:new Set(p?p.prodaje:[])}}
  const F=PF,isP=F.uloge.has("printer"),isS=F.uloge.has("seller");
  $("mojBody").innerHTML=`<div class="card"><h2>Šta radiš?</h2><div class="chips">${Object.entries(ROLE_LBL).map(([k,n])=>`<button type="button" class="${F.uloge.has(k)?"on":""}" onclick="pfKeep();PF.uloge.has('${k}')?PF.uloge.delete('${k}'):PF.uloge.add('${k}');tabProfil()">${n}</button>`).join("")}</div></div>
  <div class="card"><h2>Osnovni podaci</h2>
    <div class="row" style="gap:14px;align-items:center">${avatar({naziv:F.naziv||"?",logo:F.logo},true)}<div>
      <label class="upbtn" style="margin:0">📷 ${F.logo?"Promijeni sliku/logo":"Dodaj sliku ili logo"}<input type="file" accept="image/*" class="hide" onchange="pfLogo(this)"></label>
      ${F.logoBusy?'<div class="meta" style="margin-top:6px">šaljem…</div>':F.logo?'<div style="margin-top:6px"><a href="#" onclick="pfKeep();PF.logo=\'\';tabProfil();return false">Ukloni sliku</a></div>':""}<div id="pfLogoErr"></div></div></div>
    <label>Naziv radionice/firme ili ime *</label><input id="pN" value="${esc(F.naziv)}" placeholder="npr. PrintLab Tuzla">
    <div class="g2"><div><label>Grad *</label><select id="pC">${opts(CITIES)}</select></div><div><label>Broj (Viber / WhatsApp) *</label><input id="pT" type="tel" value="${esc(F.telefon)}" placeholder="+387 6x xxx xxx"></div></div>
    <div class="g2"><div><label>Email na profilu</label><input id="pE" type="email" value="${esc(F.email)}"></div><div><label>Web / Instagram / Facebook</label><input id="pW" value="${esc(F.web)}" placeholder="npr. instagram.com/mojaradionica"></div></div>
    <label>Opis</label><textarea id="pO" placeholder="Šta radiš, rokovi, dostava…">${esc(F.opis)}</textarea></div>
  ${isP?`<div class="card"><h2>🖨️ Printeri</h2><p class="sub" style="margin-bottom:8px">Dodirni modele koje imaš – radna ploha se upisuje sama.</p>
    <div class="chips">${Object.keys(PRINTERS).map(n=>`<button type="button" class="${F.printeri.includes(n)?"on":""}" onclick="pfKeep();const i=PF.printeri.indexOf('${n}');i<0?PF.printeri.push('${n}'):PF.printeri.splice(i,1);tabProfil()">${n}</button>`).join("")}</div>
    <label>Drugi printeri (odvoji zarezom)</label><input id="pD" value="${esc(F.drugi)}" placeholder="npr. Voron 2.4 350, Artillery Sidewinder X2"></div>
  <div class="card"><h2>🧵 Plastika na stanju</h2><p class="sub" style="margin-bottom:8px">Ažuriraj kad se promijeni – po ovome te klijenti nalaze.</p>
    ${F.plastika.map((s,i)=>`<div class="row" style="flex-wrap:nowrap;margin-bottom:6px"><select onchange="PF.plastika[${i}][0]=this.value">${Object.keys(MATS).map(m=>`<option ${m===s[0]?"selected":""}>${m}</option>`).join("")}</select>
      <select onchange="PF.plastika[${i}][1]=this.value">${Object.keys(COLORS).map(c=>`<option ${c===s[1]?"selected":""}>${c}</option>`).join("")}</select>
      <input type="number" min="0" step="100" value="${s[2]}" onchange="PF.plastika[${i}][2]=+this.value" style="max-width:96px" aria-label="grama"><button type="button" class="x" onclick="pfKeep();PF.plastika.splice(${i},1);tabProfil()" aria-label="Ukloni">×</button></div>`).join("")}
    <button type="button" class="btn sm lt" onclick="pfKeep();PF.plastika.push(['PLA','Crna',1000]);tabProfil()">+ Dodaj kalem</button></div>`:""}
  ${isS?`<div class="card"><h2>🛒 Šta prodaješ?</h2><div class="chips">${Object.entries(SELL_LBL).map(([k,n])=>`<button type="button" class="${F.prodaje.has(k)?"on":""}" onclick="pfKeep();PF.prodaje.has('${k}')?PF.prodaje.delete('${k}'):PF.prodaje.add('${k}');tabProfil()">${n}</button>`).join("")}</div></div>`:""}
  <div id="pErr"></div>
  <div class="row"><button class="btn" id="pSave">${p?"💾 Sačuvaj izmjene":"Sačuvaj i pošalji na odobrenje"}</button>${p&&isP?`<button class="btn lt" id="pConfirm">✅ Stanje je tačno – potvrdi za danas</button>`:""}</div>
  ${p?`<p class="meta">Zadnja potvrda stanja: ${fmtDate(p.azurirano)||"—"}</p>`:""}`;
  $("pC").value=F.grad;
  $("pSave").onclick=()=>withBusy($("pSave"),"Čuvam…",saveProfile);
  if($("pConfirm"))$("pConfirm").onclick=()=>withBusy($("pConfirm"),"…",async()=>{try{await api("me/confirm",{method:"POST",body:{}});await loadMe();toast("Stanje potvrđeno za danas");viewMoj()}catch(x){toast(x.message)}})}
window.pfKeep=()=>{if(!$("pN"))return;PF.naziv=$("pN").value;PF.grad=$("pC").value;PF.telefon=$("pT").value;PF.email=$("pE").value;PF.web=$("pW").value;PF.opis=$("pO").value;if($("pD"))PF.drugi=$("pD").value};
window.pfLogo=async inp=>{const f=inp.files[0];if(!f)return;pfKeep();PF.logoBusy=true;tabProfil();
  try{PF.logo=await uploadImage(f,512)}catch(x){PF.logoBusy=false;tabProfil();errBox("pfLogoErr",x.message);return}PF.logoBusy=false;tabProfil()};
async function saveProfile(){pfKeep();const F=PF;
  if(F.logoBusy)return errBox("pErr","Sačekaj da se slika pošalje.");
  const printeri=[...F.printeri,...F.drugi.split(",").map(s=>s.trim()).filter(Boolean)];
  try{const r=await api("me/profile",{method:"PUT",body:{uloge:[...F.uloge],naziv:F.naziv,grad:F.grad,telefon:F.telefon,email:F.email,web:F.web,opis:F.opis,logo:F.logo,
      printeri:F.uloge.has("printer")?printeri:[],plastika:F.uloge.has("printer")?F.plastika:[],prodaje:F.uloge.has("seller")?[...F.prodaje]:[]}});
    errBox("pErr","");PF=null;await loadMe();await loadPublic();toast(r.status==="pending"?"Profil je poslan na odobrenje":"Profil je sačuvan");viewMoj()}
  catch(x){errBox("pErr",x.message)}}

/* ---------- moji oglasi ---------- */
const ST_LBL={active:'<span class="pill ok">Aktivan</span>',sold:'<span class="pill">Prodano</span>',hidden:'<span class="pill warn">Sakriven</span>'};
async function tabOglasi(){
  if(!ME.profile){$("mojBody").innerHTML=`<div class="card empty">Prvo popuni <a href="#" onclick="mojTab='profil';viewMoj();return false">profil</a>, pa objavljuj oglase.</div>`;return}
  if(EDIT)return adEditor();
  if(!MESTATS)try{MESTATS=await api("me/stats")}catch{MESTATS={totals:[]}}
  const tot=id=>{const t=(MESTATS.totals||[]).find(x=>x.kind==="o"&&x.ref===id);return t?[t.v||0,t.c||0]:[0,0]};
  $("mojBody").innerHTML=`<div class="row" style="justify-content:space-between;margin-bottom:10px"><b>${ME.ads.length} ${ME.ads.length===1?"oglas":"oglasa"}</b><button class="btn sm" onclick="EDIT={};viewMoj()">+ Novi oglas</button></div>
  ${ME.ads.map(a=>{const [v,c]=tot(a.id),img=(a.slike||[])[0];return `<div class="ad"><div class="thumb">${img?`<img src="${esc(img)}" alt="">`:(CATS[a.kategorija]||["📦"])[0]}</div><div style="flex:1;min-width:0">
    <div class="row" style="justify-content:space-between;align-items:flex-start"><b>${esc(a.naslov)}</b><span class="price">${esc(a.cijena)}</span></div>
    <div>${ST_LBL[a.status]||""}<span class="pill">👁 ${v} pregleda</span><span class="pill">📞 ${c} kontakata</span></div>
    <div class="acts"><button class="btn sm lt" onclick="EDIT=ME.ads.find(x=>x.id==='${a.id}');viewMoj()">✏️ Uredi</button>
      ${a.status==="active"?`<button class="btn sm lt" onclick="adStatus('${a.id}','sold')">✓ Prodano</button>`:a.status==="sold"?`<button class="btn sm lt" onclick="adStatus('${a.id}','active')">↺ Ponovo aktiviraj</button>`:""}
      ${a.status==="active"&&ME.profile.status==="approved"?`<a class="btn sm lt" href="#o-${a.id}">Pogledaj</a>`:""}
      <button class="btn sm lt" style="color:var(--bad)" onclick="adDelete('${a.id}')">Obriši</button></div></div></div>`}).join("")||`<div class="card empty">Nemaš oglasa. Prodaješ plastiku, printer ili dijelove? Objavi oglas.</div>`}`}
window.adStatus=async(id,s)=>{try{await api("me/ads/"+id,{method:"PUT",body:{status:s}});await loadMe();await loadPublic();toast(s==="sold"?"Označeno kao prodano":"Oglas je ponovo aktivan");viewMoj()}catch(x){toast(x.message)}};
window.adDelete=async id=>{if(!confirm("Obrisati oglas? Ovo se ne može vratiti."))return;try{await api("me/ads/"+id,{method:"DELETE"});await loadMe();await loadPublic();toast("Oglas je obrisan");viewMoj()}catch(x){toast(x.message)}};
let AE=null;
function adEditor(){const a=EDIT;if(!AE||AE._for!==(a.id||"new"))AE={_for:a.id||"new",kategorija:a.kategorija||"filament",naslov:a.naslov||"",cijena:a.cijena||"",stanje:a.stanje||"Novo",materijal:a.materijal||"",boja:a.boja||"",opis:a.opis||"",slike:[...(a.slike||[])],busy:0};
  const E=AE,mat=E.kategorija==="filament"||E.kategorija==="resin";
  $("mojBody").innerHTML=`<a class="back" href="#" onclick="EDIT=null;AE=null;viewMoj();return false">← Moji oglasi</a><div class="card"><h2>${a.id?"Uredi oglas":"Novi oglas"}</h2>
  <label>Odjel *</label><select id="eCat">${Object.entries(CATS).map(([k,[i,n]])=>`<option value="${k}" ${k===E.kategorija?"selected":""}>${i} ${n}</option>`).join("")}</select>
  <label>Naslov *</label><input id="eT" value="${esc(E.naslov)}" placeholder="npr. eSun PETG 1 kg – crna">
  <div class="g2"><div><label>Cijena *</label><input id="eP" value="${esc(E.cijena)}" placeholder="npr. 38 KM ili Po dogovoru"></div><div><label>Stanje</label><select id="eS"><option ${E.stanje==="Novo"?"selected":""}>Novo</option><option ${E.stanje==="Polovno"?"selected":""}>Polovno</option></select></div></div>
  ${mat?`<div class="g2"><div><label>Materijal</label><select id="eM">${opts(Object.keys(MATS).filter(m=>MATS[m][1]===(E.kategorija==="resin"?"SLA":"FDM")),"—")}</select></div><div><label>Boja</label><select id="eC">${opts(Object.keys(COLORS),"—")}</select></div></div>`:""}
  <label>Opis</label><textarea id="eD" placeholder="Količina, stanje, dostava, kompatibilnost…">${esc(E.opis)}</textarea>
  <label>Slike (do 5) – prva je naslovna</label><div class="ups" id="eImgs"></div>
  <label class="upbtn ${E.slike.length+E.busy>=5?"hide":""}" id="eAdd" style="margin-top:8px">📷 Dodaj slike<input type="file" accept="image/*" multiple class="hide" id="eFile"></label>
  <div id="eErr"></div><button class="btn" id="eSave" style="width:100%;margin-top:14px">${a.id?"💾 Sačuvaj izmjene":"Objavi oglas"}</button>
  ${ME.profile.status!=="approved"?'<p class="meta">Oglas postaje javan kad odobrimo tvoj profil.</p>':""}</div>`;
  if(mat){$("eM").value=E.materijal;$("eC").value=E.boja}
  const keep=()=>{E.kategorija=$("eCat").value;E.naslov=$("eT").value;E.cijena=$("eP").value;E.stanje=$("eS").value;E.opis=$("eD").value;if($("eM")){E.materijal=$("eM").value;E.boja=$("eC").value}};
  const drawImgs=()=>{$("eImgs").innerHTML=E.slike.map((s,i)=>upTile(s,`AE.slike.splice(${i},1);adEditorImgs()`)).join("")+Array(E.busy).fill(upTile("")).join("");$("eAdd").classList.toggle("hide",E.slike.length+E.busy>=5)};
  window.adEditorImgs=drawImgs;drawImgs();
  $("eCat").onchange=()=>{keep();E.materijal="";E.boja="";adEditor()};
  $("eFile").onchange=async ev=>{const files=[...ev.target.files].slice(0,5-E.slike.length-E.busy);ev.target.value="";errBox("eErr","");
    await Promise.all(files.map(async f=>{E.busy++;drawImgs();try{E.slike.push(await uploadImage(f,1280))}catch(x){errBox("eErr",x.message)}finally{E.busy--;drawImgs()}}))};
  $("eSave").onclick=()=>{keep();if(E.busy)return errBox("eErr","Sačekaj da se slike pošalju.");
    withBusy($("eSave"),"Čuvam…",async()=>{const body={kategorija:E.kategorija,naslov:E.naslov,cijena:E.cijena,stanje:E.stanje,materijal:E.materijal,boja:E.boja,opis:E.opis,slike:E.slike};
      try{if(a.id)await api("me/ads/"+a.id,{method:"PUT",body});else await api("me/ads",{method:"POST",body});
        EDIT=null;AE=null;MESTATS=null;await loadMe();await loadPublic();toast(a.id?"Oglas je sačuvan":"Oglas je objavljen");viewMoj()}catch(x){errBox("eErr",x.message)}})}}

/* ---------- statistika ---------- */
async function tabStats(){$("mojBody").innerHTML=`<div class="card empty">Učitavam…</div>`;
  try{MESTATS=await api("me/stats")}catch(x){$("mojBody").innerHTML=`<div class="card empty">${esc(x.message)}</div>`;return}
  const S=MESTATS,days=[];for(let i=29;i>=0;i--)days.push(new Date(Date.now()-i*864e5).toISOString().slice(0,10));
  const by=d=>S.rows.filter(r=>r.day===d).reduce((a,r)=>[a[0]+r.views,a[1]+r.contacts],[0,0]);
  const series=days.map(by),max=Math.max(1,...series.map(s=>s[0]));
  const sum=(k,col)=>(S.totals||[]).filter(t=>t.kind===k).reduce((a,t)=>a+(t[col]||0),0);
  const last30=series.reduce((a,s)=>[a[0]+s[0],a[1]+s[1]],[0,0]);
  $("mojBody").innerHTML=`<div class="grid4">
    <div class="stat"><div class="l">Pregledi profila</div><div class="v">${sum("p","v")}</div></div>
    <div class="stat"><div class="l">Pregledi oglasa</div><div class="v">${sum("o","v")}</div></div>
    <div class="stat"><div class="l">Kontakti (Viber, WhatsApp, poziv, email)</div><div class="v">${sum("p","c")+sum("o","c")}</div></div>
    <div class="stat"><div class="l">Pregledi zadnjih 30 dana</div><div class="v">${last30[0]}</div></div></div>
  <div class="card" style="margin-top:12px"><h2>Pregledi po danu (30 dana)</h2>
    <div class="bars">${series.map((s,i)=>`<div class="bar" title="${fmtDate(days[i])}: ${s[0]} pregleda, ${s[1]} kontakata"><span style="height:${Math.round(s[0]/max*100)}%"></span></div>`).join("")}</div>
    <div class="row meta" style="justify-content:space-between"><span>${fmtDate(days[0])}</span><span>danas</span></div></div>
  <div class="card"><h2>Po oglasu</h2>${S.ads.length?`<table class="tbl"><thead><tr><th>Oglas</th><th>👁</th><th>📞</th></tr></thead><tbody>${S.ads.map(a=>{const t=(S.totals||[]).find(x=>x.kind==="o"&&x.ref===a.id)||{};return `<tr><td>${esc(a.naslov)}</td><td>${t.v||0}</td><td>${t.c||0}</td></tr>`}).join("")}</tbody></table>`:'<div class="meta">Još nema oglasa.</div>'}</div>
  <p class="meta">Brojimo jedan pregled po posjetiocu po danu. Kontakt je klik na Viber, WhatsApp, poziv ili email.</p>`}

/* ---------- postavke ---------- */
function tabSettings(){const u=ME.user;
  $("mojBody").innerHTML=`<div class="card"><h2>Nalog</h2><div class="kv"><b>Email</b><span>${esc(u.email)} ${u.verified?'<span class="pill ok">✓ potvrđen</span>':`<span class="pill warn">nije potvrđen</span> ${u.mail?'<a href="#" onclick="resendVerify();return false">pošalji link ponovo</a>':""}`}</span></div>
    <div class="row" style="margin-top:12px"><button class="btn lt" id="sOut">Odjavi se</button></div></div>
  <div class="card"><h2>Promjena lozinke</h2><form id="fPw" novalidate>${pwField("sO","Trenutna lozinka","current-password")}${pwField("sN","Nova lozinka","new-password")}${pwField("sN2","Ponovi novu lozinku","new-password")}
    <div id="sErr"></div><button class="btn" id="sPwBtn" style="margin-top:12px">Promijeni lozinku</button></form></div>
  <div class="card"><h2 style="color:var(--bad)">Brisanje naloga</h2><p class="sub" style="margin-bottom:8px">Trajno briše nalog, profil i sve oglase. Ne može se vratiti.</p>
    ${pwField("sD","Upiši lozinku za potvrdu","current-password")}<div id="sDErr"></div><button class="btn lt" id="sDel" style="margin-top:12px;color:var(--bad)">Obriši moj nalog</button></div>`;
  $("sOut").onclick=async()=>{try{await api("auth/logout",{method:"POST",body:{}})}catch{}ME=null;MESTATS=null;PF=null;updAcct();toast("Odjavljen/a si");location.hash="trazi"};
  $("fPw").onsubmit=e=>{e.preventDefault();const n1=$("sN").value,n2=$("sN2").value;if(n1.length<8)return errBox("sErr","Nova lozinka mora imati najmanje 8 znakova.");if(n1!==n2)return errBox("sErr","Lozinke se ne podudaraju.");
    withBusy($("sPwBtn"),"Čuvam…",async()=>{try{await api("me/password",{method:"POST",body:{old:$("sO").value,password:n1,password2:n2}});errBox("sErr","");$("fPw").reset();toast("Lozinka je promijenjena")}catch(x){errBox("sErr",x.message)}})};
  $("sDel").onclick=()=>{if(!confirm("Sigurno želiš trajno obrisati nalog, profil i sve oglase?"))return;
    withBusy($("sDel"),"Brišem…",async()=>{try{await api("me/delete",{method:"POST",body:{password:$("sD").value}});ME=null;updAcct();await loadPublic();toast("Nalog je obrisan");location.hash="trazi"}catch(x){errBox("sDErr",x.message)}})}}

/* ================= ADMIN ================= */
async function viewAdmin(){
  await loadMe();
  if(!ME||!ME.user.admin){$("v-admin").innerHTML=`<div class="card empty">Samo za administratora.${ME?`<br><br>Prijavljen/a si kao <b>${esc(ME.user.email)}</b>${ME.user.verified?"":" – email još nije potvrđen"}. Admin je nalog s emailom info.3dprinted@gmail.com, nakon potvrde emaila.`:""}</div>`;return}
  $("v-admin").innerHTML=`<h1>⚙️ Admin</h1><div class="card empty">Učitavam…</div>`;
  let D;try{D=await api("admin")}catch(x){$("v-admin").innerHTML=`<h1>⚙️ Admin</h1><div class="card empty">${esc(x.message)}</div>`;return}
  const pend=D.profiles.filter(p=>p.status==="pending"),rest=D.profiles.filter(p=>p.status!=="pending");
  const v7=D.stats.reduce((a,s)=>a+(s.v||0),0),c7=D.stats.reduce((a,s)=>a+(s.c||0),0);
  const pCard=p=>`<div class="ad" style="display:block"><div class="hd">${avatar(p)}<div style="flex:1;min-width:0"><b>${esc(p.naziv)}</b> <span class="meta">· ${esc(p.grad)} · ${esc(p.telefon)}</span>
    <div class="meta">${esc(p.email||"")}${p.login?` · nalog: ${esc(p.login)} ${p.verified?"✓":"(email nepotvrđen)"}`:" · bez naloga"}${p.web?` · ${esc(p.web)}`:""}</div>
    <div class="meta">${esc((p.uloge||[]).map(r=>({printer:"printa",seller:"prodaje"})[r]).join(", "))}${p.printeri.length?" · "+esc(p.printeri.join(", ")):""}</div>
    ${p.opis?`<div class="meta">${esc(p.opis.slice(0,200))}</div>`:""}</div></div>
    <div class="acts">${p.status!=="approved"?`<button class="btn sm" onclick="admP('${p.id}',{status:'approved'})">✓ Odobri</button>`:""}${p.status!=="hidden"?`<button class="btn sm lt" onclick="admP('${p.id}',{status:'hidden'})">Sakrij</button>`:""}
      <button class="btn sm lt" onclick="admP('${p.id}',{izdvojen:${!p.izdvojen}})">${p.izdvojen?"★ Ukloni izdvajanje":"☆ Izdvoji"}</button>${p.status==="approved"?`<a class="btn sm lt" href="#p-${p.id}">Pogledaj</a>`:""}
      <a class="btn sm vb" href="viber://chat?number=%2B${dig(p.telefon)}">Viber</a><button class="btn sm lt" style="color:var(--bad)" onclick="admDelP('${p.id}','${esc(p.naziv).replace(/'/g,"")}')">🗑 Obriši</button></div></div>`;
  $("v-admin").innerHTML=`<h1>⚙️ Admin</h1>
  <div class="grid4"><div class="stat"><div class="l">Nalozi</div><div class="v">${D.users}</div></div><div class="stat"><div class="l">Profili (javni)</div><div class="v">${D.profiles.filter(p=>p.status==="approved").length}</div></div>
    <div class="stat"><div class="l">Pregledi, 7 dana</div><div class="v">${v7}</div></div><div class="stat"><div class="l">Kontakti, 7 dana</div><div class="v">${c7}</div></div></div>
  <div class="card" style="margin-top:12px"><h2>⏳ Čeka odobrenje (${pend.length})</h2>${pend.map(pCard).join("")||'<div class="meta">Nema novih profila.</div>'}</div>
  <div class="card"><h2>Svi profili</h2>${rest.map(p=>`<div style="margin-bottom:4px">${p.status==="hidden"?'<span class="pill warn">sakriven</span>':""}</div>`+pCard(p)).join("")}</div>
  <div class="card"><h2>Oglasi (zadnjih 200)</h2>${D.ads.map(a=>`<div class="row" style="justify-content:space-between;border-top:1px solid var(--line);padding:8px 0"><div style="min-width:0;flex:1"><b>${esc(a.naslov)}</b> · ${esc(a.cijena)}<div class="meta">${esc(a.prodavac)} · ${ST_LBL[a.status]||esc(a.status)}${a.izdvojen?' <span class="pill gold">★</span>':""}</div></div>
    <div class="row">${a.status==="hidden"?`<button class="btn sm lt" onclick="admA('${a.id}',{status:'active'})">Vrati</button>`:`<button class="btn sm lt" onclick="admA('${a.id}',{status:'hidden'})">Sakrij</button>`}<button class="btn sm lt" onclick="admA('${a.id}',{izdvojen:${!a.izdvojen}})">${a.izdvojen?"★":"☆"}</button><a class="btn sm lt" href="#o-${a.id}">👁</a><button class="btn sm lt" style="color:var(--bad)" onclick="admDelA('${a.id}')">🗑</button></div></div>`).join("")||'<div class="meta">Nema oglasa.</div>'}</div>`}
window.admP=async(id,b)=>{try{await api("admin/profile",{method:"POST",body:{id,...b}});await loadPublic();toast("Sačuvano");viewAdmin()}catch(x){toast(x.message)}};
window.admDelP=async(id,n)=>{if(!confirm(`Trajno obrisati profil "${n}" i sve njegove oglase? Nalog korisnika ostaje.`))return;try{await api("admin/delete-profile",{method:"POST",body:{id}});await loadPublic();toast("Profil je obrisan");viewAdmin()}catch(x){toast(x.message)}};
window.admDelA=async id=>{if(!confirm("Trajno obrisati ovaj oglas?"))return;try{await api("admin/delete-ad",{method:"POST",body:{id}});await loadPublic();toast("Oglas je obrisan");viewAdmin()}catch(x){toast(x.message)}};
window.admA=async(id,b)=>{try{await api("admin/ad",{method:"POST",body:{id,...b}});await loadPublic();toast("Sačuvano");viewAdmin()}catch(x){toast(x.message)}};
