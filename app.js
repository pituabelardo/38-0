/* ============================================================================
   PLANTILLAZO — Orquestador (app.js)
   ----------------------------------------------------------------------------
   Router de vistas (hash-based), toggles tema/idioma con persistencia,
   color del club del día, utilidades (toast, confeti, formatos) y el wiring
   de autenticación (login/registro/reset/nueva contraseña/perfil/ranking).
   ============================================================================ */
(function(){
  'use strict';

  const $ = (s, r=document)=> r.querySelector(s);
  const esc = (s)=> String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* ------------------------------------------------------------------ utils */
  function reducedMotion(){ return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  function toast(msg){
    const el = $('#toast'); if(!el) return;
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(()=> el.classList.remove('show'), 1800);
  }

  function fmtTime(ms){
    if(!ms || ms < 0) return '—';
    const s = Math.round(ms/1000);
    const m = Math.floor(s/60), r = s%60;
    return m + ':' + String(r).padStart(2,'0');
  }
  function fmtDateShort(key){
    // 'YYYY-MM-DD' -> 'DD·MM·YY'
    const [y,m,d] = key.split('-');
    return `${d}·${m}·${y.slice(2)}`;
  }
  function fmtDateLong(key){
    const d = new Date(key + 'T00:00:00');
    const lang = PLi18n.lang === 'en' ? 'en-GB' : 'es-ES';
    return d.toLocaleDateString(lang, { day:'numeric', month:'short', year:'numeric' });
  }

  function applyClubColor(hex){
    const root = document.documentElement;
    const club = hex || getComputedStyle(root).getPropertyValue('--brand').trim() || '#0B5D3B';
    root.style.setProperty('--club', club);
    // --club-ink: si el color es muy claro, oscurece para texto legible
    root.style.setProperty('--club-ink', darkenIfLight(club));
  }
  function darkenIfLight(hex){
    const c = hex.replace('#',''); if(c.length<6) return hex;
    const r=parseInt(c.slice(0,2),16), g=parseInt(c.slice(2,4),16), b=parseInt(c.slice(4,6),16);
    const lum = (0.299*r + 0.587*g + 0.114*b);
    if(lum > 170){ // claro -> oscurecer 45%
      const dk = (x)=> Math.round(x*0.55);
      return '#' + [dk(r),dk(g),dk(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
    }
    return hex;
  }

  /* confeti en colores del club (canvas 2D ligero) */
  function confetti(clubHex){
    if(reducedMotion()) return;
    const cv = $('#confetti'); if(!cv) return;
    const ctx = cv.getContext('2d');
    let W,H; const size=()=>{W=cv.width=innerWidth;H=cv.height=innerHeight;}; size();
    const onResize=()=>size(); addEventListener('resize', onResize);
    const cols = [clubHex||'#0B5D3B','#C2872B','#0B5D3B','#E84855','#16140F'];
    const P = Array.from({length:120},()=>({x:Math.random()*W,y:-20-Math.random()*H*0.5,
      s:5+Math.random()*7, vy:2+Math.random()*3.5, vx:-1.5+Math.random()*3, rot:Math.random()*6,
      vr:-0.2+Math.random()*0.4, c:cols[Math.floor(Math.random()*cols.length)]}));
    const t0=performance.now(), dur=2600;
    (function loop(now){
      const el=now-t0; ctx.clearRect(0,0,W,H);
      P.forEach(p=>{ p.y+=p.vy; p.x+=p.vx; p.rot+=p.vr; p.vy+=0.02;
        ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot); ctx.fillStyle=p.c;
        ctx.globalAlpha=Math.max(0,1-el/dur); ctx.fillRect(-p.s/2,-p.s/2,p.s,p.s*0.6); ctx.restore(); });
      if(el<dur) requestAnimationFrame(loop); else { ctx.clearRect(0,0,W,H); removeEventListener('resize',onResize); }
    })(t0);
  }

  /* ------------------------------------------------------ tema / idioma */
  function getTheme(){
    const saved = localStorage.getItem('pl_theme');
    if(saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function setTheme(theme){
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('pl_theme', theme);
  }
  function toggleTheme(){ setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); }

  function setLang(lang){
    PLi18n.lang = lang;
    document.documentElement.lang = lang;
    localStorage.setItem('pl_lang', lang);
    const lb = $('#langBtn'); if(lb) lb.textContent = lang.toUpperCase();
    renderHeaderNav();
    renderFooter();
    route(); // re-render de la vista actual con el nuevo idioma
  }
  function toggleLang(){ setLang(PLi18n.lang === 'es' ? 'en' : 'es'); }

  /* footer dependiente del idioma (consolidado aquí; antes estaba duplicado en
     index.html — point 14). Texto del enlace "reportar" + línea de edición.      */
  function renderFooter(){
    try {
      const d = PLData.getDailySquad();
      const rl = $('#reportLink'); if(rl) rl.textContent = PLi18n.t('report');
      const eb = $('#ediBot');
      if(eb && d) eb.textContent = PLi18n.t('edicion', { n:d.edition, date: fmtDateLong(d.gameDate) });
    } catch(e){}
  }

  /* ------------------------------------------------------ cabecera / nav */
  let currentUser = null;
  let currentProfile = null;

  function renderHeaderNav(){
    const nav = $('#viewnav'); if(!nav) return;
    const v = currentView();
    const items = [
      { key:'play',    label: PLi18n.t('nav_play') },
      { key:'survival',label: PLi18n.t('nav_survival') },
      { key:'rank',    label: PLi18n.t('nav_rank') },
      { key: currentUser ? 'profile' : 'login', label: currentUser ? PLi18n.t('nav_profile') : PLi18n.t('login') },
    ];
    nav.innerHTML = items.map(it =>
      `<button data-go="${it.key}" ${ (v===it.key || (it.key==='profile'&&v==='profile')) ? 'aria-current="page"' : '' }>${esc(it.label)}</button>`
    ).join('') + (currentUser ? `<button data-go="logout">${esc(PLi18n.t('logout'))}</button>` : '');
    nav.querySelectorAll('button').forEach(b=> b.addEventListener('click', ()=>{
      const go = b.dataset.go;
      if(go === 'logout'){ doLogout(); return; }
      location.hash = '#/' + go;
    }));
  }

  /* ------------------------------------------------------ ROUTER */
  function currentView(){
    const h = (location.hash || '#/play').replace(/^#\//,'');
    return h.split('?')[0] || 'play';
  }

  async function route(){
    const view = currentView();
    const c = $('#view');
    renderHeaderNav();
    renderFooter();

    try {
      switch(view){
        case 'home':     renderHome(c); break;
        case 'play':     await PLGame.start(c); break;
        case 'survival': PLSurvival.start(c); break;
        case 'login':    renderAuth(c, 'login'); break;
        case 'register': renderAuth(c, 'register'); break;
        case 'reset':    renderAuth(c, 'reset'); break;
        case 'newpass':  renderAuth(c, 'newpass'); break;
        case 'profile':  await renderProfile(c); break;
        case 'rank':     await renderRank(c); break;
        case 'report':   renderReport(c); break;
        default:         location.hash = '#/play'; return;
      }
    } catch(err){
      // si una vista async falla (red caída, etc.) pintamos error+reintento en lugar
      // de dejar "Cargando…" colgado para siempre
      console.warn('[Plantillazo] route error:', err && err.message);
      renderViewError(c, ()=> route());
    }
    // accesibilidad: lleva el foco al encabezado de la vista al cambiar de ruta
    focusViewHeading(c);
  }

  /* mueve el foco al primer encabezado de la vista (sin scroll brusco).
     En 'play' el foco al buscador lo gestiona game.js, así que ahí no forzamos. */
  function focusViewHeading(c){
    if(!c) return;
    if(currentView() === 'play') return; // game.js enfoca el input de búsqueda
    const h = c.querySelector('h1, h2, h3');
    if(h){
      h.setAttribute('tabindex','-1');
      try { h.focus({ preventScroll:true }); } catch(e){ h.focus(); }
    }
  }

  /* ------------------------------------------------------ VISTA: landing */
  function renderHome(c){
    applyClubColor(null);
    const t = PLi18n.t;
    c.innerHTML = `
      <section class="hero reveal d2">
        <h1 class="big">Planti<b>llazo</b></h1>
        <p class="lede">${esc(t('hero_lede'))}</p>
        <div class="cta-row">
          <button class="btn primary" id="ctaPlay">${esc(t('play_today'))}</button>
          <button class="btn ghost" id="ctaSurvival">${esc(t('survival_cta'))}</button>
        </div>
        <p class="surv-tagline">${esc(t('survival_landing_hint'))}</p>
        <div class="cta-row" style="margin-top:14px">
          ${ currentUser ? `<button class="btn ghost" id="ctaProfile">${esc(t('nav_profile'))}</button>`
                         : `<button class="btn ghost" id="ctaLogin">${esc(t('login'))}</button>` }
        </div>
      </section>
      <section class="howto reveal d3">
        <h2>${esc(t('howto_title'))}</h2>
        <ol>
          <li>${t('howto_1')}</li>
          <li>${t('howto_2')}</li>
          <li>${t('howto_3')}</li>
          <li>${t('howto_4')}</li>
        </ol>
      </section>
      <div class="ad reveal d3" role="complementary" aria-label="ad">${esc(t('ad'))}</div>
      <p class="crosspromo reveal d3">${t('crosspromo')}</p>
    `;
    $('#ctaPlay').addEventListener('click', ()=> location.hash='#/play');
    const cs = $('#ctaSurvival'); if(cs) cs.addEventListener('click', ()=> location.hash='#/survival');
    const cl = $('#ctaLogin'); if(cl) cl.addEventListener('click', ()=> location.hash='#/login');
    const cp = $('#ctaProfile'); if(cp) cp.addEventListener('click', ()=> location.hash='#/profile');
  }

  /* ------------------------------------------------------ VISTA: auth */
  function renderAuth(c, mode){
    applyClubColor(null);
    const t = PLi18n.t;
    const offline = !PLSupa.isReady();
    let body = '';

    if(mode === 'login'){
      body = `
        <h2>${esc(t('auth_login_title'))}</h2>
        <p class="sub">${esc(t('auth_login_sub'))}</p>
        <div id="msg"></div>
        <div class="field"><label for="email">${esc(t('f_email'))}</label><input id="email" type="email" autocomplete="email"></div>
        <div class="field"><label for="password">${esc(t('f_password'))}</label><input id="password" type="password" autocomplete="current-password"></div>
        <button class="btn primary full" id="submitBtn">${esc(t('do_login'))}</button>
        <div class="formlinks">
          <button data-go="register">${esc(t('link_to_register'))}</button>
          <button data-go="reset">${esc(t('link_forgot'))}</button>
        </div>`;
    } else if(mode === 'register'){
      const teams = PLData.getAllTeams();
      const teamOpts = `<option value="">${esc(t('f_select'))}</option>` +
        teams.map(tm=>`<option value="${tm.id}">${esc(tm.name)}</option>`).join('');
      body = `
        <h2>${esc(t('auth_register_title'))}</h2>
        <p class="sub">${esc(t('auth_register_sub'))}</p>
        <div id="msg"></div>
        <div class="field"><label for="email">${esc(t('f_email'))}</label><input id="email" type="email" autocomplete="email"></div>
        <div class="field"><label for="username">${esc(t('f_username'))}</label><input id="username" type="text" autocomplete="username"></div>
        <div class="field"><label for="password">${esc(t('f_password'))}</label><input id="password" type="password" autocomplete="new-password"></div>
        <div class="field"><label for="favteam">${esc(t('f_favteam'))} <span class="opt">${esc(t('f_optional'))}</span></label><select id="favteam">${teamOpts}</select></div>
        <div class="field"><label for="country">${esc(t('f_country'))} <span class="opt">${esc(t('f_optional'))}</span></label><input id="country" type="text" autocomplete="country-name"></div>
        <div class="field"><label for="birthyear">${esc(t('f_birthyear'))} <span class="opt">${esc(t('f_optional'))}</span></label><input id="birthyear" type="number" min="1920" max="2020" inputmode="numeric"></div>
        <button class="btn primary full" id="submitBtn">${esc(t('do_register'))}</button>
        <div class="formlinks"><button data-go="login">${esc(t('link_to_login'))}</button></div>`;
    } else if(mode === 'reset'){
      body = `
        <h2>${esc(t('auth_reset_title'))}</h2>
        <p class="sub">${esc(t('auth_reset_sub'))}</p>
        <div id="msg"></div>
        <div class="field"><label for="email">${esc(t('f_email'))}</label><input id="email" type="email" autocomplete="email"></div>
        <button class="btn primary full" id="submitBtn">${esc(t('do_reset'))}</button>
        <div class="formlinks"><button data-go="login">${esc(t('link_to_login'))}</button></div>`;
    } else if(mode === 'newpass'){
      body = `
        <h2>${esc(t('auth_newpass_title'))}</h2>
        <p class="sub">${esc(t('auth_newpass_sub'))}</p>
        <div id="msg"></div>
        <div class="field"><label for="password">${esc(t('f_newpassword'))}</label><input id="password" type="password" autocomplete="new-password"></div>
        <button class="btn primary full" id="submitBtn">${esc(t('do_newpass'))}</button>`;
    }

    c.innerHTML = `<section class="card reveal d2">${body}</section>`;
    if(offline){ showMsg('err', PLi18n.t('offline_login')); }

    c.querySelectorAll('[data-go]').forEach(b=> b.addEventListener('click', ()=> location.hash='#/'+b.dataset.go));
    const sub = $('#submitBtn');
    if(sub) sub.addEventListener('click', ()=> handleAuthSubmit(mode));
    // Enter envía
    c.querySelectorAll('input').forEach(inp => inp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); handleAuthSubmit(mode);} }));
  }

  function showMsg(kind, text){
    const m = $('#msg'); if(!m) return;
    m.innerHTML = `<div class="formmsg ${kind}">${esc(text)}</div>`;
  }

  async function handleAuthSubmit(mode){
    const t = PLi18n.t;
    const sub = $('#submitBtn'); if(sub) sub.disabled = true;
    try {
      if(mode === 'login'){
        const email = $('#email').value.trim(), password = $('#password').value;
        if(!email || !password){ showMsg('err', t('err_fields')); return; }
        await PLSupa.login({ email, password });
        await refreshAuth();
        location.hash = '#/profile';
      }
      else if(mode === 'register'){
        const email = $('#email').value.trim();
        const username = $('#username').value.trim();
        const password = $('#password').value;
        if(!email || !username || !password){ showMsg('err', t('err_fields')); return; }
        if(username.length < 3){ showMsg('err', t('err_username_len')); return; }
        if(password.length < 6){ showMsg('err', t('err_pass_len')); return; }
        const favteam = $('#favteam').value ? Number($('#favteam').value) : null;
        const country = $('#country').value.trim() || null;
        const by = $('#birthyear').value ? Number($('#birthyear').value) : null;
        await PLSupa.register({ email, username, password, favoriteTeamId:favteam, country, birthYear:by });
        await refreshAuth();
        if(currentUser){ location.hash = '#/profile'; }
        else { showMsg('ok', t('msg_register_ok')); }
      }
      else if(mode === 'reset'){
        const email = $('#email').value.trim();
        if(!email){ showMsg('err', t('err_fields')); return; }
        await PLSupa.requestPasswordReset(email);
        showMsg('ok', t('msg_reset_sent'));
      }
      else if(mode === 'newpass'){
        const password = $('#password').value;
        if(password.length < 6){ showMsg('err', t('err_pass_len')); return; }
        await PLSupa.updatePassword(password);
        showMsg('ok', t('msg_newpass_ok'));
        setTimeout(()=> location.hash='#/profile', 1200);
      }
    } catch(err){
      showMsg('err', friendlyErr(err));
    } finally {
      if(sub) sub.disabled = false;
    }
  }

  function friendlyErr(err){
    const m = (err && err.message) ? err.message : String(err);
    const en = PLi18n.lang === 'en';
    if(/invalid login credentials/i.test(m)) return en?'Wrong email or password.':'Email o contraseña incorrectos.';
    if(/already registered|already exists|duplicate/i.test(m)) return en?'That email is already registered.':'Ese email ya está registrado.';
    if(/email not confirmed/i.test(m)) return en?'Confirm your email first.':'Confirma tu email primero.';
    return m;
  }

  async function doLogout(){
    await PLSupa.logout();
    currentUser = null; currentProfile = null;
    renderHeaderNav();
    location.hash = '#/play';
    toast(PLi18n.t('logged_out'));
  }

  /* ------------------------------------------------------ VISTA: perfil */
  async function renderProfile(c){
    applyClubColor(null);
    const t = PLi18n.t;
    if(!PLSupa.isReady() || !currentUser){
      c.innerHTML = `<section class="card reveal d2"><p class="empty-state">${esc(t('prof_need_login'))}</p>
        <button class="btn primary full" id="goLogin">${esc(t('login'))}</button></section>`;
      const gl = $('#goLogin'); if(gl) gl.addEventListener('click', ()=> location.hash='#/login');
      return;
    }
    c.innerHTML = `<p class="empty-state reveal d2">${esc(t('prof_loading'))}</p>`;

    let prof, stats, allBadges, myBadgeIds;
    try {
      [prof, stats, allBadges, myBadgeIds] = await Promise.all([
        PLSupa.getProfile(), PLSupa.getMyStats(), PLSupa.getAllBadges(), PLSupa.getMyBadgeIds()
      ]);
    } catch(err){
      renderViewError(c, ()=> renderProfile(c));
      return;
    }
    allBadges = allBadges || [];
    myBadgeIds = myBadgeIds || [];
    currentProfile = prof;
    const uname = prof ? prof.username : (currentUser.email||'jugador');
    const initial = (uname||'?').charAt(0).toUpperCase();
    const fav = prof && prof.favorite_team_id ? PLData.getTeam(prof.favorite_team_id) : null;
    const club = fav ? fav.colorPrimary : null;
    applyClubColor(club);

    const streak = prof ? (prof.current_streak||0) : 0;
    const best = prof ? (prof.best_streak||0) : 0;
    const s = stats || { winRate:0, bestTimeMs:null, avgRarity:0, played:0 };

    const badgesHtml = allBadges.length ? allBadges.map(b=>{
      const owned = myBadgeIds.includes(b.id);
      const name = PLi18n.lang==='en' ? (b.name_en||b.name_es) : (b.name_es||b.name_en);
      const desc = PLi18n.lang==='en' ? (b.desc_en||b.desc_es||'') : (b.desc_es||b.desc_en||'');
      return `<div class="badge ${owned?'':'locked'}" title="${esc(desc)}">
        <div class="ic">${esc(b.icon||'🏅')}</div>
        <div class="bn">${esc(name)}</div>
        <div class="bd">${esc(desc)}</div>
      </div>`;
    }).join('') : `<p class="empty-state">${esc(t('prof_nobadges'))}</p>`;

    const metaLine = [
      fav ? fav.name : null,
      prof && prof.country ? prof.country : null,
      prof && prof.birth_year ? prof.birth_year : null,
    ].filter(Boolean).join(' · ');

    c.innerHTML = `
      <section class="profhead reveal d2">
        <div class="avatar" style="background:var(--club)">${esc(initial)}</div>
        <div class="who2"><div class="u">@${esc(uname)}</div><div class="meta">${esc(metaLine||'LaLiga')}</div></div>
      </section>

      <section class="profgrid reveal d3">
        <div class="stat"><div class="k">${esc(t('prof_streak'))}</div><div class="v">${streak}</div></div>
        <div class="stat"><div class="k">${esc(t('prof_best'))}</div><div class="v">${best}</div></div>
        <div class="stat"><div class="k">${esc(t('prof_winrate'))}</div><div class="v">${s.winRate}<small style="font-size:14px">%</small></div></div>
        <div class="stat"><div class="k">${esc(t('prof_besttime'))}</div><div class="v">${esc(fmtTime(s.bestTimeMs))}</div></div>
        <div class="stat"><div class="k">${esc(t('prof_avgrarity'))}</div><div class="v" style="color:var(--gold)">${s.avgRarity}</div></div>
        <div class="stat"><div class="k">${esc(t('prof_played'))}</div><div class="v">${s.played}</div></div>
      </section>

      <h3 class="section-title reveal d3">${esc(t('prof_badges'))}</h3>
      <div class="badges reveal d4">${badgesHtml}</div>
    `;
  }

  /* ------------------------------------------------------ VISTA: ranking */
  let rankTab = 'daily';
  async function renderRank(c){
    applyClubColor(null);
    const t = PLi18n.t;
    c.innerHTML = `
      <div class="tabs reveal d2" role="tablist">
        <button id="tabDaily" role="tab" aria-selected="${rankTab==='daily'}">${esc(t('rank_daily'))}</button>
        <button id="tabGlobal" role="tab" aria-selected="${rankTab==='global'}">${esc(t('rank_global'))}</button>
      </div>
      <div id="rankBody" class="reveal d3"><p class="empty-state">${esc(t('rank_loading'))}</p></div>
    `;
    $('#tabDaily').addEventListener('click', ()=>{ rankTab='daily'; renderRank(c); });
    $('#tabGlobal').addEventListener('click', ()=>{ rankTab='global'; renderRank(c); });

    if(!PLSupa.isReady()){
      $('#rankBody').innerHTML = `<p class="empty-state">${esc(t('rank_offline'))}</p>`;
      return;
    }

    let rows;
    try {
      const daily = PLData.getDailySquad();
      rows = rankTab==='daily'
        ? await PLSupa.getLeaderboardDaily(daily.gameDate)
        : await PLSupa.getLeaderboardGlobal();
    } catch(err){
      renderViewError($('#rankBody'), ()=> renderRank(c));
      return;
    }

    if(!rows || !rows.length){
      $('#rankBody').innerHTML = `<p class="empty-state">${esc(t('rank_empty'))}</p>`;
      return;
    }
    const meId = currentUser ? currentUser.id : null;
    const head = `<div class="lrow head"><span>${esc(t('rank_pos'))}</span><span>${esc(t('rank_user'))}</span><span>${esc(t('rank_pts'))}</span></div>`;
    const body = rows.map((r,i)=>{
      const isMe = meId && r.user_id === meId;
      const pos = i+1;
      // daily -> rarity_points ; global -> total_rarity
      const pts = rankTab==='daily' ? r.rarity_points : r.total_rarity;
      return `<div class="lrow ${isMe?'me':''}">
        <span class="pos ${pos<=3?'top':''}">${pos}</span>
        <span class="usr">@${esc(r.username||'jugador')}${isMe?` <small style="color:var(--ink-soft)">(${esc(t('rank_you'))})</small>`:''}</span>
        <span class="pts">${Math.round(Number(pts)||0)}</span>
      </div>`;
    }).join('');
    $('#rankBody').innerHTML = `<div class="ltable">${head}${body}</div>`;
  }

  /* helper: estado de error con reintento dentro de un contenedor cualquiera */
  function renderViewError(target, onRetry){
    const t = PLi18n.t;
    if(!target) return;
    target.innerHTML = `<div class="card" role="alert" style="margin-top:8px">
      <h2>${esc(t('err_title'))}</h2>
      <p class="sub">${esc(t('err_load'))}</p>
      <button class="btn primary full" id="retryView">${esc(t('retry'))}</button>
    </div>`;
    const b = target.querySelector('#retryView');
    if(b && typeof onRetry === 'function') b.addEventListener('click', onRetry);
  }

  /* ------------------------------------------------------ VISTA: reportar */
  function renderReport(c){
    const t = PLi18n.t;
    const d = PLData.getDailySquad();
    c.innerHTML = `
      <section class="card reveal d2">
        <h2>${esc(t('report_title'))}</h2>
        <p class="sub">${esc(t('report_sub'))}</p>
        <div id="msg"></div>
        <div class="field"><label for="rep">${esc(t('report_player'))}</label><input id="rep" type="text"></div>
        <button class="btn primary full" id="repBtn">${esc(t('report_send'))}</button>
        <div class="formlinks"><button data-go="play">${esc(t('nav_play'))}</button></div>
      </section>`;
    c.querySelectorAll('[data-go]').forEach(b=> b.addEventListener('click', ()=> location.hash='#/'+b.dataset.go));
    $('#repBtn').addEventListener('click', ()=>{
      const val = $('#rep').value.trim();
      if(!val){ showMsg('err', t('err_fields')); return; }
      // MVP: el reporte se guarda en localStorage (en prod -> tabla pl_reports / Edge Function)
      try {
        const key='pl_reports'; const arr=JSON.parse(localStorage.getItem(key)||'[]');
        arr.push({ when:new Date().toISOString(), gameDate:d.gameDate, squadId:d.squadId, text:val });
        localStorage.setItem(key, JSON.stringify(arr));
      } catch(e){}
      showMsg('ok', t('report_thanks'));
      $('#rep').value='';
    });
  }

  /* ------------------------------------------------------ auth bootstrap */
  async function refreshAuth(){
    if(!PLSupa.isReady()){ currentUser=null; return; }
    currentUser = await PLSupa.getUser();
    renderHeaderNav();
  }

  /* ------------------------------------------------------ init */
  async function init(){
    // tema + idioma persistidos
    setTheme(getTheme());
    const savedLang = localStorage.getItem('pl_lang') || ((navigator.language||'es').slice(0,2)==='en'?'en':'es');
    PLi18n.lang = savedLang; document.documentElement.lang = savedLang;
    $('#langBtn').textContent = savedLang.toUpperCase();

    $('#themeBtn').addEventListener('click', toggleTheme);
    $('#langBtn').addEventListener('click', toggleLang);
    $('#brandBtn').addEventListener('click', ()=> location.hash='#/home');

    // Supabase
    PLSupa.init();
    if(PLSupa.isReady()){
      // Precarga del dataset desde pl_* (con fallback a demo si falla) y resolución
      // del reto del día por la Edge Function `daily-challenge`. Se hace ANTES del
      // primer render para que getDailySquad()/getAllTeams() (síncronos) usen ya los
      // datos reales. Si algo falla, PLData cae a los datos demo (juego jugable).
      try {
        await PLData.preload();
        await PLData.getDailyRemote();
      } catch(e){ console.warn('[Plantillazo] preload/daily remoto falló, uso demo:', e && e.message); }
      await refreshAuth();
      // recuperación de contraseña: Supabase dispara PASSWORD_RECOVERY al volver del email
      PLSupa.onAuthChange((session, event)=>{
        currentUser = session ? session.user : null;
        renderHeaderNav();
        // Señal FIABLE del flujo de reset: el token del hash se consume nada más
        // cargar supabase-js, así que el regex de abajo puede llegar tarde. El evento
        // PASSWORD_RECOVERY siempre llega y nos lleva a la pantalla de nueva contraseña.
        if(event === 'PASSWORD_RECOVERY'){ location.hash = '#/newpass'; }
      });
      // respaldo: si el hash todavía trae el token (la app cargó antes de que
      // supabase-js lo consuma), también enrutamos a la pantalla de nueva contraseña.
      if(/type=recovery/.test(location.hash) || /access_token/.test(location.hash)){
        location.hash = '#/newpass';
      }
    }

    // número de edición en cabecera (tras resolver el reto: remoto si Supabase está
    // listo, local en modo offline). Protegido si el reto no carga.
    const daily = PLData.getDailySquad();
    $('#ediTop').textContent = 'Nº ' + (daily && daily.edition != null ? daily.edition : '—');

    window.addEventListener('hashchange', route);
    if(!location.hash) location.hash = '#/home';
    route();
  }

  // utilidades expuestas para game.js
  window.PLApp = {
    toast, confetti, reducedMotion,
    fmtTime, fmtDateShort, fmtDateLong,
    applyClubColor,
  };

  document.addEventListener('DOMContentLoaded', init);
})();
