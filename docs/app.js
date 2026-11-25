'use strict';

/* ============================================================== helpers */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const C = {
  orange: '#ff2d46',
  orangeFill: 'rgba(255, 45, 70, 0.82)',
  teal: '#f87171',
  tealFill: 'rgba(248, 113, 113, 0.78)',
  blue: '#fb7185',
  blueFill: 'rgba(251, 113, 133, 0.75)',
  violet: '#e879f9',
  green: '#22c55e',
  red: '#ef4444',
  yellow: '#fbbf24',
  slate: 'rgba(161, 161, 170, 0.45)',
};

const TEAM_STAT_META = {
  reb: { label: 'Rebotes', color: C.teal },
  ast: { label: 'Assistências', color: C.orange },
  stl: { label: 'Roubos', color: C.blue },
  blk: { label: 'Tocos', color: C.violet },
  to: { label: 'Turnovers', color: C.red },
  tpm: { label: 'Cestas de 3', color: C.yellow },
  paint: { label: 'Pts no garrafão', color: '#f472b6' },
};

const COMBO_DEFS = {
  pra: { label: 'PRA', long: 'Pontos + Rebotes + Assistências', get: (s) => s.combos.pra },
  pr: { label: 'PTS + REB', long: 'Pontos + Rebotes', get: (s) => s.combos.pr },
  pa: { label: 'PTS + AST', long: 'Pontos + Assistências', get: (s) => s.combos.pa },
  ra: { label: 'REB + AST', long: 'Rebotes + Assistências', get: (s) => s.combos.ra },
  pts: { label: 'Pontos', long: 'Pontos', get: (s) => s.pts },
  reb: { label: 'Rebotes', long: 'Rebotes', get: (s) => s.reb },
  ast: { label: 'Assistências', long: 'Assistências', get: (s) => s.ast },
  p3: { label: 'PTS + 3PM', long: 'Pontos + cestas de 3', get: (s) => s.combos.p3 },
  stocks: { label: 'STL + BLK', long: 'Roubos + Tocos', get: (s) => s.combos.stocks },
  pra3: { label: 'PRA + 3PM', long: 'PRA + cestas de 3', get: (s) => s.combos.pra3 },
};

const PROP_MARKETS = [
  { key: 'pts', label: 'Pontos', short: 'PTS', minAvg: 10, minLine: 9.5, series: (s) => s.pts },
  { key: 'pra', label: 'PRA', short: 'PRA', minAvg: 16, minLine: 14.5, series: (s) => s.combos.pra },
  { key: 'reb', label: 'Rebotes', short: 'REB', minAvg: 4, minLine: 2.5, series: (s) => s.reb },
  { key: 'ast', label: 'Assistências', short: 'AST', minAvg: 3, minLine: 2.5, series: (s) => s.ast },
  { key: 'tpm', label: 'Cestas de 3', short: '3PM', minAvg: 1.5, minLine: 1.5, series: (s) => s.tpm },
  { key: 'stocks', label: 'Roubos + Tocos', short: 'STL+BLK', minAvg: 1.5, minLine: 1.5, series: (s) => s.stl + s.blk },
];

const PAGE_META = {
  overview: ['Visão geral', 'Jogos do dia, sugestões de props e probabilidades estimadas.'],
  teams: ['Times', 'Últimos jogos, produção ofensiva, defesa e confrontos.'],
  players: ['Jogadores', 'Análise de mercados com linha, odd da 99play e aproveitamento L5/L10/L20.'],
  combos: ['Combos', 'Média, mediana e aproveitamento contra a linha de over/under.'],
  compare: ['Comparador', 'Dois jogadores lado a lado, com perfil e produção.'],
  'football-overview': ['Futebol — Visão geral', 'Jogos do dia, melhores entradas e estatísticas de futebol.'],
  'football-teams': ['Times — Futebol', 'Gols, escanteios, cartões, chutes e odds por mercado.'],
  'football-players': ['Jogadores — Futebol', 'Gols, assistências, finalizações, desarmes e defesas.'],
};

const state = {
  season: '',
  teams: [],
  teamMap: new Map(),
  teamId: null,
  compareTeamId: null,
  teamLast: 10,
  teamData: null,
  teamCompareData: null,
  teamStatKeys: ['reb', 'ast', 'stl', 'blk', 'to'],
  playerId: null,
  playerLast: 10,
  playerData: null,
  comboPlayerId: null,
  comboData: null,
  comboType: 'pra',
  comboLine: 28.5,
  comboLineTouched: false,
  compareIds: { a: null, b: null },
  compareData: { a: null, b: null },
  slateLoaded: false,
  slateGames: [],
  slateSignature: '',
  slateInsights: new Map(),
  slateBestBets: [],
  insightsToken: 0,
  leaders: [],
  leadersPromise: null,

  // Futebol
  football: {
    competitions: [],
    competitionId: null,
    slate: [],
    slateDate: '',
    teamId: null,
    teamLast: 5,
    teamData: null,
    playerId: null,
    playerLast: 5,
    playerData: null,
    bestBets: [],
  },
};

let teamToken = 0;
let compareTeamToken = 0;
let playerToken = 0;
let comboToken = 0;
let compareToken = 0;
let footballToken = 0;
let footballTeamToken = 0;
let footballPlayerToken = 0;
const pluginSeq = 0;
const charts = new Map();
const seriesPromises = new Map();

/* ============================================================== formatters */

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function fmt(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtSmart(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : fmt(rounded, 1);
}

function fmtSigned(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n > 0 ? '+' : ''}${fmt(n, digits)}`;
}

function shortDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function longDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function median(values) {
  const arr = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!arr.length) return 0;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function slope(values) {
  const n = values.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  values.forEach((y, x) => {
    num += (x - meanX) * (y - meanY);
    den += (x - meanX) ** 2;
  });
  return den ? num / den : 0;
}

function quantile(values, q) {
  const arr = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!arr.length) return 0;
  const pos = (arr.length - 1) * Math.min(Math.max(q, 0), 1);
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return arr[lower];
  return arr[lower] + (arr[upper] - arr[lower]) * (pos - lower);
}

function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
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

function imageFallback(el) {
  el.style.opacity = '0.18';
}

/* ================================================================ charts */

Chart.defaults.color = '#8e9db5';
Chart.defaults.font.family = "'Segoe UI', system-ui, -apple-system, sans-serif";
Chart.defaults.font.size = 10.5;
Chart.defaults.borderColor = 'rgba(148, 163, 184, 0.12)';
Chart.defaults.animation = { duration: 420 };
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.boxWidth = 7;
Chart.defaults.plugins.legend.labels.boxHeight = 7;
Chart.defaults.plugins.legend.labels.padding = 13;
Chart.defaults.plugins.tooltip.backgroundColor = '#0b1220';
Chart.defaults.plugins.tooltip.borderColor = 'rgba(148, 163, 184, 0.28)';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.tooltip.titleFont = { weight: '600', size: 11 };
Chart.defaults.plugins.tooltip.bodyFont = { size: 11 };

const GRID = { color: 'rgba(148, 163, 184, 0.08)', drawTicks: false };

function yAxis(extra = {}) {
  return {
    beginAtZero: true,
    grid: GRID,
    border: { display: false },
    ticks: { padding: 6 },
    ...extra,
  };
}

function xAxis(extra = {}) {
  return {
    grid: { display: false },
    border: { display: false },
    ticks: { maxRotation: 0, autoSkip: true, padding: 4 },
    ...extra,
  };
}

function makeChart(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  if (charts.has(id)) charts.get(id).destroy();
  const instance = new Chart(canvas.getContext('2d'), config);
  charts.set(id, instance);
  return instance;
}

function destroyCharts(ids) {
  ids.forEach((id) => {
    if (charts.has(id)) {
      charts.get(id).destroy();
      charts.delete(id);
    }
  });
}

function hLinePlugin(value, label, color) {
  const id = `hline_${++pluginSeq}`;
  return {
    id,
    afterDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea || !scales.y) return;
      const y = scales.y.getPixelForValue(value);
      if (!Number.isFinite(y) || y < chartArea.top || y > chartArea.bottom) return;
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = '600 9.5px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(label, chartArea.right - 4, y - 5);
      ctx.restore();
    },
  };
}

function vLinePlugin(index, label, color) {
  const id = `vline_${++pluginSeq}`;
  return {
    id,
    afterDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea || !scales.x) return;
      const x = scales.x.getPixelForValue(index);
      if (!Number.isFinite(x) || x < chartArea.left || x > chartArea.right) return;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.restore();
    },
  };
}

/* ================================================================ api */

async function api(path) {
  if (window.NBAApi) return window.NBAApi.request(path);
  const res = await fetch(path);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    throw new Error((body && body.error) || `Falha ao carregar (${res.status})`);
  }
  return body;
}

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .3s';
    setTimeout(() => el.remove(), 320);
  }, 3600);
}

/* ================================================================ pickers */

function setupPicker(root, onPick) {
  if (!root) return null;
  const input = root.querySelector('input');
  const results = root.querySelector('.search-results');
  let timer = null;

  const close = () => results.classList.remove('open');

  async function search() {
    results.classList.add('open');
    results.innerHTML = '<div class="search-hint"><span class="spinner"></span>Buscando jogadores…</div>';
    try {
      const q = input.value.trim();
      const data = await api(`/api/players?q=${encodeURIComponent(q)}&limit=20`);
      if (!data.players.length) {
        results.innerHTML = '<div class="search-hint">Nenhum jogador encontrado. Tente só o sobrenome.</div>';
        return;
      }
      results.innerHTML = data.players
        .map(
          (p) => `<button type="button" class="search-item" data-id="${p.id}">
            <img src="${escapeHtml(p.headshot)}" alt="" onerror="this.style.opacity='.15'" />
            <span class="si-main">
              <strong>${escapeHtml(p.name)}</strong>
              <small>${escapeHtml(p.teamAbbr)} · ${escapeHtml(p.pos || 'NBA')}</small>
            </span>
          </button>`
        )
        .join('');

      $$('.search-item', results).forEach((button) => {
        button.addEventListener('click', () => {
          const player = data.players.find((p) => p.id === button.dataset.id);
          if (!player) return;
          input.value = player.name;
          close();
          onPick(player);
        });
      });
    } catch (err) {
      results.innerHTML = `<div class="search-hint">${escapeHtml(err.message)}</div>`;
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(search, 260);
  });

  input.addEventListener('focus', () => {
    if (!results.children.length) search();
    else results.classList.add('open');
  });

  document.addEventListener('click', (event) => {
    if (!root.contains(event.target)) close();
  });

  return {
    input,
    setName(name) { input.value = name; },
  };
}

async function findPlayer(query) {
  try {
    const data = await api(`/api/players?q=${encodeURIComponent(query)}&limit=3`);
    return data.players[0] || null;
  } catch {
    return null;
  }
}

/* ================================================================ navigation */

function goTo(view) {
  $$('.view').forEach((section) => section.classList.toggle('active', section.id === `view-${view}`));
  $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  const [title, sub] = PAGE_META[view] || PAGE_META.overview;
  $('#page-title').textContent = title;
  $('#page-sub').textContent = sub;
  if (window.location.hash !== `#${view}`) {
    history.replaceState(null, '', `#${view}`);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (view === 'overview' && !state.slateLoaded) loadSlate();
  if (view === 'combos' && !state.comboData) ensureCombo();
  if (view === 'football-overview' && !state.football.slateDate) loadFootballOverview();
  if (view === 'football-teams') loadFootballTeam();
  if (view === 'football-players') loadFootballPlayer();
}

function bindNavigation() {
  $$('.nav-item').forEach((button) => {
    button.addEventListener('click', () => goTo(button.dataset.view));
  });
  $$('[data-goto]').forEach((button) => {
    button.addEventListener('click', () => goTo(button.dataset.goto));
  });
}

/* ================================================================ overview */

function todayLabel() {
  const text = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
  });
  $('#today-label').textContent = text.charAt(0).toUpperCase() + text.slice(1);
  $('#season-label').textContent = state.season || '—';
}

function slateSignature(games) {
  return games
    .map((game) => [
      game.id,
      game.status.state,
      game.status.completed ? 1 : 0,
      game.competitors.map((c) => c.score).join('-'),
      game.odds?.details || '',
      game.odds?.total ?? '',
    ].join(':'))
    .join('|');
}

async function loadSlate({ silent = false } = {}) {
  const grid = $('#slate-grid');
  if (!silent) {
    grid.innerHTML = '<div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div>';
  }
  try {
    const data = await api('/api/slate');
    const games = data.games || [];
    const signature = slateSignature(games);
    const changed = signature !== state.slateSignature;

    state.slateLoaded = true;
    state.slateGames = games;
    state.slateSignature = signature;
    todayLabel();

    if (changed || !silent) {
      renderSlate(games);
      loadSlateInsights(games);
    } else {
      updateSlateStamp(games);
    }
  } catch (err) {
    if (!silent) grid.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

function startSlateAutoRefresh() {
  const refresh = () => {
    if (document.visibilityState !== 'visible') return;
    if (!$('#view-overview')?.classList.contains('active')) return;
    loadSlate({ silent: true });
  };
  setInterval(refresh, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
}

function updateSlateStamp(games) {
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const first = games[0]?.date ? new Date(games[0].date) : null;
  const day = first
    ? first.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : '';
  $('#slate-updated').textContent = `Atualizado ${time}${day ? ` · ${day}` : ''}`;
}

function renderSlate(games) {
  const grid = $('#slate-grid');
  updateSlateStamp(games);

  if (!games.length) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1">Nenhum jogo na grade de hoje. Volte mais tarde.</div>';
    return;
  }

  const sorted = [...games].sort((a, b) => new Date(a.date) - new Date(b.date));
  grid.innerHTML = sorted.map((game) => gameCardHtml(game)).join('');
}

function gameCardHtml(game) {
  const away = game.competitors.find((c) => !c.home);
  const home = game.competitors.find((c) => c.home);
  const rows = [away, home].filter(Boolean);
  const statusClass = game.status.completed ? 'final' : game.status.state === 'in' ? 'live' : '';
  const statusText = game.status.completed ? 'Final' : game.status.state === 'in' ? 'Ao vivo' : game.status.detail || longDate(game.date);
  const odds = game.odds;

  return `<article class="game-card">
    <div class="game-top">
      <span class="game-top-left">
        <span class="game-status ${statusClass}">${escapeHtml(statusText)}</span>
        <span class="bet-flag" data-bet-flag="${game.id}"></span>
      </span>
      <span>${escapeHtml(game.venue || game.broadcast || '')}</span>
    </div>
    <div class="bet-slot pending" data-bet-slot="${game.id}">
      <span class="bet-pending"><span class="spinner"></span>Calculando sugestão…</span>
    </div>
    <div class="matchup">
      ${rows
        .map(
          (team) => `<div class="team-row ${game.status.completed && !team.winner ? 'loser' : ''}">
            <img src="${escapeHtml(team.logo)}" alt="" onerror="this.style.opacity='.2'" />
            <span class="tname">
              <strong>${escapeHtml(team.abbr)}</strong>
              <small>${team.home ? 'CASA' : 'FORA'}${team.record ? ` · ${escapeHtml(team.record)}` : ''}</small>
            </span>
            <span class="score">${game.status.state === 'pre' ? '—' : team.score}</span>
          </div>`
        )
        .join('')}
    </div>
    <div class="stars-row" data-stars="${game.id}"></div>
    <div class="odds-row">
      <div><span>Spread</span><strong>${odds && odds.details ? escapeHtml(odds.details) : '—'}</strong></div>
      <div><span>Total</span><strong>${odds && odds.total != null ? fmt(odds.total, 1) : '—'}</strong></div>
      <div><span>Moneyline</span><strong>${odds && (odds.awayMoney || odds.homeMoney) ? `${escapeHtml(odds.awayMoney || '—')} / ${escapeHtml(odds.homeMoney || '—')}` : '—'}</strong></div>
    </div>
    <div class="game-foot">
      <span>${escapeHtml(game.odds?.provider || 'Odds indisponíveis')}</span>
      <span>${longDate(game.date)}</span>
    </div>
  </article>`;
}

function betIconSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`;
}

function betBannerHtml(insight) {
  const s = insight.suggestion;
  if (!s) {
    return '<div class="bet-empty">Sem sugestão com confiança suficiente para este jogo.</div>';
  }
  const stats = s.player;
  return `<button type="button" class="bet-banner" data-player-id="${escapeHtml(s.player.id)}" data-player-name="${escapeHtml(s.player.name)}">
    <span class="bet-head">
      <span class="bet-icon">${betIconSvg()}</span>
      <img class="bet-face" src="${escapeHtml(s.player.headshot)}" alt="" onerror="this.style.opacity='.15'" />
      <span class="bet-copy">
        <span class="bet-eyebrow">Sugestão GS Stats PRO</span>
        <strong>${escapeHtml(s.player.name)} <span class="bet-team">${escapeHtml(s.player.teamAbbr || '')}</span></strong>
        <span class="bet-market">Over <b>${fmt(s.line, 1)} ${escapeHtml(s.market.short)}</b> · <b class="bet-prob">${s.probability}%</b> de probabilidade</span>
      </span>
    </span>
    <span class="bet-stats">
      <span><b>${fmt(stats.pts, 1)}</b>PTS</span>
      <span><b>${fmt(stats.reb, 1)}</b>REB</span>
      <span><b>${fmt(stats.ast, 1)}</b>AST</span>
      <span><b>${fmt(stats.tpm, 1)}</b>3PM</span>
    </span>
  </button>`;
}

function starsRowHtml(insight) {
  if (!insight) return '';
  return insight.sides
    .map((side) => `<div class="stars-side">
      <span class="stars-team">
        <img src="${escapeHtml(side.team.logo)}" alt="" onerror="this.style.opacity='.15'" />
        ${escapeHtml(side.team.abbr)} · destaques
      </span>
      ${side.top
        .slice(0, 2)
        .map((p) => `<button type="button" class="star-chip" data-player-id="${escapeHtml(p.id)}" data-player-name="${escapeHtml(p.name)}">
          <img src="${escapeHtml(p.headshot)}" alt="" onerror="this.style.opacity='.15'" />
          <span class="star-body">
            <span class="star-name">${escapeHtml(p.name)}</span>
            <span class="star-line">${fmt(p.pts, 1)} PTS · ${fmt(p.reb, 1)} REB · ${fmt(p.ast, 1)} AST · ${fmt(p.tpm, 1)} 3PM</span>
          </span>
        </button>`)
        .join('')}
    </div>`)
    .join('');
}

function updateGameInsight(gameId) {
  const insight = state.slateInsights.get(gameId);
  const slot = $(`[data-bet-slot="${gameId}"]`);
  if (slot) {
    slot.classList.remove('pending');
    slot.innerHTML = betBannerHtml(insight || {});
  }
  const stars = $(`[data-stars="${gameId}"]`);
  if (stars) stars.innerHTML = starsRowHtml(insight);

  const flag = $(`[data-bet-flag="${gameId}"]`);
  if (flag) {
    const best = insight?.suggestion;
    flag.innerHTML = best
      ? `<span class="bet-flag-on" title="Sugestão GS Stats PRO: ${escapeHtml(best.player.name)} over ${fmt(best.line, 1)} ${escapeHtml(best.market.short)} (${best.probability}%)">${betIconSvg()}</span>`
      : '';
  }
}

/* ============================================================ insights */
/* Sugestões de props: média dos últimos 10 jogos, linha conservadora
   (percentil 35) e probabilidade estimada por histórico + modelo normal. */

function ensureLeagueLeaders() {
  if (state.leaders.length) return Promise.resolve(state.leaders);
  if (!state.leadersPromise) {
    state.leadersPromise = api('/api/leaders')
      .then((data) => {
        state.leaders = data.players || [];
        return state.leaders;
      })
      .catch(() => {
        state.leaders = [];
        return state.leaders;
      });
  }
  return state.leadersPromise;
}

function fetchPlayerSeries(id) {
  const key = String(id);
  if (!seriesPromises.has(key)) {
    seriesPromises.set(key, api(`/api/player-series/${key}?last=10`).catch(() => null));
  }
  return seriesPromises.get(key);
}

function buildPropSuggestions(player, series) {
  const games = series?.games || [];
  if (games.length < 5) return [];
  const avg = series.averages || {};
  const suggestions = [];

  for (const market of PROP_MARKETS) {
    const values = games.map((g) => market.series(g.stats)).filter((v) => Number.isFinite(v));
    if (values.length < 5) continue;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean < market.minAvg) continue;

    const max = Math.max(...values);
    if (max < 1) continue;

    const q35 = quantile(values, 0.35);
    const line = Math.max(market.minLine || 0.5, Math.floor(q35) - 0.5);
    if (line >= max) continue;

    const over = values.filter((v) => v > line).length;
    const empirical = over / values.length;
    const sd = Math.max(stdDev(values), 0.55);
    const model = 1 - normalCdf((line - mean) / sd);
    const last5 = values.slice(0, 5);
    const recent = last5.length ? last5.filter((v) => v > line).length / last5.length : empirical;

    let probability = 0.55 * empirical + 0.30 * model + 0.15 * recent;
    probability = Math.min(0.90, Math.max(0.35, probability));
    const pct = Math.round(probability * 100);
    const cv = mean ? sd / mean : 1;
    const confidence = pct >= 70 && cv <= 0.32 ? 'Alta' : pct >= 60 ? 'Média' : 'Baixa';
    const score = pct + (1 - Math.min(cv, 0.7)) * 12 + Math.min((avg.pra || 0) / 15, 1.5) * 5 + empirical * 4;

    suggestions.push({
      market,
      line,
      probability: pct,
      confidence,
      score,
      cv,
      n: values.length,
      hits: over,
      recent: values.slice(0, 10),
      mean,
      player: {
        id: player.id,
        name: player.name,
        headshot: player.headshot,
        teamAbbr: player.teamAbbr,
        teamName: player.teamName,
        pts: avg.pts || 0,
        reb: avg.reb || 0,
        ast: avg.ast || 0,
        tpm: avg.tpm || 0,
        pra: avg.pra || 0,
      },
    });
  }

  return suggestions;
}

async function loadSlateInsights(games) {
  if (!games || !games.length) return;
  const token = ++state.insightsToken;
  state.slateInsights.clear();
  state.slateBestBets = [];

  const section = $('#overview-radar');
  if (section) section.hidden = true;

  const leaders = await ensureLeagueLeaders();
  if (token !== state.insightsToken) return;

  if (!leaders.length) {
    games.forEach((game) => updateGameInsight(game.id));
    return;
  }

  const byTeam = new Map();
  for (const player of leaders) {
    const key = String(player.teamId);
    if (!byTeam.has(key)) byTeam.set(key, []);
    byTeam.get(key).push(player);
  }
  for (const list of byTeam.values()) list.sort((a, b) => b.pra - a.pra);

  await mapLimit(games, 2, async (game) => {
    if (token !== state.insightsToken) return;

    const sides = [game.competitors.find((c) => !c.home), game.competitors.find((c) => c.home)]
      .filter(Boolean)
      .map((team) => ({ team, top: (byTeam.get(String(team.id)) || []).slice(0, 3) }));

    const candidates = sides.flatMap((side) => side.top);
    const seriesList = await mapLimit(candidates, 3, (player) => fetchPlayerSeries(player.id));
    if (token !== state.insightsToken) return;

    const seriesMap = new Map();
    candidates.forEach((player, index) => seriesMap.set(player.id, seriesList[index]));

    const suggestions = [];
    const enrichedSides = sides.map((side) => ({
      ...side,
      top: side.top.map((player) => ({
        ...player,
        ...(seriesMap.get(player.id)?.averages || {}),
      })),
    }));

    for (const player of candidates) {
      const series = seriesMap.get(player.id);
      if (series) suggestions.push(...buildPropSuggestions(player, series));
    }
    suggestions.sort((a, b) => b.score - a.score);

    const insight = {
      gameId: game.id,
      sides: enrichedSides,
      suggestion: suggestions[0] || null,
    };
    state.slateInsights.set(game.id, insight);
    state.slateBestBets.push(...suggestions.slice(0, 2).map((s) => ({ ...s, gameId: game.id })));
    updateGameInsight(game.id);
  });

  if (token !== state.insightsToken) return;
  await attachOdds(state.slateBestBets);
  if (token !== state.insightsToken) return;
  renderOverviewRadar();
  renderOverviewStars();
  loadTeamPropsOfDay().catch(() => {});
}

async function attachOdds(bets) {
  if (!bets?.length) return;
  await ensureBookSlate();
  const byEvent = new Map();
  for (const bet of bets) {
    const event = findBookEvent({ abbr: bet.player.teamAbbr, name: bet.player.teamName });
    if (!event) continue;
    bet.eventId = event.id;
    if (!byEvent.has(event.id)) byEvent.set(event.id, []);
    byEvent.get(event.id).push(bet);
  }
  await mapLimit([...byEvent.entries()], 3, async ([eventId, list]) => {
    try {
      const details = await api(`/api/book/event/${eventId}`);
      for (const bet of list) {
        const target = nameKey(bet.player.name);
        const entry = Object.entries(details.props || {}).find(([key]) => nameKey(key) === target);
        const book = entry?.[1]?.[bet.market.key] || null;
        if (!book) continue;
        bet.bookLine = book.line;
        bet.odd = book.over;
        bet.underOdd = book.under;
        bet.eventLabel = (details.teams || []).map((t) => t.abbr).join(' x ');
        bet.eventTime = details.startDate || '';
        if (book.line != null) recomputeAtLine(bet, book.line);
      }
    } catch { /* odd opcional */ }
  });
}

// Recalcula aproveitamento/probabilidade na linha real da casa de apostas.
function recomputeAtLine(bet, line) {
  const values = bet.recent || [];
  if (!values.length) return;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.max(stdDev(values), 0.55);
  const hits = values.filter((v) => v > line).length;
  const empirical = hits / values.length;
  const model = 1 - normalCdf((line - mean) / sd);
  const last5 = values.slice(0, 5);
  const recentRate = last5.length ? last5.filter((v) => v > line).length / last5.length : empirical;
  const p = 0.55 * empirical + 0.30 * model + 0.15 * recentRate;
  bet.line = line;
  bet.mean = mean;
  bet.hits = hits;
  bet.n = values.length;
  bet.probability = Math.round(Math.min(0.90, Math.max(0.35, p)) * 100);
}

function shortPlayerName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter((p) => !/^(jr|sr|ii|iii|iv)\.?$/i.test(p));
  return parts.length > 1 ? parts[parts.length - 1] : parts[0] || '—';
}

function renderOverviewRadar() {
  const section = $('#overview-radar');
  if (!section) return;

  const seenPlayers = new Set();
  const bets = [...state.slateBestBets]
    .sort((a, b) => b.probability - a.probability || b.score - a.score)
    .filter((s) => {
      if (seenPlayers.has(s.player.id)) return false;
      seenPlayers.add(s.player.id);
      return true;
    })
    .slice(0, 10);
  if (!bets.length) {
    section.hidden = true;
    destroyCharts(['chart-overview-probs']);
    return;
  }

  section.hidden = false;
  const top = bets.slice(0, 8);
  $('#radar-hint').textContent = `${top.length} props ordenadas pela maior probabilidade · odds 99play`;

  $('#radar-list').innerHTML = top.map((s, index) => {
    const recent = [...(s.recent || [])].reverse();
    const max = Math.max(1, ...recent);
    const spark = recent.map((v) => `<i class="${v > s.line ? 'on' : 'off'}" style="height:${Math.max(12, Math.round((v / max) * 100))}%"></i>`).join('');
    const oddOn = !!s.odd;
    return `
    <button type="button" class="radar-item" data-player-id="${escapeHtml(s.player.id)}" data-player-name="${escapeHtml(s.player.name)}">
      <span class="radar-rank">${index + 1}</span>
      <img src="${escapeHtml(s.player.headshot)}" alt="" onerror="this.style.opacity='.15'" />
      <span class="radar-body">
        <span class="radar-top">
          <strong>${escapeHtml(s.player.name)}</strong>
          <span class="badge blue">${escapeHtml(s.player.teamAbbr || 'NBA')}</span>
          <span class="radar-prob">${s.probability}%</span>
        </span>
        <span class="radar-bet">Over ${fmt(s.line, 1)} ${escapeHtml(s.market.short)} · ${escapeHtml(s.market.label)}${s.eventLabel ? ` <span class="radar-match">${escapeHtml(s.eventLabel)}</span>` : ''}</span>
        <span class="radar-meta">
          <span class="spark">${spark}</span>
          <span class="radar-hit">${s.hits}/${s.n} acima</span>
          <span class="radar-odd ${oddOn ? 'on' : 'off'}">${s.odd ? fmt(s.odd, 2) : '—'}</span>
        </span>
        <span class="radar-bar"><i style="width:${s.probability}%"></i></span>
      </span>
    </button>`;
  }).join('');

  renderOverviewProbChart(top);
}

function renderOverviewProbChart(bets) {
  makeChart('chart-overview-probs', {
    type: 'bar',
    data: {
      labels: bets.map((s) => `${shortPlayerName(s.player.name)} · ${s.market.short}`),
      datasets: [{
        data: bets.map((s) => s.probability),
        backgroundColor: bets.map((s) => (
          s.probability >= 70 ? 'rgba(34, 197, 94, 0.78)'
            : s.probability >= 55 ? 'rgba(251, 191, 36, 0.8)'
              : 'rgba(161, 161, 170, 0.42)'
        )),
        borderRadius: 5,
        maxBarThickness: 22,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const s = bets[ctx.dataIndex];
              return ` ${s.player.name} · Over ${fmt(s.line, 1)} ${s.market.label}: ${s.probability}%`;
            },
            afterLabel: (ctx) => {
              const s = bets[ctx.dataIndex];
              return `${s.player.teamAbbr} · confiança ${s.confidence.toLowerCase()}`;
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          max: 100,
          grid: GRID,
          border: { display: false },
          ticks: { callback: (value) => `${value}%`, padding: 6 },
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: '#cbd5e1', font: { size: 10, weight: '600' } },
        },
      },
    },
  });
}

function renderOverviewStars() {
  const container = $('#overview-stars');
  if (!container) return;

  const teamIds = new Set((state.slateGames || []).flatMap((game) => game.competitors.map((c) => String(c.id))));
  const list = state.leaders
    .filter((player) => teamIds.has(String(player.teamId)))
    .sort((a, b) => b.pra - a.pra)
    .slice(0, 12);

  if (!list.length) {
    container.innerHTML = '<div class="empty" style="grid-column:1/-1">Carregando destaques das equipes…</div>';
    return;
  }

  container.innerHTML = list.map((p) => `
    <button type="button" class="leader" data-player-id="${escapeHtml(p.id)}" data-player-name="${escapeHtml(p.name)}">
      <img src="${escapeHtml(p.headshot)}" alt="" onerror="this.style.opacity='.15'" />
      <span class="l-main">
        <span class="l-name">${escapeHtml(p.name)}</span>
        <span class="l-sub">${escapeHtml(p.teamAbbr)} · ${fmt(p.pts, 1)} PTS · ${fmt(p.reb, 1)} REB · ${fmt(p.ast, 1)} AST · ${fmt(p.tpm, 1)} 3PM</span>
      </span>
      <span class="l-pra"><strong>${fmt(p.pra, 1)}</strong><span>PRA</span></span>
    </button>`).join('');
}

function openPlayer(id, name) {
  if (!id) return;
  goTo('players');
  if (playerPicker) playerPicker.setName(name || '');
  loadPlayer(id);
}

function bindOverviewInteractions() {
  document.addEventListener('click', (event) => {
    const teamTarget = event.target.closest('[data-team-id]');
    if (teamTarget && teamTarget.closest('#team-props-list')) {
      openTeam(teamTarget.dataset.teamId, teamTarget.dataset.teamName);
      return;
    }

    const target = event.target.closest('[data-player-id]');
    if (!target) return;
    if (!target.closest('#overview-stars, #radar-list, #slate-grid')) return;
    openPlayer(target.dataset.playerId, target.dataset.playerName);
  });
}

/* ================================================================ teams */

function fillTeamSelects() {
  const options = state.teams
    .map((team) => `<option value="${team.id}">${escapeHtml(team.fullName)}</option>`)
    .join('');
  $('#team-select').innerHTML = options;
  $('#team-compare-select').innerHTML = options;
  $('#team-select').value = state.teamId;
  if (state.compareTeamId) $('#team-compare-select').value = state.compareTeamId;
}

async function loadTeam(id) {
  if (!id) return;
  state.teamId = String(id);
  const token = ++teamToken;
  const head = $('#team-header');
  const team = state.teamMap.get(String(id));
  head.innerHTML = `<div class="loading"><span class="spinner"></span>Carregando ${escapeHtml(team?.fullName || 'time')}…</div>`;

  try {
    const data = await api(`/api/team/${id}?last=${state.teamLast}`);
    if (token !== teamToken) return;
    state.teamData = data;

    let compareId = state.compareTeamId;
    if (!compareId || compareId === String(id)) {
      compareId = data.games[0]?.opp?.id || null;
    }

    let compareData = null;
    if (compareId && compareId !== String(id)) {
      try {
        compareData = await api(`/api/team/${compareId}?last=${state.teamLast}`);
      } catch {
        compareData = null;
      }
    }
    if (token !== teamToken) return;

    state.compareTeamId = compareId;
    state.teamCompareData = compareData;
    $('#team-compare-select').value = compareId || '';
    renderTeam(data, compareData);
  } catch (err) {
    if (token !== teamToken) return;
    head.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

async function loadCompareTeam(id) {
  state.compareTeamId = id ? String(id) : null;
  if (!state.teamData) return;
  const token = ++compareTeamToken;

  if (!id || String(id) === String(state.teamId)) {
    state.teamCompareData = null;
    renderTeam(state.teamData, null);
    return;
  }

  try {
    const data = await api(`/api/team/${id}?last=${state.teamLast}`);
    if (token !== compareTeamToken) return;
    state.teamCompareData = data;
    renderTeam(state.teamData, data);
  } catch (err) {
    toast(err.message);
  }
}

function renderTeam(data, compare) {
  const { team, games, record, averages: avg, oppAverages: opp, leaders } = data;
  const recent = games.slice(0, state.teamLast);

  const form = [...recent].reverse()
    .map((g) => `<span class="form-dot ${g.win ? 'w' : 'l'}">${g.win ? 'V' : 'D'}</span>`)
    .join('');

  $('#team-header').innerHTML = `<div class="entity-head">
    <img class="entity-logo" src="${escapeHtml(team.logo)}" alt="" onerror="imageFallback(this)" />
    <div>
      <div class="entity-name">${escapeHtml(team.fullName)}
        <span class="badge">${record.wins}V · ${record.losses}D</span>
      </div>
      <div class="entity-sub">
        <span>${games.length} jogos na temporada</span>
        <span>·</span><span>${escapeHtml(data.season)}</span>
        <span>·</span><span>${fmt(avg.pts, 1)} pts/jogo</span>
      </div>
    </div>
    <div class="entity-form">${form}</div>
  </div>`;

  const diff = avg.pts - opp.pts;
  const kpis = [
    { label: 'Pontos / jogo', value: fmt(avg.pts, 1), sub: `${record.wins}V · ${record.losses}D no período`, accent: C.orange },
    { label: 'Pontos sofridos', value: fmt(opp.pts, 1), sub: `saldo ${fmtSigned(diff)}`, accent: C.blue },
    { label: 'Margem', value: fmtSigned(diff), sub: 'por jogo', accent: diff >= 0 ? C.green : C.red },
    { label: 'FG%', value: `${fmt(avg.fgPct, 1)}%`, sub: `${fmt(avg.fgm, 1)}/${fmt(avg.fga, 1)} por jogo`, accent: C.teal },
    { label: '3P%', value: `${fmt(avg.tpPct, 1)}%`, sub: `${fmt(avg.tpm, 1)} cestas por jogo`, accent: C.yellow },
    { label: 'Rebotes', value: fmt(avg.reb, 1), sub: `${fmt(avg.oreb, 1)} ofensivos`, accent: C.violet },
    { label: 'Assistências', value: fmt(avg.ast, 1), sub: `${fmt(avg.to, 1)} turnovers`, accent: C.orange },
    { label: 'Roubos + tocos', value: `${fmt(avg.stl, 1)}+${fmt(avg.blk, 1)}`, sub: `${fmt(avg.stl + avg.blk, 1)} por jogo`, accent: C.blue },
  ];

  $('#team-kpis').innerHTML = kpis.map((k) => `
    <div class="kpi" style="--accent:${k.accent}">
      <div class="kpi-label">${escapeHtml(k.label)}</div>
      <div class="kpi-value"><strong>${k.value}</strong></div>
      <div class="kpi-sub">${k.sub}</div>
    </div>`).join('');

  renderTeamPointsChart(recent);
  renderTeamScoringChart(recent);
  renderTeamStatToggles();
  renderTeamStatsChart(recent);
  renderTeamRadar(team, avg, compare);
  renderTeamTable(recent, team);
  renderTeamLeaders(leaders);

  const loading = ensureTeamAnalysis(data);
  renderTeamAnalysis(data);
  loading.then((changed) => {
    if (changed && state.teamData && String(state.teamData.team.id) === String(team.id)) {
      renderTeamAnalysis(state.teamData);
    }
  });
}

function renderTeamPointsChart(games) {
  const ordered = [...games].reverse();
  const labels = ordered.map((g) => shortDate(g.date));
  const margin = ordered.map((g) => g.scoreFor - g.scoreAgainst);

  makeChart('chart-team-points', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Pontos marcados',
          data: ordered.map((g) => g.scoreFor),
          backgroundColor: C.orangeFill,
          borderRadius: 5,
          maxBarThickness: 24,
        },
        {
          type: 'bar',
          label: 'Pontos sofridos',
          data: ordered.map((g) => g.scoreAgainst),
          backgroundColor: 'rgba(100, 116, 139, 0.5)',
          borderRadius: 5,
          maxBarThickness: 24,
        },
        {
          type: 'line',
          label: 'Margem',
          data: margin,
          borderColor: C.green,
          backgroundColor: C.green,
          borderWidth: 2,
          pointRadius: 2.5,
          pointHoverRadius: 5,
          tension: 0.35,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' } },
      scales: { x: xAxis(), y: yAxis() },
    },
  });
}

function renderTeamScoringChart(games) {
  const ordered = [...games].reverse();
  makeChart('chart-team-scoring', {
    type: 'bar',
    data: {
      labels: ordered.map((g) => shortDate(g.date)),
      datasets: [
        {
          label: 'Cestas de 2',
          data: ordered.map((g) => g.stats.tpm2 * 2),
          backgroundColor: C.orangeFill,
          borderRadius: 4,
          stack: 'pts',
          maxBarThickness: 26,
        },
        {
          label: 'Cestas de 3',
          data: ordered.map((g) => g.stats.tpm * 3),
          backgroundColor: C.tealFill,
          borderRadius: 4,
          stack: 'pts',
          maxBarThickness: 26,
        },
        {
          label: 'Lances livres',
          data: ordered.map((g) => g.stats.ftm),
          backgroundColor: C.blueFill,
          borderRadius: 4,
          stack: 'pts',
          maxBarThickness: 26,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' } },
      scales: { x: xAxis(), y: yAxis({ stacked: true }) },
    },
  });
}

function renderTeamStatToggles() {
  const container = $('#team-stat-toggles');
  container.innerHTML = Object.entries(TEAM_STAT_META).map(([key, meta]) => `
    <button type="button" class="chip ${state.teamStatKeys.includes(key) ? 'active' : ''}" data-stat="${key}">
      ${escapeHtml(meta.label)}
    </button>`).join('');
}

function renderTeamStatsChart(games) {
  const ordered = [...games].reverse();
  const keys = state.teamStatKeys.length ? state.teamStatKeys : ['reb'];
  makeChart('chart-team-stats', {
    type: 'line',
    data: {
      labels: ordered.map((g) => shortDate(g.date)),
      datasets: keys.map((key) => ({
        label: TEAM_STAT_META[key].label,
        data: ordered.map((g) => g.stats[key]),
        borderColor: TEAM_STAT_META[key].color,
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 5,
        tension: 0.35,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' } },
      scales: { x: xAxis(), y: yAxis() },
    },
  });
}

function renderTeamRadar(team, avg, compare) {
  const cats = [
    ['pts', 'Pontos'],
    ['reb', 'Rebotes'],
    ['ast', 'Assist.'],
    ['tpm', 'Cestas de 3'],
    ['stl', 'Roubos'],
    ['blk', 'Tocos'],
  ];
  const rawA = cats.map(([key]) => avg[key]);
  const rawB = compare ? cats.map(([key]) => compare.averages[key]) : null;
  const maxes = cats.map((_, i) => Math.max(rawA[i], rawB ? rawB[i] : 0, 1) * 1.12);

  const datasets = [{
    label: team.abbr,
    data: rawA.map((v, i) => Math.round((v / maxes[i]) * 1000) / 10),
    raw: rawA,
    borderColor: C.orange,
    backgroundColor: 'rgba(249, 115, 22, 0.16)',
    pointBackgroundColor: C.orange,
    borderWidth: 2,
    pointRadius: 2.5,
  }];

  if (compare) {
    datasets.push({
      label: compare.team.abbr,
      data: rawB.map((v, i) => Math.round((v / maxes[i]) * 1000) / 10),
      raw: rawB,
      borderColor: C.teal,
      backgroundColor: 'rgba(45, 212, 191, 0.12)',
      pointBackgroundColor: C.teal,
      borderWidth: 2,
      pointRadius: 2.5,
    });
  }

  $('#radar-hint').textContent = compare
    ? `${team.abbr} vs ${compare.team.abbr} · médias normalizadas`
    : 'Selecione um adversário para comparar';

  makeChart('chart-team-radar', {
    type: 'radar',
    data: { labels: cats.map(([, label]) => label), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${fmt(ctx.dataset.raw[ctx.dataIndex], 1)} (${ctx.raw})`,
          },
        },
      },
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: { display: false, stepSize: 25 },
          grid: { color: 'rgba(148, 163, 184, 0.12)' },
          angleLines: { color: 'rgba(148, 163, 184, 0.12)' },
          pointLabels: { color: '#cbd5e1', font: { size: 10, weight: '600' } },
        },
      },
    },
  });
}

function renderTeamTable(games, team) {
  if (!games.length) {
    $('#team-games-table').innerHTML = '<div class="empty">Nenhum jogo finalizado no período.</div>';
    return;
  }
  const rows = games.map((g) => `<tr>
    <td>${shortDate(g.date)}</td>
    <td class="opp">
      <img src="${escapeHtml(g.opp?.logo || '')}" alt="" onerror="this.style.opacity='.15'" />
      ${escapeHtml(g.opp?.abbr || '—')}<span class="ha">${g.home ? 'CASA' : 'FORA'}</span>
    </td>
    <td><span class="result ${g.win ? 'w' : 'l'}">${g.win ? 'V' : 'D'}</span></td>
    <td class="strong">${g.scoreFor}–${g.scoreAgainst}</td>
    <td class="strong">${g.stats.pts}</td>
    <td>${g.stats.reb}</td>
    <td>${g.stats.ast}</td>
    <td>${g.stats.tpm}/${g.stats.tpa}</td>
    <td>${g.stats.stl}</td>
    <td>${g.stats.blk}</td>
    <td>${g.stats.to}</td>
    <td>${fmt(g.stats.fgPct, 1)}%</td>
  </tr>`).join('');

  $('#team-games-table').innerHTML = `<table>
    <thead><tr>
      <th>Data</th><th>Adversário</th><th>Res</th><th>Placar</th>
      <th>PTS</th><th>REB</th><th>AST</th><th>3P</th><th>STL</th><th>BLK</th><th>TO</th><th>FG%</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderTeamLeaders(leaders) {
  const container = $('#team-leaders');
  if (!leaders.length) {
    container.innerHTML = '<div class="empty" style="grid-column:1/-1">Sem dados individuais no período.</div>';
    return;
  }
  container.innerHTML = leaders.map((p) => `
    <button type="button" class="leader" data-player-id="${p.id}" data-player-name="${escapeHtml(p.name)}">
      <img src="${escapeHtml(p.headshot)}" alt="" onerror="this.style.opacity='.15'" />
      <span class="l-main">
        <span class="l-name">${escapeHtml(p.name)}</span>
        <span class="l-sub">${escapeHtml(p.pos || 'NBA')} · ${p.gp} jogos · ${fmt(p.pts, 1)} PTS</span>
      </span>
      <span class="l-pra"><strong>${fmt(p.pra, 1)}</strong><span>PRA</span></span>
    </button>`).join('');
}

function bindTeamInteractions() {
  $('#team-select').addEventListener('change', (event) => {
    state.compareTeamId = null;
    loadTeam(event.target.value);
  });

  $('#team-compare-select').addEventListener('change', (event) => {
    loadCompareTeam(event.target.value);
  });

  $('#team-last').addEventListener('change', (event) => {
    state.teamLast = Number(event.target.value);
    loadTeam(state.teamId);
  });

  $('#team-stat-toggles').addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    const key = chip.dataset.stat;
    if (state.teamStatKeys.includes(key)) {
      if (state.teamStatKeys.length === 1) return;
      state.teamStatKeys = state.teamStatKeys.filter((k) => k !== key);
    } else {
      state.teamStatKeys = [...state.teamStatKeys, key];
    }
    renderTeamStatToggles();
    if (state.teamData) renderTeamStatsChart(state.teamData.games);
  });

  $('#team-leaders').addEventListener('click', (event) => {
    const card = event.target.closest('.leader');
    if (!card) return;
    goTo('players');
    const name = card.dataset.playerName || '';
    if (playerPicker) playerPicker.setName(name);
    loadPlayer(card.dataset.playerId);
  });
}

/* ================================================================ players */

let playerPicker = null;
let comboPicker = null;
const comparePickers = { a: null, b: null };

async function loadPlayer(id) {
  if (!id) return;
  state.playerId = String(id);
  const token = ++playerToken;
  $('#player-header').innerHTML = '<div class="loading"><span class="spinner"></span>Carregando jogador…</div>';

  try {
    const data = await api(`/api/player/${id}?last=82`);
    if (token !== playerToken) return;
    state.playerData = data;
    renderPlayer(data);
  } catch (err) {
    if (token !== playerToken) return;
    $('#player-header').innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

function playerHeader(player, seasonLabel, gp) {
  const team = player.team;
  return `<div class="entity-head">
    <img class="avatar" src="${escapeHtml(player.headshot)}" alt="" onerror="this.style.opacity='.15'" />
    <div>
      <div class="entity-name">${escapeHtml(player.name)}
        ${team ? `<span class="badge blue">${escapeHtml(team.abbr)}</span>` : ''}
      </div>
      <div class="entity-sub">
        <span>${escapeHtml(player.position || 'Jogador')}</span>
        ${player.jersey ? `<span>·</span><span>#${escapeHtml(player.jersey)}</span>` : ''}
        <span>·</span><span>${gp} jogos no período</span>
        <span>·</span><span>Temporada ${escapeHtml(seasonLabel)}</span>
      </div>
    </div>
    ${team ? `<img src="${escapeHtml(team.logo)}" alt="" style="width:34px;height:34px;margin-left:auto;object-fit:contain;opacity:.8" onerror="this.style.display='none'" />` : ''}
  </div>`;
}

function renderPlayer(data) {
  const { player, games, averages: avg, season } = data;
  const recent = games.slice(0, state.playerLast);

  $('#player-header').innerHTML = playerHeader(player, season, games.length);

  if (!games.length) {
    $('#player-kpis').innerHTML = '';
    $('#player-analysis').innerHTML = '';
    destroyCharts(['chart-player-scoring', 'chart-player-pra', 'chart-player-shots', 'chart-player-eff', 'chart-player-market']);
    $('#player-games-table').innerHTML = '<div class="empty">Nenhum jogo nesta temporada regular.</div>';
    return;
  }

  const kpis = [
    { label: 'Pontos', value: fmt(avg.pts, 1), sub: `em ${games.length} jogos`, accent: C.orange },
    { label: 'Rebotes', value: fmt(avg.reb, 1), sub: `em ${games.length} jogos`, accent: C.teal },
    { label: 'Assistências', value: fmt(avg.ast, 1), sub: `${fmt(avg.to, 1)} turnovers`, accent: C.blue },
    { label: 'PRA', value: fmt(avg.combos.pra, 1), sub: 'pts + reb + ast', accent: C.violet },
    { label: 'Cestas de 3', value: fmt(avg.tpm, 1), sub: `${fmt(avg.tpPct, 1)}% de acerto`, accent: C.yellow },
    { label: 'True Shooting', value: `${fmt(avg.ts, 1)}%`, sub: `eFG ${fmt(avg.efg, 1)}%`, accent: C.green },
  ];

  $('#player-kpis').innerHTML = kpis.map((k) => `
    <div class="kpi" style="--accent:${k.accent}">
      <div class="kpi-label">${escapeHtml(k.label)}</div>
      <div class="kpi-value"><strong>${k.value}</strong></div>
      <div class="kpi-sub">${k.sub}</div>
    </div>`).join('');

  renderPlayerScoringChart(recent);
  renderPlayerPraChart(recent, avg);
  renderPlayerShotsChart(recent);
  renderPlayerEfficiencyChart(recent);
  renderPlayerTable(recent, player);

  renderPlayerAnalysis(data);
  ensureAnalysisData(data).then((changed) => {
    if (changed && state.playerData && String(state.playerData.player.id) === String(player.id)) {
      renderPlayerAnalysis(state.playerData);
    }
  });
}

function renderPlayerScoringChart(games) {
  const ordered = [...games].reverse();
  makeChart('chart-player-scoring', {
    type: 'line',
    data: {
      labels: ordered.map((g) => shortDate(g.date)),
      datasets: [
        { label: 'Pontos', data: ordered.map((g) => g.stats.pts), borderColor: C.orange, backgroundColor: 'rgba(249,115,22,.12)', borderWidth: 2.2, pointRadius: 2.5, pointHoverRadius: 5, tension: 0.35, fill: true },
        { label: 'Rebotes', data: ordered.map((g) => g.stats.reb), borderColor: C.teal, backgroundColor: 'transparent', borderWidth: 2, pointRadius: 2.5, tension: 0.35 },
        { label: 'Assistências', data: ordered.map((g) => g.stats.ast), borderColor: C.blue, backgroundColor: 'transparent', borderWidth: 2, pointRadius: 2.5, tension: 0.35 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: { afterLabel: (ctx) => ordered[ctx.dataIndex]?.opp ? `vs ${ordered[ctx.dataIndex].opp.abbr}` : '' } },
      },
      scales: { x: xAxis(), y: yAxis() },
    },
  });
}

function renderPlayerPraChart(games, avg) {
  const ordered = [...games].reverse();
  const values = ordered.map((g) => g.stats.combos.pra);
  makeChart('chart-player-pra', {
    type: 'bar',
    data: {
      labels: ordered.map((g) => shortDate(g.date)),
      datasets: [
        {
          label: 'PRA',
          data: values,
          backgroundColor: values.map((v) => (v >= avg.combos.pra ? C.orangeFill : 'rgba(148,163,184,.32)')),
          borderRadius: 5,
          maxBarThickness: 30,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { afterLabel: (ctx) => ordered[ctx.dataIndex]?.opp ? `vs ${ordered[ctx.dataIndex].opp.abbr}` : '' } },
      },
      scales: { x: xAxis(), y: yAxis() },
    },
    plugins: [hLinePlugin(avg.combos.pra, `média ${fmt(avg.combos.pra, 1)}`, C.orange)],
  });
}

function renderPlayerShotsChart(games) {
  const twoPts = games.reduce((a, g) => a + g.stats.tpm2 * 2, 0);
  const threePts = games.reduce((a, g) => a + g.stats.tpm * 3, 0);
  const ftPts = games.reduce((a, g) => a + g.stats.ftm, 0);

  makeChart('chart-player-shots', {
    type: 'doughnut',
    data: {
      labels: ['Cestas de 2', 'Cestas de 3', 'Lances livres'],
      datasets: [{
        data: [twoPts, threePts, ftPts],
        backgroundColor: [C.orange, C.teal, C.blue],
        borderColor: '#0b1220',
        borderWidth: 3,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0) || 1;
              return ` ${ctx.label}: ${ctx.raw} pts (${fmt((ctx.raw / total) * 100, 0)}%)`;
            },
          },
        },
      },
    },
  });
}

function renderPlayerEfficiencyChart(games) {
  const ordered = [...games].reverse();
  makeChart('chart-player-eff', {
    type: 'line',
    data: {
      labels: ordered.map((g) => shortDate(g.date)),
      datasets: [
        { label: 'TS%', data: ordered.map((g) => g.stats.ts), borderColor: C.green, backgroundColor: 'transparent', borderWidth: 2.2, pointRadius: 2.5, tension: 0.35 },
        { label: 'eFG%', data: ordered.map((g) => g.stats.efg), borderColor: C.violet, backgroundColor: 'transparent', borderWidth: 2, pointRadius: 2.5, tension: 0.35, borderDash: [4, 3] },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: xAxis(),
        y: yAxis({ suggestedMax: 80, ticks: { callback: (v) => `${v}%`, padding: 6 } }),
      },
    },
  });
}

function renderPlayerTable(games, player) {
  const rows = games.map((g) => {
    const result = g.win === null ? '—' : g.win ? '<span class="result w">V</span>' : '<span class="result l">D</span>';
    return `<tr>
      <td>${shortDate(g.date)}</td>
      <td class="opp">
        ${g.opp ? `<img src="${escapeHtml(g.opp.logo)}" alt="" onerror="this.style.opacity='.15'" />${escapeHtml(g.opp.abbr)}` : '—'}
        <span class="ha">${g.home === true ? 'CASA' : g.home === false ? 'FORA' : ''}</span>
      </td>
      <td>${result}</td>
      <td>${g.stats.min}</td>
      <td class="strong">${g.stats.pts}</td>
      <td>${g.stats.reb}</td>
      <td>${g.stats.ast}</td>
      <td>${g.stats.tpm}/${g.stats.tpa}</td>
      <td>${g.stats.stl}</td>
      <td>${g.stats.blk}</td>
      <td>${g.stats.to}</td>
      <td>${fmt(g.stats.fgPct, 0)}%</td>
      <td class="strong">${g.stats.combos.pra}</td>
    </tr>`;
  }).join('');

  $('#player-games-table').innerHTML = `<table>
    <thead><tr>
      <th>Data</th><th>Adversário</th><th>Res</th><th>MIN</th><th>PTS</th><th>REB</th>
      <th>AST</th><th>3P</th><th>STL</th><th>BLK</th><th>TO</th><th>FG%</th><th>PRA</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/* ================================================================ combos */

function ensureCombo() {
  if (state.comboData) {
    renderCombo();
    return;
  }
  if (state.playerId) {
    if (playerPicker) playerPicker.setName(state.playerData?.player?.name || '');
    loadComboPlayer(state.playerId);
  }
}

async function loadComboPlayer(id) {
  if (!id) return;
  state.comboPlayerId = String(id);
  const token = ++comboToken;
  $('#combo-header').innerHTML = '<div class="loading"><span class="spinner"></span>Carregando jogador…</div>';

  try {
    const data = await api(`/api/player/${id}?last=10`);
    if (token !== comboToken) return;
    state.comboData = data;
    if (!state.comboLineTouched) {
      state.comboLine = defaultComboLine();
      $('#combo-line').value = state.comboLine;
    }
    renderCombo();
  } catch (err) {
    if (token !== comboToken) return;
    $('#combo-header').innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

function comboValues(data) {
  return data.games.map((g) => COMBO_DEFS[state.comboType].get(g.stats));
}

function defaultComboLine() {
  if (!state.comboData) return 20.5;
  const values = comboValues(state.comboData);
  if (!values.length) return 20.5;
  return Math.floor(median(values)) + 0.5;
}

function comboStats(values, line) {
  const over = values.filter((v) => v > line).length;
  const under = values.filter((v) => v < line).length;
  const push = values.filter((v) => v === line).length;
  const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  return {
    over,
    under,
    push,
    mean,
    median: median(values),
    std: stdDev(values),
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 0,
    last5: values.slice(0, 5),
  };
}

function renderCombo() {
  const data = state.comboData;
  if (!data) return;
  const def = COMBO_DEFS[state.comboType];
  const games = data.games;
  const values = comboValues(data);
  const line = state.comboLine;

  if (!games.length) {
    $('#combo-header').innerHTML = '<div class="empty">Sem jogos para esse jogador.</div>';
    $('#combo-kpis').innerHTML = '';
    destroyCharts(['chart-combo', 'chart-combo-dist']);
    $('#combo-table').innerHTML = '';
    $('#combo-insight').innerHTML = '';
    return;
  }

  const { player, season } = data;
  $('#combo-header').innerHTML = playerHeader(player, season, games.length);

  const s = comboStats(values, line);
  const last5 = comboStats(s.last5, line);
  const cv = s.mean ? s.std / s.mean : 0;
  const trend = slope([...values].reverse());

  const overPct = values.length ? Math.round((s.over / values.length) * 100) : 0;
  const overPct5 = s.last5.length ? Math.round((last5.over / s.last5.length) * 100) : 0;

  const kpis = [
    { label: 'Média', value: fmt(s.mean, 1), sub: `${def.label} por jogo`, accent: C.orange },
    { label: 'Mediana', value: fmt(s.median, 1), sub: 'valor central', accent: C.blue },
    { label: `Over ${fmt(line, 1)}`, value: `${s.over}/${values.length}`, sub: `${overPct}% dos jogos`, accent: s.over >= values.length / 2 ? C.green : C.red },
    { label: 'Over (últimos 5)', value: `${last5.over}/${s.last5.length}`, sub: `${overPct5}% da amostra`, accent: last5.over >= 3 ? C.green : C.orange },
    { label: 'Desvio padrão', value: fmt(s.std, 1), sub: cv < 0.15 ? 'alta consistência' : cv < 0.28 ? 'consistência média' : 'alta variação', accent: C.violet },
    { label: 'Amplitude', value: `${fmt(s.min, 0)}–${fmt(s.max, 0)}`, sub: 'mínimo e máximo', accent: C.teal },
  ];

  $('#combo-kpis').innerHTML = kpis.map((k) => `
    <div class="kpi" style="--accent:${k.accent}">
      <div class="kpi-label">${escapeHtml(k.label)}</div>
      <div class="kpi-value"><strong>${k.value}</strong></div>
      <div class="kpi-sub">${k.sub}</div>
    </div>`).join('');

  $('#combo-chart-title').textContent = `${def.long} por jogo`;
  $('#combo-chart-hint').textContent = `Linha ${fmt(line, 1)} · verde = over · vermelho = under`;
  $('#combo-legend').innerHTML = `
    <span><i style="background:${C.green}"></i>Over</span>
    <span><i style="background:${C.red}"></i>Under</span>
    <span><i style="background:${C.violet}"></i>Média móvel (5)</span>`;

  renderComboChart(games, values, line);
  renderComboDistribution(values, line);
  renderComboInsight(s, last5, line, overPct, trend, cv, def);
  renderComboTable(games, values, line, def);
}

function renderComboChart(games, values, line) {
  const orderedValues = [...values].reverse();
  const ordered = [...games].reverse();

  const movingAvg = orderedValues.map((_, i) => {
    const start = Math.max(0, i - 4);
    const slice = orderedValues.slice(start, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });

  makeChart('chart-combo', {
    type: 'bar',
    data: {
      labels: ordered.map((g) => shortDate(g.date)),
      datasets: [
        {
          label: COMBO_DEFS[state.comboType].label,
          data: orderedValues,
          backgroundColor: orderedValues.map((v) => (v > line ? C.green : v < line ? 'rgba(240,82,82,.72)' : 'rgba(148,163,184,.45)')),
          borderRadius: 5,
          maxBarThickness: 30,
          order: 2,
        },
        {
          type: 'line',
          label: 'Média móvel (5)',
          data: movingAvg.map((v) => Math.round(v * 10) / 10),
          borderColor: C.violet,
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            afterLabel: (ctx) => {
              const g = ordered[ctx.dataIndex];
              if (!g) return '';
              const detail = `PTS ${g.stats.pts} · REB ${g.stats.reb} · AST ${g.stats.ast}`;
              return `${detail}${g.opp ? `\nvs ${g.opp.abbr}` : ''}`;
            },
          },
        },
      },
      scales: { x: xAxis(), y: yAxis() },
    },
    plugins: [hLinePlugin(line, `linha ${fmt(line, 1)}`, '#e2e8f0')],
  });
}

function buildBins(values) {
  if (!values.length) return { labels: [], counts: [] };
  const min = Math.floor(Math.min(...values));
  const max = Math.ceil(Math.max(...values));
  const width = Math.max(1, Math.ceil((max - min + 1) / 8));
  const start = min;
  const labels = [];
  const counts = [];
  for (let edge = start; edge <= max; edge += width) {
    labels.push(`${edge}–${edge + width - 1}`);
    counts.push(0);
  }
  values.forEach((v) => {
    let idx = Math.floor((v - start) / width);
    if (idx < 0) idx = 0;
    if (idx >= counts.length) idx = counts.length - 1;
    counts[idx] += 1;
  });
  return { labels, counts };
}

function renderComboDistribution(values, line) {
  const bins = buildBins(values);
  makeChart('chart-combo-dist', {
    type: 'bar',
    data: {
      labels: bins.labels,
      datasets: [{
        data: bins.counts,
        backgroundColor: bins.labels.map((label) => {
          const [lo, hi] = label.split('–').map(Number);
          if (line >= lo && line <= hi) return C.orange;
          return line > hi ? 'rgba(240,82,82,.55)' : 'rgba(34,197,94,.55)';
        }),
        borderRadius: 4,
        maxBarThickness: 34,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: (items) => `${items[0].label} pts` } } },
      scales: {
        x: xAxis({ ticks: { maxRotation: 0, autoSkip: true, font: { size: 9 } } }),
        y: yAxis({ ticks: { precision: 0, stepSize: 1 } }),
      },
    },
  });
}

function renderComboInsight(s, last5, line, overPct, trend, cv, def) {
  const trendLabel = trend > 0.6 ? 'em alta' : trend < -0.6 ? 'em queda' : 'estável';
  const trendClass = trend > 0.6 ? 'good' : trend < -0.6 ? 'bad' : 'neutral';
  const consistency = cv < 0.15 ? 'alta' : cv < 0.28 ? 'média' : 'baixa';
  const consistencyClass = cv < 0.15 ? 'good' : cv < 0.28 ? 'neutral' : 'bad';

  const lineHits = s.over > s.under ? 'mais overs' : s.under > s.over ? 'mais unders' : 'equilíbrio';
  const best = Math.max(...[s.max]);
  const worst = s.min;

  $('#combo-insight').innerHTML = `
    <div style="margin-bottom:10px">
      <span class="tag ${trendClass}">Tendência ${trendLabel} (${fmtSigned(trend, 2)}/jogo)</span>
      <span class="tag ${consistencyClass}">Consistência ${consistency}</span>
      <span class="tag neutral">${lineHits}</span>
    </div>
    <p>A linha de <strong>${fmt(line, 1)}</strong> foi <strong>superada em ${s.over} de ${s.over + s.under + s.push}</strong> jogos (${overPct}%). Nos últimos 5, o atleta passou a linha em <strong>${last5.over}/5</strong>.</p>
    <div class="stat-line"><span>Média / mediana</span><b>${fmt(s.mean, 1)} / ${fmt(s.median, 1)}</b></div>
    <div class="stat-line"><span>Últimos 5 jogos</span><b>${fmt(last5.mean, 1)} de média</b></div>
    <div class="stat-line"><span>Melhor / pior jogo</span><b>${best} / ${worst}</b></div>
    <div class="stat-line"><span>Desvio padrão</span><b>${fmt(s.std, 2)}</b></div>
    <p style="margin-top:12px;font-size:11px;color:var(--muted-2)">Amostra de ${s.over + s.under + s.push} jogos. Considere adversário, ritmo, minutagem e lesões antes de qualquer decisão.</p>`;
}

function renderComboTable(games, values, line, def) {
  const over = values.filter((v) => v > line).length;
  const under = values.filter((v) => v < line).length;
  $('#combo-table-hint').textContent = `${def.long} · ${over} over(s) e ${under} under(s)`;

  const rows = games.map((g, i) => {
    const value = values[i];
    const badge = value > line
      ? '<span class="tag good">Over</span>'
      : value < line
        ? '<span class="tag bad">Under</span>'
        : '<span class="tag neutral">Push</span>';
    return `<tr>
      <td>${shortDate(g.date)}</td>
      <td class="opp">${g.opp ? `<img src="${escapeHtml(g.opp.logo)}" alt="" onerror="this.style.opacity='.15'" />${escapeHtml(g.opp.abbr)}` : '—'}</td>
      <td>${g.stats.pts}</td>
      <td>${g.stats.reb}</td>
      <td>${g.stats.ast}</td>
      <td>${g.stats.tpm}</td>
      <td class="strong">${value}</td>
      <td>${fmt(line, 1)}</td>
      <td>${badge}</td>
      <td>${fmtSigned(value - line, 1)}</td>
    </tr>`;
  }).join('');

  $('#combo-table').innerHTML = `<table>
    <thead><tr>
      <th>Data</th><th>Adversário</th><th>PTS</th><th>REB</th><th>AST</th><th>3PM</th>
      <th>${escapeHtml(def.label)}</th><th>Linha</th><th>Resultado</th><th>Margem</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function bindComboInteractions() {
  const typeSelect = $('#combo-type');
  typeSelect.innerHTML = Object.entries(COMBO_DEFS)
    .map(([key, def]) => `<option value="${key}">${escapeHtml(def.label)} — ${escapeHtml(def.long)}</option>`)
    .join('');

  typeSelect.addEventListener('change', (event) => {
    state.comboType = event.target.value;
    state.comboLineTouched = false;
    state.comboLine = defaultComboLine();
    $('#combo-line').value = state.comboLine;
    renderCombo();
  });

  $('#combo-line').addEventListener('input', (event) => {
    const value = Number(event.target.value);
    if (!Number.isFinite(value)) return;
    state.comboLine = value;
    state.comboLineTouched = true;
    renderCombo();
  });

  $$('.step').forEach((button) => {
    button.addEventListener('click', () => {
      const input = $('#combo-line');
      const next = Math.max(0, Number(input.value || 0) + Number(button.dataset.step));
      input.value = next;
      state.comboLine = next;
      state.comboLineTouched = true;
      renderCombo();
    });
  });
}

/* ================================================================ compare */

let compareTokens = { a: 0, b: 0 };

async function loadCompare(slot, id, name) {
  if (!id) return;
  state.compareIds[slot] = String(id);
  const token = ++compareTokens[slot];
  $('#cmp-head').innerHTML = '<div class="loading"><span class="spinner"></span>Carregando comparação…</div>';

  try {
    const data = await api(`/api/player/${id}?last=10`);
    if (token !== compareTokens[slot]) return;
    state.compareData[slot] = data;
    if (comparePickers[slot] && name) comparePickers[slot].setName(name);
    maybeRenderCompare();
  } catch (err) {
    if (token !== compareTokens[slot]) return;
    toast(err.message);
  }
}

function maybeRenderCompare() {
  const a = state.compareData.a;
  const b = state.compareData.b;
  const head = $('#cmp-head');

  if (!a || !b) return;

  head.innerHTML = `<div class="cmp-player">
      <img src="${escapeHtml(a.player.headshot)}" alt="" onerror="this.style.opacity='.15'" />
      <div>
        <div class="cp-name">${escapeHtml(a.player.name)}</div>
        <div class="cp-sub">${escapeHtml(a.player.team?.abbr || '—')} · ${fmt(a.averages.pts, 1)} PTS · ${fmt(a.averages.combos.pra, 1)} PRA</div>
      </div>
    </div>
    <div class="cmp-score">VS</div>
    <div class="cmp-player right">
      <img src="${escapeHtml(b.player.headshot)}" alt="" onerror="this.style.opacity='.15'" />
      <div>
        <div class="cp-name">${escapeHtml(b.player.name)}</div>
        <div class="cp-sub">${escapeHtml(b.player.team?.abbr || '—')} · ${fmt(b.averages.pts, 1)} PTS · ${fmt(b.averages.combos.pra, 1)} PRA</div>
      </div>
    </div>`;

  renderCompareRadar(a, b);
  renderComparePraChart(a, b);
  renderCompareTable(a, b);
}

function renderCompareRadar(a, b) {
  const cats = [
    ['pts', 'Pontos'],
    ['reb', 'Rebotes'],
    ['ast', 'Assist.'],
    ['tpm', 'Cestas de 3'],
    ['stl', 'Roubos'],
    ['blk', 'Tocos'],
  ];
  const rawA = cats.map(([key]) => a.averages[key]);
  const rawB = cats.map(([key]) => b.averages[key]);
  const maxes = cats.map((_, i) => Math.max(rawA[i], rawB[i], 1) * 1.12);

  makeChart('chart-cmp-radar', {
    type: 'radar',
    data: {
      labels: cats.map(([, label]) => label),
      datasets: [
        {
          label: a.player.name,
          data: rawA.map((v, i) => Math.round((v / maxes[i]) * 1000) / 10),
          raw: rawA,
          borderColor: C.orange,
          backgroundColor: 'rgba(249,115,22,.15)',
          pointBackgroundColor: C.orange,
          borderWidth: 2,
          pointRadius: 2.5,
        },
        {
          label: b.player.name,
          data: rawB.map((v, i) => Math.round((v / maxes[i]) * 1000) / 10),
          raw: rawB,
          borderColor: C.teal,
          backgroundColor: 'rgba(45,212,191,.12)',
          pointBackgroundColor: C.teal,
          borderWidth: 2,
          pointRadius: 2.5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${fmt(ctx.dataset.raw[ctx.dataIndex], 1)} (${ctx.raw})`,
          },
        },
      },
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: { display: false, stepSize: 25 },
          grid: { color: 'rgba(148,163,184,.12)' },
          angleLines: { color: 'rgba(148,163,184,.12)' },
          pointLabels: { color: '#cbd5e1', font: { size: 10, weight: '600' } },
        },
      },
    },
  });
}

function renderComparePraChart(a, b) {
  const orderedA = [...a.games].reverse();
  const orderedB = [...b.games].reverse();
  const maxLen = Math.max(orderedA.length, orderedB.length);
  const labels = Array.from({ length: maxLen }, (_, i) => `J${i + 1}`);

  makeChart('chart-cmp-pra', {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: `${a.player.name} (${fmt(a.averages.combos.pra, 1)})`,
          data: labels.map((_, i) => orderedA[i] ? orderedA[i].stats.combos.pra : null),
          borderColor: C.orange,
          backgroundColor: 'rgba(249,115,22,.1)',
          borderWidth: 2.2,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.35,
          spanGaps: true,
        },
        {
          label: `${b.player.name} (${fmt(b.averages.combos.pra, 1)})`,
          data: labels.map((_, i) => orderedB[i] ? orderedB[i].stats.combos.pra : null),
          borderColor: C.teal,
          backgroundColor: 'transparent',
          borderWidth: 2.2,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.35,
          spanGaps: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            afterLabel: (ctx) => {
              const list = ctx.datasetIndex === 0 ? orderedA : orderedB;
              const game = list[ctx.dataIndex];
              return game && game.opp ? `vs ${game.opp.abbr}${game.home ? ' (casa)' : ' (fora)'}` : '';
            },
          },
        },
      },
      scales: { x: xAxis(), y: yAxis() },
    },
  });
}

function renderCompareTable(a, b) {
  const rows = [
    ['Pontos', 'pts', 1, true],
    ['Rebotes', 'reb', 1, true],
    ['Assistências', 'ast', 1, true],
    ['Cestas de 3', 'tpm', 1, true],
    ['Roubos', 'stl', 1, true],
    ['Tocos', 'blk', 1, true],
    ['Turnovers', 'to', 1, false],
    ['Minutos', 'min', 1, true],
    ['TS%', 'ts', 1, true],
    ['eFG%', 'efg', 1, true],
  ];

  const body = rows.map(([label, key, digits, higherBetter]) => {
    const va = a.averages[key] ?? 0;
    const vb = b.averages[key] ?? 0;
    const aBetter = higherBetter ? va > vb : va < vb;
    const bBetter = higherBetter ? vb > va : vb < va;
    return `<tr>
      <td>${label}</td>
      <td class="${aBetter ? 'strong better' : ''}">${fmt(va, digits)}</td>
      <td class="${bBetter ? 'strong better' : ''}">${fmt(vb, digits)}</td>
      <td>${fmtSigned(va - vb, digits)}</td>
    </tr>`;
  }).join('');

  const praA = a.averages.combos.pra;
  const praB = b.averages.combos.pra;
  const extra = `<tr>
      <td><b>PRA</b></td>
      <td class="${praA > praB ? 'strong better' : ''}">${fmt(praA, 1)}</td>
      <td class="${praB > praA ? 'strong better' : ''}">${fmt(praB, 1)}</td>
      <td>${fmtSigned(praA - praB, 1)}</td>
    </tr>`;

  $('#cmp-table').innerHTML = `<table>
    <thead><tr><th>Métrica</th><th>${escapeHtml(a.player.name)}</th><th>${escapeHtml(b.player.name)}</th><th>Diferença</th></tr></thead>
    <tbody>${body}${extra}</tbody>
  </table>`;
}

function bindCompareInteractions() {
  comparePickers.a = setupPicker($('#cmp-a-picker'), (p) => loadCompare('a', p.id, p.name));
  comparePickers.b = setupPicker($('#cmp-b-picker'), (p) => loadCompare('b', p.id, p.name));
}

/* ================================================================ defaults */

async function loadDefaults() {
  const defaultTeam = state.teamMap.has('13') ? '13' : state.teams[0]?.id;
  state.teamId = defaultTeam;
  $('#team-select').value = defaultTeam;

  const jobs = [loadSlate(), loadTeam(defaultTeam)];

  jobs.push((async () => {
    const p = (await findPlayer('luka doncic')) || (await findPlayer(''));
    if (!p) return;
    playerPicker?.setName(p.name);
    await loadPlayer(p.id);
    if (!state.comboPlayerId) {
      if (comboPicker) comboPicker.setName(p.name);
      await loadComboPlayer(p.id);
    }
    if (!state.compareIds.a) await loadCompare('a', p.id, p.name);
  })());

  jobs.push((async () => {
    const p = await findPlayer('shai gilgeous-alexander');
    if (!p) return;
    await loadCompare('b', p.id, p.name);
  })());

  await Promise.allSettled(jobs);
}

/* ================================================================ boot */

async function init() {
  bindNavigation();
  todayLabel();
  bindTeamInteractions();
  bindComboInteractions();
  bindOverviewInteractions();
  startSlateAutoRefresh();

  playerPicker = setupPicker($('#player-picker'), (p) => loadPlayer(p.id));
  comboPicker = setupPicker($('#combo-picker'), (p) => loadComboPlayer(p.id));
  bindCompareInteractions();

  window.imageFallback = imageFallback;

  ensureLeagueLeaders().then(() => {
    if (state.slateGames.length) renderOverviewStars();
  });

  $('#player-last').addEventListener('change', (event) => {
    state.playerLast = Number(event.target.value);
    loadPlayer(state.playerId);
  });

  try {
    const data = await api('/api/teams');
    state.season = data.season;
    state.teams = data.teams;
    state.teamMap = new Map(data.teams.map((t) => [t.id, t]));
    $('#season-label').textContent = data.season;
    todayLabel();
    fillTeamSelects();
    await loadDefaults();
    $('#status-dot').classList.remove('off');

    const hash = window.location.hash.replace('#', '');
    if (hash && PAGE_META[hash]) goTo(hash);
  } catch (err) {
    $('#status-dot').classList.add('off');
    $('#slate-grid').innerHTML = `<div class="empty" style="grid-column:1/-1">${escapeHtml(err.message)}. Verifique se o servidor está rodando.</div>`;
    toast('Não foi possível conectar à API. Reinicie o servidor.');
  }
}

/* ============================================= ANÁLISE DE MERCADOS (props) */

const MARKET_LIST = [
  { key: 'pts', label: 'Pontos' },
  { key: 'reb', label: 'Rebotes' },
  { key: 'ast', label: 'Assistências' },
  { key: 'q1pts', label: 'Pontos 1ºQ', quarter: true },
  { key: 'q1reb', label: 'Rebotes 1ºQ', quarter: true, unavailable: true },
  { key: 'pra', label: 'PRA' },
  { key: 'pr', label: 'PTS + REB' },
  { key: 'pa', label: 'PTS + AST' },
  { key: 'ra', label: 'REB + AST' },
  { key: 'tpm', label: 'Cestas de 3' },
  { key: 'tpa', label: 'Tentativas de 3' },
  { key: 'tpm2', label: 'Cestas de 2' },
  { key: 'tpa2', label: 'Tentativas de 2' },
  { key: 'dd', label: 'Duplo-duplo', binary: true, integers: true },
  { key: 'td', label: 'Triplo-duplo', binary: true, integers: true },
  { key: 'stl', label: 'Roubos' },
  { key: 'blk', label: 'Tocos' },
  { key: 'stocks', label: 'Roubos + Tocos' },
  { key: 'to', label: 'Turnovers' },
  { key: 'pf', label: 'Faltas' },
];

const analysisState = {
  market: 'pts',
  line: null,
  lines: new Map(),
  book: null,
  quarters: null,
};

function looseKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

// Ignora sufixos (Jr., II, III…) para casar nomes da ESPN com os da casa.
function nameKey(value) {
  return looseKey(value).replace(/(jr|sr|ii|iii|iv|v)$/,'');
}

const TEAM_ALIAS = { GS: 'GSW', GSW: 'GSW', NO: 'NOP', NOP: 'NOP', NY: 'NYK', NYK: 'NYK', SA: 'SAS', SAS: 'SAS', WSH: 'WAS', WAS: 'WAS', UTAH: 'UTA', UTA: 'UTA', PHO: 'PHX', PHX: 'PHX', BRK: 'BKN', BKN: 'BKN', CHA: 'CHA', CHO: 'CHA' };

function teamAlias(abbr) {
  const key = String(abbr || '').toUpperCase();
  return TEAM_ALIAS[key] || key;
}

async function ensureBookSlate() {
  if (state.bookEvents) return state.bookEvents;
  if (!state.bookSlatePromise) {
    state.bookSlatePromise = api('/api/book/slate')
      .then((res) => {
        state.bookEvents = (res.events || []).filter((e) => !e.champId || e.champId === 2980);
        return state.bookEvents;
      })
      .catch(() => {
        state.bookEvents = [];
        return [];
      });
  }
  return state.bookSlatePromise;
}

function findBookEvent(team) {
  if (!team || !state.bookEvents?.length) return null;
  const abbr = teamAlias(team.abbr);
  const name = looseKey(team.name);
  return state.bookEvents.find((event) => event.teams.some((t) => {
    if (teamAlias(t.abbr) === abbr) return true;
    return name && looseKey(t.name) === name;
  })) || null;
}

async function loadBookPropsFor(player) {
  await ensureBookSlate();
  const event = findBookEvent(player.team);
  if (!event) return { event: null, props: null };
  try {
    const details = await api(`/api/book/event/${event.id}`);
    const target = nameKey(player.name);
    const entry = Object.entries(details.props || {}).find(([key]) => nameKey(key) === target);
    return {
      event: { ...event, startDate: details.startDate || event.startDate },
      props: entry ? entry[1] : null,
      betUrl: `https://99play.io/sports#/sport/67`,
    };
  } catch {
    return { event, props: null };
  }
}

async function ensureAnalysisData(data) {
  const player = data.player;
  const market = MARKET_LIST.find((m) => m.key === analysisState.market) || MARKET_LIST[0];
  const playerKey = String(player.id);
  const tasks = [];

  if (!analysisState.book || analysisState.book.playerId !== playerKey) {
    tasks.push(
      loadBookPropsFor(player).then((res) => {
        analysisState.book = { playerId: playerKey, ...res };
      }).catch(() => {
        analysisState.book = { playerId: playerKey, event: null, props: null };
      })
    );
  }

  if (market.quarter && (!analysisState.quarters || analysisState.quarters.playerId !== playerKey)) {
    tasks.push(
      api(`/api/player-quarters/${player.id}?last=25`).then((res) => {
        analysisState.quarters = { playerId: playerKey, games: res.games || {} };
      }).catch(() => {
        analysisState.quarters = { playerId: playerKey, games: {} };
      })
    );
  }

  if (!tasks.length) return false;
  await Promise.all(tasks);
  return true;
}

function marketValue(key, game) {
  const s = game.stats || {};
  const combos = s.combos || {};
  switch (key) {
    case 'pts': return s.pts;
    case 'reb': return s.reb;
    case 'ast': return s.ast;
    case 'stl': return s.stl;
    case 'blk': return s.blk;
    case 'to': return s.to;
    case 'pf': return s.pf;
    case 'tpm': return s.tpm;
    case 'tpa': return s.tpa;
    case 'tpm2': return s.tpm2;
    case 'tpa2': return s.tpa2;
    case 'pra': return combos.pra;
    case 'pr': return combos.pr;
    case 'pa': return combos.pa;
    case 'ra': return combos.ra;
    case 'stocks': return combos.stocks;
    case 'dd': return combos.dd;
    case 'td': return combos.td;
    default: return null;
  }
}

function quarterValue(key, eventId) {
  const entry = analysisState.quarters?.games?.[String(eventId)];
  if (!entry) return null;
  if (key === 'q1pts') return entry.q1pts;
  if (key === 'q1ast') return entry.q1ast;
  if (key === 'q1reb') return null;
  return null;
}

function marketSeries(market, games) {
  const out = [];
  for (const game of games) {
    let value = null;
    if (market.quarter) value = quarterValue(market.key, game.eventId);
    else value = marketValue(market.key, game);
    if (Number.isFinite(value)) out.push({ date: game.date, opp: game.opp, value, eventId: game.eventId });
  }
  return out;
}

function defaultLine(values, market) {
  if (market.binary) return 0.5;
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return 0.5;
  const avg = clean.reduce((a, b) => a + b, 0) / clean.length;
  return Math.floor(avg) + 0.5;
}

function windowHits(values, line, size) {
  const slice = size ? values.slice(-size) : values;
  if (!slice.length) return null;
  const hits = slice.filter((v) => v > line).length;
  return { hits, total: slice.length, pct: (hits / slice.length) * 100 };
}

function hitTile(label, stats, accent) {
  if (!stats) return `<div class="hit-tile empty"><span>${label}</span><strong>—</strong><small>sem dados</small></div>`;
  const tone = stats.pct >= 65 ? 'good' : stats.pct < 40 ? 'bad' : 'mid';
  return `<div class="hit-tile ${tone}" style="--accent:${accent}">
    <span>${label}</span>
    <strong>${Math.round(stats.pct)}%</strong>
    <small>${stats.hits}/${stats.total}</small>
  </div>`;
}

function gameTimeLabel(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function renderPlayerAnalysis(data) {
  const host = $('#player-analysis');
  if (!host) return;
  const { player, games } = data;
  const market = MARKET_LIST.find((m) => m.key === analysisState.market) || MARKET_LIST[0];
  const ordered = [...games].reverse();
  const book = analysisState.book?.playerId === String(player.id) ? analysisState.book : null;
  const bookMarket = book?.props?.[market.key] || null;

  const perPlayer = analysisState.lines;
  const lineKey = `${player.id}:${market.key}`;
  const series = marketSeries(market, ordered);
  const values = series.map((s) => s.value);
  const stored = perPlayer.get(lineKey);
  const line = stored != null ? stored : (bookMarket?.line ?? defaultLine(values, market));

  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const l5 = windowHits(values, line, 5);
  const l10 = windowHits(values, line, 10);
  const l20 = windowHits(values, line, 20);
  const season = windowHits(values, line, 0);

  const bookLine = bookMarket?.line ?? null;
  const overOdd = bookMarket?.over ?? null;
  const underOdd = bookMarket?.under ?? null;
  const oddLine = bookLine != null && Math.abs(bookLine - line) < 0.001;

  const matchup = book?.event
    ? `${book.event.teams.map((t) => t.abbr).join(' x ')} · ${gameTimeLabel(book.event.startDate)}`
    : '';

  const tabs = MARKET_LIST.map((m) => `
    <button type="button" class="market-tab ${m.key === market.key ? 'active' : ''}" data-market="${m.key}">${m.label}</button>
  `).join('');

  const unavailable = market.unavailable || (!values.length && !market.quarter);
  const quarterPending = market.quarter && !analysisState.quarters;
  const step = market.binary ? 1 : 0.5;

  host.innerHTML = `
    <div class="card market-card">
      <div class="market-head">
        <div>
          <span class="eyebrow">Análise de mercado</span>
          <h3>${escapeHtml(market.label)} <span class="market-player">· ${escapeHtml(player.name)}</span></h3>
          <span class="hint">${matchup ? escapeHtml(matchup) : 'Selecione o jogador do jogo do dia para ver a odd da 99play'}</span>
        </div>
        ${oddLine && overOdd ? `
        <a href="${book?.betUrl || 'https://99play.io/sports#/sport/67'}" target="_blank" rel="noopener" class="odd-box-link odd-box on">
          <span>Odd 99play</span>
          <strong>${fmt(overOdd, 2)}</strong>
          <small>${underOdd ? `menos ${fmt(underOdd, 2)}` : 'linha da casa'}</small>
        </a>` : `
        <div class="odd-box off">
          <span>Odd 99play</span>
          <strong>—</strong>
          <small>linha manual</small>
        </div>`}
      </div>

      <div class="market-tabs">${tabs}</div>

      <div class="line-row">
        <span class="line-label">Linha</span>
        <div class="stepper">
          <button type="button" class="step" data-line-step="-${step}" data-current="${line}">−</button>
          <strong>${fmt(line, 1)}</strong>
          <button type="button" class="step" data-line-step="${step}" data-current="${line}">+</button>
        </div>
        ${bookLine != null ? `<button type="button" class="line-reset" data-line-reset>linha da casa ${fmt(bookLine, 1)}</button>` : ''}
        <span class="line-avg">média ${avg != null ? fmt(avg, 1) : '—'}</span>
      </div>

      ${unavailable ? `
        <div class="market-empty">
          <strong>Mercado sem dados automáticos.</strong>
          <span>${market.key === 'q1reb'
            ? 'A ESPN não disponibiliza rebotes por quarto. Use a linha e o histórico completo como referência.'
            : 'Nenhum jogo com esse dado na temporada atual.'}</span>
        </div>` : quarterPending ? `
        <div class="market-empty"><span class="spinner"></span><span>Carregando dados do 1º quarto…</span></div>` : `
        <div class="hit-grid">
          ${hitTile('L5', l5)}
          ${hitTile('L10', l10)}
          ${hitTile('L20', l20)}
          ${hitTile('Temporada', season)}
        </div>
        <div class="chart-box market-chart"><canvas id="chart-player-market"></canvas></div>
        <div class="market-legend">
          <span><i class="dot-green"></i>acima de ${fmt(line, 1)}</span>
          <span><i class="dot-red"></i>abaixo de ${fmt(line, 1)}</span>
          <span>${series.length} jogos · ${values.filter((v) => v > line).length} acima da linha</span>
        </div>
      `}
      <div class="market-foot">
        <a class="book-link" href="https://99play.io/sports#/sport/67" target="_blank" rel="noopener">Conferir odds na 99play ↗</a>
        <span class="hint">Análise gratuita · sem assinatura</span>
      </div>
    </div>`;

  if (!unavailable && !quarterPending) {
    drawMarketChart(market, series, line);
  } else {
    destroyCharts(['chart-player-market']);
  }
}

function drawMarketChart(market, series, line) {
  const shown = series.slice(-20);
  const values = shown.map((s) => s.value);
  const colors = values.map((v) => (v > line ? 'rgba(34,197,94,.85)' : 'rgba(239,68,68,.82)'));
  const label = market.binary ? `${fmt(line, 1)} (sim/não)` : `linha ${fmt(line, 1)}`;

  makeChart('chart-player-market', {
    type: 'bar',
    data: {
      labels: shown.map((s) => shortDate(s.date)),
      datasets: [{
        label: market.label,
        data: values,
        backgroundColor: colors,
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 4,
        maxBarThickness: 34,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterLabel: (ctx) => {
              const item = shown[ctx.dataIndex];
              return item?.opp?.abbr ? `vs ${item.opp.abbr}` : '';
            },
          },
        },
      },
      scales: {
        x: xAxis(),
        y: yAxis({ beginAtZero: true, ticks: { color: '#8b8b96', precision: market.integers ? 0 : 1 } }),
      },
    },
    plugins: [hLinePlugin(line, label, '#f8fafc')],
  });
}

let analysisBound = false;
function bindAnalysis() {
  if (analysisBound) return;
  analysisBound = true;
  document.addEventListener('click', (event) => {
    const tab = event.target.closest('#player-analysis [data-market]');
    if (tab) {
      analysisState.market = tab.dataset.market;
      if (!state.playerData) return;
      renderPlayerAnalysis(state.playerData);
      ensureAnalysisData(state.playerData).then((changed) => {
        if (changed && state.playerData) renderPlayerAnalysis(state.playerData);
      });
      return;
    }

    const stepBtn = event.target.closest('#player-analysis [data-line-step]');
    if (stepBtn && state.playerData) {
      const market = MARKET_LIST.find((m) => m.key === analysisState.market) || MARKET_LIST[0];
      const key = `${state.playerData.player.id}:${market.key}`;
      const current = Number(analysisState.lines.get(key) ?? stepBtn.dataset.current ?? 0);
      const next = Math.max(0, Math.round((current + Number(stepBtn.dataset.lineStep)) * 10) / 10);
      analysisState.lines.set(key, next);
      renderPlayerAnalysis(state.playerData);
      return;
    }

    if (event.target.closest('#player-analysis [data-line-reset]') && state.playerData) {
      const market = MARKET_LIST.find((m) => m.key === analysisState.market) || MARKET_LIST[0];
      analysisState.lines.delete(`${state.playerData.player.id}:${market.key}`);
      renderPlayerAnalysis(state.playerData);
    }
  });
}

/* ============================================= ANÁLISE DE TIMES (totais) */

const TEAM_MARKET_LIST = [
  { key: 'pts', label: 'Pontos' },
  { key: 'reb', label: 'Rebotes' },
  { key: 'ast', label: 'Assistências' },
  { key: 'tpm', label: 'Cestas de 3' },
  { key: 'stl', label: 'Roubos' },
  { key: 'blk', label: 'Tocos' },
];

const teamAnalysisState = {
  market: 'pts',
  lines: new Map(),
  books: {},   // { '99play': {teamId,event,props}, 'br365': {...} }
  log: null,
};

function overProbability(values, line) {
  if (!values?.length) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.max(stdDev(values), 0.55);
  const hits = values.filter((v) => v > line).length;
  const empirical = hits / values.length;
  const model = 1 - normalCdf((line - mean) / sd);
  const last5 = values.slice(0, 5);
  const recent = last5.length ? last5.filter((v) => v > line).length / last5.length : empirical;
  const p = 0.55 * empirical + 0.30 * model + 0.15 * recent;
  return Math.min(0.95, Math.max(0.25, p));
}

// Melhor entrada considerando TODAS as casas: entre as linhas ofertadas,
// a de maior probabilidade mantendo uma odd jogável (nem 1.01, nem 3.00).
function bestTeamEntry(bookMarket, values) {
  if (!bookMarket?.lines?.length || !values?.length) return null;
  let best = null;
  for (const row of bookMarket.lines) {
    if (row.over == null || row.over < 1.3 || row.over > 2.2) continue;
    const p = overProbability(values, row.line);
    if (p == null) continue;
    if (!best || p > best.p + 1e-9 || (Math.abs(p - best.p) < 1e-9 && row.over > best.over)) {
      best = { ...row, p };
    }
  }
  return best;
}

function teamMarketValue(key, stats) {
  const s = stats || {};
  if (key === 'stocks') return (Number(s.stl) || 0) + (Number(s.blk) || 0);
  return Number.isFinite(Number(s[key])) ? Number(s[key]) : null;
}

// Busca a melhor odd entre todas as casas para um determinado mercado/time.
function bestTeamEntryAcrossBooks(books, teamId, teamAbbr, marketKey, values) {
  if (!books || !values?.length) return null;
  let best = null;
  let bestBook = null;
  for (const [bookLabel, book] of Object.entries(books)) {
    if (!book || book.teamId !== String(teamId)) continue;
    const props = book.props?.[teamAbbr];
    const bm = props?.[marketKey];
    const entry = bestTeamEntry(bm, values);
    if (!entry) continue;
    if (!best || entry.p > best.p + 1e-9 || (Math.abs(entry.p - best.p) < 1e-9 && entry.over > best.over)) {
      best = entry;
      bestBook = bookLabel;
    }
  }
  if (!best) return null;
  return { ...best, book: bestBook };
}

async function loadTeamBook(team) {
  await ensureBookSlate();
  const event = findBookEvent({ abbr: team.abbr, name: team.fullName || team.name });
  if (!event) return { event: null, props: null };
  const results = { '99play': null, 'br365': null };

  // 99play (Altenar)
  try {
    const details = await api(`/api/book/event/${event.id}`);
    results['99play'] = {
      event: { ...event, startDate: details.startDate || event.startDate },
      props: details.teamProps?.[team.abbr] || null,
      betUrl: `https://99play.io/sports#/sport/67`,
    };
  } catch { /* 99play falhou */ }

  // br365 (comparação)
  try {
    const details = await api(`/api/book-br365/event/${event.id}`);
    results['br365'] = {
      event: { ...event, startDate: details.startDate || event.startDate },
      props: details.teamProps?.[team.abbr] || null,
      betUrl: `https://www.br365.io/sports#/basketball`,
    };
  } catch { /* br365 indisponível (API protegida) */ }

  return results;
}

const teamAnalysisLoads = new Map();

async function ensureTeamAnalysis(data) {
  const team = data.team;
  if (!team) return false;
  const key = String(team.id);
  const books = teamAnalysisState.books;
  if (books[key] && books[key].teamId === key && teamAnalysisState.log?.teamId === key) return false;

  if (!teamAnalysisLoads.has(key)) {
    const promise = Promise.all([
      loadTeamBook(team).catch(() => ({ '99play': null, 'br365': null })),
      api(`/api/team-log/${key}?last=82`).catch(() => ({ games: [] })),
    ])
      .then(([booksResult, log]) => {
        books[key] = { teamId: key, ...booksResult };
        teamAnalysisState.log = { teamId: key, games: log.games || [] };
      })
      .finally(() => teamAnalysisLoads.delete(key));
    teamAnalysisLoads.set(key, promise);
  }

  await teamAnalysisLoads.get(key);
  return true;
}

function renderTeamAnalysis(data) {
  const host = $('#team-analysis');
  if (!host || !data?.team) return;
  const { team, games } = data;
  const market = TEAM_MARKET_LIST.find((m) => m.key === teamAnalysisState.market) || TEAM_MARKET_LIST[0];
  const log = teamAnalysisState.log?.teamId === String(team.id) ? teamAnalysisState.log.games : null;
  const ordered = [...(log?.length ? log : games)].reverse();
  const series = ordered
    .map((game) => ({ date: game.date, opp: game.opp, value: teamMarketValue(market.key, game.stats) }))
    .filter((row) => Number.isFinite(row.value));
  const values = series.map((row) => row.value);
  const newestFirst = [...values].reverse();

  const books = teamAnalysisState.books[String(team.id)] || {};
  const pending = teamAnalysisLoads.has(String(team.id));

  // Coleta o mercado de cada casa para exibir comparação de odds
  const bookMarkets = {};
  let mainBook = null;
  for (const [label, book] of Object.entries(books)) {
    if (!book) continue;
    if (!mainBook) mainBook = book;
    const bm = book.props?.[team.abbr]?.[market.key] || null;
    bookMarkets[label] = bm;
  }
  const bookMarket = bookMarkets['99play'] || null;
  const br365Market = bookMarkets['br365'] || null;

  // Melhor entrada considerando todas as casas
  const best = bestTeamEntryAcrossBooks(books, String(team.id), team.abbr, market.key, newestFirst);

  const lineKey = `${team.id}:${market.key}`;
  const stored = teamAnalysisState.lines.get(lineKey);
  const line = stored != null
    ? stored
    : (best?.line ?? bookMarket?.line ?? br365Market?.line ?? defaultLine(values, market));

  // Odd da linha selecionada em cada casa
  const oddByBook = {};
  for (const [label, bm] of Object.entries(bookMarkets)) {
    if (!bm) continue;
    const rowAtLine = bm.lines?.find((row) => Math.abs(row.line - line) < 0.001);
    oddByBook[label] = rowAtLine?.over ?? (Math.abs(bm.line - line) < 0.001 ? bm.over : null);
  }
  const overOdd = oddByBook['99play'] ?? null;
  const underOdd = bookMarket && Math.abs(bookMarket.line - line) < 0.001 ? bookMarket.under : null;

  // Qual casa tem a melhor odd para esta linha
  let bestOddBook = null;
  let bestOddVal = -1;
  for (const [label, odd] of Object.entries(oddByBook)) {
    if (odd && odd > bestOddVal) { bestOddVal = odd; bestOddBook = label; }
  }

  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const l5 = windowHits(values, line, 5);
  const l10 = windowHits(values, line, 10);
  const l20 = windowHits(values, line, 20);
  const season = windowHits(values, line, 0);

  const mainEvent = mainBook?.event;
  const matchup = mainEvent
    ? `${mainEvent.teams.map((t) => t.abbr).join(' x ')} · ${gameTimeLabel(mainEvent.startDate)}`
    : '';

  const tabs = TEAM_MARKET_LIST.map((m) => `
    <button type="button" class="market-tab ${m.key === market.key ? 'active' : ''}" data-team-market="${m.key}">${m.label}</button>
  `).join('');

  const unavailable = !values.length;
  const step = 0.5;

  // Badge de qual casa tem a melhor odd
  const bestOddBadge = bestOddBook
    ? `<span class="badge ${bestOddBook === '99play' ? 'orange' : 'blue'}">melhor odd ${bestOddBook === '99play' ? '99play' : 'br365'}</span>`
    : '';

  host.innerHTML = `
    <div class="card market-card">
      <div class="market-head">
        <div>
          <span class="eyebrow">Análise de mercados do time</span>
          <h3>${escapeHtml(market.label)} <span class="market-player">· ${escapeHtml(team.fullName || team.name)}</span></h3>
          <span class="hint">${matchup ? escapeHtml(matchup) : pending ? 'Buscando odds e histórico da temporada…' : 'Jogo de hoje ainda não está nas casas — linha manual disponível'}</span>
          ${bestOddBadge}
        </div>
        ${overOdd ? `
        <a href="${books['99play']?.betUrl || 'https://99play.io/sports#/sport/67'}" target="_blank" rel="noopener" class="odd-box-link odd-box ${overOdd ? 'on' : 'off'}">
          <span>Odd 99play</span>
          <strong>${fmt(overOdd, 2)}</strong>
          <small>${overOdd && underOdd ? `menos ${fmt(underOdd, 2)}` : 'linha da casa'}</small>
        </a>` : `
        <div class="odd-box off">
          <span>Odd 99play</span>
          <strong>${pending ? '…' : '—'}</strong>
          <small>${pending ? 'carregando' : 'linha manual'}</small>
        </div>`}
        ${br365Market && oddByBook.br365 ? `
        <a href="${books['br365']?.betUrl || 'https://www.br365.io/sports#/basketball'}" target="_blank" rel="noopener" class="odd-box-link odd-box on">
          <span>Odd br365</span>
          <strong>${fmt(oddByBook.br365, 2)}</strong>
          <small>${bestOddBook === 'br365' ? 'melhor odd' : 'linha da casa'}</small>
        </a>` : br365Market ? `
        <div class="odd-box off">
          <span>Odd br365</span>
          <strong>—</strong>
          <small>sem odd para esta linha</small>
        </div>` : ''}
      </div>

      <div class="market-tabs">${tabs}</div>

      <div class="line-row">
        <span class="line-label">Linha</span>
        <div class="stepper">
          <button type="button" class="step" data-team-line-step="-${step}" data-current="${line}">−</button>
          <strong>${fmt(line, 1)}</strong>
          <button type="button" class="step" data-team-line-step="${step}" data-current="${line}">+</button>
        </div>
        ${best && Math.abs(best.line - line) > 0.001 ? `<button type="button" class="line-reset" data-team-line-best>melhor entrada ${fmt(best.line, 1)} · ${fmt(best.over, 2)} (${best.book})</button>` : ''}
        ${bookMarket && Math.abs(bookMarket.line - line) > 0.001 ? `<button type="button" class="line-reset" data-team-line-reset>linha 99play ${fmt(bookMarket.line, 1)}</button>` : ''}
        ${br365Market && Math.abs(br365Market.line - line) > 0.001 ? `<button type="button" class="line-reset" data-team-line-reset-br365>linha br365 ${fmt(br365Market.line, 1)}</button>` : ''}
        <span class="line-avg">média ${avg != null ? fmt(avg, 1) : '—'}</span>
      </div>

      ${unavailable ? `
        <div class="market-empty">
          <strong>Sem dados para este mercado.</strong>
          <span>Nenhum jogo do time nesta temporada com esse total disponível.</span>
        </div>` : `
        <div class="hit-grid">
          ${hitTile('L5', l5)}
          ${hitTile('L10', l10)}
          ${hitTile('L20', l20)}
          ${hitTile('Temporada', season)}
        </div>
        <div class="chart-box market-chart"><canvas id="chart-team-market"></canvas></div>
        <div class="market-legend">
          <span><i class="dot-green"></i>acima de ${fmt(line, 1)}</span>
          <span><i class="dot-red"></i>abaixo de ${fmt(line, 1)}</span>
          <span>${series.length} jogos · ${values.filter((v) => v > line).length} acima da linha</span>
        </div>
      `}
      ${market.key === 'reb' ? `<div class="market-note">Nenhuma das casas abre mercado de rebotes por time — a linha é manual, mas o histórico é o oficial da ESPN.</div>` : ''}
      <div class="market-foot">
        <a class="book-link" href="https://99play.io/sports#/sport/67" target="_blank" rel="noopener">Conferir odds na 99play ↗</a>
        ${br365Market ? `<a class="book-link" href="https://www.br365.io/sports#/basketball" target="_blank" rel="noopener">Conferir odds na br365 ↗</a>` : ''}
        <span class="hint">Análise gratuita · sem assinatura</span>
      </div>
    </div>`;

  if (!unavailable) drawTeamMarketChart(market, series, line);
  else destroyCharts(['chart-team-market']);
}

function drawTeamMarketChart(market, series, line) {
  const shown = series.slice(-20);
  const values = shown.map((row) => row.value);
  const colors = values.map((v) => (v > line ? 'rgba(34,197,94,.85)' : 'rgba(239,68,68,.82)'));

  makeChart('chart-team-market', {
    type: 'bar',
    data: {
      labels: shown.map((row) => shortDate(row.date)),
      datasets: [{
        label: market.label,
        data: values,
        backgroundColor: colors,
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 4,
        maxBarThickness: 34,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterLabel: (ctx) => {
              const item = shown[ctx.dataIndex];
              return item?.opp?.abbr ? `vs ${item.opp.abbr}` : '';
            },
          },
        },
      },
      scales: {
        x: xAxis(),
        y: yAxis({ beginAtZero: true, ticks: { color: '#8b8b96', precision: 0 } }),
      },
    },
    plugins: [hLinePlugin(line, `linha ${fmt(line, 1)}`, '#f8fafc')],
  });
}

let teamAnalysisBound = false;
function bindTeamAnalysis() {
  if (teamAnalysisBound) return;
  teamAnalysisBound = true;
  document.addEventListener('click', (event) => {
    const tab = event.target.closest('#team-analysis [data-team-market]');
    if (tab) {
      teamAnalysisState.market = tab.dataset.teamMarket;
      if (!state.teamData) return;
      renderTeamAnalysis(state.teamData);
      ensureTeamAnalysis(state.teamData).then((changed) => {
        if (changed && state.teamData) renderTeamAnalysis(state.teamData);
      });
      return;
    }

    const stepBtn = event.target.closest('#team-analysis [data-team-line-step]');
    if (stepBtn && state.teamData) {
      const market = TEAM_MARKET_LIST.find((m) => m.key === teamAnalysisState.market) || TEAM_MARKET_LIST[0];
      const key = `${state.teamData.team.id}:${market.key}`;
      const current = Number(teamAnalysisState.lines.get(key) ?? stepBtn.dataset.current ?? 0);
      const next = Math.max(0, Math.round((current + Number(stepBtn.dataset.teamLineStep)) * 10) / 10);
      teamAnalysisState.lines.set(key, next);
      renderTeamAnalysis(state.teamData);
      return;
    }

    const bestBtn = event.target.closest('#team-analysis [data-team-line-best]');
    if (bestBtn && state.teamData) {
      const market = TEAM_MARKET_LIST.find((m) => m.key === teamAnalysisState.market) || TEAM_MARKET_LIST[0];
      const books = teamAnalysisState.books[String(state.teamData.team.id)] || {};
      const log = teamAnalysisState.log?.teamId === String(state.teamData.team.id) ? teamAnalysisState.log.games : null;
      const base = log?.length ? log : state.teamData.games;
      const values = [...base].reverse()
        .map((game) => teamMarketValue(market.key, game.stats))
        .filter((v) => Number.isFinite(v))
        .reverse();
      const best = bestTeamEntryAcrossBooks(books, String(state.teamData.team.id), state.teamData.team.abbr, market.key, values);
      if (best) {
        teamAnalysisState.lines.set(`${state.teamData.team.id}:${market.key}`, best.line);
        renderTeamAnalysis(state.teamData);
      }
      return;
    }

    const resetBtn = event.target.closest('#team-analysis [data-team-line-reset]');
    if (resetBtn && state.teamData) {
      const market = TEAM_MARKET_LIST.find((m) => m.key === teamAnalysisState.market) || TEAM_MARKET_LIST[0];
      teamAnalysisState.lines.delete(`${state.teamData.team.id}:${market.key}`);
      renderTeamAnalysis(state.teamData);
      return;
    }

    const resetBr365Btn = event.target.closest('#team-analysis [data-team-line-reset-br365]');
    if (resetBr365Btn && state.teamData) {
      const market = TEAM_MARKET_LIST.find((m) => m.key === teamAnalysisState.market) || TEAM_MARKET_LIST[0];
      const books = teamAnalysisState.books[String(state.teamData.team.id)] || {};
      const br365 = books['br365'];
      const line = br365?.props?.[state.teamData.team.abbr]?.[market.key]?.line;
      if (line != null) {
        teamAnalysisState.lines.set(`${state.teamData.team.id}:${market.key}`, line);
        renderTeamAnalysis(state.teamData);
      }
      return;
    }
  });
}

/* ------------------------------------- props de times do dia (overview) */

function openTeam(id) {
  if (!id) return;
  goTo('teams');
  $('#team-select').value = String(id);
  const compare = $('#team-compare-select');
  if (compare && compare.value === String(id)) compare.value = '';
  loadTeam(id);
}

let teamPropsToken = 0;
let teamPropsSignature = '';

async function loadTeamPropsOfDay() {
  const section = $('#overview-team-props');
  const list = $('#team-props-list');
  if (!section || !list) return;
  const games = state.slateGames || [];
  if (!games.length) {
    section.hidden = true;
    return;
  }
  const bucket = Math.floor(Date.now() / (10 * 60 * 1000));
  const signature = `${state.slateSignature}:${bucket}`;
  if (teamPropsSignature === signature && list.dataset.ready === '1') return;
  const token = ++teamPropsToken;

  await ensureBookSlate();
  if (!state.bookEvents?.length) {
    section.hidden = true;
    return;
  }

  const eventBySide = new Map();
  for (const game of games) {
    for (const side of game.competitors || []) {
      const event = findBookEvent({ abbr: side.abbr, name: side.name });
      if (event) eventBySide.set(String(side.id), { side, event, game });
    }
  }

  const rows = [];
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await mapLimit([...eventBySide.values()], 2, async ({ side, event, game }) => {
    let details = null;
    for (let attempt = 0; attempt < 2 && !details; attempt += 1) {
      try {
        details = await api(`/api/book/event/${event.id}`);
      } catch {
        await wait(600);
      }
    }
    if (!details) return;
    const props = details.teamProps?.[side.abbr];
    if (!props) return;

    let log = null;
    try {
      log = await api(`/api/team-log/${side.id}?last=20&light=1`);
    } catch {
      return;
    }

    for (const market of TEAM_MARKET_LIST) {
      const book = props[market.key];
      if (!book?.lines?.length) continue;
      const series = (log.games || [])
        .map((entry) => teamMarketValue(market.key, entry.stats))
        .filter((v) => Number.isFinite(v));
      if (series.length < 4) continue;
      const entry = bestTeamEntry(book, series);
      if (!entry) continue;
      const probability = Math.round(entry.p * 100);
      if (probability < 52) continue;
      rows.push({
        team: side,
        market,
        line: entry.line,
        odd: entry.over,
        probability,
        hits: series.filter((v) => v > entry.line).length,
        total: series.length,
        recent: series.slice(0, 10),
        event: { ...event, startDate: details.startDate || event.startDate },
        gameId: game.id,
        betUrl: `https://99play.io/sports#/sport/67`,
        bookName: '99play',
      });
    }
  });

  if (token !== teamPropsToken) return;

  if (!rows.length) {
    section.hidden = true;
    return;
  }

  rows.sort((a, b) => b.probability - a.probability || (b.odd || 0) - (a.odd || 0));
  const uniqueTeams = new Set(rows.map((row) => row.team.id)).size;
  // uma linha por time (a melhor entrada), como na lista de referência
  const seenTeams = new Set();
  const top = [];
  for (const row of rows) {
    if (seenTeams.has(row.team.id)) continue;
    seenTeams.add(row.team.id);
    top.push(row);
    if (top.length >= 10) break;
  }

  section.hidden = false;
  const hint = $('#team-props-hint');
  if (hint) hint.textContent = `${rows.length} entradas em ${uniqueTeams} times · odd real da 99play`;

  list.innerHTML = top.map((row, index) => {
    const recent = [...row.recent].reverse();
    const max = Math.max(1, ...recent);
    const spark = recent.map((v) => `<i class="${v > row.line ? 'on' : 'off'}" style="height:${Math.max(12, Math.round((v / max) * 100))}%"></i>`).join('');
    const opp = (row.event.teams || []).find((t) => t.abbr !== row.team.abbr);
    return `
    <button type="button" class="radar-item" data-team-id="${escapeHtml(row.team.id)}" data-team-name="${escapeHtml(row.team.name || row.team.abbr)}">
      <span class="radar-rank">${index + 1}</span>
      <img src="${escapeHtml(row.team.logo || '')}" alt="" onerror="this.style.opacity='.15'" />
      <span class="radar-body">
        <span class="radar-top">
          <strong>${escapeHtml(row.team.name || row.team.abbr)}</strong>
          <span class="badge blue">${escapeHtml(row.team.abbr)}</span>
          <span class="radar-prob">${row.probability}%</span>
        </span>
        <span class="radar-bet">Over ${fmt(row.line, 1)} ${escapeHtml(row.market.label)}${opp ? ` <span class="radar-match">vs ${escapeHtml(opp.abbr || opp.name || '')} · ${gameTimeLabel(row.event.startDate)}</span>` : ''}</span>
        <span class="radar-meta">
          <span class="spark">${spark}</span>
          <span class="radar-hit">${row.hits}/${row.total} acima</span>
          ${row.odd ? `
          <a href="${escapeHtml(row.betUrl)}" target="_blank" rel="noopener" class="radar-odd-link">
            <span class="radar-odd on">${fmt(row.odd, 2)}</span>
          </a>` : `
          <span class="radar-odd off">—</span>`}
        </span>
        <span class="radar-bar"><i style="width:${row.probability}%"></i></span>
      </span>
    </button>`;
  }).join('');

  teamPropsSignature = signature;
  list.dataset.ready = '1';
}

/* ============================================================================
   GS Status Football — módulo de futebol
   ============================================================================ */

const FOOTBALL_MARKETS = [
  { key: 'goals', label: 'Gols do time', icon: '⚽' },
  { key: 'goalsHT', label: 'Gols 1º tempo', icon: '🔥' },
  { key: 'corners', label: 'Escanteios', icon: '📐' },
  { key: 'cards', label: 'Cartões amarelos', icon: '🟨' },
  { key: 'shots', label: 'Chutes totais', icon: '🎯' },
  { key: 'shotsOnTarget', label: 'Chutes a gol', icon: '🥅' },
];

const footballOddColor = (p) => {
  if (p >= 0.70) return 'var(--green)';
  if (p >= 0.55) return 'var(--blue)';
  if (p >= 0.45) return 'var(--yellow)';
  return 'var(--red)';
};

function footballProbFromRate(rate) {
  // taxa histórica -> probabilidade ajustada (mesma lógica do NBA, suavizada)
  if (rate == null) return null;
  const p = Math.min(0.90, Math.max(0.10, rate));
  return p;
}

function footballBestEntry(series, line, oddsByBook) {
  if (!series?.length) return null;
  const hits = series.filter((v) => v > line).length;
  const p = hits / series.length;
  let bestBook = null;
  let bestOdd = null;
  for (const [book, odd] of Object.entries(oddsByBook || {})) {
    if (odd && (bestOdd == null || odd > bestOdd)) {
      bestOdd = odd;
      bestBook = book;
    }
  }
  return { line, p, hits, total: series.length, odd: bestOdd, book: bestBook };
}

async function loadFootballOverview() {
  const token = ++footballToken;
  const section = $('#football-slate');
  const grid = $('#football-slate-grid');
  const bestSection = $('#football-best-bets');
  const bestList = $('#football-best-list');
  if (!section || !grid) return;

  section.hidden = false;
  grid.innerHTML = '<div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div>';

  try {
    const data = await getFootballSlate();
    if (token !== footballToken) return;
    state.football.slate = data.games || [];
    state.football.slateDate = new Date().toISOString().slice(0, 10);

    const updated = $('#football-slate-updated');
    if (updated) updated.textContent = `Atualizado ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

    renderFootballSlate(state.football.slate);

    // Calcula melhores entradas do dia (apenas jogos com odds)
    const bestBets = [];
    for (const game of state.football.slate) {
      if (!game.odds) continue;
      const home = game.homeTeam;
      const away = game.awayTeam;
      if (!home || !away) continue;
      const line = game.odds.total;
      if (!line) continue;
      // Usamos média histórica simples se não tivermos série — placeholder de probabilidade
      const p = 0.50; // sem série histórica ainda, usamos neutro
      const bet = {
        team: home.name,
        market: 'Total de gols',
        line,
        odd: game.odds.homeMoney || game.odds.awayMoney || null,
        probability: Math.round(p * 100),
        book: game.odds.provider || '99play',
        event: game,
        betUrl: `https://99play.io/sports#/sport/1`,
      };
      if (bet.odd) bestBets.push(bet);
    }
    bestBets.sort((a, b) => (b.odd || 0) - (a.odd || 0));
    state.football.bestBets = bestBets.slice(0, 6);

    if (bestSection && bestList) {
      if (state.football.bestBets.length) {
        bestSection.hidden = false;
        const hint = $('#football-best-hint');
        if (hint) hint.textContent = `${state.football.bestBets.length} entradas · odds da casa`;
        bestList.innerHTML = state.football.bestBets.map((b, i) => `
          <button type="button" class="radar-item football-bet-item" data-bet-url="${escapeHtml(b.betUrl)}">
            <span class="radar-rank">${i + 1}</span>
            <span class="fire-badge">🔥</span>
            <span class="radar-body">
              <span class="radar-top">
                <strong>${escapeHtml(b.team)}</strong>
                <span class="radar-prob">${b.probability}%</span>
              </span>
              <span class="radar-bet">Over ${fmt(b.line, 1)} ${escapeHtml(b.market)}</span>
              <span class="radar-meta">
                <span class="radar-odd on">${b.odd ? fmt(b.odd, 2) : '—'}</span>
                <span class="radar-book">${escapeHtml(b.book)}</span>
              </span>
            </span>
          </button>
        `).join('');
      } else {
        bestSection.hidden = true;
      }
    }
  } catch (err) {
    console.error('football overview error', err);
    grid.innerHTML = '<div class="loading">Não foi possível carregar os jogos de futebol.</div>';
  }
}

function renderFootballSlate(games) {
  const grid = $('#football-slate-grid');
  if (!grid) return;
  if (!games?.length) {
    grid.innerHTML = '<div class="loading">Sem jogos de futebol hoje.</div>';
    return;
  }
  grid.innerHTML = games.map((g) => {
    const h = g.homeTeam;
    const a = g.awayTeam;
    const completed = g.status.completed;
    const score = completed ? `${h.score || 0} x ${a.score || 0}` : '—';
    const clock = g.status.clock ? ` ${g.status.clock}` : '';
    const odd = g.odds ? (g.odds.homeMoney || g.odds.awayMoney || '—') : '—';
    return `
    <button type="button" class="slate-card football-game-card" data-event-id="${escapeHtml(g.id)}">
      <div class="slate-head">
        <span class="slate-time">${new Date(g.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
        <span class="slate-comp">${escapeHtml(g.competition)}</span>
      </div>
      <div class="slate-teams">
        <div class="slate-team home">
          <img src="${escapeHtml(h.logo || '')}" class="slate-logo" alt="" onerror="this.style.opacity='.15'" />
          <span class="slate-name">${escapeHtml(h.name)}</span>
          <span class="slate-score ${completed ? 'final' : ''}">${score}</span>
        </div>
        <div class="slate-vs">x</div>
        <div class="slate-team away">
          <img src="${escapeHtml(a.logo || '')}" class="slate-logo" alt="" onerror="this.style.opacity='.15'" />
          <span class="slate-name">${escapeHtml(a.name)}</span>
          <span class="slate-score ${completed ? 'final' : ''}">${score}</span>
        </div>
      </div>
      <div class="slate-foot">
        <span class="slate-status">${completed ? 'Final' : g.status.detail || 'Ao vivo'}</span>
        <span class="slate-odd">Odd ${odd}</span>
      </div>
    </button>
    `;
  }).join('');
}

async function loadFootballTeam() {
  const token = ++footballTeamToken;
  const select = $('#football-team-select');
  const header = $('#football-team-header');
  const kpis = $('#football-team-kpis');
  const analysis = $('#football-team-analysis');
  if (!select || !header || !analysis) return;

  const teamId = select.value;
  if (!teamId) {
    header.innerHTML = '<div class="loading" style="text-align:center; padding: 40px;">Selecione um time acima para ver a análise.</div>';
    kpis.innerHTML = '';
    analysis.innerHTML = '';
    return;
  }
  header.innerHTML = '<div class="loading"><span class="spinner"></span>Carregando time…</div>';
  analysis.innerHTML = '';

  try {
    const data = await getFootballTeam(teamId, state.football.competitionId);
    if (token !== footballTeamToken) return;
    state.football.teamData = data;
    renderFootballTeam(data);
  } catch (err) {
    console.error('football team error', err);
    header.innerHTML = '<div class="loading" style="text-align:center; padding: 40px;">Erro ao carregar o time.</div>';
  }
}

function renderFootballTeam(data) {
  const { team: teamInfo, games } = data;
  const header = $('#football-team-header');
  const kpis = $('#football-team-kpis');
  const analysis = $('#football-team-analysis');
  if (!header || !analysis) return;

  const played = games.filter((g) => g.status === 'completed');
  const lastN = played.slice(0, state.football.teamLast);
  const avgGF = lastN.length ? (lastN.reduce((a, g) => a + (g.home ? g.scoreFor : g.scoreAgainst), 0) / lastN.length).toFixed(1) : '—';
  const avgGA = lastN.length ? (lastN.reduce((a, g) => a + (g.home ? g.scoreAgainst : g.scoreFor), 0) / lastN.length).toFixed(1) : '—';
  const wins = lastN.filter((g) => (g.home ? g.scoreFor > g.scoreAgainst : g.scoreAgainst > g.scoreFor)).length;
  const winRate = lastN.length ? ((wins / lastN.length) * 100).toFixed(0) : '—';

  header.innerHTML = `
    <div class="entity-head">
      <img class="entity-logo" src="${escapeHtml(teamInfo.logo || '')}" alt="" onerror="this.style.opacity='.15'" />
      <div>
        <div class="entity-name">${escapeHtml(teamInfo.name || 'Time')} <span class="badge blue">${played.length} jogos</span></div>
        <div class="entity-sub">
          <span>GF/jogo: ${avgGF}</span>
          <span>·</span><span>GC/jogo: ${avgGA}</span>
          <span>·</span><span>Aproveitamento: ${winRate}%</span>
        </div>
      </div>
      <div class="entity-form">${played.slice(0, 5).map((g) => g.win ? '<span class="form-dot w">V</span>' : '<span class="form-dot l">D</span>').join('')}</div>
    </div>
  `;

  kpis.innerHTML = `
    <div class="kpi"><div class="kpi-label">Gols pró / jogo</div><div class="kpi-value">${avgGF}</div></div>
    <div class="kpi"><div class="kpi-label">Gols contra / jogo</div><div class="kpi-value">${avgGA}</div></div>
    <div class="kpi"><div class="kpi-label">Aproveitamento</div><div class="kpi-value">${winRate}%</div></div>
    <div class="kpi"><div class="kpi-label">Jogos analisados</div><div class="kpi-value">${played.length}</div></div>
  `;

  renderFootballTeamMarkets(lastN);
  renderFootballTeamTable(games);
}

function renderFootballTeamMarkets(games) {
  const analysis = $('#football-team-analysis');
  if (!analysis) return;

  // Calcula médias por mercado
  const marketStats = {};
  for (const m of FOOTBALL_MARKETS) {
    const values = games.map((g) => {
      const s = g.stats || {};
      switch (m.key) {
        case 'goals': return s.goals || 0;
        case 'goalsHT': return Math.floor((s.goals || 0) / 2); // estimativa HT
        case 'corners': return s.corners || 0;
        case 'cards': return s.fouls || 0; // placeholder: cartões não disponíveis no scoreboard
        case 'shots': return s.shots || 0;
        case 'shotsOnTarget': return s.shotsOnTarget || 0;
        default: return 0;
      }
    }).filter((v) => Number.isFinite(v));
    marketStats[m.key] = values;
  }

  const marketCards = FOOTBALL_MARKETS.map((m) => {
    const values = marketStats[m.key] || [];
    const avg = values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : '—';
    const line = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 2) / 2 : 0.5;
    const hits = values.filter((v) => v > line).length;
    const pct = values.length ? Math.round((hits / values.length) * 100) : 0;
    const isHot = pct >= 65;
    return `
    <div class="football-market-card ${isHot ? 'hot' : ''}">
      <div class="fm-head">
        <span class="fm-icon">${m.icon}</span>
        <span class="fm-label">${m.label}</span>
        ${isHot ? '<span class="fm-fire">🔥</span>' : ''}
      </div>
      <div class="fm-line">Linha ${fmt(line, 1)} · Média ${avg}</div>
      <div class="fm-stats">${hits}/${values.length} acima (${pct}%)</div>
      <div class="fm-odd">
        <a href="https://99play.io/sports#/sport/1" target="_blank" rel="noopener" class="odd-link">99play Odd —</a>
        <a href="https://www.br365.io/sports#/soccer" target="_blank" rel="noopener" class="odd-link">br365 Odd —</a>
      </div>
    </div>
    `;
  }).join('');

  analysis.innerHTML = `
    <div class="section-head">
      <h3>Mercados de entrada — ${escapeHtml((state.football.teamData && state.football.teamData.team) ? state.football.teamData.team.name : 'Time')}</h3>
      <span class="hint">Probabilidade baseada nos últimos ${games.length} jogos · clique na odd para apostar</span>
    </div>
    <div class="grid two">${marketCards}</div>
  `;
}

function renderFootballTeamTable(games) {
  const wrap = $('#football-team-games-table');
  if (!wrap) return;
  const recent = games.slice(0, 10);
  wrap.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Data</th><th>Competição</th><th>Adversário</th><th>Placar</th><th>Gols</th><th>Esc.</th><th>Cartões</th><th>Chutes</th></tr></thead>
      <tbody>
        ${recent.map((g) => {
          const s = g.stats || {};
          const isHome = g.home;
          const gf = isHome ? g.scoreFor : g.scoreAgainst;
          const gc = isHome ? g.scoreAgainst : g.scoreFor;
          return `<tr>
            <td>${new Date(g.date).toLocaleDateString('pt-BR')}</td>
            <td>${escapeHtml(g.competition)}</td>
            <td>${escapeHtml(g.opp?.name || '—')}</td>
            <td><strong>${gf} x ${gc}</strong></td>
            <td>${s.goals || '—'}</td>
            <td>${s.corners || '—'}</td>
            <td>${s.fouls || '—'}</td>
            <td>${s.shots || '—'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

async function loadFootballPlayer() {
  const token = ++footballPlayerToken;
  const picker = $('#football-player-picker');
  const header = $('#football-player-header');
  const analysis = $('#football-player-analysis');
  if (!picker || !header || !analysis) return;

  const input = picker.querySelector('input');
  const name = input ? input.value.trim() : '';
  if (!name) {
    header.innerHTML = '<div class="loading">Digite o nome de um jogador</div>';
    return;
  }
  header.innerHTML = '<div class="loading"><span class="spinner"></span>Buscando jogador…</div>';
  analysis.innerHTML = '';

  try {
    // Busca no índice de jogadores da NBA (não temos índice de futebol ainda)
    // Como placeholder, mostramos que o módulo de jogadores está em construção
    header.innerHTML = `
      <div class="entity-head">
        <div>
          <div class="entity-name">${escapeHtml(name)}</div>
          <div class="entity-sub">Módulo de jogadores em construção · use a análise de times acima</div>
        </div>
      </div>
    `;
    analysis.innerHTML = `
      <div class="loading">
        <p>A análise detalhada de jogadores de futebol estará disponível em breve.</p>
        <p>Enquanto isso, acesse a aba <strong>Times</strong> para ver os mercados de entrada por time.</p>
      </div>
    `;
  } catch (err) {
    console.error('football player error', err);
    header.innerHTML = '<div class="loading">Erro ao buscar jogador.</div>';
  }
}

/* ------------------------------------- navegação futebol ------------------------------------- */

function bindFootballNavigation() {
  // Competições
  const compSelect = $('#football-comp-select');
  const teamSelect = $('#football-team-select');
  if (compSelect && teamSelect) {
    compSelect.addEventListener('change', async () => {
      const compId = compSelect.value;
      state.football.competitionId = compId;
      state.football.teamData = null;
      teamSelect.innerHTML = '<option value="">Carregando times…</option>';
      try {
        // Busca times da competição via scoreboard (usa times dos jogos)
        const data = await getFootballSlate(compId);
        const teamsMap = new Map();
        for (const g of data.games || []) {
          if (g.homeTeam) teamsMap.set(g.homeTeam.id, g.homeTeam);
          if (g.awayTeam) teamsMap.set(g.awayTeam.id, g.awayTeam);
        }
        teamSelect.innerHTML = '<option value="">Selecione um time</option>' + [...teamsMap.values()].map((t) =>
          `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`
        ).join('');
      } catch {
        teamSelect.innerHTML = '<option value="">Erro ao carregar times</option>';
      }
    });

    teamSelect.addEventListener('change', () => {
      state.football.teamId = teamSelect.value;
      state.football.teamData = null;
      goTo('football-teams');
    });
  }

  // Slate cards -> abre time
  document.addEventListener('click', (event) => {
    const card = event.target.closest('.football-game-card');
    if (card) {
      const eventId = card.dataset.eventId;
      const game = state.football.slate.find((g) => g.id === eventId);
      if (game) {
        // Abre o time da casa por padrão
        goTo('football-teams');
        setTimeout(() => {
          const compSelect = $('#football-comp-select');
          const teamSelect = $('#football-team-select');
          if (compSelect) compSelect.value = game.competitionId || '';
          if (teamSelect) {
            teamSelect.value = game.homeTeam?.id || '';
            teamSelect.dispatchEvent(new Event('change'));
          }
        }, 100);
      }
    }

    // Melhor entrada -> link direto
    const betItem = event.target.closest('.football-bet-item');
    if (betItem) {
      const url = betItem.dataset.betUrl;
      if (url) window.open(url, '_blank');
    }
  });
}

/* ------------------------------------- charts futebol ------------------------------------- */

function renderFootballTeamCharts(games) {
  // Gols por jogo
  const goalsCtx = $('#chart-football-team-goals');
  if (goalsCtx && games.length) {
    const labels = games.map((g) => new Date(g.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }));
    const homeGoals = games.map((g) => g.home ? g.scoreFor : g.scoreAgainst);
    makeChart('chart-football-team-goals', {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Gols pró',
          data: homeGoals,
          backgroundColor: homeGoals.map((v) => (v >= 2 ? 'var(--green)' : 'var(--red)')),
          borderRadius: 4,
        }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });
  }

  // Escanteios
  const cornersCtx = $('#chart-football-team-corners');
  if (cornersCtx && games.length) {
    const labels = games.map((g) => new Date(g.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }));
    const corners = games.map((g) => (g.stats && g.stats.corners) || 0);
    makeChart('chart-football-team-corners', {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Escanteios',
          data: corners,
          backgroundColor: 'var(--blue)',
          borderRadius: 4,
        }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });
  }

  // Cartões
  const cardsCtx = $('#chart-football-team-cards');
  if (cardsCtx && games.length) {
    const labels = games.map((g) => new Date(g.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }));
    const cards = games.map((g) => (g.stats && g.stats.fouls) || 0);
    makeChart('chart-football-team-cards', {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Cartões / Faltas',
          data: cards,
          backgroundColor: 'var(--orange)',
          borderRadius: 4,
        }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });
  }

  // Chutes
  const shotsCtx = $('#chart-football-team-shots');
  if (shotsCtx && games.length) {
    const labels = games.map((g) => new Date(g.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }));
    const shots = games.map((g) => (g.stats && g.stats.shots) || 0);
    makeChart('chart-football-team-shots', {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Chutes',
          data: shots,
          backgroundColor: 'var(--violet)',
          borderRadius: 4,
        }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });
  }
}

// Integra renderFootballTeam com charts
const _renderFootballTeam = renderFootballTeam;
renderFootballTeam = function (data) {
  _renderFootballTeam.call(this, data);
  if (data && data.games) renderFootballTeamCharts(data.games);
};

/* ------------------------------------- init futebol ------------------------------------- */

/* ------------------------------------------------------ dashboard moderno */
async function loadDashboardStats() {
  try {
    const [comps, slate] = await Promise.all([
      getFootballCompetitions(),
      getFootballSlate(),
    ]);
    const compsCount = comps.competitions?.length || 0;
    const gamesCount = slate.games?.length || 0;
    $('#qs-games').textContent = gamesCount;
    $('#qs-leagues').textContent = compsCount;
    let bestCount = 0;
    try { bestCount += document.querySelectorAll('#radar-list .radar-item').length; } catch { /* ok */ }
    try { bestCount += document.querySelectorAll('#team-props-list .radar-item').length; } catch { /* ok */ }
    $('#qs-best').textContent = bestCount;
    state.football.competitions = comps.competitions || [];
    state.football.slate = slate.games || [];
  } catch (err) { console.error('dashboard stats error', err); }
}

async function loadBestBets() {
  const list = $('#best-bets-list');
  const hint = $('#best-bets-hint');
  if (!list) return;
  list.innerHTML = '<div class="loading"><span class="spinner"></span>Buscando melhores entradas…</div>';
  try {
    const bets = [];
    try {
      const radarItems = [...document.querySelectorAll('#radar-list .radar-item')];
      for (const item of radarItems.slice(0, 5)) {
        const name = item.querySelector('strong')?.textContent || '';
        const prob = item.querySelector('.radar-prob')?.textContent || '0';
        const odd = item.querySelector('.radar-odd')?.textContent || '—';
        const betText = item.querySelector('.radar-bet')?.textContent || '';
        bets.push({ team: name, market: betText.replace(/Over\s*/i, '').trim() || 'Props', line: 0, odd: odd === '—' ? null : parseFloat(odd.replace(',', '.')) || null, probability: parseInt(prob) || 0, book: '99play', betUrl: 'https://99play.io/sports#/sport/67' });
      }
    } catch { /* ok */ }
    try {
      const teamItems = [...document.querySelectorAll('#team-props-list .radar-item')];
      for (const item of teamItems.slice(0, 5)) {
        const name = item.querySelector('strong')?.textContent || '';
        const prob = item.querySelector('.radar-prob')?.textContent || '0';
        const odd = item.querySelector('.radar-odd')?.textContent || '—';
        const betText = item.querySelector('.radar-bet')?.textContent || '';
        bets.push({ team: name, market: betText.replace(/Over\s*/i, '').trim() || 'Props', line: 0, odd: odd === '—' ? null : parseFloat(odd.replace(',', '.')) || null, probability: parseInt(prob) || 0, book: '99play', betUrl: 'https://99play.io/sports#/sport/67' });
      }
    } catch { /* ok */ }
    try {
      for (const game of state.football.slate.slice(0, 6)) {
        if (!game.odds) continue;
        const home = game.homeTeam, away = game.awayTeam;
        if (!home || !away) continue;
        const line = game.odds.total;
        if (!line) continue;
        const oddVal = game.odds.homeMoney || game.odds.awayMoney || null;
        bets.push({ team: `${home.name} x ${away.name}`, market: `Total de gols Over ${fmt(line, 1)}`, line, odd: oddVal ? parseFloat(oddVal.replace(',', '.')) || null : null, probability: 60, book: game.odds.provider || '99play', betUrl: 'https://99play.io/sports#/sport/1' });
      }
    } catch { /* ok */ }
    bets.sort((a, b) => b.probability - a.probability || (b.odd || 0) - (a.odd || 0));
    const top = bets.slice(0, 8);
    if (hint) hint.textContent = `${top.length} entradas · probabilidade × odd`;
    list.innerHTML = top.map((b, i) => `
      <button type="button" class="radar-item best-bet-item" data-bet-url="${escapeHtml(b.betUrl)}">
        <span class="best-rank">${i + 1}</span>
        <span class="best-body">
          <div class="best-top"><span class="best-name">${escapeHtml(b.team)}</span><span class="best-prob">${b.probability}%</span></div>
          <div class="best-bet">Over ${escapeHtml(b.market)}</div>
          <div class="best-meta"><span class="best-odd">${b.odd ? fmt(b.odd, 2) : '—'}</span><span class="best-book">${escapeHtml(b.book)}</span></div>
        </span>
      </button>
    `).join('');
    renderProbDistChart(top);
  } catch (err) { console.error('best bets error', err); list.innerHTML = '<div class="loading">Não foi possível carregar as entradas.</div>'; }
}

function renderProbDistChart(bets) {
  const canvas = $('#chart-overview-prob-dist');
  if (!canvas) return;
  const ranges = ['50-60%', '60-70%', '70-80%', '80-90%', '90%+'];
  const counts = ranges.map(() => 0);
  for (const b of bets) { const p = b.probability; if (p >= 90) counts[4]++; else if (p >= 80) counts[3]++; else if (p >= 70) counts[2]++; else if (p >= 60) counts[1]++; else counts[0]++; }
  makeChart('chart-overview-prob-dist', { type: 'bar', data: { labels: ranges, datasets: [{ label: 'Entradas', data: counts, backgroundColor: counts.map((c, i) => i >= 4 ? '#4ade80' : i >= 3 ? '#60a5fa' : i >= 2 ? '#fbbf24' : i >= 1 ? '#f97316' : '#f87171'), borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'Qtd', color: '#8b8b96', font: { size: 11 } } }, x: { ticks: { color: '#8b8b96', font: { size: 11 } } } } } });
}

async function loadDashboardFootballSlate() {
  const grid = $('#football-slate-grid');
  if (!grid) return;
  try {
    const data = await getFootballSlate();
    state.football.slate = data.games || [];
    renderFootballSlate(state.football.slate);
    const updated = $('#football-slate-updated');
    if (updated) updated.textContent = `Atualizado ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  } catch (err) { console.error('dashboard slate error', err); grid.innerHTML = '<div class="loading">Não foi possível carregar os jogos.</div>'; }
}

function bindDashboardNav() {
  document.addEventListener('click', (event) => {
    const card = event.target.closest('.nav-card');
    if (card) { const view = card.dataset.goto; if (view) goTo(view); }
  });
}

async function initFootball() {
  try {
    const data = await getFootballCompetitions();
    state.football.competitions = data.competitions || [];
    const compSelect = $('#football-comp-select');
    if (compSelect) {
      compSelect.innerHTML = state.football.competitions.map((c) =>
        `<option value="${escapeHtml(c.id)}">${c.flag} ${escapeHtml(c.name)}</option>`
      ).join('');
      // Seleciona Brasileirão por padrão
      const br = state.football.competitions.find((c) => c.key === 'BR');
      if (br) compSelect.value = br.id;
      compSelect.dispatchEvent(new Event('change'));
    }
  } catch (err) {
    console.error('football init error', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bindAnalysis();
  bindTeamAnalysis();
  bindFootballNavigation();
  bindDashboardNav();
  init();
  initFootball();
  loadDashboardStats();
  loadBestBets();
  loadDashboardFootballSlate();
  if ('serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
});
