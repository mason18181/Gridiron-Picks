require('dotenv').config();
const express = require('express');
const path = require('path');
const { pool, initSchema } = require('./db');
const { TEAMS } = require('./teams');
const { syncWeekOdds, syncWeekResults } = require('./odds');
const { computeScoreboard } = require('./scoring');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- auth helpers ----------
async function requirePlayer(req, res, next) {
  const id = Number(req.header('x-player-id'));
  const pin = req.header('x-player-pin');
  if (!id || !pin) return res.status(401).json({ error: 'Missing player credentials' });
  const { rows } = await pool.query('SELECT * FROM players WHERE id = $1 AND pin = $2', [id, pin]);
  if (!rows.length) return res.status(401).json({ error: 'Invalid player credentials' });
  req.player = rows[0];
  next();
}

function requireHost(req, res, next) {
  const pw = req.header('x-host-password');
  if (!process.env.HOST_PASSWORD) return res.status(500).json({ error: 'Host password not configured on server' });
  if (pw !== process.env.HOST_PASSWORD) return res.status(401).json({ error: 'Invalid host password' });
  next();
}

// ---------- players ----------
// Single entry point: a recognized name+PIN logs straight in. An
// unrecognized name does NOT create an account — it only tells the caller
// whether a join request is safe to submit; the actual request is a
// separate call (POST /api/join-request) so the client can show a
// confirmation prompt first.
app.post('/api/login', async (req, res) => {
  const { name, pin } = req.body;
  if (!name || !pin) return res.status(400).json({ error: 'name and pin required' });
  const { rows } = await pool.query('SELECT id, name FROM players WHERE name=$1 AND pin=$2', [name, pin]);
  if (rows.length) return res.json({ status: 'ok', player: rows[0] });

  const nameTaken = (await pool.query('SELECT id FROM players WHERE name=$1', [name])).rows.length > 0;
  if (nameTaken) return res.status(401).json({ error: 'That name exists but the PIN is wrong' });

  const pending = (await pool.query("SELECT id FROM join_requests WHERE name=$1 AND status='pending'", [name])).rows.length > 0;
  return res.json({ status: 'unrecognized', pendingRequest: pending });
});

app.post('/api/join-request', async (req, res) => {
  const { name, pin } = req.body;
  if (!name || !pin) return res.status(400).json({ error: 'name and pin required' });
  const cfg = (await pool.query('SELECT phase FROM config WHERE id=1')).rows[0];
  if (cfg.phase !== 'lobby') return res.status(400).json({ error: 'The draft has already started — ask the host to add you directly.' });

  const nameTaken = (await pool.query('SELECT id FROM players WHERE name=$1', [name])).rows.length > 0;
  if (nameTaken) return res.status(400).json({ error: 'That name is already registered — did you mean to log in?' });

  const existingPending = (await pool.query("SELECT id FROM join_requests WHERE name=$1 AND status='pending'", [name])).rows[0];
  if (existingPending) return res.json({ ok: true, alreadyPending: true });

  await pool.query('INSERT INTO join_requests (name, pin) VALUES ($1,$2)', [name, pin]);
  res.json({ ok: true, alreadyPending: false });
});

app.get('/api/join-requests', requireHost, async (req, res) => {
  const rows = (await pool.query("SELECT id, name, created_at FROM join_requests WHERE status='pending' ORDER BY created_at")).rows;
  res.json(rows);
});

app.post('/api/host/join-requests/:id/approve', requireHost, async (req, res) => {
  const id = Number(req.params.id);
  const reqRow = (await pool.query("SELECT * FROM join_requests WHERE id=$1 AND status='pending'", [id])).rows[0];
  if (!reqRow) return res.status(404).json({ error: 'Request not found or already handled' });

  try {
    await pool.query('INSERT INTO players (name, pin) VALUES ($1,$2)', [reqRow.name, reqRow.pin]);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'That name was taken in the meantime' });
    return res.status(500).json({ error: 'Server error' });
  }
  await pool.query("UPDATE join_requests SET status='approved' WHERE id=$1", [id]);
  res.json({ ok: true });
});

app.post('/api/host/join-requests/:id/deny', requireHost, async (req, res) => {
  const id = Number(req.params.id);
  await pool.query("UPDATE join_requests SET status='denied' WHERE id=$1 AND status='pending'", [id]);
  res.json({ ok: true });
});

app.post('/api/host/login', requireHost, (req, res) => res.json({ ok: true }));

// ---------- shared state ----------
app.get('/api/state', async (req, res) => {
  const cfg = (await pool.query('SELECT * FROM config WHERE id=1')).rows[0];
  const players = (await pool.query('SELECT id, name FROM players ORDER BY id')).rows;
  const draftPicks = (await pool.query('SELECT player_id, team, pick_number FROM draft_picks ORDER BY pick_number')).rows;

  const counts = {};
  draftPicks.forEach(p => { counts[p.team] = (counts[p.team] || 0) + 1; });
  const teams = TEAMS.map(t => ({ ...t, drafted: counts[t.abbr] || 0 }));

  let currentTurnPlayerId = null;
  if (cfg.phase === 'draft' && cfg.draft_order && cfg.draft_order.length) {
    const n = cfg.draft_order.length;
    const total = n * cfg.rounds;
    if (cfg.current_pick_index < total) {
      const round = Math.floor(cfg.current_pick_index / n);
      const posInRound = cfg.current_pick_index % n;
      const order = round % 2 === 0 ? cfg.draft_order : [...cfg.draft_order].reverse();
      currentTurnPlayerId = order[posInRound];
    }
  }

  res.json({
    phase: cfg.phase,
    teamCap: cfg.team_cap,
    currentWeek: cfg.current_week,
    seventeenthTeam: cfg.seventeenth_team,
    draftOrder: cfg.draft_order,
    currentPickIndex: cfg.current_pick_index,
    pickDeadline: cfg.pick_deadline,
    rounds: cfg.rounds,
    currentTurnPlayerId,
    players,
    draftPicks,
    teams,
  });
});

// ---------- draft ----------
app.post('/api/host/start-draft', requireHost, async (req, res) => {
  const players = (await pool.query('SELECT id FROM players ORDER BY id')).rows;
  if (players.length < 2) return res.status(400).json({ error: 'Need at least 2 players' });
  const ids = players.map(p => p.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const teamCap = Math.floor((2 / 3) * ids.length);
  await pool.query(
    `UPDATE config SET phase='draft', draft_order=$1, team_cap=$2, current_pick_index=0,
     pick_deadline = now() + interval '30 seconds' WHERE id=1`,
    [ids, teamCap]
  );
  res.json({ ok: true, draftOrder: ids, teamCap });
});

function computeTurn(cfg) {
  const n = cfg.draft_order.length;
  const total = n * cfg.rounds;
  if (cfg.current_pick_index >= total) return null;
  const round = Math.floor(cfg.current_pick_index / n);
  const posInRound = cfg.current_pick_index % n;
  const order = round % 2 === 0 ? cfg.draft_order : [...cfg.draft_order].reverse();
  return order[posInRound];
}

async function advancePick(client) {
  await client.query(
    `UPDATE config SET current_pick_index = current_pick_index + 1,
     pick_deadline = now() + interval '30 seconds' WHERE id=1`
  );
  const cfg = (await client.query('SELECT * FROM config WHERE id=1')).rows[0];
  const n = cfg.draft_order.length;
  if (cfg.current_pick_index >= n * cfg.rounds) {
    await client.query(`UPDATE config SET pick_deadline = NULL WHERE id=1`);
  }
}

async function availableTeamsFor(playerId) {
  const cfg = (await pool.query('SELECT team_cap FROM config WHERE id=1')).rows[0];
  const counts = (await pool.query('SELECT team, count(*) c FROM draft_picks GROUP BY team')).rows;
  const countMap = {};
  counts.forEach(r => { countMap[r.team] = Number(r.c); });
  const mine = (await pool.query('SELECT team FROM draft_picks WHERE player_id=$1', [playerId])).rows.map(r => r.team);
  return TEAMS.map(t => t.abbr).filter(abbr => (countMap[abbr] || 0) < cfg.team_cap && !mine.includes(abbr));
}

app.post('/api/draft/pick', requirePlayer, async (req, res) => {
  const { team } = req.body;
  const cfg = (await pool.query('SELECT * FROM config WHERE id=1')).rows[0];
  if (cfg.phase !== 'draft') return res.status(400).json({ error: 'Draft is not active' });
  const turnPlayerId = computeTurn(cfg);
  if (turnPlayerId !== req.player.id) return res.status(400).json({ error: "It's not your turn" });

  const available = await availableTeamsFor(req.player.id);
  if (!available.includes(team)) return res.status(400).json({ error: 'That team is not available' });

  await pool.query(
    'INSERT INTO draft_picks (player_id, team, pick_number) VALUES ($1,$2,$3)',
    [req.player.id, team, cfg.current_pick_index]
  );
  await advancePick(pool);
  res.json({ ok: true });
});

// Any connected client can call this while polling; it only acts if the
// clock has actually run out, so it's safe to call repeatedly/concurrently.
app.post('/api/draft/auto-check', async (req, res) => {
  const cfg = (await pool.query('SELECT * FROM config WHERE id=1')).rows[0];
  if (cfg.phase !== 'draft' || !cfg.pick_deadline) return res.json({ acted: false });
  if (new Date(cfg.pick_deadline).getTime() > Date.now()) return res.json({ acted: false });

  const turnPlayerId = computeTurn(cfg);
  if (!turnPlayerId) return res.json({ acted: false });
  const available = await availableTeamsFor(turnPlayerId);
  if (!available.length) return res.json({ acted: false });
  const team = available[Math.floor(Math.random() * available.length)];

  await pool.query(
    'INSERT INTO draft_picks (player_id, team, pick_number) VALUES ($1,$2,$3)',
    [turnPlayerId, team, cfg.current_pick_index]
  );
  await advancePick(pool);
  res.json({ acted: true, playerId: turnPlayerId, team });
});

app.post('/api/host/set-seventeenth', requireHost, async (req, res) => {
  const { team } = req.body;
  const cfg = (await pool.query('SELECT * FROM config WHERE id=1')).rows[0];
  const n = cfg.draft_order.length;
  if (cfg.current_pick_index < n * cfg.rounds) return res.status(400).json({ error: 'Draft is not finished yet' });
  await pool.query(
    `UPDATE config SET seventeenth_team=$1, phase='season', current_week=1 WHERE id=1`,
    [team]
  );
  res.json({ ok: true });
});

// ---------- weekly picks ----------
async function rosterFor(playerId, seventeenthTeam) {
  const drafted = (await pool.query('SELECT team FROM draft_picks WHERE player_id=$1', [playerId])).rows.map(r => r.team);
  if (seventeenthTeam) drafted.push(seventeenthTeam);
  return drafted;
}

app.get('/api/week/:week', requirePlayer, async (req, res) => {
  const week = Number(req.params.week);
  const cfg = (await pool.query('SELECT seventeenth_team FROM config WHERE id=1')).rows[0];
  const roster = await rosterFor(req.player.id, cfg.seventeenth_team);

  const usedPreviously = (await pool.query(
    'SELECT team FROM player_picks WHERE player_id=$1 AND week < $2', [req.player.id, week]
  )).rows.map(r => r.team);

  const odds = (await pool.query('SELECT team, opponent, spread, commence_time FROM weekly_odds WHERE week=$1', [week])).rows;
  const oddsMap = {};
  odds.forEach(o => { oddsMap[o.team] = o; });

  const remaining = roster.filter(t => !usedPreviously.includes(t)).map(t => ({
    team: t,
    isSeventeenth: t === cfg.seventeenth_team,
    odds: oddsMap[t] || null,
  }));

  const existing = (await pool.query('SELECT * FROM player_picks WHERE player_id=$1 AND week=$2', [req.player.id, week])).rows[0] || null;

  let canChange = false;
  if (existing && !existing.locked && !existing.change_used) {
    const o = oddsMap[existing.team];
    canChange = !o || !o.commence_time || new Date(o.commence_time).getTime() > Date.now();
  }

  res.json({ week, remainingTeams: remaining, existingPick: existing, canChange });
});

app.post('/api/picks', requirePlayer, async (req, res) => {
  const { week, team } = req.body;
  const cfg = (await pool.query('SELECT seventeenth_team, current_week FROM config WHERE id=1')).rows[0];
  if (week !== cfg.current_week) return res.status(400).json({ error: 'You can only pick for the current active week' });

  const roster = await rosterFor(req.player.id, cfg.seventeenth_team);
  if (!roster.includes(team)) return res.status(400).json({ error: 'That team is not on your roster' });

  const usedPreviously = (await pool.query(
    'SELECT team FROM player_picks WHERE player_id=$1 AND week < $2', [req.player.id, week]
  )).rows.map(r => r.team);
  if (usedPreviously.includes(team)) return res.status(400).json({ error: "You've already used that team this season" });

  const oddsRow = (await pool.query('SELECT commence_time FROM weekly_odds WHERE week=$1 AND team=$2', [week, team])).rows[0];
  if (oddsRow && oddsRow.commence_time && new Date(oddsRow.commence_time).getTime() <= Date.now()) {
    return res.status(400).json({ error: 'That game has already kicked off' });
  }

  const existing = (await pool.query('SELECT * FROM player_picks WHERE player_id=$1 AND week=$2', [req.player.id, week])).rows[0];

  if (!existing) {
    await pool.query(
      'INSERT INTO player_picks (player_id, week, team) VALUES ($1,$2,$3)',
      [req.player.id, week, team]
    );
    return res.json({ ok: true, changed: false });
  }

  if (existing.locked) return res.status(400).json({ error: 'This pick is locked and cannot be changed' });
  if (existing.change_used) return res.status(400).json({ error: "You've already used your one change for this week" });

  const prevOdds = (await pool.query('SELECT commence_time FROM weekly_odds WHERE week=$1 AND team=$2', [week, existing.team])).rows[0];
  if (prevOdds && prevOdds.commence_time && new Date(prevOdds.commence_time).getTime() <= Date.now()) {
    return res.status(400).json({ error: 'Your original pick has already kicked off; you can no longer change it' });
  }

  await pool.query(
    'UPDATE player_picks SET team=$1, change_used=true, submitted_at=now() WHERE id=$2',
    [team, existing.id]
  );
  res.json({ ok: true, changed: true });
});

// ---------- host: odds sync + week management ----------
app.post('/api/host/sync-odds', requireHost, async (req, res) => {
  const { week } = req.body;
  try {
    const n = await syncWeekOdds(week);
    res.json({ ok: true, rows: n });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/host/sync-results', requireHost, async (req, res) => {
  const { week } = req.body;
  try {
    const n = await syncWeekResults(week);
    res.json({ ok: true, rows: n });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/host/process-missed', requireHost, async (req, res) => {
  const { week } = req.body;
  const cfg = (await pool.query('SELECT seventeenth_team FROM config WHERE id=1')).rows[0];
  const players = (await pool.query('SELECT id FROM players')).rows;
  let assigned = 0, forfeited = 0;

  for (const p of players) {
    const existing = (await pool.query('SELECT id FROM player_picks WHERE player_id=$1 AND week=$2', [p.id, week])).rows[0];
    if (existing) continue;

    const usedSeventeenth = (await pool.query(
      'SELECT id FROM player_picks WHERE player_id=$1 AND team=$2', [p.id, cfg.seventeenth_team]
    )).rows.length > 0;

    if (!usedSeventeenth) {
      await pool.query(
        'INSERT INTO player_picks (player_id, week, team, auto_assigned, locked, change_used) VALUES ($1,$2,$3,true,true,true)',
        [p.id, week, cfg.seventeenth_team]
      );
      assigned++;
    } else {
      await pool.query(
        'INSERT INTO player_picks (player_id, week, team, auto_assigned, locked, change_used) VALUES ($1,$2,$3,true,true,true)',
        [p.id, week, 'FORFEIT']
      );
      await pool.query(
        `INSERT INTO weekly_results (week, team, result) VALUES ($1,'FORFEIT','L')
         ON CONFLICT (week, team) DO UPDATE SET result='L'`,
        [week]
      );
      forfeited++;
    }
  }
  res.json({ ok: true, assigned, forfeited });
});

app.post('/api/host/advance-week', requireHost, async (req, res) => {
  await pool.query('UPDATE config SET current_week = current_week + 1 WHERE id=1');
  const cfg = (await pool.query('SELECT current_week FROM config WHERE id=1')).rows[0];
  res.json({ ok: true, currentWeek: cfg.current_week });
});

// ---------- scoreboard ----------
app.get('/api/scoreboard', async (req, res) => {
  const players = (await pool.query('SELECT id, name FROM players ORDER BY id')).rows;
  const cfg = (await pool.query('SELECT seventeenth_team FROM config WHERE id=1')).rows[0];

  const picks = (await pool.query('SELECT player_id, week, team FROM player_picks')).rows;
  const picksByPlayer = {};
  picks.forEach(p => {
    if (!picksByPlayer[p.player_id]) picksByPlayer[p.player_id] = [];
    picksByPlayer[p.player_id].push({ week: p.week, team: p.team });
  });

  const oddsRows = (await pool.query('SELECT week, team, opponent, spread, commence_time FROM weekly_odds')).rows;
  const oddsByWeek = {};
  oddsRows.forEach(o => {
    if (!oddsByWeek[o.week]) oddsByWeek[o.week] = {};
    oddsByWeek[o.week][o.team] = o;
  });

  const resultRows = (await pool.query('SELECT week, team, result FROM weekly_results')).rows;
  const resultsByWeek = {};
  resultRows.forEach(r => {
    if (!resultsByWeek[r.week]) resultsByWeek[r.week] = {};
    resultsByWeek[r.week][r.team] = r.result;
  });

  const board = computeScoreboard(players, picksByPlayer, oddsByWeek, resultsByWeek, cfg.seventeenth_team);
  res.json(board);
});

const PORT = process.env.PORT || 3000;
initSchema()
  .then(() => app.listen(PORT, () => console.log(`Gridiron Picks running on port ${PORT}`)))
  .catch(err => { console.error('Failed to init schema', err); process.exit(1); });

