'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const CACHE_DIR = path.join(ROOT, 'cache');

const SEASON = (() => {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
})();
const SEASON_LABEL = `${SEASON - 1}-${String(SEASON).slice(2)}`;

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const ESPN_WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba';
const ESPN_CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba';

// ---------------------------------------------------------------- utilities

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function round(v, digits = 1) {
  if (!Number.isFinite(v)) return 0;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function pct(made, attempted) {
  if (!attempted) return 0;
  return round((made / attempted) * 100, 1);
}

function pair(value) {
  const parts = String(value ?? '').split('-');
  const a = Number(parts[0]);
  const b = Number(parts[1]);
  return [Number.isFinite(a) ? a : 0, Number.isFinite(b) ? b : 0];
}

function average(list, pick) {
  const vals = list.map(pick).filter((v) => Number.isFinite(v));
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function normText(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// ------------------------------------------------------------------- cache

const mem = new Map();
const pending = new Map();

async function cached(key, ttl, producer) {
  const now = Date.now();
  const hit = mem.get(key);
  if (hit && now - hit.t < ttl) return hit.v;
  if (pending.has(key)) return pending.get(key);

  const file = path.join(CACHE_DIR, crypto.createHash('sha1').update(key).digest('hex') + '.json');
  try {
    const raw = JSON.parse(await fsp.readFile(file, 'utf8'));
    if (raw && now - raw.t < ttl) {
      mem.set(key, { t: raw.t, v: raw.v });
      return raw.v;
    }
  } catch {
    /* cache miss */
  }

  if (pending.has(key)) return pending.get(key);

  const task = (async () => {
    const value = await producer();
    mem.set(key, { t: Date.now(), v: value });
    try {
      await fsp.mkdir(CACHE_DIR, { recursive: true });
      await fsp.writeFile(file, JSON.stringify({ t: Date.now(), v: value }));
    } catch {
      /* cache is best-effort */
    }
    return value;
  })();

  pending.set(key, task);
  try {
    return await task;
  } finally {
    pending.delete(key);
  }
}

async function espn(url, ttlSeconds = 3600, key = url) {
  return cached(`espn:${key}`, ttlSeconds * 1000, async () => {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await fetch(url, {
          headers: {
            'user-agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            accept: 'application/json, text/plain, */*',
          },
          signal: AbortSignal.timeout(25000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
        return await res.json();
      } catch (err) {
        lastError = err;
        if (attempt < 2) await sleep(350 * (attempt + 1));
      }
    }
    throw lastError;
  });
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      out[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return out;
}

// -------------------------------------------------------------------- data

async function getTeams() {
  return cached('teams:v1', 12 * 3600 * 1000, async () => {
    const json = await espn(`${ESPN}/teams`, 12 * 3600, 'teams');
    const raw = json?.sports?.[0]?.leagues?.[0]?.teams?.map((t) => t.team) || [];
    const teams = raw.map((t) => ({
      id: String(t.id),
      abbr: t.abbreviation,
      name: t.name || t.shortDisplayName || t.displayName,
      fullName: t.displayName,
      logo:
        t.logos?.find((l) => l.rel?.includes('full') || l.rel?.includes('default'))?.href ||
        `https://a.espncdn.com/i/teamlogos/nba/500/${String(t.abbreviation || '').toLowerCase()}.png`,
      color: `#${t.color || '444444'}`,
      altColor: `#${t.alternateColor || 'ffffff'}`,
    }));
    teams.sort((a, b) => a.fullName.localeCompare(b.fullName));
    return teams;
  });
}

async function getTeamMap() {
  const teams = await getTeams();
  return new Map(teams.map((t) => [t.id, t]));
}

async function getPlayerIndex() {
  return cached('players-index:v1', 12 * 3600 * 1000, async () => {
    const teams = await getTeams();
    const lists = await mapLimit(teams, 8, async (team) => {
      try {
        const json = await espn(
          `${ESPN}/teams/${team.id}/roster`,
          12 * 3600,
          `roster:${team.id}`
        );
        const athletes = json?.athletes || [];
        return athletes
          .filter((a) => a && a.id && (a.fullName || a.displayName))
          .map((a) => ({
            id: String(a.id),
            name: a.fullName || a.displayName,
            teamId: team.id,
            teamAbbr: team.abbr,
            teamName: team.name,
            teamLogo: team.logo,
            pos: a.position?.abbreviation || '',
            jersey: a.jersey || '',
            headshot:
              a.headshot?.href ||
              `https://a.espncdn.com/i/headshots/nba/players/full/${a.id}.png`,
          }));
      } catch {
        return [];
      }
    });
    return lists.flat().sort((a, b) => a.name.localeCompare(b.name));
  });
}

async function getSlate() {
  const json = await espn(`${ESPN}/scoreboard`, 90, 'scoreboard:current');
  const events = json?.events || [];
  return events.map((event) => {
    const comp = event.competitions?.[0];
    const odds = comp?.odds?.[0];
    const competitors = (comp?.competitors || []).map((c) => ({
      id: String(c.team?.id),
      abbr: c.team?.abbreviation,
      name: c.team?.displayName,
      shortName: c.team?.shortDisplayName,
      logo: c.team?.logo,
      home: c.homeAway === 'home',
      score: Number(c.score?.value ?? c.score ?? 0),
      winner: Boolean(c.winner),
      record: c.records?.[0]?.summary || '',
    }));
    return {
      id: event.id,
      name: event.name,
      date: event.date,
      venue: comp?.venue?.fullName || '',
      broadcast: comp?.broadcasts?.[0]?.names?.join(', ') || '',
      status: {
        state: comp?.status?.type?.state || 'pre',
        detail: comp?.status?.type?.shortDetail || comp?.status?.type?.description || '',
        completed: Boolean(comp?.status?.type?.completed),
      },
      odds: odds
        ? {
            provider: odds.provider?.name || '',
            details: odds.details || '',
            spread: Number.isFinite(odds.spread) ? odds.spread : null,
            total: Number.isFinite(odds.overUnder) ? odds.overUnder : null,
            homeMoney: odds.moneyline?.home?.close?.odds || odds.homeTeamOdds?.moneyLine || '',
            awayMoney: odds.moneyline?.away?.close?.odds || odds.awayTeamOdds?.moneyLine || '',
          }
        : null,
      competitors,
    };
  });
}

async function getSummary(eventId, ttlSeconds = 300) {
  return espn(
    `${ESPN}/summary?event=${eventId}`,
    ttlSeconds,
    `summary:${eventId}`
  );
}

function statMap(statistics) {
  const map = {};
  for (const s of statistics || []) {
    const value =
      typeof s.value === 'number'
        ? s.value
        : Number.isFinite(Number(s.displayValue))
          ? Number(s.displayValue)
          : s.displayValue;
    map[s.name] = value;
  }
  return map;
}

function teamStatsFromMap(map) {
  const fg = pair(map['fieldGoalsMade-fieldGoalsAttempted']);
  const tp = pair(map['threePointFieldGoalsMade-threePointFieldGoalsAttempted']);
  const ft = pair(map['freeThrowsMade-freeThrowsAttempted']);
  const fgm = fg[0];
  const fga = fg[1];
  const tpm = tp[0];
  const tpa = tp[1];
  const ftm = ft[0];
  const fta = ft[1];
  const pts = fgm * 2 + tpm + ftm;
  const reb = Number(map.totalRebounds) || 0;
  const ast = Number(map.assists) || 0;
  const stl = Number(map.steals) || 0;
  const blk = Number(map.blocks) || 0;
  const to = Number(map.totalTurnovers ?? map.turnovers) || 0;

  let ts = 0;
  if (fga + 0.44 * fta > 0) ts = pts / (2 * (fga + 0.44 * fta));
  if (ts > 1.5) ts = ts / 100;

  return {
    pts,
    fgm,
    fga,
    fgPct: pct(fgm, fga),
    tpm,
    tpa,
    tpPct: pct(tpm, tpa),
    ftm,
    fta,
    ftPct: pct(ftm, fta),
    tpm2: Math.max(0, fgm - tpm),
    tpa2: Math.max(0, fga - tpa),
    reb,
    oreb: Number(map.offensiveRebounds) || 0,
    dreb: Number(map.defensiveRebounds) || 0,
    ast,
    stl,
    blk,
    to,
    pf: Number(map.fouls) || 0,
    paint: Number(map.pointsInPaint) || 0,
    fast: Number(map.fastBreakPoints) || 0,
    pot: Number(map.turnoverPoints) || 0,
    efg: fga ? round(((fgm + 0.5 * tpm) / fga) * 100, 1) : 0,
    ts: round(ts * 100, 1),
  };
}

const TEAM_FIELDS = [
  'pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta',
  'reb', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'to', 'pf',
  'paint', 'fast', 'pot', 'efg', 'ts',
];

function averageTeamStats(games, which = 'stats') {
  const out = {};
  for (const field of TEAM_FIELDS) out[field] = round(average(games, (g) => g[which]?.[field]), 1);
  out.fgPct = pct(out.fgm, out.fga);
  out.tpPct = pct(out.tpm, out.tpa);
  out.ftPct = pct(out.ftm, out.fta);
  out.efg = out.fga ? round(((out.fgm + 0.5 * out.tpm) / out.fga) * 100, 1) : 0;
  out.ts = out.fga + 0.44 * out.fta > 0 ? round((out.pts / (2 * (out.fga + 0.44 * out.fta))) * 100, 1) : 0;
  return out;
}

function normalizeTeamGame(event, summary, teamId) {
  const comp = summary?.header?.competitions?.[0];
  if (!comp) return null;
  const me = (comp.competitors || []).find((c) => String(c.team?.id) === String(teamId));
  const opponent = (comp.competitors || []).find((c) => String(c.team?.id) !== String(teamId));
  if (!me || !opponent) return null;

  const myBox = (summary.boxscore?.teams || []).find((t) => String(t.team?.id) === String(teamId));
  const opBox = (summary.boxscore?.teams || []).find((t) => String(t.team?.id) !== String(teamId));

  const scoreFor = Number(me.score?.value ?? me.score ?? 0);
  const scoreAgainst = Number(opponent.score?.value ?? opponent.score ?? 0);

  return {
    eventId: event.id,
    date: event.date,
    home: me.homeAway === 'home',
    opp: {
      id: String(opponent.team?.id),
      abbr: opponent.team?.abbreviation,
      name: opponent.team?.displayName,
      logo: opponent.team?.logo,
    },
    scoreFor,
    scoreAgainst,
    win: scoreFor > scoreAgainst,
    stats: teamStatsFromMap(statMap(myBox?.statistics)),
    oppStats: teamStatsFromMap(statMap(opBox?.statistics)),
  };
}

function aggregateTeamLeaders(summaries, teamId) {
  const acc = new Map();

  for (const summary of summaries) {
    const side = (summary?.boxscore?.players || []).find(
      (p) => String(p.team?.id) === String(teamId)
    );
    if (!side) continue;
    const block = side.statistics?.[0];
    if (!block) continue;
    const keys = block.keys || [];

    for (const row of block.athletes || []) {
      const athlete = row.athlete;
      if (!athlete?.id || row.didNotPlay) continue;
      const id = String(athlete.id);
      const map = {};
      keys.forEach((k, i) => {
        map[k] = row.stats?.[i];
      });

      const fg = pair(map['fieldGoalsMade-fieldGoalsAttempted']);
      const tp = pair(map['threePointFieldGoalsMade-threePointFieldGoalsAttempted']);
      const minutes = Number(map.minutes) || 0;
      const pts = Number(map.points) || 0;
      const reb = Number(map.rebounds) || 0;
      const ast = Number(map.assists) || 0;

      if (!acc.has(id)) {
        acc.set(id, {
          id,
          name: athlete.displayName || athlete.shortName || 'Jogador',
          headshot: athlete.headshot?.href || '',
          pos: athlete.position?.abbreviation || '',
          gp: 0,
          min: 0,
          pts: 0,
          reb: 0,
          ast: 0,
          stl: 0,
          blk: 0,
          to: 0,
          tpm: 0,
          fgm: 0,
          fga: 0,
          pra: 0,
        });
      }
      const a = acc.get(id);
      a.gp += 1;
      a.min += minutes;
      a.pts += pts;
      a.reb += reb;
      a.ast += ast;
      a.stl += Number(map.steals) || 0;
      a.blk += Number(map.blocks) || 0;
      a.to += Number(map.turnovers) || 0;
      a.tpm += tp[0];
      a.fgm += fg[0];
      a.fga += fg[1];
      a.pra += pts + reb + ast;
    }
  }

  return [...acc.values()]
    .map((a) => ({
      id: a.id,
      name: a.name,
      headshot: a.headshot,
      pos: a.pos,
      gp: a.gp,
      mpg: round(a.min / a.gp, 1),
      pts: round(a.pts / a.gp, 1),
      reb: round(a.reb / a.gp, 1),
      ast: round(a.ast / a.gp, 1),
      stl: round(a.stl / a.gp, 1),
      blk: round(a.blk / a.gp, 1),
      to: round(a.to / a.gp, 1),
      tpm: round(a.tpm / a.gp, 1),
      pra: round(a.pra / a.gp, 1),
      fgPct: pct(a.fgm, a.fga),
    }))
    .sort((a, b) => b.pra - a.pra)
    .slice(0, 12);
}

async function getTeamDashboard(teamId, last = 10) {
  const teamMap = await getTeamMap();
  const team = teamMap.get(String(teamId));
  if (!team) {
    const err = new Error('Time não encontrado');
    err.status = 404;
    throw err;
  }

  const schedule = await espn(
    `${ESPN}/teams/${teamId}/schedule?season=${SEASON}`,
    1800,
    `schedule:${teamId}:${SEASON}`
  );

  const completed = (schedule?.events || [])
    .filter((e) => {
      const type = e.seasonType;
      const regular = !type || type.type === 2 || type.id === '2';
      return regular && e.competitions?.[0]?.status?.type?.completed;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, last);

  const summaries = await mapLimit(completed, 6, (event) => getSummary(event.id, 24 * 3600));
  const games = completed
    .map((event, i) => normalizeTeamGame(event, summaries[i], teamId))
    .filter(Boolean);

  const wins = games.filter((g) => g.win).length;
  const losses = games.length - wins;
  const averages = averageTeamStats(games);
  const oppAverages = averageTeamStats(games, 'oppStats');
  const leaders = aggregateTeamLeaders(summaries, teamId);

  return {
    team,
    season: SEASON_LABEL,
    games,
    record: { wins, losses },
    averages,
    oppAverages,
    leaders,
  };
}

function playerCombo(stats) {
  const { pts, reb, ast, stl, blk, tpm } = stats;
  return {
    pra: pts + reb + ast,
    pr: pts + reb,
    pa: pts + ast,
    ra: reb + ast,
    p3: pts + tpm,
    stocks: stl + blk,
    pra3: pts + reb + ast + tpm,
  };
}

async function getPlayerSeasonContext(playerId) {
  const athlete = await espn(
    `${ESPN_CORE}/seasons/${SEASON}/athletes/${playerId}`,
    12 * 3600,
    `athlete:${playerId}:${SEASON}`
  ).catch(() => null);

  let teamId = athlete?.team?.$ref?.match(/teams\/(\d+)/)?.[1] || null;
  let team = teamId ? (await getTeamMap()).get(String(teamId)) : null;

  if (!team) {
    const index = await getPlayerIndex();
    const found = index.find((p) => p.id === String(playerId));
    if (found) {
      teamId = found.teamId;
      team = (await getTeamMap()).get(String(teamId)) || {
        id: teamId,
        abbr: found.teamAbbr,
        name: found.teamName,
        fullName: found.teamName,
        logo: found.teamLogo,
      };
    }
  }

  return { athlete, teamId, team };
}

async function getPlayerDashboard(playerId, last = 10) {
  const log = await espn(
    `${ESPN_WEB}/athletes/${playerId}/gamelog?season=${SEASON}`,
    900,
    `gamelog:${playerId}:${SEASON}`
  );

  const { athlete, teamId, team } = await getPlayerSeasonContext(playerId);

  let scheduleMap = new Map();
  if (teamId) {
    try {
      const schedule = await espn(
        `${ESPN}/teams/${teamId}/schedule?season=${SEASON}`,
        1800,
        `schedule:${teamId}:${SEASON}`
      );
      for (const event of schedule?.events || []) scheduleMap.set(String(event.id), event);
    } catch {
      /* opcional */
    }
  }

  const names = log?.names || [];
  const labels = log?.labels || [];
  const indexOf = Object.fromEntries(names.map((n, i) => [n, i]));

  const seasonType =
    (log?.seasonTypes || []).find((s) => /regular season/i.test(s.displayName || '')) ||
    (log?.seasonTypes || [])[0];

  const rawEvents = (seasonType?.categories || [])
    .flatMap((c) => c.events || [])
    .slice(0, last);

  const games = rawEvents.map((entry) => {
    const stats = entry.stats || [];
    const read = (name) => {
      const idx = indexOf[name];
      return idx === undefined ? 0 : Number(stats[idx]) || 0;
    };
    const fg = pair(stats[indexOf['fieldGoalsMade-fieldGoalsAttempted']]);
    const tp = pair(stats[indexOf['threePointFieldGoalsMade-threePointFieldGoalsAttempted']]);
    const ft = pair(stats[indexOf['freeThrowsMade-freeThrowsAttempted']]);

    const base = {
      min: read('minutes'),
      pts: read('points'),
      reb: read('totalRebounds'),
      ast: read('assists'),
      stl: read('steals'),
      blk: read('blocks'),
      to: read('turnovers'),
      pf: read('fouls'),
      fgm: fg[0],
      fga: fg[1],
      tpm: tp[0],
      tpa: tp[1],
      ftm: ft[0],
      fta: ft[1],
      plusMinus: Number(stats[indexOf['plusMinus']]) || 0,
    };
    base.fgPct = pct(base.fgm, base.fga);
    base.tpPct = pct(base.tpm, base.tpa);
    base.ftPct = pct(base.ftm, base.fta);
    base.tpm2 = Math.max(0, base.fgm - base.tpm);
    base.tpa2 = Math.max(0, base.fga - base.tpa);
    base.efg = base.fga ? round(((base.fgm + 0.5 * base.tpm) / base.fga) * 100, 1) : 0;
    base.ts =
      base.fga + 0.44 * base.fta > 0
        ? round((base.pts / (2 * (base.fga + 0.44 * base.fta))) * 100, 1)
        : 0;
    base.combos = playerCombo(base);

    const event = scheduleMap.get(String(entry.eventId));
    let meta = {
      date: null,
      home: null,
      opp: null,
      scoreFor: null,
      scoreAgainst: null,
      win: null,
    };

    if (event) {
      const comp = event.competitions?.[0];
      const me = (comp?.competitors || []).find((c) => String(c.id) === String(teamId));
      const opp = (comp?.competitors || []).find((c) => String(c.id) !== String(teamId));
      const scoreFor = Number(me?.score?.value ?? me?.score?.displayValue ?? NaN);
      const scoreAgainst = Number(opp?.score?.value ?? opp?.score?.displayValue ?? NaN);
      meta = {
        date: event.date,
        home: me?.homeAway === 'home',
        opp: opp
          ? {
              id: String(opp.id),
              abbr: opp.team?.abbreviation,
              name: opp.team?.displayName,
              logo: opp.team?.logo,
            }
          : null,
        scoreFor: Number.isFinite(scoreFor) ? scoreFor : null,
        scoreAgainst: Number.isFinite(scoreAgainst) ? scoreAgainst : null,
        win:
          Number.isFinite(scoreFor) && Number.isFinite(scoreAgainst)
            ? scoreFor > scoreAgainst
            : null,
      };
    }

    return { eventId: String(entry.eventId), ...meta, stats: base };
  });

  games.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const comboAverages = {};
  for (const key of ['pra', 'pr', 'pa', 'ra', 'p3', 'stocks', 'pra3']) {
    comboAverages[key] = round(average(games, (g) => g.stats.combos[key]), 1);
  }

  const averages = {
    min: round(average(games, (g) => g.stats.min), 1),
    pts: round(average(games, (g) => g.stats.pts), 1),
    reb: round(average(games, (g) => g.stats.reb), 1),
    ast: round(average(games, (g) => g.stats.ast), 1),
    stl: round(average(games, (g) => g.stats.stl), 1),
    blk: round(average(games, (g) => g.stats.blk), 1),
    to: round(average(games, (g) => g.stats.to), 1),
    tpm: round(average(games, (g) => g.stats.tpm), 1),
    tpa: round(average(games, (g) => g.stats.tpa), 1),
    fgm: round(average(games, (g) => g.stats.fgm), 1),
    fga: round(average(games, (g) => g.stats.fga), 1),
    ftm: round(average(games, (g) => g.stats.ftm), 1),
    fta: round(average(games, (g) => g.stats.fta), 1),
    ts: round(average(games, (g) => g.stats.ts), 1),
    efg: round(average(games, (g) => g.stats.efg), 1),
    plusMinus: round(average(games, (g) => g.stats.plusMinus), 1),
    combos: comboAverages,
  };
  averages.fgPct = pct(averages.fgm, averages.fga);
  averages.tpPct = pct(averages.tpm, averages.tpa);
  averages.ftPct = pct(averages.ftm, averages.fta);

  return {
    player: {
      id: String(playerId),
      name: athlete?.fullName || `Jogador ${playerId}`,
      shortName: athlete?.shortName || '',
      headshot:
        athlete?.headshot?.href ||
        `https://a.espncdn.com/i/headshots/nba/players/full/${playerId}.png`,
      position: athlete?.position?.displayName || '',
      jersey: athlete?.jersey || '',
      team: team || null,
    },
    season: SEASON_LABEL,
    games,
    averages,
  };
}

// ------------------------------------------------------------------- server

function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

async function serveStatic(req, res, pathname) {
  const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.resolve(PUBLIC_DIR, relative);
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const data = await fsp.readFile(file);
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Arquivo não encontrado');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  try {
    if (pathname === '/api/health') {
      sendJSON(res, 200, { ok: true, season: SEASON_LABEL });
      return;
    }

    if (pathname === '/api/teams') {
      sendJSON(res, 200, { season: SEASON_LABEL, teams: await getTeams() });
      return;
    }

    if (pathname === '/api/players') {
      const q = normText(url.searchParams.get('q') || '');
      const limit = Math.min(Number(url.searchParams.get('limit') || 25), 100);
      const all = await getPlayerIndex();
      let list = all;
      if (q) {
        const tokens = q.split(/\s+/).filter(Boolean);
        list = all.filter((p) => {
          const haystack = normText(`${p.name} ${p.teamAbbr} ${p.teamName} ${p.pos}`);
          return tokens.every((t) => haystack.includes(t));
        });
      }
      sendJSON(res, 200, {
        total: list.length,
        players: list.slice(0, limit),
      });
      return;
    }

    if (pathname === '/api/slate') {
      sendJSON(res, 200, { season: SEASON_LABEL, games: await getSlate() });
      return;
    }

    const teamMatch = pathname.match(/^\/api\/team\/(\d+)$/);
    if (teamMatch) {
      const last = Math.min(Math.max(Number(url.searchParams.get('last') || 10), 1), 20);
      sendJSON(res, 200, await getTeamDashboard(teamMatch[1], last));
      return;
    }

    const playerMatch = pathname.match(/^\/api\/player\/(\d+)$/);
    if (playerMatch) {
      const last = Math.min(Math.max(Number(url.searchParams.get('last') || 10), 1), 20);
      sendJSON(res, 200, await getPlayerDashboard(playerMatch[1], last));
      return;
    }

    if (pathname.startsWith('/api/')) {
      sendJSON(res, 404, { error: 'Endpoint não encontrado' });
      return;
    }

    await serveStatic(req, res, pathname);
  } catch (err) {
    const status = err.status || 500;
    console.error(`[${new Date().toISOString()}] ${pathname}:`, err.message);
    sendJSON(res, status, {
      error:
        status === 404
          ? err.message
          : 'Não foi possível buscar os dados agora. Tente novamente em instantes.',
      detail: err.message,
    });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  🏀  NBA Analytics Dashboard');
  console.log(`  ➜  http://localhost:${PORT}`);
  console.log(`  ➜  Temporada ${SEASON_LABEL} (ESPN)`);
  console.log('');

  getTeams().catch(() => {});
  getPlayerIndex().catch(() => {});
});
