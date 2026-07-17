/* ============================================================================
   PLANTILLAZO — Motor del modo diario (game.js)
   ----------------------------------------------------------------------------
   Renderiza y gobierna la vista de juego: dossier del día, buscador con
   autocompletado, 5 intentos, rareza, acierto/fallo, tarjeta de compartir.
   Depende de PLData (datos), PLi18n (textos), PLSupa (guardado), PLApp (utils).

   Progreso del día: se guarda en localStorage para que recargar no resetee el
   reto (clave por fecha). Si hay sesión, además se persiste en pl_results.
   ============================================================================ */
(function(){
  'use strict';

  const MAX = 5;
  let st = null;        // estado del reto en curso
  let listIdx = -1;     // navegación con teclado en el desplegable

  const $ = (sel, root=document) => root.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function lsKey(date){ return 'pl_daily_' + date; }

  function loadProgress(date){
    try { return JSON.parse(localStorage.getItem(lsKey(date)) || 'null'); }
    catch(e){ return null; }
  }
  function saveProgress(){
    try { localStorage.setItem(lsKey(st.daily.gameDate), JSON.stringify({
      misses: st.misses, solved: st.solved, finished: st.finished,
      solvedPlayerId: st.solvedPlayerId, rarity: st.rarity, timeMs: st.timeMs, attempts: st.attempts,
    })); } catch(e){}
  }

  /* ---- Arranque de la vista de juego ---- */
  async function start(container){
    const daily = PLData.getDailySquad(); // reto global del día (determinista)
    if(!daily || !daily.team){
      // robustez: sin reto válido (dataset roto / Edge Function futura caída)
      renderError(container);
      return;
    }
    // aplica el color del club del día a la pantalla
    PLApp.applyClubColor(daily.team && daily.team.colorPrimary);

    const prev = loadProgress(daily.gameDate) || { misses: [], solved:false, finished:false };
    st = {
      daily,
      misses: prev.misses || [],
      solved: !!prev.solved,
      finished: !!prev.finished,
      solvedPlayerId: prev.solvedPlayerId || null,
      rarity: prev.rarity || 0,
      timeMs: prev.timeMs || 0,
      attempts: prev.attempts || (prev.misses ? prev.misses.length : 0),
      startedAt: performance.now(),
      alreadyPlayed: false,
    };

    // 'Ya jugaste hoy': si hay sesión y existe resultado del día en el servidor,
    // hidratamos el estado terminado y NO dejamos volver a jugar. Para anónimos se
    // mantiene el localStorage (prev) como hasta ahora.
    if(PLSupa.isReady()){
      try {
        const user = await PLSupa.getUser();
        if(user){
          const res = await PLSupa.getTodayResult(daily.gameDate);
          if(res){
            st.finished = true;
            st.solved = !!res.solved;
            st.solvedPlayerId = res.guessed_player_id || st.solvedPlayerId || null;
            st.attempts = res.attempts != null ? res.attempts : st.attempts;
            st.timeMs = res.time_ms != null ? res.time_ms : st.timeMs;
            st.rarity = res.rarity_points != null ? res.rarity_points : st.rarity;
            st.alreadyPlayed = true;
            saveProgress(); // refleja en localStorage para coherencia offline
          }
        }
      } catch(e){
        // si falla la consulta no bloqueamos el juego: seguimos con el estado local
        console.warn('[Plantillazo] getTodayResult falló, uso estado local:', e && e.message);
      }
    }

    if(st.finished){ renderFinished(container); }
    else { renderPlay(container); }
  }

  /* ---- Render: estado de error con reintento ---- */
  function renderError(container){
    const t = PLi18n.t;
    container.innerHTML = `
      <section class="card reveal d2" role="alert">
        <h2>${esc(t('err_title'))}</h2>
        <p class="sub">${esc(t('err_load'))}</p>
        <button class="btn primary full" id="retryBtn">${esc(t('retry'))}</button>
      </section>`;
    const b = $('#retryBtn');
    if(b) b.addEventListener('click', ()=> start(container));
  }

  /* ---- Render: pantalla jugable ---- */
  function renderPlay(container){
    const d = st.daily, t = PLi18n.t;
    const editionDate = PLApp.fmtDateShort(d.gameDate);
    container.innerHTML = `
      <section class="dossier reveal d2">
        <p class="kicker"><span class="dot">●</span> <span>${esc(t('kicker'))}</span></p>
        <div class="stamp">
          <span class="edicode">${esc(editionDate)}</span>
          <span class="band">${esc(t('band'))}</span>
          <h1 class="team">${esc(d.team.name)}<span class="accentline"></span></h1>
          <p class="season">${esc(formatSeason(d.season))}</p>
          <p class="ask">${esc(t('ask',{n:MAX}))}</p>
        </div>
      </section>

      <section class="search reveal d3">
        <label for="q">${esc(t('searchLabel'))}</label>
        <div class="ibox">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input id="q" type="text" autocomplete="off" placeholder="${esc(t('searchPlaceholder'))}" aria-expanded="false" aria-controls="menu" aria-autocomplete="list" role="combobox" />
        </div>
        <div class="menu" id="menu" role="listbox" aria-label="${esc(t('searchLabel'))}"></div>
      </section>

      <section class="tries reveal d4">
        <div class="hd">
          <span>${esc(t('triesLabel'))}</span>
          <span id="triesCount">${esc(t('triesCount',{used:st.misses.length,total:MAX}))}</span>
        </div>
        <div class="ticks" id="ticks"></div>
        <div class="misslist" id="misslist"></div>
      </section>

      <section class="rare reveal d5" id="rareBox">
        <div class="row">
          <div>
            <div class="lab">${esc(t('rareLabel'))}</div>
            <div class="tag" id="rareTag">${esc(t('rareTagDefault'))}</div>
          </div>
          <div class="val" id="rareVal">— <small>/100</small></div>
        </div>
        <div class="meter"><i id="rareBar" style="width:0%"></i></div>
      </section>

      <div class="ad" role="complementary" aria-label="ad">${esc(t('ad'))}</div>
    `;
    renderTicks();
    renderMisses();
    wireSearch();
  }

  function formatSeason(s){
    // "2015-16" -> "temporada 2015–16" / "season 2015–16"
    return PLi18n.t('season_prefix') + s.replace('-', '–');
  }

  function renderTicks(){
    const box = $('#ticks'); if(!box) return;
    const cells = [];
    for(let i=0;i<MAX;i++){
      if(i < st.misses.length){ cells.push('<div class="tick ko" title="Fallo">✕</div>'); }
      else if(i === st.misses.length && !st.finished){ cells.push(`<div class="tick cur">${i+1}</div>`); }
      else { cells.push('<div class="tick"></div>'); }
    }
    box.innerHTML = cells.join('');
  }
  function renderMisses(){
    const box = $('#misslist'); if(!box) return;
    box.innerHTML = st.misses.map(m => `<div class="miss"><span class="x">✕</span><span class="nm">${esc(m.name)}</span></div>`).join('');
  }

  /* ---- Buscador con autocompletado ---- */
  function wireSearch(){
    const q = $('#q'), menu = $('#menu');
    if(!q) return;

    function close(){ menu.classList.remove('open'); q.setAttribute('aria-expanded','false'); q.removeAttribute('aria-activedescendant'); listIdx=-1; }
    function renderMenu(list, term){
      if(!list.length){
        menu.innerHTML = `<div class="empty">${esc(PLi18n.t('noResults'))}</div>`;
        menu.classList.add('open'); q.setAttribute('aria-expanded','true');
        q.removeAttribute('aria-activedescendant'); return;
      }
      // term escapado para el resaltado (se aplica el <mark> sobre el HTML YA escapado)
      const safeTerm = esc(term);
      const re = new RegExp('('+safeTerm.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','ig');
      menu.innerHTML = list.map((p,i)=>{
        // XSS: escapamos SIEMPRE el nombre antes de insertar el <mark>; nunca crudo
        const safeDisp = esc(p.display);
        const disp = term ? safeDisp.replace(re,'<mark>$1</mark>') : safeDisp;
        // NO-SPOILER: el desplegable muestra SOLO posición + nombre (+ aka) + nacionalidad.
        // La rareza y el club+años se RETIRARON porque revelaban la respuesta (quién
        // estaba en la plantilla buscada). La nacionalidad no delata pertenencia.
        const nat = p.nationality
          ? `<span class="meta nat" title="${esc(PLi18n.t('nat_label'))}">${esc(p.nationality)}</span>`
          : '';
        return `<button class="opt" role="option" data-id="${p.id}" data-name="${esc(p.display)}" id="opt-${i}">
          <span class="pos">${esc(p.position||'—')}</span>
          <span class="nm">${disp}${p.aka?` <em>(aka ${esc(p.aka)})</em>`:''}</span>
          ${nat}
        </button>`;
      }).join('');
      menu.classList.add('open'); q.setAttribute('aria-expanded','true');
      q.removeAttribute('aria-activedescendant');
      menu.querySelectorAll('.opt').forEach(b=>{
        b.addEventListener('click', ()=> submitGuess(Number(b.dataset.id), b.dataset.name));
      });
      listIdx = -1;
    }

    const sqId = st.daily.squadId;
    // debounce ~120ms: no se busca/renderiza en cada pulsación
    let _debounce = null;
    q.addEventListener('input', ()=>{
      clearTimeout(_debounce);
      const term = q.value.trim();
      if(term.length < 1){ close(); return; }
      _debounce = setTimeout(()=>{
        // por si el campo cambió/limpió durante el debounce
        const cur = q.value.trim();
        if(cur.length < 1){ close(); return; }
        const res = PLData.searchPlayers(cur, sqId);
        renderMenu(res, cur);
      }, 120);
    });
    q.addEventListener('keydown', (e)=>{
      const opts = [...menu.querySelectorAll('.opt')];
      if(e.key === 'ArrowDown'){ e.preventDefault(); if(!opts.length) return; listIdx = Math.min(listIdx+1, opts.length-1); highlight(opts); }
      else if(e.key === 'ArrowUp'){ e.preventDefault(); if(!opts.length) return; listIdx = Math.max(listIdx-1, 0); highlight(opts); }
      else if(e.key === 'Enter'){
        e.preventDefault();
        if(listIdx >= 0 && opts[listIdx]){ const b=opts[listIdx]; submitGuess(Number(b.dataset.id), b.dataset.name); }
        else { const res = PLData.searchPlayers(q.value.trim(), sqId); if(res.length===1){ submitGuess(res[0].id, res[0].display); } }
      }
      else if(e.key === 'Escape'){ close(); }
    });
    function highlight(opts){
      opts.forEach((o,i)=> o.classList.toggle('active', i===listIdx));
      const cur = opts[listIdx];
      if(cur){
        cur.scrollIntoView({block:'nearest'});
        // aria-activedescendant -> opción resaltada (accesibilidad, point 13)
        q.setAttribute('aria-activedescendant', cur.id);
      } else {
        q.removeAttribute('aria-activedescendant');
      }
    }
    document.addEventListener('click', (e)=>{ if(!e.target.closest('.search')) close(); });
    q.focus();

    // guarda close para usarlo desde submitGuess
    st._closeMenu = close;
    st._clearInput = ()=>{ q.value=''; };
  }

  /* ---- Procesa un intento ---- */
  function submitGuess(playerId, displayName){
    if(st.finished) return;
    // guarda anti doble-submit (doble click / Enter+click simultáneos)
    if(st._submitting) return;
    st._submitting = true;
    try {
      _submitGuess(playerId, displayName);
    } finally {
      st._submitting = false;
    }
  }
  function _submitGuess(playerId, displayName){
    if(st._closeMenu) st._closeMenu();
    if(st._clearInput) st._clearInput();

    // ya intentado antes
    if(st.misses.some(m => m.id === playerId)){
      PLApp.toast(PLi18n.t('already_in'));
      return;
    }

    const correct = PLData.isInSquad(playerId, st.daily.squadId);
    if(correct){
      st.solved = true; st.finished = true; st.solvedPlayerId = playerId;
      st.attempts = st.misses.length + 1;
      st.timeMs = Math.round(performance.now() - st.startedAt);
      st.rarity = PLData.getRarity(playerId, st.daily.squadId);
      saveProgress();
      persistResult();
      const c = document.getElementById('view'); renderFinished(c, true);
    } else {
      st.misses.push({ id: playerId, name: displayName });
      st.attempts = st.misses.length;
      renderTicks(); renderMisses();
      const count = document.getElementById('triesCount');
      if(count) count.textContent = PLi18n.t('triesCount',{used:st.misses.length,total:MAX});
      // sacudida del chip actual (el último ko)
      const ticks = document.querySelectorAll('.tick.ko');
      const lastKo = ticks[ticks.length-1];
      if(lastKo){ lastKo.classList.add('shake'); setTimeout(()=>lastKo.classList.remove('shake'),420); }

      if(st.misses.length >= MAX){
        st.finished = true; st.solved = false;
        st.attempts = MAX;
        st.timeMs = Math.round(performance.now() - st.startedAt);
        saveProgress();
        persistResult();
        const c = document.getElementById('view'); renderFinished(c, true);
      } else {
        saveProgress();
      }
    }
  }

  /* ---- Persistir resultado (si hay sesión) ----
     ANTI-TRAMPAS: el resultado se registra por la Edge Function `submit-guess`
     (PLSupa.saveResult -> invoke). La función es la AUTORIDAD: valida el jugador,
     calcula la rareza, actualiza la racha (transaccional) y concede las insignias.
     El cliente YA NO escribe pl_results/racha/insignias (la RLS lo impide). Aquí
     solo enviamos { gameDate, playerId, timeMs, attempts } y mostramos feedback.
     Para anónimos no se llama nada (sigue todo en localStorage).                  */
  async function persistResult(){
    if(!PLSupa.isReady()) return;
    // Mientras el dataset real viva solo en el cliente (PL_REAL), submit-guess
    // validaría contra el seed demo del servidor -> no se envía nada (los
    // resultados de logados quedan en localStorage como los anónimos).
    if(PLData.usingSupabase && !PLData.usingSupabase()) return;
    const user = await PLSupa.getUser();
    if(!user) return;
    const res = await PLSupa.saveResult({
      gameDate: st.daily.gameDate,
      attempts: st.attempts,
      timeMs: st.timeMs,
      // jugador que se envía a validar: el del acierto, o el último intento si se
      // agotaron los 5 (submit-guess valida la pertenencia server-side).
      guessedPlayerId: st.solvedPlayerId
        || (st.misses.length ? st.misses[st.misses.length-1].id : null),
    });
    if(res && res.ok){
      PLApp.toast(PLi18n.t('result_saved'));
      // la rareza/insignias/racha autoritativas vienen del servidor. Si quisiéramos,
      // podríamos notificar las nuevas insignias (res.newBadges) aquí.
    }
  }

  /* ---- Render: pantalla final (acierto o fallo) ---- */
  function renderFinished(container, animate){
    const d = st.daily, t = PLi18n.t;
    const player = st.solvedPlayerId ? PLData.getPlayer(st.solvedPlayerId) : null;
    const playerName = player ? (player.alias || player.fullName) : '';
    const timeStr = PLApp.fmtTime(st.timeMs);
    const rarity = st.solved ? st.rarity : 0;
    const grid = buildShareGrid();

    container.innerHTML = `
      <section class="solved reveal d2 ${st.solved?'':'fail'}">
        <span class="seal">${esc(st.solved ? t('seal_ok') : t('seal_ko'))}</span>
        <h1>${esc(st.solved ? t('title_ok') : t('title_ko'))}</h1>
        <p class="who">${esc(st.solved ? t('who_ok') : t('who_ko'))} <b>${esc(st.solved ? playerName : (d.team.name + ' ' + formatSeason(d.season)))}</b></p>
        ${st.alreadyPlayed ? `<p class="already">${esc(t('already_played'))}</p>` : ''}
      </section>

      <section class="stats reveal d3">
        <div class="stat rar"><div class="k">${esc(t('kRar'))}</div><div class="v">${st.solved?rarity:'—'}</div></div>
        <div class="stat tim"><div class="k">${esc(t('kTim'))}</div><div class="v">${esc(timeStr)}</div></div>
        <div class="stat try"><div class="k">${esc(t('kTry'))}</div><div class="v">${st.attempts}</div></div>
      </section>

      <section class="sharecard reveal d4" id="card">
        <div class="sc-top">
          <span class="sc-mark">Planti<b>llazo</b></span>
          <span class="sc-edi">#${d.edition} · ${esc(PLApp.fmtDateShort(d.gameDate))}</span>
        </div>
        <div class="sc-grid">${grid.html}</div>
        <p class="sc-line"><b>${esc(t('kRar'))} ${st.solved?rarity:0}</b> · <span>${esc(timeStr)}</span> · <span>${st.attempts} ${esc(t('kTry').toLowerCase())}</span></p>
        <p class="nospoiler">${esc(t('noSpoiler'))}</p>
        <div class="sc-foot"><span>38-0.es/plantillazo</span><span>${esc(t('scPlay'))}</span></div>
      </section>

      <div class="actions reveal d4">
        <button class="btn primary" id="shareBtn">${esc(t('share'))}</button>
        <button class="btn ghost" id="copyBtn">${esc(t('copy'))}</button>
      </div>

      <div class="ad" role="complementary" aria-label="ad">${esc(t('ad'))}</div>

      <section class="countdown reveal d4" id="countdown">
        <div class="cd-lab">${esc(t('next_in'))}</div>
        <div class="cd-clock" id="cdClock" aria-live="off">--:--:--</div>
        <button class="btn ghost cd-notify" id="notifyBtn">${esc(t('notify_me'))}</button>
      </section>

      <p class="crosspromo reveal d4" id="loginHint" hidden>${esc(t('save_login_hint'))}</p>
    `;

    $('#shareBtn').addEventListener('click', ()=> doShare(grid.text));
    $('#copyBtn').addEventListener('click', ()=> doCopy(grid.text));
    startCountdown();
    wireNotify();

    // muestra el aviso de "inicia sesión para guardar" solo si no hay sesión
    if(PLSupa.isReady()){
      PLSupa.getUser().then(u=>{ if(!u){ const h=$('#loginHint'); if(h) h.hidden=false; } });
    }

    if(animate && st.solved && !PLApp.reducedMotion()){ PLApp.confetti(d.team && d.team.colorPrimary); }
  }

  /* ---- Cuenta atrás a la próxima medianoche UTC (point 7) ----
     El reto cambia a las 00:00 UTC (coherente con dateKey en UTC). Mostramos
     HH:MM:SS vivo. Se limpia el intervalo al re-render (clave _cdTimer en st).   */
  let _cdTimer = null;
  function startCountdown(){
    if(_cdTimer){ clearInterval(_cdTimer); _cdTimer = null; }
    const clock = $('#cdClock');
    if(!clock) return;
    function tick(){
      const cl = document.getElementById('cdClock');
      if(!cl){ if(_cdTimer){ clearInterval(_cdTimer); _cdTimer=null; } return; }
      const now = new Date();
      // próxima medianoche UTC
      const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()+1, 0,0,0,0);
      let diff = Math.max(0, Math.floor((next - now.getTime())/1000));
      const h = String(Math.floor(diff/3600)).padStart(2,'0');
      const m = String(Math.floor((diff%3600)/60)).padStart(2,'0');
      const s = String(diff%60).padStart(2,'0');
      cl.textContent = `${h}:${m}:${s}`;
    }
    tick();
    _cdTimer = setInterval(tick, 1000);
  }

  /* ---- "Avísame" (opt-in) — stub funcional (TODO) ----
     De momento intenta usar la Notifications API del navegador como recordatorio
     simple del día siguiente. El reenganche real (email a las 00:00 / push) irá por
     servidor (ver README §6.5). Guardamos el opt-in en localStorage.             */
  function wireNotify(){
    const btn = $('#notifyBtn');
    if(!btn) return;
    // refleja estado previo
    try { if(localStorage.getItem('pl_notify_optin') === '1'){ btn.textContent = PLi18n.t('notify_on'); btn.classList.add('on'); } } catch(e){}
    btn.addEventListener('click', async ()=>{
      // TODO(servidor): registrar el opt-in real (email/push) en pl_profiles / Edge Function.
      try { localStorage.setItem('pl_notify_optin', '1'); } catch(e){}
      if('Notification' in window){
        try {
          const perm = await Notification.requestPermission();
          if(perm === 'granted'){
            PLApp.toast(PLi18n.t('notify_set'));
          } else {
            PLApp.toast(PLi18n.t('notify_blocked'));
          }
        } catch(e){ PLApp.toast(PLi18n.t('notify_set')); }
      } else {
        PLApp.toast(PLi18n.t('notify_set'));
      }
      btn.textContent = PLi18n.t('notify_on');
      btn.classList.add('on');
    });
  }

  /* ---- Tarjeta de compartir SIN spoilers (cuadritos estilo Wordle) ---- */
  function buildShareGrid(){
    // 5 celdas: ✕ por cada fallo, ✓ por el acierto, ★ marca la rareza alta.
    const cells = [];
    const text = [];
    for(let i=0;i<MAX;i++){
      if(i < st.misses.length){ cells.push('<span class="cell x">·</span>'); text.push('·'); }
      else if(i === st.misses.length && st.solved){
        if(st.rarity >= 70){ cells.push('<span class="cell y">★</span>'); text.push('★'); }
        else { cells.push('<span class="cell g">✓</span>'); text.push('✓'); }
      }
      else { cells.push('<span class="cell x">·</span>'); text.push('·'); }
    }
    const d = st.daily, t = PLi18n.t;
    const timeStr = PLApp.fmtTime(st.timeMs);
    const shareText =
      `Plantillazo #${d.edition}\n` +
      `${text.join(' ')}\n` +
      `${t('kRar')} ${st.solved?st.rarity:0} · ${timeStr} · ${st.attempts} ${t('kTry').toLowerCase()}\n` +
      `38-0.es/plantillazo`;
    return { html: cells.join(''), text: shareText };
  }

  function toast(){ PLApp.toast(PLi18n.t('toast_copied')); }
  async function doCopy(txt){ try{ await navigator.clipboard.writeText(txt); }catch(e){} toast(); }
  async function doShare(txt){
    if(navigator.share){ try{ await navigator.share({ text: txt }); return; }catch(e){} }
    doCopy(txt);
  }

  window.PLGame = { start, _state: ()=>st };
})();
