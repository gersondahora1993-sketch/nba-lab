'use strict';

/* ============================================================== helpers */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const C = {
  orange: '#f97316',
  orangeFill: 'rgba(249, 115, 22, 0.82)',
  teal: '#2dd4bf',
  tealFill: 'rgba(45, 212, 191, 0.78)',
  blue: '#60a5fa',
  blueFill: 'rgba(96, 165, 250, 0.75)',
  violet: '#a78bfa',
  green: '#22c55e',
  red: '#f05252',
  yellow: '#fbbf24',
  slate: 'rgba(148, 163, 184, 0.45)',
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

const PAGE_META = {
  overview: ['Visão geral', 'Jogos do dia, odds e tendências da temporada.'],
  teams: ['Times', 'Últimos jogos, produção ofensiva, defesa e confrontos.'],
  players: ['Jogadores', 'Pontuação, rebotes, assistências e eficiência jogo a jogo.'],
  combos: ['Combos', 'Média, mediana e aproveitamento contra a linha de over/under.'],
  compare: ['Comparador', 'Dois jogadores lado a lado, com perfil e produção.'],
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
};

let teamToken = 0;
let compareTeamToken = 0;
let playerToken = 0;
let comboToken = 0;
let compareToken = 0;
let pluginSeq = 0;
const charts = new Map();

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

async function loadSlate() {
  const grid = $('#slate-grid');
  grid.innerHTML = '<div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div>';
  try {
    const data = await api('/api/slate');
    state.slateLoaded = true;
    renderSlate(data.games || []);
  } catch (err) {
    grid.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

function renderSlate(games) {
  const grid = $('#slate-grid');
  $('#slate-updated').textContent = `Atualizado ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

  if (!games.length) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1">Nenhum jogo na grade de hoje. Volte mais tarde.</div>';
    return;
  }

  const sorted = [...games].sort((a, b) => new Date(a.date) - new Date(b.date));

  grid.innerHTML = sorted.map((game) => {
    const away = game.competitors.find((c) => !c.home);
    const home = game.competitors.find((c) => c.home);
    const rows = [away, home].filter(Boolean);
    const statusClass = game.status.completed ? 'final' : game.status.state === 'in' ? 'live' : '';
    const statusText = game.status.completed ? 'Final' : game.status.state === 'in' ? 'Ao vivo' : game.status.detail || longDate(game.date);
    const odds = game.odds;

    return `<article class="game-card">
      <div class="game-top">
        <span class="game-status ${statusClass}">${escapeHtml(statusText)}</span>
        <span>${escapeHtml(game.venue || game.broadcast || '')}</span>
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
  }).join('');
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

  const form = [...games].reverse()
    .map((g) => `<span class="form-dot ${g.win ? 'w' : 'l'}">${g.win ? 'V' : 'D'}</span>`)
    .join('');

  $('#team-header').innerHTML = `<div class="entity-head">
    <img class="entity-logo" src="${escapeHtml(team.logo)}" alt="" onerror="imageFallback(this)" />
    <div>
      <div class="entity-name">${escapeHtml(team.fullName)}
        <span class="badge">${record.wins}V · ${record.losses}D</span>
      </div>
      <div class="entity-sub">
        <span>Últimos ${games.length} jogos</span>
        <span>·</span><span>Temporada ${escapeHtml(data.season)}</span>
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

  renderTeamPointsChart(games);
  renderTeamScoringChart(games);
  renderTeamStatToggles();
  renderTeamStatsChart(games);
  renderTeamRadar(team, avg, compare);
  renderTeamTable(games, team);
  renderTeamLeaders(leaders);
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
    const data = await api(`/api/player/${id}?last=${state.playerLast}`);
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

  $('#player-header').innerHTML = playerHeader(player, season, games.length);

  if (!games.length) {
    $('#player-kpis').innerHTML = '';
    destroyCharts(['chart-player-scoring', 'chart-player-pra', 'chart-player-shots', 'chart-player-eff']);
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

  renderPlayerScoringChart(games);
  renderPlayerPraChart(games, avg);
  renderPlayerShotsChart(games);
  renderPlayerEfficiencyChart(games);
  renderPlayerTable(games, player);
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

  playerPicker = setupPicker($('#player-picker'), (p) => loadPlayer(p.id));
  comboPicker = setupPicker($('#combo-picker'), (p) => loadComboPlayer(p.id));
  bindCompareInteractions();

  window.imageFallback = imageFallback;

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

document.addEventListener('DOMContentLoaded', () => {
  init();
  if ('serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
});
