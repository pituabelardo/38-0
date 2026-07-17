/* ============================================================================
   PLANTILLAZO — Capa de acceso a datos  (data.js)
   ----------------------------------------------------------------------------
   ÚNICO punto por el que la UI toca los datos del juego. Hoy lee de window.PL_DEMO
   (data-demo.js). MAÑANA, cuando llegue el dataset real, SOLO se reescribe el
   interior de estas funciones para leer de Supabase (pl_squads / pl_squad_members
   / pl_players) — la UI (game.js, app.js) NO cambia.

   API pública (window.PLData):
     getTeam(teamId)
     getPlayer(playerId)
     getDailySquad(date)            -> reto global del día (determinista por fecha)
     getSquadById(squadId)
     searchPlayers(term)            -> autocompletado tolerante a acentos/alias/aka
     isInSquad(playerId, squadId)   -> validación del acierto
     getRarity(playerId, squadId)   -> 0..100 (menos min/notoriedad => más raro)
     getMemberStat(playerId, squadId)
     getAllTeams()                  -> para el desplegable de "equipo favorito"

   NOTA ANTI-TRAMPAS: getDailySquad/isInSquad/getRarity corren HOY en el cliente.
   En producción la validación del acierto debe pasar por una Edge Function con
   service_role (ver README). Esta capa está pensada para que ese cambio sea local.
   ============================================================================ */
(function(){
  'use strict';

  /* ---- Origen de datos ----
     Por defecto los datos vienen de Supabase (pl_teams/pl_players/pl_squads/
     pl_squad_members), precargados UNA vez al arranque a un cache en memoria con
     la MISMA forma que window.PL_DEMO. Así la UI (síncrona) no cambia.
     FALLBACK: si la precarga falla (sin red, Supabase caído), se usa window.PL_DEMO
     para que el juego siga siendo jugable. El reto del día NO sale de aquí en
     producción: lo sirve la Edge Function `daily-challenge` (ver getDailyRemote). */
  let _supaCache = null;            // { teams, players, squads } o null
  /* Origen: Supabase (si tiene el dataset real) > PL_REAL (dataset real estático,
     js/data-real.js) > PL_DEMO. Mientras las tablas pl_* solo tengan el seed demo,
     manda el dataset real estático para que TODOS jueguen con las 520 plantillas. */
  const SRC = () => _supaCache || window.PL_REAL || window.PL_DEMO;

  /* preload(): rellena _supaCache desde Supabase. Idempotente. No lanza: si falla,
     deja _supaCache=null (=> fallback a demo). app.js lo hace `await` antes de
     renderizar la primera vista. */
  async function preload(){
    if(_supaCache) return _supaCache;
    try {
      const c = window.PLSupa && window.PLSupa.rawClient && window.PLSupa.rawClient();
      if(!c) return null; // sin cliente -> fallback demo
      const [teamsR, playersR, squadsR, membersR] = await Promise.all([
        c.from('pl_teams').select('id,name,short_name,slug,color_primary,color_secondary'),
        c.from('pl_players').select('id,full_name,alias,aka,nationality,position,search_blob'),
        c.from('pl_squads').select('id,team_id,season').eq('league','laliga').order('id',{ascending:true}),
        c.from('pl_squad_members').select('squad_id,player_id,matches,minutes,goals,rarity'),
      ]);
      if(teamsR.error||playersR.error||squadsR.error||membersR.error) throw (teamsR.error||playersR.error||squadsR.error||membersR.error);
      const teams = (teamsR.data||[]).map(t=>({
        id:t.id, name:t.name, shortName:t.short_name, slug:t.slug, colorPrimary:t.color_primary,
      }));
      const players = (playersR.data||[]).map(p=>({
        id:p.id, fullName:p.full_name, alias:p.alias||'', aka:p.aka||'',
        nationality:p.nationality||'', position:p.position||'', _blob:p.search_blob||'',
      }));
      // agrupar miembros por squad
      const bySquad = new Map();
      for(const m of (membersR.data||[])){
        const arr = bySquad.get(m.squad_id) || [];
        arr.push({ playerId:m.player_id, matches:m.matches, minutes:m.minutes, goals:m.goals,
                   rarity:(m.rarity!=null? Math.round(Number(m.rarity)*100): null) });
        bySquad.set(m.squad_id, arr);
      }
      const squads = (squadsR.data||[]).map(s=>({
        id:s.id, teamId:s.team_id, season:s.season, members: bySquad.get(s.id)||[],
      }));
      if(!teams.length || !players.length || !squads.length) return null; // datos incompletos -> fallback
      // Si Supabase aún tiene solo el seed demo (<50 plantillas) y existe el dataset
      // real estático, se ignora el remoto: manda PL_REAL hasta que se carguen las pl_*.
      if(squads.length < 50 && window.PL_REAL){
        console.info('[Plantillazo] Supabase solo tiene el seed demo; uso dataset real estático (PL_REAL).');
        return null;
      }
      _supaCache = { teams, players, squads };
      // reset de índices para que se reconstruyan sobre el nuevo origen
      _byId = _bySquadId = _searchIdx = _playerClubs = null;
      return _supaCache;
    } catch(e){
      console.warn('[Plantillazo] preload Supabase falló, uso datos demo:', e && e.message);
      return null;
    }
  }

  /* normaliza: sin acentos, minúsculas, sin signos */
  function norm(s){
    return (s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
  }

  /* construye el "search blob" de un jugador (espejo de pl_players.search_blob).
     Si el origen es Supabase, p._blob ya viene normalizado del servidor: se usa
     tal cual (misma normalización). Si no, se calcula localmente (datos demo).   */
  function blob(p){
    if(p._blob) return p._blob;
    return norm([p.fullName, p.alias, p.aka, p.fullNameLong].filter(Boolean).join(' '));
  }

  /* ---- Índices cacheados (rendimiento) ----
     Se construyen UNA vez al primer uso (no en cada tecla):
       _byId      : id -> player
       _bySquadId : squadId -> squad
       _searchIdx : [{ p, blob }]   (blob normalizado precalculado)
       _playerClubs: playerId -> "Club (aa–bb) · Club (cc–dd)" derivado de las
                     plantillas demo en las que aparece el jugador (desambiguación
                     de homónimos por club+años, no por nacionalidad).            */
  let _byId = null, _bySquadId = null, _searchIdx = null, _playerClubs = null;

  function buildIndexes(){
    const src = SRC();
    _byId = new Map();
    for(const p of src.players){ _byId.set(p.id, p); }
    _bySquadId = new Map();
    for(const s of src.squads){ _bySquadId.set(s.id, s); }
    // search_blob normalizado una sola vez
    _searchIdx = src.players.map(p => ({ p, blob: blob(p) }));
    // club(es)+años por jugador, a partir de las plantillas donde aparece
    _playerClubs = new Map();
    for(const sq of src.squads){
      const team = src.teams.find(t => t.id === sq.teamId);
      const teamName = team ? (team.shortName || team.name) : '';
      // año de inicio de la temporada "2015-16" -> "15–16"
      const yr = (sq.season || '').replace('-', '–');
      const yrShort = (function(){
        const m = /^(\d{4})-(\d{2})$/.exec(sq.season || '');
        return m ? (m[1].slice(2) + '–' + m[2]) : yr;
      })();
      for(const mb of sq.members){
        if(mb.playerId == null) continue;
        const arr = _playerClubs.get(mb.playerId) || [];
        arr.push(teamName + ' ' + yrShort);
        _playerClubs.set(mb.playerId, arr);
      }
    }
  }
  function ensureIndexes(){ if(!_searchIdx) buildIndexes(); }
  /* meta de desambiguación: club(es)+años en los que aparece (máx 2 para no saturar) */
  function clubMeta(playerId){
    ensureIndexes();
    const arr = _playerClubs.get(playerId);
    if(!arr || !arr.length) return '';
    return arr.slice(0,2).join(' · ');
  }

  function getTeam(teamId){
    return SRC().teams.find(t => t.id === teamId) || null;
  }
  function getPlayer(playerId){
    ensureIndexes();
    return _byId.get(playerId) || null;
  }
  function getSquadById(squadId){
    ensureIndexes();
    return _bySquadId.get(squadId) || null;
  }
  function getAllTeams(){
    return SRC().teams.slice().sort((a,b)=> a.name.localeCompare(b.name,'es'));
  }
  /* ---- Todas las plantillas (para el modo supervivencia) ----
     Devuelve [{ squadId, season, team }] resueltas (igual forma de `team` que
     getDailySquad), sin los miembros (no destripa nada). La UE las baraja en
     cliente. Reutiliza el MISMO origen (Supabase precargado o demo).             */
  function getAllSquads(){
    return SRC().squads.map(s => ({
      squadId: s.id,
      season: s.season,
      team: getTeam(s.teamId),
    })).filter(s => s.team);
  }

  /* ---- Reto diario determinista (UTC) ----
     El MISMO equipo+temporada para todo el mundo cada día. Se deriva de la fecha
     (YYYY-MM-DD) de forma estable: hash simple -> índice sobre las squads.
     date: objeto Date o string 'YYYY-MM-DD'. Por defecto, HOY en UTC.
     IMPORTANTE: usamos UTC (getUTCFullYear/Month/Date) — NO hora local — para que
     el reto cambie a la MISMA medianoche para todo el mundo y el nº de edición
     (editionNumber, que ya usa Date.UTC) nunca se desincronice del reto cerca de
     medianoche.
     NOTA (Edge Function): en producción el game_date autoritativo lo devolverá el
     servidor, no el cliente; esta función dejará de marcar la fecha del reto.     */
  function dateKey(date){
    let d;
    if(!date){ d = new Date(); }
    else if(typeof date === 'string'){ return date.slice(0,10); }
    else { d = date; }
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth()+1).padStart(2,'0');
    const day = String(d.getUTCDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  function hashStr(s){
    let h = 2166136261;
    for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  /* Cache del reto del día servido por la Edge Function (lo rellena getDailyRemote).
     getDailySquad() lo devuelve cuando coincide la fecha, para que la UI síncrona
     use el reto AUTORITATIVO del servidor sin tener que volverse async. Si no hay
     cache (sin red / aún no resuelto), cae al cálculo local con el MISMO hash
     (fallback demo) — siempre coincide con el servidor por construcción.          */
  let _dailyRemoteCache = null; // { gameDate, squadId, season, team, edition }

  function getDailySquad(date){
    const key = dateKey(date);
    // 1) reto autoritativo del servidor (si está cacheado y es de hoy)
    if(_dailyRemoteCache && _dailyRemoteCache.gameDate === key && _dailyRemoteCache.team){
      return _dailyRemoteCache;
    }
    // 2) fallback local: mismo hash que el servidor sobre las squads del origen
    const squads = SRC().squads;
    const idx = hashStr(key) % squads.length;
    const squad = squads[idx];
    const team = getTeam(squad.teamId);
    return {
      gameDate: key,
      squadId: squad.id,
      season: squad.season,
      team,
      // nº de edición estable: días desde el epoch del juego (1 ene 2026)
      edition: editionNumber(key),
    };
  }
  function editionNumber(key){
    const epoch = Date.UTC(2026,0,1);
    const d = new Date(key + 'T00:00:00Z').getTime();
    return Math.max(1, Math.floor((d - epoch)/86400000) + 1);
  }

  /* ---- Autocompletado ----
     Busca por nombre/apellido/alias/aka, tolerante a acentos y mayúsculas.
     Devuelve [{ id, fullName, display, aka, position, nationality }].
     - El blob normalizado está PRECALCULADO en _searchIdx (no se recalcula por
       tecla; el debounce vive en game.js).
     - nationality = nacionalidad del jugador (NO revela pertenencia a la plantilla
       buscada, a diferencia de club+años o de la rareza-tentación, que SÍ
       destripaban la respuesta y se han retirado del desplegable).
     IMPORTANTE: busca sobre TODOS los jugadores del dataset (no solo la plantilla
     del día) para no destripar la respuesta. El acierto y la rareza se validan/
     muestran APARTE (rareza solo tras acertar, en la pantalla de resultado).      */
  function searchPlayers(term, squadId){
    ensureIndexes();
    const t = norm(term);
    if(t.length < 1) return [];
    const scored = [];
    for(const entry of _searchIdx){
      const b = entry.blob;
      const idx = b.indexOf(t);
      if(idx === -1) continue;
      // prioridad: empieza por el término > contiene; nombre corto antes
      const startsWord = new RegExp('(^|\\s)' + t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).test(b);
      const score = (startsWord ? 0 : 100) + idx;
      scored.push({ p: entry.p, score });
    }
    scored.sort((a,b)=> a.score - b.score || a.p.fullName.localeCompare(b.p.fullName,'es'));
    return scored.slice(0,8).map(({p})=>{
      return {
        id: p.id,
        fullName: p.fullName,
        display: p.alias || p.fullName,
        aka: p.aka || '',
        position: p.position || '',
        nationality: p.nationality || '', // NO revela pertenencia a la plantilla
      };
    });
  }

  /* ---- Validación del acierto ---- */
  function isInSquad(playerId, squadId){
    const sq = getSquadById(squadId);
    if(!sq) return false;
    return sq.members.some(m => m.playerId === playerId);
  }
  function getMemberStat(playerId, squadId){
    const sq = getSquadById(squadId);
    if(!sq) return null;
    return sq.members.find(m => m.playerId === playerId) || null;
  }

  /* ---- Marcador de rareza (0..100) ----
     Aciertas igual con cualquier válido, pero menos minutos esa temporada =>
     más rareza. Se normaliza DENTRO de la plantilla del día: el jugador con menos
     minutos de esa plantilla ~ 100; el de más minutos ~ baja. Se mezcla con goles
     (un goleador es "notorio" aunque juegue menos) para que el 3er portero valga
     más que el crack. Resultado entero 0..100.

     SUELO DE MINUTOS (point 11): a la notoriedad por minutos se le suma un suelo
     (MIN_FLOOR) ANTES de normalizar, para que una aparición testimonial (1 partido,
     ~90') no dispare la rareza a ~100 de forma trivial: sigue siendo raro, pero no
     "gratis". A los porteros NO se les infla por tener 0 goles: el peso de goles se
     ANULA para porteros (la rareza del portero la marcan solo los minutos).

     En producción: pl_squad_members.rarity (precalculado y validado a doble fuente,
     no este cálculo de cliente).                                                  */
  function getRarity(playerId, squadId){
    const sq = getSquadById(squadId);
    if(!sq) return 0;
    const me = sq.members.find(m => m.playerId === playerId);
    if(!me) return 0;
    // Rareza AUTORITATIVA: si el origen es Supabase, member.rarity (0..100) ya viene
    // precalculada y validada por el servidor; se usa tal cual (no se recalcula).
    if(me.rarity != null) return Math.max(1, Math.min(100, Math.round(me.rarity)));
    const MIN_FLOOR = 450; // ~5 partidos: amortigua apariciones testimoniales
    // notoriedad por minutos: minutos + suelo, normalizada por el máximo del equipo (+ suelo)
    const minsArr = sq.members.map(m => (m.minutes || 0) + MIN_FLOOR);
    const maxMin = Math.max(...minsArr, 1);
    const fameMin = ((me.minutes || 0) + MIN_FLOOR) / maxMin;
    // notoriedad por goles: solo para jugadores de campo (los porteros no se inflan)
    const me_p = getPlayer(playerId);
    const isKeeper = me_p && me_p.position === 'POR';
    let fame;
    if(isKeeper){
      fame = fameMin; // el portero se mide solo por minutos
    } else {
      const goals = sq.members.map(m => m.goals || 0);
      const maxGoal = Math.max(...goals, 1);
      const fameGoal = (me.goals || 0) / maxGoal;
      fame = 0.75 * fameMin + 0.25 * fameGoal;
    }
    const rarity = Math.round((1 - fame) * 100);
    return Math.max(1, Math.min(100, rarity));
  }
  function rarityLabel(score, lang){
    const L = (es,en)=> lang === 'en' ? en : es;
    if(score >= 85) return L('Joya de hemeroteca','Deep-cut gem');
    if(score >= 65) return L('Pieza de coleccionista','Collector’s pick');
    if(score >= 40) return L('Secundario con galones','Solid squad player');
    if(score >= 20) return L('Titular reconocible','Recognisable starter');
    return L('Estrella del equipo','Team star');
  }

  /* ---- Reto diario por Edge Function (producción) ----
     Obtiene el reto del día de la función `daily-challenge` (que NO expone los
     miembros). Normaliza la respuesta a la MISMA forma que getDailySquad() para
     que game.js/app.js no noten la diferencia. Si la función falla, devuelve null
     y el llamador cae a getDailySquad() local (fallback demo).                   */
  async function getDailyRemote(date){
    // El reto remoto solo es autoritativo si el origen de datos es Supabase real;
    // con PL_REAL estático el hash local (idéntico al del servidor) es la autoridad.
    if(!_supaCache) return null;
    try {
      if(!(window.PLSupa && window.PLSupa.callDaily)) return null;
      const d = await window.PLSupa.callDaily(date);
      if(!d || !d.team || d.squadId == null) return null;
      // team con la forma que espera la UI (colorPrimary, name, shortName)
      const team = {
        id: null,
        name: d.team.name,
        shortName: d.team.short_name || d.team.name,
        colorPrimary: d.team.color_primary || null,
        colorSecondary: d.team.color_secondary || null,
      };
      const daily = {
        gameDate: d.gameDate,
        squadId: d.squadId,
        season: d.season,
        team,
        edition: d.edition != null ? d.edition : editionNumber(d.gameDate),
      };
      // cachea para que getDailySquad() (síncrono) sirva el reto del servidor
      _dailyRemoteCache = daily;
      return daily;
    } catch(e){
      console.warn('[Plantillazo] getDailyRemote falló, uso reto local:', e && e.message);
      return null;
    }
  }

  window.PLData = {
    norm, preload,
    usingSupabase: () => !!_supaCache,
    getTeam, getPlayer, getSquadById, getAllTeams, getAllSquads,
    getDailySquad, getDailyRemote, editionNumber,
    searchPlayers, isInSquad, getMemberStat,
    getRarity, rarityLabel,
  };
})();
