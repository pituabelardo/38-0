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

  /* ---- Racha LOCAL (localStorage) ------------------------------------------
     El gancho de hábito para el 98% anónimo: la racha vive en el navegador
     desde la primera partida, sin cuenta. Al iniciar sesión/registrarse se
     SINCRONIZA con el servidor (syncToday + claimedStreak en submit-guess).
     Reglas (fechas UTC, las mismas del reto):
       - acierto hoy  -> si el último acierto fue AYER: racha+1; si no: racha=1
       - fallo (5/5)  -> racha=0
       - la racha "viva" solo cuenta si el último acierto fue hoy o ayer.
     Clave: pl_streak_v1 = { c: racha actual, b: mejor racha, last: 'YYYY-MM-DD' }
     Migración: si no existe, se reconstruye desde los pl_daily_* ya guardados
     (quien jugó ayer sin cuenta no empieza de cero).                          */
  const STREAK_KEY = 'pl_streak_v1';

  function prevDateKey(key){
    const d = new Date(key + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0,10);
  }
  function saveStreakObj(s){
    try { localStorage.setItem(STREAK_KEY, JSON.stringify(s)); } catch(e){}
  }
  function rebuildStreakFromHistory(){
    // Reconstruye la racha recorriendo hacia atrás los días resueltos consecutivos.
    const s = { c:0, b:0, last:null };
    try {
      const today = PLData.getDailySquad().gameDate;
      let day = today;
      const read = (k)=>{ try { return JSON.parse(localStorage.getItem('pl_daily_'+k) || 'null'); } catch(e){ return null; } };
      const t = read(day);
      if(t && t.finished && !t.solved){ saveStreakObj(s); return s; } // hoy fallado -> 0
      if(!(t && t.solved)) day = prevDateKey(day); // hoy sin resolver: la racha puede seguir viva desde ayer
      for(let i=0; i<400; i++){
        const st = read(day);
        if(st && st.solved){ s.c++; if(!s.last) s.last = day; day = prevDateKey(day); }
        else break;
      }
      if(t && t.solved && !s.last) s.last = today;
      s.b = s.c;
    } catch(e){}
    saveStreakObj(s);
    return s;
  }
  function loadStreak(){
    try {
      const s = JSON.parse(localStorage.getItem(STREAK_KEY) || 'null');
      if(s && typeof s.c === 'number') return s;
    } catch(e){}
    return rebuildStreakFromHistory();
  }
  function applyLocalStreak(solved, gameDate){
    const s = loadStreak();
    if(solved){
      if(s.last === gameDate) return s;                       // ya contado hoy
      s.c = (s.last === prevDateKey(gameDate)) ? s.c + 1 : 1; // consecutivo o reinicio
      s.last = gameDate;
      s.b = Math.max(s.b || 0, s.c);
    } else {
      s.c = 0;                                                // 5 fallos: racha rota
    }
    saveStreakObj(s);
    return s;
  }
  /* racha "viva" para mostrar: 0 si el último acierto no es de hoy ni de ayer */
  function liveStreak(){
    const s = loadStreak();
    try {
      const today = PLData.getDailySquad().gameDate;
      if(s.last !== today && s.last !== prevDateKey(today)) return { c:0, b:s.b||0, last:s.last };
    } catch(e){}
    return s;
  }

  /* ---- Sincronización al iniciar sesión (puente anónimo -> cuenta) ----
     Si el reto de HOY ya está terminado en localStorage y el servidor aún no
     tiene resultado, se envía ahora (con claimedStreak para que el servidor
     SIEMBRE la racha local en el primer resultado del usuario). Lo llama
     app.js tras login/registro y en el arranque con sesión.                   */
  async function syncToday(){
    try {
      if(!PLSupa.isReady()) return;
      if(PLData.usingSupabase && !PLData.usingSupabase()) return;
      const user = await PLSupa.getUser();
      if(!user) return;
      const daily = PLData.getDailySquad();
      if(!daily || !daily.gameDate) return;
      const prev = loadProgress(daily.gameDate);
      if(!prev || !prev.finished) return;
      const existing = await PLSupa.getTodayResult(daily.gameDate);
      if(existing) return;
      const pid = prev.solvedPlayerId
        || (prev.misses && prev.misses.length ? prev.misses[prev.misses.length-1].id : null);
      if(pid == null) return;
      const s = loadStreak();
      const res = await PLSupa.saveResult({
        gameDate: daily.gameDate,
        attempts: prev.attempts || (prev.misses ? prev.misses.length : 1),
        timeMs: prev.timeMs || null,
        guessedPlayerId: pid,
        claimedStreak: s.c || 0,
      });
      if(res && res.ok){ PLApp.toast(PLi18n.t('result_saved')); }
    } catch(e){
      console.warn('[Plantillazo] syncToday:', e && e.message);
    }
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
    else {
      PLApp.track('pl_play_start', { edition: daily.edition });
      renderPlay(container);
    }
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
        // XSS: escapamos SIEMPRE los nombres antes de insertar el <mark>; nunca crudo
        const hi = (s)=> term ? s.replace(re,'<mark>$1</mark>') : s;
        const safeFull = esc(p.fullName || p.display);
        const safeDisp = esc(p.display);
        // NOMBRE COMPLETO siempre; si el alias no está contenido en él (p. ej.
        // «Nacho» en José Ignacio Fernández), se antepone el alias en negrita.
        const aliasApart = p.display && p.fullName
          && PLData.norm(p.fullName).indexOf(PLData.norm(p.display)) === -1;
        const nameHtml = aliasApart
          ? `<b class="ali">${hi(safeDisp)}</b> <span class="fn">${hi(safeFull)}</span>`
          : hi(safeFull);
        // NO-SPOILER: solo posición + nombre + bandera (la nacionalidad no delata
        // pertenencia; la rareza y el club+años se retiraron porque sí lo hacían).
        const nat = p.nationality
          ? `<span class="meta nat" title="${esc(p.nationality)}" aria-label="${esc(PLi18n.t('nat_label'))}: ${esc(p.nationality)}">${esc(PLApp.flag(p.nationality))}</span>`
          : '';
        return `<button class="opt" role="option" data-id="${p.id}" data-name="${esc(p.display)}" id="opt-${i}">
          <span class="pos">${esc(p.position||'—')}</span>
          <span class="nm">${nameHtml}</span>
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
    PLApp.track('pl_guess', { correct, attempt_n: st.misses.length + 1 });
    if(correct){
      st.solved = true; st.finished = true; st.solvedPlayerId = playerId;
      st.attempts = st.misses.length + 1;
      st.timeMs = Math.round(performance.now() - st.startedAt);
      st.rarity = PLData.getRarity(playerId, st.daily.squadId);
      saveProgress();
      const sk = applyLocalStreak(true, st.daily.gameDate);
      PLApp.track('pl_win', { attempts: st.attempts, rarity: st.rarity, streak: sk.c, time_s: Math.round(st.timeMs/1000), edition: st.daily.edition });
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
        const skPrev = liveStreak().c || 0;
        applyLocalStreak(false, st.daily.gameDate);
        PLApp.track('pl_lose', { streak_lost: skPrev, edition: st.daily.edition });
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
      // racha local: el servidor la usa para SEMBRAR la racha en el primer
      // resultado del usuario (puente anónimo -> cuenta, ver submit-guess).
      claimedStreak: (loadStreak().c || 0),
    });
    if(res && res.ok){
      PLApp.toast(PLi18n.t('result_saved'));
      // racha autoritativa del servidor: si difiere de la local, manda la del
      // servidor en pantalla (y se refleja en localStorage para coherencia).
      if(typeof res.currentStreak === 'number' && res.currentStreak > 0){
        const el = document.getElementById('streakNum');
        if(el) el.textContent = String(res.currentStreak);
        const sub = document.getElementById('streakSub');
        if(sub) sub.textContent = PLi18n.t('streak_next', { n: res.currentStreak + 1 });
        try {
          const s = loadStreak();
          if(res.currentStreak > (s.c||0)){ s.c = res.currentStreak; s.b = Math.max(s.b||0, s.c); saveStreakObj(s); }
        } catch(e){}
      }
    }
  }

  /* ---- Render: pantalla final (acierto o fallo) ---- */
  function renderFinished(container, animate){
    const d = st.daily, t = PLi18n.t;
    const player = st.solvedPlayerId ? PLData.getPlayer(st.solvedPlayerId) : null;
    // nombre COMPLETO en el veredicto (petición de Jorge 18-jul); alias de respaldo
    const playerName = player ? (player.fullName || player.alias) : '';
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

      ${(function(){
        const s = liveStreak();
        if(st.solved){
          return `<section class="streakbox reveal d3" id="streakBox">
            <span class="sk-fire" aria-hidden="true">🔥</span>
            <div class="sk-txt">
              <div class="sk-main">${esc(t('streak_now',{n:''}))}<b id="streakNum">${s.c}</b></div>
              <div class="sk-sub" id="streakSub">${esc(t('streak_next',{n:s.c+1}))}</div>
            </div>
          </section>`;
        }
        return `<section class="streakbox broken reveal d3" id="streakBox">
          <span class="sk-fire" aria-hidden="true">🧊</span>
          <div class="sk-txt">
            <div class="sk-main">${esc(t('streak_broken'))}</div>
            ${s.b ? `<div class="sk-sub">${esc(t('streak_best',{n:s.b}))}</div>` : ''}
          </div>
        </section>`;
      })()}

      <div id="rankbox"></div>

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

      <section class="regcta reveal d4" id="regCta" hidden>
        <p class="rc-txt" id="regCtaTxt"></p>
        <button class="btn primary full" id="regCtaBtn">${esc(t('streak_cta'))}</button>
      </section>
    `;

    $('#shareBtn').addEventListener('click', ()=> doShare(grid.text));
    $('#copyBtn').addEventListener('click', ()=> doCopy(grid.text));
    startCountdown();
    wireNotify();

    // CTA de registro SOLO para anónimos, en el momento de máxima motivación:
    // acaba de ganar y tiene una racha local que "blindar" (el puente a la cuenta).
    if(PLSupa.isReady()){
      PLSupa.getUser().then(u=>{
        if(u) return;
        const box = $('#regCta'), txt = $('#regCtaTxt'), btn = $('#regCtaBtn');
        if(!box || !txt || !btn) return;
        const s = liveStreak();
        txt.textContent = (st.solved && s.c >= 1)
          ? t('streak_cta_txt', { n: s.c })
          : t('save_login_hint');
        box.hidden = false;
        btn.addEventListener('click', ()=>{
          PLApp.track('pl_streak_cta_click', { streak: s.c });
          location.hash = '#/register';
        });
      });
    }

    if(animate && st.solved && !PLApp.reducedMotion()){ PLApp.confetti(d.team && d.team.colorPrimary); }

    // Ranking del día en la pantalla de resultado (backlog #7, "envidia sana"):
    // el anónimo ve la tabla donde PODRÍA estar (con su posición hipotética
    // calculada con la misma ordenación que el servidor) y un motivo real para
    // registrarse. El logado ve el top con su fila resaltada. Fire & forget.
    loadRankbox(d);
  }

  /* ---- Ranking del día (top 5) en la pantalla de resultado ----
     Anónimo: posición hipotética = 1 + cuántos le ganan con la ordenación del
     servidor (rareza desc, tiempo asc). Vacío: pitch de estreno del nº 1.       */
  async function loadRankbox(d){
    const box = document.getElementById('rankbox');
    if(!box || !PLSupa.isReady()) return;
    const t = PLi18n.t;
    let rows, me = null;
    try {
      rows = await PLSupa.getLeaderboardDaily(d.gameDate);
      me = await PLSupa.getUser();
    } catch(e){ return; } // silencioso: la pantalla de resultado ya es completa sin esto
    if(!document.getElementById('rankbox')) return; // re-render mientras cargaba
    rows = rows || [];
    const anon = !me;

    PLApp.track('pl_rank_view', { variant: anon ? (rows.length ? 'anon' : 'anon_empty') : 'logged', entries: rows.length });

    // vacío -> pitch de "estrena el nº 1" (solo tiene sentido para anónimos;
    // un logado con ranking vacío simplemente no ve el bloque: sin ruido)
    if(!rows.length){
      if(!anon) return;
      box.innerHTML = `<section class="rankbox reveal d4">
        <div class="rb-head"><span class="rb-tit">${esc(t('rb_empty_title'))}</span></div>
        <p class="rb-txt">${esc(t('rb_empty_txt'))}</p>
        <button class="btn primary full" id="rbCta">${esc(t('rb_anon_cta'))}</button>
      </section>`;
      wireRankCta(box, 'empty');
      return;
    }

    const meId = me ? me.id : null;
    const top = rows.slice(0, 5);
    // posición hipotética del anónimo que acaba de ganar (misma ordenación que el RPC)
    let youPos = null;
    if(anon && st.solved){
      youPos = 1 + rows.filter(r =>
        (Number(r.rarity_points) > st.rarity) ||
        (Number(r.rarity_points) === st.rarity && Number(r.time_ms) <= st.timeMs)
      ).length;
    }
    const body = top.map((r, i) => {
      const isMe = meId && r.user_id === meId;
      return `<div class="lrow ${isMe ? 'me' : ''}">
        <span class="pos ${i < 3 ? 'top' : ''}">${i + 1}</span>
        <span class="usr">@${esc(r.username || 'jugador')}${isMe ? ` <small style="color:var(--ink-soft)">(${esc(t('rank_you'))})</small>` : ''}</span>
        <span class="pts">${Math.round(Number(r.rarity_points) || 0)}</span>
      </div>`;
    }).join('');
    const youRow = (youPos !== null)
      ? `<div class="lrow me rb-you"><span class="pos">${youPos}</span><span class="usr">${esc(t('rb_you_pos', { pts: st.rarity, pos: youPos }))}</span><span class="pts">${st.rarity}</span></div>`
      : (anon ? `<p class="rb-txt">${esc(t('rb_you_pos_lose'))}</p>` : '');
    box.innerHTML = `<section class="rankbox reveal d4">
      <div class="rb-head"><span class="rb-tit">${esc(t('rb_title'))}</span><span class="rb-n">${rows.length} 🏆</span></div>
      <div class="ltable">${body}${youPos !== null ? youRow : ''}</div>
      ${youPos === null ? youRow : ''}
      ${anon
        ? `<button class="btn primary full" id="rbCta">${esc(t('rb_anon_cta'))}</button>`
        : `<button class="btn ghost full" id="rbFull">${esc(t('rb_full'))}</button>`}
    </section>`;
    if(anon){ wireRankCta(box, st.solved ? 'won' : 'lost'); }
    else {
      const b = box.querySelector('#rbFull');
      if(b) b.addEventListener('click', () => { location.hash = '#/rank'; });
    }
  }

  function wireRankCta(box, variant){
    const b = box.querySelector('#rbCta');
    if(!b) return;
    b.addEventListener('click', () => {
      PLApp.track('pl_rank_cta_click', { variant });
      location.hash = '#/register';
    });
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
      PLApp.track('pl_notify_optin', {});
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
  async function doCopy(txt){ PLApp.track('pl_share', { method:'copy' }); try{ await navigator.clipboard.writeText(txt); }catch(e){} toast(); }
  async function doShare(txt){
    if(navigator.share){ try{ PLApp.track('pl_share', { method:'native' }); await navigator.share({ text: txt }); return; }catch(e){} }
    doCopy(txt);
  }

  window.PLGame = { start, syncToday, _state: ()=>st, _streak: liveStreak };
})();
