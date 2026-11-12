/*
 * GS NBA PRO — camada de dados 100% no navegador.
 * Busca os dados públicos da ESPN direto do cliente (CORS liberado),
 * normaliza e guarda cache no localStorage. Assim o app funciona
 * publicado (GitHub Pages) e instalado como PWA no Windows e Android.
 */
(function () {
  'use strict';

  const SEASON = (() => {
    const now = new Date();
    return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  })();
  const SEASON_LABEL = `${SEASON - 1}-${String(SEASON).slice(2)}`;

  const ESPN = 'https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba';
  const ESPN_WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba';
  const ESPN_CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba';

  const TEAMS = [
    ['1', 'ATL', 'Atlanta', 'Hawks', 'atl'],
    ['2', 'BOS', 'Boston', 'Celtics', 'bos'],
    ['3', 'NO', 'New Orleans', 'Pelicans', 'no'],
    ['4', 'CHI', 'Chicago', 'Bulls', 'chi'],
    ['5', 'CLE', 'Cleveland', 'Cavaliers', 'cle'],
    ['6', 'DAL', 'Dallas', 'Mavericks', 'dal'],
    ['7', 'DEN', 'Denver', 'Nuggets', 'den'],
    ['8', 'DET', 'Detroit', 'Pistons', 'det'],
    ['9', 'GS', 'Golden State', 'Warriors', 'gs'],
    ['10', 'HOU', 'Houston', 'Rockets', 'hou'],
    ['11', 'IND', 'Indiana', 'Pacers', 'ind'],
    ['12', 'LAC', 'LA', 'Clippers', 'lac'],
    ['13', 'LAL', 'Los Angeles', 'Lakers', 'lal'],
    ['14', 'MIA', 'Miami', 'Heat', 'mia'],
    ['15', 'MIL', 'Milwaukee', 'Bucks', 'mil'],
    ['16', 'MIN', 'Minnesota', 'Timberwolves', 'min'],
    ['17', 'BKN', 'Brooklyn', 'Nets', 'bkn'],
    ['18', 'NY', 'New York', 'Knicks', 'ny'],
    ['19', 'ORL', 'Orlando', 'Magic', 'orl'],
    ['20', 'PHI', 'Philadelphia', '76ers', 'phi'],
    ['21', 'PHX', 'Phoenix', 'Suns', 'phx'],
    ['22', 'POR', 'Portland', 'Trail Blazers', 'por'],
    ['23', 'SAC', 'Sacramento', 'Kings', 'sac'],
    ['24', 'SA', 'San Antonio', 'Spurs', 'sa'],
    ['25', 'OKC', 'Oklahoma City', 'Thunder', 'okc'],
    ['26', 'UTAH', 'Utah', 'Jazz', 'utah'],
    ['27', 'WSH', 'Washington', 'Wizards', 'wsh'],
    ['28', 'TOR', 'Toronto', 'Raptors', 'tor'],
    ['29', 'MEM', 'Memphis', 'Grizzlies', 'mem'],
    ['30', 'CHA', 'Charlotte', 'Hornets', 'cha'],
  ].map(([id, abbr, city, name, slug]) => ({
    id,
    abbr,
    name,
    fullName: `${city} ${name}`,
    logo: `https://a.espncdn.com/i/teamlogos/nba/500/${slug}.png`,
    color: '#444444',
    altColor: '#ffffff',
  }));

  const TEAM_MAP = new Map(TEAMS.map((t) => [t.id, t]));

  // ------------------------------------------------------------- helpers

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function round(v, digits = 1) {
    if (!Number.isFinite(v)) return 0;
    const f = 10 ** digits;
    return Math.round(v * f) / f;
  }

  function pct(made, attempted) {
    return attempted ? round((made / attempted) * 100, 1) : 0;
  }

  function pair(value) {
    const parts = String(value ?? '').split('-');
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    return [Number.isFinite(a) ? a : 0, Number.isFinite(b) ? b : 0];
  }

  function average(list, pick) {
    const vals = list.map(pick).filter((v) => Number.isFinite(v));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }

  function normText(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  async function mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const i = cursor;
        cursor += 1;
        if (i >= items.length) return;
        out[i] = await fn(items[i], i);
      }
    });
    await Promise.all(workers);
    return out;
  }

  // --------------------------------------------------------------- cache

  const mem = new Map();
  const PREFIX = 'gs-nba-pro:v1:';

  function readCache(key, ttl) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (!raw) return null;
      const item = JSON.parse(raw);
      if (!item || Date.now() - item.t > Math.min(ttl, item.ttl || ttl)) return null;
      return item.v;
    } catch {
      return null;
    }
  }

  function pruneCache() {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) {
          let t = 0;
          try { t = JSON.parse(localStorage.getItem(k)).t || 0; } catch { /* noop */ }
          keys.push([k, t]);
        }
      }
      keys.sort((a, b) => a[1] - b[1]);
      for (const [k] of keys.slice(0, Math.max(1, Math.floor(keys.length / 3)))) {
        localStorage.removeItem(k);
      }
    } catch { /* noop */ }
  }

  function writeCache(key, value, ttl) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify({ t: Date.now(), ttl, v: value }));
    } catch {
      pruneCache();
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify({ t: Date.now(), ttl, v: value }));
      } catch { /* sem cache */ }
    }
  }

  async function cached(key, ttl, producer) {
    const now = Date.now();
    const hit = mem.get(key);
    if (hit && now - hit.t < ttl) return hit.v;

    const disk = readCache(key, ttl);
    if (disk !== null) {
      mem.set(key, { t: now, v: disk });
      return disk;
    }

    const value = await producer();
    mem.set(key, { t: now, v: value });
    writeCache(key, value, ttl);
    return value;
  }

  async function memCached(key, ttl, producer) {
    const now = Date.now();
    const hit = mem.get(key);
    if (hit && now - hit.t < ttl) return hit.v;
    const value = await producer();
    mem.set(key, { t: now, v: value });
    return value;
  }

  async function espn(url, ttl = 3600, key = url) {
    return memCached(`http:${key}`, ttl * 1000, async () => {
      let lastError;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return await res.json();
        } catch (err) {
          lastError = err;
          if (attempt < 2) await sleep(350 * (attempt + 1));
        }
      }
      throw lastError;
    });
  }

  // ---------------------------------------------------------------- data

  async function getTeams() {
    return cached('teams', 24 * 3600 * 1000, async () => [...TEAMS].sort((a, b) => a.fullName.localeCompare(b.fullName)));
  }

  async function getPlayerIndex() {
    return cached('players-index', 12 * 3600 * 1000, async () => {
      const lists = await mapLimit(TEAMS, 8, async (team) => {
        try {
          const json = await espn(`${ESPN}/teams/${team.id}/roster`, 12 * 3600, `roster:${team.id}`);
          return (json.athletes || [])
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
              headshot: a.headshot?.href || `https://a.espncdn.com/i/headshots/nba/players/full/${a.id}.png`,
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
    return (json.events || []).map((event) => {
      const comp = event.competitions?.[0];
      const odds = comp?.odds?.[0];
      const competitors = (comp?.competitors || []).map((c) => ({
        id: String(c.team?.id),
        abbr: c.team?.abbreviation,
        name: c.team?.displayName,
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
        odds: odds ? {
          provider: odds.provider?.name || '',
          details: odds.details || '',
          spread: Number.isFinite(odds.spread) ? odds.spread : null,
          total: Number.isFinite(odds.overUnder) ? odds.overUnder : null,
          homeMoney: odds.moneyline?.home?.close?.odds || '',
          awayMoney: odds.moneyline?.away?.close?.odds || '',
        } : null,
        competitors,
      };
    });
  }

  async function getLeagueLeaders() {
    return cached(`league-leaders:${SEASON}`, 15 * 60 * 1000, async () => {
      const url = `${ESPN_WEB}/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=true&page=1&limit=500&sort=offensive.avgPoints%3Adesc&season=${SEASON}`;
      const json = await espn(url, 900, `byathlete:${SEASON}`);
      const defs = Object.fromEntries((json.categories || []).map((cat) => [cat.name, cat.names || []]));

      return (json.athletes || [])
        .map((row) => {
          const athlete = row.athlete || {};
          const flat = {};
          for (const category of row.categories || []) {
            const names = defs[category.name] || [];
            (category.values || []).forEach((value, index) => {
              if (names[index]) flat[names[index]] = Number(value) || 0;
            });
          }
          const team = TEAM_MAP.get(String(athlete.teamId || '')) || null;
          return {
            id: String(athlete.id || ''),
            name: athlete.displayName || athlete.fullName || 'Jogador',
            headshot: athlete.headshot?.href || `https://a.espncdn.com/i/headshots/nba/players/full/${athlete.id}.png`,
            pos: athlete.position?.abbreviation || '',
            teamId: String(athlete.teamId || ''),
            teamAbbr: team?.abbr || athlete.teamShortName || '',
            teamName: team?.name || athlete.teamName || '',
            teamLogo: team?.logo || '',
            gp: flat.gamesPlayed || 0,
            min: round(flat.avgMinutes, 1),
            pts: round(flat.avgPoints, 1),
            reb: round(flat.avgRebounds, 1),
            ast: round(flat.avgAssists, 1),
            tpm: round(flat.avgThreePointFieldGoalsMade, 1),
            stl: round(flat.avgSteals, 1),
            blk: round(flat.avgBlocks, 1),
            to: round(flat.avgTurnovers, 1),
            pra: round((flat.avgPoints || 0) + (flat.avgRebounds || 0) + (flat.avgAssists || 0), 1),
            fgPct: round(flat.fieldGoalPct, 1),
            tpPct: round(flat.threePointFieldGoalPct, 1),
          };
        })
        .filter((player) => player.id && player.teamId)
        .sort((a, b) => b.pra - a.pra);
    });
  }

  async function getSummary(eventId) {
    return espn(`${ESPN}/summary?event=${eventId}`, 300, `summary:${eventId}`);
  }

  function statMap(statistics) {
    const map = {};
    for (const s of statistics || []) {
      const value = typeof s.value === 'number'
        ? s.value
        : Number.isFinite(Number(s.displayValue)) ? Number(s.displayValue) : s.displayValue;
      map[s.name] = value;
    }
    return map;
  }

  function teamStatsFromMap(map) {
    const fg = pair(map['fieldGoalsMade-fieldGoalsAttempted']);
    const tp = pair(map['threePointFieldGoalsMade-threePointFieldGoalsAttempted']);
    const ft = pair(map['freeThrowsMade-freeThrowsAttempted']);
    const fgm = fg[0], fga = fg[1];
    const tpm = tp[0], tpa = tp[1];
    const ftm = ft[0], fta = ft[1];
    const pts = fgm * 2 + tpm + ftm;
    let ts = 0;
    if (fga + 0.44 * fta > 0) ts = pts / (2 * (fga + 0.44 * fta));
    if (ts > 1.5) ts /= 100;
    return {
      pts, fgm, fga, fgPct: pct(fgm, fga),
      tpm, tpa, tpPct: pct(tpm, tpa),
      ftm, fta, ftPct: pct(ftm, fta),
      tpm2: Math.max(0, fgm - tpm), tpa2: Math.max(0, fga - tpa),
      reb: Number(map.totalRebounds) || 0,
      oreb: Number(map.offensiveRebounds) || 0,
      dreb: Number(map.defensiveRebounds) || 0,
      ast: Number(map.assists) || 0,
      stl: Number(map.steals) || 0,
      blk: Number(map.blocks) || 0,
      to: Number(map.totalTurnovers ?? map.turnovers) || 0,
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
    out.ts = out.fga + 0.44 * out.fta > 0
      ? round((out.pts / (2 * (out.fga + 0.44 * out.fta))) * 100, 1)
      : 0;
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
      const side = (summary?.boxscore?.players || []).find((p) => String(p.team?.id) === String(teamId));
      if (!side) continue;
      const block = side.statistics?.[0];
      if (!block) continue;
      const keys = block.keys || [];
      for (const row of block.athletes || []) {
        const athlete = row.athlete;
        if (!athlete?.id || row.didNotPlay) continue;
        const id = String(athlete.id);
        const map = {};
        keys.forEach((k, i) => { map[k] = row.stats?.[i]; });

        const fg = pair(map['fieldGoalsMade-fieldGoalsAttempted']);
        const tp = pair(map['threePointFieldGoalsMade-threePointFieldGoalsAttempted']);
        const minutes = Number(map.minutes) || 0;
        const pts = Number(map.points) || 0;
        const reb = Number(map.rebounds) || 0;
        const ast = Number(map.assists) || 0;

        if (!acc.has(id)) {
          acc.set(id, {
            id, name: athlete.displayName || athlete.shortName || 'Jogador',
            headshot: athlete.headshot?.href || '', pos: athlete.position?.abbreviation || '',
            gp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, tpm: 0, fgm: 0, fga: 0, pra: 0,
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
        id: a.id, name: a.name, headshot: a.headshot, pos: a.pos, gp: a.gp,
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
    const team = TEAM_MAP.get(String(teamId));
    if (!team) throw new Error('Time não encontrado');

    return cached(`team:${teamId}:${last}:${SEASON}`, 20 * 60 * 1000, async () => {
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

      const summaries = await mapLimit(completed, 6, (event) => getSummary(event.id));
      const games = completed.map((event, i) => normalizeTeamGame(event, summaries[i], teamId)).filter(Boolean);
      const wins = games.filter((g) => g.win).length;

      return {
        team,
        season: SEASON_LABEL,
        games,
        record: { wins, losses: games.length - wins },
        averages: averageTeamStats(games),
        oppAverages: averageTeamStats(games, 'oppStats'),
        leaders: aggregateTeamLeaders(summaries, teamId),
      };
    });
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

  async function getPlayerDashboard(playerId, last = 10) {
    return cached(`player:${playerId}:${last}:${SEASON}`, 10 * 60 * 1000, async () => {
      const log = await espn(
        `${ESPN_WEB}/athletes/${playerId}/gamelog?season=${SEASON}`,
        900,
        `gamelog:${playerId}:${SEASON}`
      );

      let athlete = null;
      try {
        athlete = await espn(
          `${ESPN_CORE}/seasons/${SEASON}/athletes/${playerId}`,
          12 * 3600,
          `athlete:${playerId}:${SEASON}`
        );
      } catch { /* opcional */ }

      let teamId = athlete?.team?.$ref?.match(/teams\/(\d+)/)?.[1] || null;
      let team = teamId ? TEAM_MAP.get(String(teamId)) : null;

      if (!team) {
        const index = await getPlayerIndex();
        const found = index.find((p) => p.id === String(playerId));
        if (found) {
          teamId = found.teamId;
          team = TEAM_MAP.get(String(teamId)) || null;
        }
      }

      let scheduleMap = new Map();
      if (teamId) {
        try {
          const schedule = await espn(
            `${ESPN}/teams/${teamId}/schedule?season=${SEASON}`,
            1800,
            `schedule:${teamId}:${SEASON}`
          );
          for (const event of schedule?.events || []) scheduleMap.set(String(event.id), event);
        } catch { /* opcional */ }
      }

      const names = log?.names || [];
      const indexOf = Object.fromEntries(names.map((n, i) => [n, i]));
      const seasonType =
        (log?.seasonTypes || []).find((s) => /regular season/i.test(s.displayName || '')) ||
        (log?.seasonTypes || [])[0];

      const rawEvents = (seasonType?.categories || []).flatMap((c) => c.events || []).slice(0, last);

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
          min: read('minutes'), pts: read('points'), reb: read('totalRebounds'),
          ast: read('assists'), stl: read('steals'), blk: read('blocks'),
          to: read('turnovers'), pf: read('fouls'),
          fgm: fg[0], fga: fg[1], tpm: tp[0], tpa: tp[1], ftm: ft[0], fta: ft[1],
          plusMinus: Number(stats[indexOf['plusMinus']]) || 0,
        };
        base.fgPct = pct(base.fgm, base.fga);
        base.tpPct = pct(base.tpm, base.tpa);
        base.ftPct = pct(base.ftm, base.fta);
        base.tpm2 = Math.max(0, base.fgm - base.tpm);
        base.tpa2 = Math.max(0, base.fga - base.tpa);
        base.efg = base.fga ? round(((base.fgm + 0.5 * base.tpm) / base.fga) * 100, 1) : 0;
        base.ts = base.fga + 0.44 * base.fta > 0
          ? round((base.pts / (2 * (base.fga + 0.44 * base.fta))) * 100, 1)
          : 0;
        base.combos = playerCombo(base);

        const event = scheduleMap.get(String(entry.eventId));
        let meta = { date: null, home: null, opp: null, scoreFor: null, scoreAgainst: null, win: null };
        if (event) {
          const comp = event.competitions?.[0];
          const me = (comp?.competitors || []).find((c) => String(c.id) === String(teamId));
          const opp = (comp?.competitors || []).find((c) => String(c.id) !== String(teamId));
          const scoreFor = Number(me?.score?.value ?? me?.score?.displayValue ?? NaN);
          const scoreAgainst = Number(opp?.score?.value ?? opp?.score?.displayValue ?? NaN);
          meta = {
            date: event.date,
            home: me?.homeAway === 'home',
            opp: opp ? {
              id: String(opp.id),
              abbr: opp.team?.abbreviation,
              name: opp.team?.displayName,
              logo: opp.team?.logo,
            } : null,
            scoreFor: Number.isFinite(scoreFor) ? scoreFor : null,
            scoreAgainst: Number.isFinite(scoreAgainst) ? scoreAgainst : null,
            win: Number.isFinite(scoreFor) && Number.isFinite(scoreAgainst) ? scoreFor > scoreAgainst : null,
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
          headshot: athlete?.headshot?.href || `https://a.espncdn.com/i/headshots/nba/players/full/${playerId}.png`,
          position: athlete?.position?.displayName || '',
          jersey: athlete?.jersey || '',
          team: team || null,
        },
        season: SEASON_LABEL,
        games,
        averages,
      };
    });
  }

  async function getPlayerSeries(playerId, last = 10) {
    return cached(`series:${playerId}:${last}:${SEASON}`, 10 * 60 * 1000, async () => {
      const log = await espn(
        `${ESPN_WEB}/athletes/${playerId}/gamelog?season=${SEASON}`,
        900,
        `gamelog:${playerId}:${SEASON}`
      );

      const names = log?.names || [];
      const indexOf = Object.fromEntries(names.map((name, index) => [name, index]));
      const seasonType =
        (log?.seasonTypes || []).find((s) => /regular season/i.test(s.displayName || '')) ||
        (log?.seasonTypes || [])[0];
      const rawEvents = (seasonType?.categories || []).flatMap((c) => c.events || []).slice(0, last);

      const games = rawEvents.map((entry) => {
        const stats = entry.stats || [];
        const read = (name) => {
          const index = indexOf[name];
          return index === undefined ? 0 : Number(stats[index]) || 0;
        };
        const fg = pair(stats[indexOf['fieldGoalsMade-fieldGoalsAttempted']]);
        const tp = pair(stats[indexOf['threePointFieldGoalsMade-threePointFieldGoalsAttempted']]);
        const ft = pair(stats[indexOf['freeThrowsMade-freeThrowsAttempted']]);

        const base = {
          min: read('minutes'), pts: read('points'), reb: read('totalRebounds'),
          ast: read('assists'), stl: read('steals'), blk: read('blocks'),
          to: read('turnovers'),
          fgm: fg[0], fga: fg[1], tpm: tp[0], tpa: tp[1], ftm: ft[0], fta: ft[1],
        };
        base.combos = playerCombo(base);
        return { eventId: String(entry.eventId), stats: base };
      });

      const averages = {};
      for (const key of ['pts', 'reb', 'ast', 'stl', 'blk', 'to', 'tpm']) {
        averages[key] = round(average(games, (g) => g.stats[key]), 1);
      }
      averages.min = round(average(games, (g) => g.stats.min), 1);
      averages.pra = round(average(games, (g) => g.stats.combos.pra), 1);
      averages.gp = games.length;

      return { playerId: String(playerId), season: SEASON_LABEL, games, averages };
    });
  }

  // ---------------------------------------------------------------- router

  async function request(path) {
    const url = new URL(path, window.location.origin);
    const pathname = url.pathname;

    if (pathname === '/api/teams') {
      return { season: SEASON_LABEL, teams: await getTeams() };
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
      return { total: list.length, players: list.slice(0, limit) };
    }

    if (pathname === '/api/slate') {
      return { season: SEASON_LABEL, games: await getSlate() };
    }

    if (pathname === '/api/leaders') {
      return { season: SEASON_LABEL, players: await getLeagueLeaders() };
    }

    const seriesMatch = pathname.match(/^\/api\/player-series\/(\d+)$/);
    if (seriesMatch) {
      const last = Math.min(Math.max(Number(url.searchParams.get('last') || 10), 1), 20);
      return getPlayerSeries(seriesMatch[1], last);
    }

    const teamMatch = pathname.match(/^\/api\/team\/(\d+)$/);
    if (teamMatch) {
      const last = Math.min(Math.max(Number(url.searchParams.get('last') || 10), 1), 20);
      return getTeamDashboard(teamMatch[1], last);
    }

    const playerMatch = pathname.match(/^\/api\/player\/(\d+)$/);
    if (playerMatch) {
      const last = Math.min(Math.max(Number(url.searchParams.get('last') || 10), 1), 20);
      return getPlayerDashboard(playerMatch[1], last);
    }

    throw new Error('Rota não encontrada');
  }

  window.NBAApi = { request, SEASON, SEASON_LABEL };
})();
