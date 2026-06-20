/* ============================================================================
   PLANTILLAZO — Capa Supabase (supabase.js)
   ----------------------------------------------------------------------------
   Auth (email+usuario+contraseña), recuperación de contraseña, perfil
   (pl_profiles), resultados (pl_results), insignias (pl_badges/pl_user_badges)
   y ranking (pl_leaderboard_daily).

   La clave PUBLISHABLE puede ir en el cliente (la service_role NUNCA).

   ⚠️ ANTI-TRAMPAS (ver README): hoy el guardado de resultados y la concesión de
   insignias se hacen desde el cliente. En producción deben ir por una Edge
   Function con service_role. Todo el guardado pasa por saveResult()/grantBadges()
   para poder redirigirlo a la Edge Function sin tocar el resto de la app.

   supabase-js v2 se carga por CDN en index.html (window.supabase).
   ============================================================================ */
(function(){
  'use strict';

  const SUPABASE_URL = 'https://fetqwujhpyjdccnlgicr.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_l-WfcfL8lbTPLQr9cwjGNA_gs1d3LyT';

  let client = null;
  let ready = false;

  function init(){
    if(client) return client;
    if(!window.supabase || !window.supabase.createClient){
      console.warn('[Plantillazo] supabase-js no cargado: la app funciona en modo offline (sin login/ranking).');
      return null;
    }
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    ready = true;
    return client;
  }

  function isReady(){ return ready && !!client; }

  /* cliente crudo (lo usa data.js para precargar el dataset desde pl_*). */
  function rawClient(){ return isReady() ? client : null; }

  /* ---- Reto diario por Edge Function `daily-challenge` (verify_jwt=false) ----
     Devuelve { gameDate, edition, season, squadId, team:{...} } SIN los miembros.
     date opcional ('YYYY-MM-DD'); por defecto el servidor usa HOY-UTC.           */
  async function callDaily(date){
    if(!isReady()) return null;
    const body = date ? { date } : {};
    const { data, error } = await client.functions.invoke('daily-challenge', { body });
    if(error){ console.warn('[Plantillazo] daily-challenge:', error.message); return null; }
    return data;
  }

  /* ---- Sesión / usuario ---- */
  async function getSession(){
    if(!isReady()) return null;
    const { data } = await client.auth.getSession();
    return data ? data.session : null;
  }
  async function getUser(){
    const s = await getSession();
    return s ? s.user : null;
  }
  function onAuthChange(cb){
    if(!isReady()) return;
    // pasamos también el evento ('SIGNED_IN', 'PASSWORD_RECOVERY', ...) porque
    // app.js lo necesita para detectar el flujo de reset de contraseña de forma fiable.
    client.auth.onAuthStateChange((event, session)=> cb(session, event));
  }

  /* ---- Registro: crea usuario + fila en pl_profiles ---- */
  async function register({ email, username, password, favoriteTeamId, country, birthYear }){
    if(!isReady()) throw new Error('Supabase no disponible.');
    const { data, error } = await client.auth.signUp({
      email, password,
      options: { data: { username } } // guarda username en metadata por si la confirmación es diferida
    });
    if(error) throw error;
    // Crea/actualiza el perfil. Si la sesión no está activa (confirmación por email
    // pendiente), el insert puede fallar por RLS; en ese caso se creará al primer login.
    const user = data.user;
    if(user){
      const prof = {
        id: user.id,
        username,
        favorite_team_id: favoriteTeamId || null,
        country: country || null,
        birth_year: birthYear || null,
      };
      // upsert tolerante: si RLS lo bloquea por falta de sesión, lo ignoramos aquí.
      try { await client.from('pl_profiles').upsert(prof, { onConflict: 'id' }); }
      catch(e){ console.warn('[Plantillazo] perfil se creará al primer login:', e.message); }
    }
    return data;
  }

  /* asegura que existe la fila de perfil (idempotente). Útil tras confirmar email. */
  async function ensureProfile(defaults){
    if(!isReady()) return null;
    const user = await getUser();
    if(!user) return null;
    const existing = await getProfile();
    if(existing) return existing;
    const username = (user.user_metadata && user.user_metadata.username)
      || (defaults && defaults.username)
      || (user.email ? user.email.split('@')[0] : 'jugador');
    const prof = { id: user.id, username };
    const { data, error } = await client.from('pl_profiles').upsert(prof, { onConflict: 'id' }).select().single();
    if(error){ console.warn('[Plantillazo] ensureProfile:', error.message); return null; }
    return data;
  }

  async function login({ email, password }){
    if(!isReady()) throw new Error('Supabase no disponible.');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if(error) throw error;
    await ensureProfile();
    return data;
  }

  async function logout(){
    if(!isReady()) return;
    await client.auth.signOut();
  }

  /* ---- Recuperación de contraseña ----
     Envía email con enlace de reset que vuelve a esta misma página con
     #access_token... Supabase emite el evento PASSWORD_RECOVERY y mostramos el
     formulario de nueva contraseña (lo maneja app.js).                          */
  async function requestPasswordReset(email){
    if(!isReady()) throw new Error('Supabase no disponible.');
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
    if(error) throw error;
    return true;
  }
  async function updatePassword(newPassword){
    if(!isReady()) throw new Error('Supabase no disponible.');
    const { error } = await client.auth.updateUser({ password: newPassword });
    if(error) throw error;
    return true;
  }

  /* ---- Perfil ---- */
  async function getProfile(){
    if(!isReady()) return null;
    const user = await getUser();
    if(!user) return null;
    const { data, error } = await client.from('pl_profiles').select('*').eq('id', user.id).maybeSingle();
    if(error){ console.warn('[Plantillazo] getProfile:', error.message); return null; }
    return data;
  }
  async function updateProfile(patch){
    if(!isReady()) throw new Error('Supabase no disponible.');
    const user = await getUser();
    if(!user) throw new Error('Sin sesión.');
    const { data, error } = await client.from('pl_profiles').update(patch).eq('id', user.id).select().single();
    if(error) throw error;
    return data;
  }

  /* ---- Resultados (anti-trampas: mover a Edge Function en prod) ---- */
  async function getTodayResult(gameDate){
    if(!isReady()) return null;
    const user = await getUser();
    if(!user) return null;
    const { data, error } = await client.from('pl_results')
      .select('*').eq('user_id', user.id).eq('game_date', gameDate).eq('mode','daily').maybeSingle();
    if(error){ console.warn('[Plantillazo] getTodayResult:', error.message); return null; }
    return data;
  }
  /* ANTI-TRAMPAS: el resultado se registra SIEMPRE por la Edge Function
     `submit-guess` (verify_jwt=true). El cliente YA NO escribe pl_results ni la
     racha ni las insignias (la RLS lo impide). La función decide la verdad:
     game_date del servidor, validez del jugador y rareza autoritativa.
     Entrada que envía el cliente: { gameDate, playerId, timeMs, attempts }
       - gameDate/attempts son orientativos; el servidor manda.
       - playerId: el jugador con el que se intenta resolver (el del acierto, o el
         último intento si se agotaron los 5; submit-guess valida pertenencia).
     Devuelve { ok, correct, rarity, currentStreak, newBadges }.                  */
  async function saveResult(result){
    if(!isReady()) return { ok:false, reason:'offline' };
    const user = await getUser();
    if(!user) return { ok:false, reason:'no-session' };
    const { data, error } = await client.functions.invoke('submit-guess', {
      body: {
        gameDate: result.gameDate,
        playerId: result.guessedPlayerId || null,
        timeMs: result.timeMs || null,
        attempts: result.attempts || 0,
      },
    });
    if(error){ console.warn('[Plantillazo] submit-guess:', error.message); return { ok:false, reason:error.message }; }
    if(data && data.error){ console.warn('[Plantillazo] submit-guess:', data.error); return { ok:false, reason:data.error }; }
    return {
      ok: true,
      correct: !!(data && data.correct),
      rarity: data ? (data.rarity||0) : 0,
      currentStreak: data ? (data.currentStreak||0) : 0,
      newBadges: (data && data.newBadges) || [],
    };
  }

  /* LEGADO: la racha ahora la calcula la Edge Function submit-guess (transaccional,
     vía RPC pl_apply_streak). El cliente ya NO puede escribir las columnas de racha
     (la RLS lo impide). Se mantiene solo por compatibilidad; NO se llama desde el
     flujo de guardado.                                                           */
  async function updateStreak(gameDate, solved){
    const prof = await getProfile();
    if(!prof) return;
    let cur = prof.current_streak || 0;
    const last = prof.last_played_date;
    if(solved){
      if(last){
        const prev = new Date(last + 'T00:00:00');
        const today = new Date(gameDate + 'T00:00:00');
        const diff = Math.round((today - prev)/86400000);
        cur = (diff === 1) ? cur + 1 : (diff === 0 ? cur : 1);
      } else { cur = 1; }
    } else {
      cur = 0;
    }
    const best = Math.max(prof.best_streak || 0, cur);
    try { await updateProfile({ current_streak: cur, best_streak: best, last_played_date: gameDate }); }
    catch(e){ console.warn('[Plantillazo] updateStreak:', e.message); }
  }

  /* ---- Insignias ---- */
  async function getAllBadges(){
    if(!isReady()) return [];
    const { data, error } = await client.from('pl_badges').select('*').order('id');
    if(error){ console.warn('[Plantillazo] getAllBadges:', error.message); return []; }
    return data || [];
  }
  async function getMyBadgeIds(){
    if(!isReady()) return [];
    const user = await getUser();
    if(!user) return [];
    const { data, error } = await client.from('pl_user_badges').select('badge_id').eq('user_id', user.id);
    if(error){ console.warn('[Plantillazo] getMyBadgeIds:', error.message); return []; }
    return (data || []).map(r => r.badge_id);
  }
  async function grantBadges(codes){
    // codes: array de códigos de pl_badges a conceder (anti-trampas: mover a Edge Function)
    if(!isReady() || !codes || !codes.length) return;
    const user = await getUser();
    if(!user) return;
    const all = await getAllBadges();
    const ids = all.filter(b => codes.includes(b.code)).map(b => ({ user_id: user.id, badge_id: b.id }));
    if(!ids.length) return;
    try { await client.from('pl_user_badges').upsert(ids, { onConflict: 'user_id,badge_id', ignoreDuplicates: true }); }
    catch(e){ console.warn('[Plantillazo] grantBadges:', e.message); }
  }

  /* ---- Estadísticas agregadas del perfil (a partir de pl_results) ---- */
  async function getMyStats(){
    if(!isReady()) return null;
    const user = await getUser();
    if(!user) return null;
    const { data, error } = await client.from('pl_results').select('solved,time_ms,rarity_points').eq('user_id', user.id);
    if(error){ console.warn('[Plantillazo] getMyStats:', error.message); return null; }
    const rows = data || [];
    const played = rows.length;
    const wins = rows.filter(r => r.solved).length;
    const times = rows.filter(r => r.solved && r.time_ms).map(r => r.time_ms);
    const rarities = rows.filter(r => r.solved).map(r => Number(r.rarity_points) || 0);
    return {
      played, wins,
      winRate: played ? Math.round((wins/played)*100) : 0,
      bestTimeMs: times.length ? Math.min(...times) : null,
      avgRarity: rarities.length ? Math.round(rarities.reduce((a,b)=>a+b,0)/rarities.length) : 0,
    };
  }

  /* ---- Ranking (vía RPC de servidor) ----
     Las funciones pl_get_leaderboard_daily / pl_get_leaderboard_global ya existen
     en la BD y devuelven el ranking ya ordenado y agregado (sin que el cliente
     tenga que leer filas crudas ni agregar a mano).                              */
  async function getLeaderboardDaily(gameDate){
    if(!isReady()) return [];
    // columnas: user_id, username, avatar_url, attempts, time_ms, rarity_points
    const { data, error } = await client.rpc('pl_get_leaderboard_daily', { p_date: gameDate });
    if(error){ console.warn('[Plantillazo] leaderboard daily (rpc):', error.message); return []; }
    return data || [];
  }
  async function getLeaderboardGlobal(){
    if(!isReady()) return [];
    // columnas: user_id, username, avatar_url, days, total_rarity
    const { data, error } = await client.rpc('pl_get_leaderboard_global');
    if(error){ console.warn('[Plantillazo] leaderboard global (rpc):', error.message); return []; }
    return data || [];
  }

  window.PLSupa = {
    init, isReady, rawClient, callDaily, getSession, getUser, onAuthChange,
    register, login, logout, ensureProfile,
    requestPasswordReset, updatePassword,
    getProfile, updateProfile,
    getTodayResult, saveResult,
    getAllBadges, getMyBadgeIds, grantBadges,
    getMyStats, getLeaderboardDaily, getLeaderboardGlobal,
  };
})();
