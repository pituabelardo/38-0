/* ============================================================================
   PLANTILLAZO — Modo Supervivencia (survival.js)
   ----------------------------------------------------------------------------
   Cadena de retos: en cada ronda sale UN equipo+temporada al azar (distinto del
   reto diario; se baraja sin repetir hasta agotar las plantillas). Nombra a un
   jugador de esa plantilla con el MISMO buscador/autocompletado del diario.
   El run aguanta hasta acumular 3 FALLOS (strikes totales). Puntuación = rondas
   superadas + rareza acumulada (+ tiempo). Mejor marca en localStorage.

   Reutiliza al máximo el modo diario: sello/dossier, buscador (searchPlayers +
   navegación con teclado + aria), rareza (getRarity), tarjeta de compartir sin
   spoilers (cuadritos estilo Wordle) y el color del club que tiñe la pantalla.

   TODO(servidor): para usuarios con sesión, persistir el run en pl_results con
   mode='survival' (la columna ya existe). Hoy todo es anónimo / localStorage.
   Depende de PLData, PLi18n, PLApp.
   ============================================================================ */
(function(){
  'use strict';

  const MAX_STRIKES = 3;
  const BEST_KEY = 'pl_survival_best'; // { rounds, rarity, timeMs }

  let st = null;        // estado del run en curso
  let listIdx = -1;     // navegación con teclado en el desplegable

  const $ = (sel, root=document) => root.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* ---- Mejor marca (localStorage) ---- */
  function loadBest(){
    try { return JSON.parse(localStorage.getItem(BEST_KEY) || 'null'); }
    catch(e){ return null; }
  }
  function saveBest(b){
    try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch(e){}
  }
  /* mejor = más rondas; a igualdad, más rareza; a igualdad, menos tiempo */
  function isBetter(a, prev){
    if(!prev) return true;
    if(a.rounds !== prev.rounds) return a.rounds > prev.rounds;
    if(a.rarity !== prev.rarity) return a.rarity > prev.rarity;
    return (a.timeMs || Infinity) < (prev.timeMs || Infinity);
  }

  /* ---- Barajado (Fisher–Yates) ---- */
  function shuffle(arr){
    const a = arr.slice();
    for(let i=a.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [a[i],a[j]] = [a[j],a[i]];
    }
    return a;
  }

  /* ---- Arranque de la vista (pantalla de intro con mejor marca) ---- */
  function start(container){
    if(_cleanup) _cleanup();
    PLApp.applyClubColor(null);
    renderIntro(container);
  }

  function renderIntro(container){
    const t = PLi18n.t;
    const best = loadBest();
    const bestHtml = best
      ? `<div class="surv-best reveal d3">
          <div class="lab">${esc(t('surv_best_label'))}</div>
          <div class="val">${best.rounds} <small>${esc(best.rounds===1?t('surv_round_unit'):t('surv_rounds_unit'))}</small></div>
          <div class="sub">${esc(t('kRar'))} ${best.rarity} · ${esc(PLApp.fmtTime(best.timeMs))}</div>
         </div>`
      : `<p class="surv-best none reveal d3">${esc(t('surv_best_none'))}</p>`;

    container.innerHTML = `
      <section class="dossier reveal d2">
        <p class="kicker"><span class="dot">●</span> <span>${esc(t('surv_kicker'))}</span></p>
        <div class="stamp">
          <h1 class="team">${esc(t('surv_intro_title'))}<span class="accentline"></span></h1>
          <p class="surv-lede">${t('surv_intro_lede')}</p>
          <ol class="surv-rules">
            <li>${t('surv_intro_rules_1')}</li>
            <li>${t('surv_intro_rules_2')}</li>
            <li>${t('surv_intro_rules_3')}</li>
          </ol>
        </div>
      </section>

      ${bestHtml}

      <div class="actions reveal d4" style="grid-template-columns:1fr">
        <button class="btn primary full" id="survStart">${esc(t('surv_start'))}</button>
      </div>

      <div class="ad" role="complementary" aria-label="ad">${esc(t('ad'))}</div>
    `;
    $('#survStart').addEventListener('click', ()=> beginRun(container));
  }

  /* ---- Inicia un run nuevo ---- */
  function beginRun(container){
    const all = PLData.getAllSquads();
    if(!all || !all.length){
      renderError(container);
      return;
    }
    // baraja todas las plantillas; cada ronda saca la siguiente sin repetir.
    // Para que NO coincida con el reto diario (distinto del diario), si la primera
    // sorteada es la del día, se rota una posición.
    let deck = shuffle(all);
    try {
      const daily = PLData.getDailySquad();
      if(daily && deck.length > 1 && deck[0].squadId === daily.squadId){
        deck.push(deck.shift());
      }
    } catch(e){}

    st = {
      deck,
      idx: 0,
      round: 0,            // rondas superadas
      strikes: 0,
      score: 0,            // rondas + rareza (entero acumulado)
      rarityTotal: 0,
      results: [],         // por ronda: { rarity } | { strike:true } — para la grid
      solvedList: [],      // colección del run: [{ name, teamName, season, rarity }] (sin spoilers: solo aciertos ya superados)
      misses: [],          // ids ya intentados EN la ronda actual
      startedAt: performance.now(),
      timeMs: 0,
      finished: false,
    };
    nextRound(container);
  }

  /* ---- Pasa a la siguiente plantilla (o termina si se agota el mazo) ---- */
  function nextRound(container){
    st.misses = [];
    if(st.idx >= st.deck.length){
      // se agotaron TODAS las plantillas: fin del run "limpio" (sin más strikes)
      endRun(container, /*exhausted*/ true);
      return;
    }
    st.current = st.deck[st.idx];
    PLApp.applyClubColor(st.current.team && st.current.team.colorPrimary);
    renderRound(container);
  }

  /* ---- Render: ronda jugable ---- */
  function renderRound(container){
    const c = st.current, t = PLi18n.t;
    container.innerHTML = `
      <section class="surv-bar reveal d2" aria-label="${esc(t('surv_kicker'))}">
        <div class="sb-cell"><span class="k">${esc(t('surv_round'))}</span><span class="v" id="sbRound">${st.round + 1}</span></div>
        <div class="sb-cell"><span class="k">${esc(t('surv_score'))}</span><span class="v gold" id="sbScore">${st.score}</span></div>
        <div class="sb-cell strikes"><span class="k">${esc(t('surv_strikes'))}</span>
          <span class="v" id="sbStrikes" aria-live="polite">${strikesText()}</span></div>
      </section>

      <section class="dossier reveal d2">
        <div class="stamp">
          <span class="band">${esc(t('surv_band'))}</span>
          <h1 class="team">${esc(c.team.name)}<span class="accentline"></span></h1>
          <p class="season">${esc(formatSeason(c.season))}</p>
          <p class="ask">${esc(t('surv_ask'))}</p>
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

      <section class="misslist reveal d4" id="misslist"></section>

      <section class="surv-collection reveal d4" id="survCollection">${solvedListHtml()}</section>

      <div class="ad" role="complementary" aria-label="ad">${esc(t('ad'))}</div>
    `;
    renderMisses();
    wireSearch();
  }

  /* ---- Colección de aciertos del run (lista que crece por rondas superadas) ----
     Cada fila: ✓ Jugador · Equipo TEMPORADA. Es seguro mostrarla (son rondas YA
     superadas, no destripa nada). Se reutiliza en la ronda y en la pantalla final. */
  function solvedListHtml(){
    const t = PLi18n.t;
    if(!st || !st.solvedList.length) return '';
    const rows = st.solvedList.map(s => {
      const meta = (s.teamName || '') + (s.season ? ' ' + s.season.replace('-', '–') : '');
      return `<li class="hit">
        <span class="ok">✓</span>
        <span class="nm">${esc(s.name)}</span>
        <span class="meta">${esc(meta)}</span>
      </li>`;
    }).join('');
    return `<div class="sc-head">${esc(t('surv_collection_title'))} <b>${st.solvedList.length}</b></div>
      <ol class="hits">${rows}</ol>`;
  }

  function strikesText(){
    // ✕ por fallo, · por strike restante (bien visibles)
    const cells = [];
    for(let i=0;i<MAX_STRIKES;i++){
      cells.push(i < st.strikes ? '<b class="ko">✕</b>' : '<span class="pend">·</span>');
    }
    return cells.join(' ');
  }

  function formatSeason(s){
    return PLi18n.t('season_prefix') + s.replace('-', '–');
  }

  function renderMisses(){
    const box = $('#misslist'); if(!box) return;
    box.innerHTML = st.misses.map(m => `<div class="miss"><span class="x">✕</span><span class="nm">${esc(m.name)}</span></div>`).join('');
  }

  /* ---- Buscador con autocompletado (reutiliza la lógica del diario) ---- */
  function wireSearch(){
    if(_cleanup) _cleanup(); // retira el listener del documento de la ronda anterior
    const q = $('#q'), menu = $('#menu');
    if(!q) return;

    function close(){ menu.classList.remove('open'); q.setAttribute('aria-expanded','false'); q.removeAttribute('aria-activedescendant'); listIdx=-1; }
    function renderMenu(list, term){
      if(!list.length){
        menu.innerHTML = `<div class="empty">${esc(PLi18n.t('noResults'))}</div>`;
        menu.classList.add('open'); q.setAttribute('aria-expanded','true');
        q.removeAttribute('aria-activedescendant'); return;
      }
      const safeTerm = esc(term);
      const re = new RegExp('('+safeTerm.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','ig');
      menu.innerHTML = list.map((p,i)=>{
        // Igual que el diario (18-jul): nombre COMPLETO + bandera emoji.
        const hi = (s)=> term ? s.replace(re,'<mark>$1</mark>') : s;
        const safeFull = esc(p.fullName || p.display);
        const safeDisp = esc(p.display);
        const aliasApart = p.display && p.fullName
          && PLData.norm(p.fullName).indexOf(PLData.norm(p.display)) === -1;
        const nameHtml = aliasApart
          ? `<b class="ali">${hi(safeDisp)}</b> <span class="fn">${hi(safeFull)}</span>`
          : hi(safeFull);
        // NO-SPOILER: rareza y club+años retirados (revelaban pertenencia).
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

    const sqId = st.current.squadId;
    let _debounce = null;
    q.addEventListener('input', ()=>{
      clearTimeout(_debounce);
      const term = q.value.trim();
      if(term.length < 1){ close(); return; }
      _debounce = setTimeout(()=>{
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
        q.setAttribute('aria-activedescendant', cur.id);
      } else {
        q.removeAttribute('aria-activedescendant');
      }
    }
    const onDocClick = (e)=>{ if(!e.target.closest('.search')) close(); };
    document.addEventListener('click', onDocClick);
    _cleanup = ()=>{ document.removeEventListener('click', onDocClick); _cleanup = null; };
    q.focus();

    st._closeMenu = close;
    st._clearInput = ()=>{ q.value=''; };
  }
  let _cleanup = null;

  /* ---- Procesa un intento ---- */
  function submitGuess(playerId, displayName){
    if(!st || st.finished) return;
    if(st._submitting) return;
    st._submitting = true;
    try { _submitGuess(playerId, displayName); }
    finally { st._submitting = false; }
  }
  function _submitGuess(playerId, displayName){
    if(st._closeMenu) st._closeMenu();
    if(st._clearInput) st._clearInput();

    if(st.misses.some(m => m.id === playerId)){
      PLApp.toast(PLi18n.t('surv_already_in'));
      return;
    }

    const container = document.getElementById('view');
    const correct = PLData.isInSquad(playerId, st.current.squadId);

    if(correct){
      const rarity = PLData.getRarity(playerId, st.current.squadId);
      st.round += 1;
      st.rarityTotal += rarity;
      st.score = st.round + st.rarityTotal;
      st.results.push({ rarity });
      // colección del run: guarda el acierto con su equipo+temporada (ya superado,
      // no es spoiler de rondas futuras). Se muestra creciendo bajo el buscador.
      st.solvedList.push({
        name: displayName,
        teamName: st.current.team ? st.current.team.name : '',
        season: st.current.season,
        rarity,
      });
      st.idx += 1;
      // CAMBIO: sin confeti por ronda. Feedback sutil (toast breve) + avance directo.
      PLApp.toast(PLi18n.t('surv_correct'));
      nextRound(container);
    } else {
      st.misses.push({ id: playerId, name: displayName });
      st.strikes += 1;
      renderMisses();
      const sb = document.getElementById('sbStrikes');
      if(sb){ sb.innerHTML = strikesText(); sb.classList.add('bump'); setTimeout(()=> sb && sb.classList.remove('bump'), 420); }
      if(st.strikes >= MAX_STRIKES){
        st.results.push({ strike:true });
        endRun(container, /*exhausted*/ false);
      } else {
        PLApp.toast(PLi18n.t('surv_strike'));
      }
    }
  }

  /* ---- Fin del run ---- */
  function endRun(container, exhausted){
    if(_cleanup) _cleanup();
    st.finished = true;
    st.timeMs = Math.round(performance.now() - st.startedAt);

    const current = { rounds: st.round, rarity: st.rarityTotal, timeMs: st.timeMs };
    const prevBest = loadBest();
    const newBest = isBetter(current, prevBest);
    if(newBest) saveBest(current);

    // TODO(servidor): si hay sesión, registrar el run en pl_results (mode='survival').
    renderOver(container, exhausted, current, prevBest, newBest);
  }

  /* ---- Tarjeta de compartir SIN spoilers (cuadritos estilo Wordle) ----
     Una celda por ronda superada (★ rareza alta, ✓ normal) + ✕ por el strike final.
     No revela equipos ni jugadores. Limita a 10 celdas visibles para no saturar.  */
  function buildShareGrid(){
    const cells = [], text = [];
    const cap = 10;
    const rounds = st.results.filter(r => !r.strike);
    rounds.slice(0, cap).forEach(r=>{
      if(r.rarity >= 70){ cells.push('<span class="cell y">★</span>'); text.push('★'); }
      else { cells.push('<span class="cell g">✓</span>'); text.push('✓'); }
    });
    if(rounds.length > cap){
      cells.push(`<span class="cell more">+${rounds.length-cap}</span>`);
      text.push('+'+(rounds.length-cap));
    }
    if(st.results.some(r => r.strike)){ cells.push('<span class="cell x">✕</span>'); text.push('✕'); }
    return { html: cells.join(''), gridText: text.join(' ') };
  }

  function renderOver(container, exhausted, current, prevBest, newBest){
    const t = PLi18n.t;
    const unit = current.rounds === 1 ? t('surv_round_unit') : t('surv_rounds_unit');
    const grid = buildShareGrid();
    const timeStr = PLApp.fmtTime(current.timeMs);

    const shareText =
      `Plantillazo · ${t('survival_cta')}\n` +
      `${grid.gridText}\n` +
      `${t('surv_share_line', { n: current.rounds, unit, r: current.rarity })} · ${timeStr}\n` +
      `38-0.es/plantillazo`;

    const bestBlock = newBest
      ? `<p class="surv-bestflag">${esc(t('surv_new_best'))} 🏆</p>`
      : (prevBest ? `<p class="surv-prevbest">${esc(t('surv_prev_best'))}: ${prevBest.rounds} ${esc(prevBest.rounds===1?t('surv_round_unit'):t('surv_rounds_unit'))} · ${esc(t('kRar'))} ${prevBest.rarity}</p>` : '');

    container.innerHTML = `
      <section class="solved reveal d2 fail">
        <span class="seal">${esc(t('surv_over_seal'))}</span>
        <h1>${esc(t('surv_over_title'))}</h1>
        <p class="who">${esc(t('surv_survived'))} <b>${current.rounds} ${esc(unit)}</b></p>
        ${exhausted ? `<p class="already">${esc(t('surv_exhausted'))}</p>` : ''}
        ${bestBlock}
      </section>

      <section class="stats reveal d3">
        <div class="stat try"><div class="k">${esc(t('surv_round'))}</div><div class="v">${current.rounds}</div></div>
        <div class="stat rar"><div class="k">${esc(t('surv_total_rarity'))}</div><div class="v">${current.rarity}</div></div>
        <div class="stat tim"><div class="k">${esc(t('surv_total_time'))}</div><div class="v">${esc(timeStr)}</div></div>
      </section>

      <section class="surv-collection final reveal d3" id="survCollection">${solvedListHtml()}</section>

      <section class="sharecard reveal d4" id="card">
        <div class="sc-top">
          <span class="sc-mark">Planti<b>llazo</b></span>
          <span class="sc-edi">${esc(t('survival_cta'))}</span>
        </div>
        <div class="sc-grid">${grid.html}</div>
        <p class="sc-line"><b>${esc(t('surv_survived'))} ${current.rounds} ${esc(unit)}</b> · ${esc(t('kRar'))} ${current.rarity} · <span>${esc(timeStr)}</span></p>
        <p class="nospoiler">${esc(t('noSpoiler'))}</p>
        <div class="sc-foot"><span>38-0.es/plantillazo</span><span>${esc(t('scPlay'))}</span></div>
      </section>

      <div class="actions reveal d4">
        <button class="btn primary" id="shareBtn">${esc(t('share'))}</button>
        <button class="btn ghost" id="copyBtn">${esc(t('copy'))}</button>
      </div>

      <div class="actions reveal d4" style="grid-template-columns:1fr; margin-top:10px">
        <button class="btn ghost full" id="againBtn">${esc(t('surv_play_again'))}</button>
      </div>

      <div class="ad" role="complementary" aria-label="ad">${esc(t('ad'))}</div>
    `;

    $('#shareBtn').addEventListener('click', ()=> doShare(shareText));
    $('#copyBtn').addEventListener('click', ()=> doCopy(shareText));
    $('#againBtn').addEventListener('click', ()=> beginRun(container));
  }

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

  function copiedToast(){ PLApp.toast(PLi18n.t('toast_copied')); }
  async function doCopy(txt){ try{ await navigator.clipboard.writeText(txt); }catch(e){} copiedToast(); }
  async function doShare(txt){
    if(navigator.share){ try{ await navigator.share({ text: txt }); return; }catch(e){} }
    doCopy(txt);
  }

  window.PLSurvival = { start, _state: ()=>st };
})();
