// ============================================================================
// PLANTILLAZO — Edge Function: submit-guess   (verify_jwt = true)
// ----------------------------------------------------------------------------
// Registro AUTORITATIVO del resultado del día. El cliente NO escribe pl_results.
//
// Entrada (JSON): { gameDate, playerId, timeMs, attempts }
//   - gameDate y attempts son ORIENTATIVOS; el servidor decide la verdad:
//     * la squad del día se recalcula con el MISMO hash que data.js / daily-challenge
//       sobre la fecha UTC del servidor (no se confía en el cliente).
//     * la rareza es la de pl_squad_members.rarity (precalculada, doble fuente).
//
// Flujo:
//   1) user = del JWT (verify_jwt=true).
//   2) gameDate autoritativo = HOY-UTC del servidor.
//   3) squadId del día = hash(gameDate) % nº squads (orden estable por id).
//   4) correct = playerId ∈ pl_squad_members(squadId).
//   5) rarity autoritativa = round(rarity*100) si correct, si no 0.
//   6) upsert en pl_results (game_date servidor, solved, rarity_points, time_ms, attempts).
//   7) racha transaccional en pl_profiles (RPC pl_apply_streak).
//   8) insignias en pl_user_badges (idempotente).
//
// Devuelve: { correct, rarity, currentStreak, newBadges }
//
// Usa SUPABASE_SERVICE_ROLE_KEY (salta RLS) DENTRO de la función.
//
// DESPLIEGUE:
//   supabase functions deploy submit-guess         (verify_jwt true por defecto)
//   o vía MCP deploy_edge_function con verify_jwt=true.
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_ATTEMPTS = 5;

// FNV-1a — idéntico a data.js / daily-challenge
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// fecha UTC del SERVIDOR (no se confía en el cliente para el game_date)
function todayUTC(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method-not-allowed' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'no-session' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, serviceKey);

    // 1) usuario del JWT
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'invalid-session' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;

    // entrada
    let body: any = {};
    try { body = await req.json(); } catch (_) { body = {}; }
    const playerId = Number(body.playerId);
    const timeMs = body.timeMs != null ? Math.max(0, Math.round(Number(body.timeMs))) : null;
    let attempts = body.attempts != null ? Math.round(Number(body.attempts)) : 0;
    if (!Number.isFinite(playerId)) {
      return new Response(JSON.stringify({ error: 'bad-input' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    attempts = Math.max(1, Math.min(MAX_ATTEMPTS, attempts || 1));
    // racha local reclamada por el cliente (siembra en el PRIMER resultado; cap 60 anti-abuso)
    const claimedStreak = Math.max(0, Math.min(60, Math.round(Number(body.claimedStreak) || 0)));

    // 2) game_date AUTORITATIVO = hoy-UTC del servidor
    const gameDate = todayUTC();

    // 3) squad del día (orden estable por id asc)
    const { data: squads, error: sqErr } = await admin
      .from('pl_squads')
      .select('id')
      .eq('league', 'laliga')
      .order('id', { ascending: true });
    if (sqErr) throw sqErr;
    if (!squads || squads.length === 0) throw new Error('no-squads');
    const squadId = squads[hashStr(gameDate) % squads.length].id;

    // 4) validar pertenencia + 5) rareza autoritativa
    const { data: member, error: mErr } = await admin
      .from('pl_squad_members')
      .select('rarity')
      .eq('squad_id', squadId)
      .eq('player_id', playerId)
      .maybeSingle();
    if (mErr) throw mErr;

    const correct = !!member;
    // rarity guardada 0..1 -> puntos 0..100
    const rarity = correct ? Math.round(Number(member!.rarity || 0) * 100) : 0;

    // ---- evitar re-jugar: si ya hay resultado del día, devolvemos el existente ----
    const { data: existing } = await admin
      .from('pl_results')
      .select('solved, rarity_points')
      .eq('user_id', userId)
      .eq('game_date', gameDate)
      .eq('mode', 'daily')
      .maybeSingle();

    if (existing) {
      const { data: prof } = await admin
        .from('pl_profiles')
        .select('current_streak')
        .eq('id', userId)
        .maybeSingle();
      return new Response(JSON.stringify({
        correct: !!existing.solved,
        rarity: Number(existing.rarity_points || 0),
        currentStreak: prof?.current_streak ?? 0,
        newBadges: [],
        already: true,
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // ¿primer resultado del usuario? (para la siembra de racha local, ver 7b)
    const { count: priorCount } = await admin
      .from('pl_results')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    // 6) upsert resultado (game_date del SERVIDOR)
    const { error: upErr } = await admin
      .from('pl_results')
      .upsert({
        user_id: userId,
        game_date: gameDate,
        mode: 'daily',
        solved: correct,
        attempts,
        time_ms: timeMs,
        rarity_points: rarity,
        guessed_player_id: correct ? playerId : null,
      }, { onConflict: 'user_id,game_date,mode' });
    if (upErr) throw upErr;

    // 7) racha transaccional (RPC SECURITY DEFINER); fallback a cálculo inline
    let currentStreak = 0;
    {
      const { data: streakRes, error: rpcErr } = await admin.rpc('pl_apply_streak', {
        p_user_id: userId, p_game_date: gameDate, p_solved: correct,
      });
      if (!rpcErr && streakRes != null) {
        currentStreak = Number(streakRes) || 0;
      } else {
        // fallback (no transaccional) por si la RPC no existiera
        const { data: prof } = await admin
          .from('pl_profiles')
          .select('current_streak, best_streak, last_played_date')
          .eq('id', userId).maybeSingle();
        let cur = prof?.current_streak || 0;
        const last = prof?.last_played_date as string | null;
        if (correct) {
          if (last) {
            const diff = Math.round(
              (new Date(gameDate + 'T00:00:00Z').getTime() - new Date(last + 'T00:00:00Z').getTime()) / 86400000,
            );
            cur = diff === 1 ? cur + 1 : (diff === 0 ? cur : 1);
          } else cur = 1;
        } else cur = 0;
        const best = Math.max(prof?.best_streak || 0, cur);
        await admin.from('pl_profiles')
          .update({ current_streak: cur, best_streak: best, last_played_date: gameDate })
          .eq('id', userId);
        currentStreak = cur;
      }
    }

    // 7b) SIEMBRA de racha local (puente anónimo -> cuenta): SOLO en el primer
    // resultado del usuario, si acertó y su racha local del navegador supera la
    // del servidor. Confianza limitada (cap 60): mismo nivel de fe que Wordle.
    if (correct && (priorCount ?? 0) === 0 && claimedStreak > currentStreak) {
      const { data: prof2 } = await admin
        .from('pl_profiles')
        .select('best_streak')
        .eq('id', userId).maybeSingle();
      const bestSeed = Math.max(prof2?.best_streak || 0, claimedStreak);
      const { error: seedErr } = await admin.from('pl_profiles')
        .update({ current_streak: claimedStreak, best_streak: bestSeed, last_played_date: gameDate })
        .eq('id', userId);
      if (!seedErr) currentStreak = claimedStreak;
    }

    // 8) insignias (idempotente). Códigos del seed pl_badges.
    const codes: string[] = [];
    if (correct) {
      codes.push('debut');
      if (attempts === 1) codes.push('sin-fallos');
      if (timeMs != null && timeMs < 10000 && rarity >= 40) codes.push('relampago');
      if (rarity >= 80) codes.push('cazador-rarezas');
      if (currentStreak >= 7) codes.push('semana-perfecta');
      if (currentStreak >= 30) codes.push('mes-de-hierro');
      if (currentStreak >= 100) codes.push('centenario');
    }

    let newBadges: string[] = [];
    if (codes.length) {
      const { data: badges } = await admin
        .from('pl_badges').select('id, code').in('code', codes);
      if (badges && badges.length) {
        // cuáles ya tenía (para reportar SOLO las nuevas)
        const ids = badges.map((b: any) => b.id);
        const { data: owned } = await admin
          .from('pl_user_badges').select('badge_id')
          .eq('user_id', userId).in('badge_id', ids);
        const ownedSet = new Set((owned || []).map((r: any) => r.badge_id));
        const toInsert = badges.filter((b: any) => !ownedSet.has(b.id));
        if (toInsert.length) {
          await admin.from('pl_user_badges')
            .upsert(toInsert.map((b: any) => ({ user_id: userId, badge_id: b.id })),
              { onConflict: 'user_id,badge_id', ignoreDuplicates: true });
        }
        newBadges = toInsert.map((b: any) => b.code);
      }
    }

    return new Response(JSON.stringify({ correct, rarity, currentStreak, newBadges }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message ?? e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
