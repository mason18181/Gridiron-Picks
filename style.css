let me = JSON.parse(localStorage.getItem('gp_me') || 'null');
let hostPw = sessionStorage.getItem('gp_host') || null;
let activeTab = 'lobby';
let pollTimer = null;

const app = document.getElementById('app');
const nav = document.getElementById('nav');
const whoami = document.getElementById('whoami');

async function api(path, { method = 'GET', body, asHost = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (me) { headers['x-player-id'] = me.id; headers['x-player-pin'] = me.pin; }
  if (asHost && hostPw) headers['x-host-password'] = hostPw;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

nav.addEventListener('click', e => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  activeTab = btn.dataset.tab;
  renderTab();
});

whoami.addEventListener('click', () => {
  if (!me) return;
  if (confirm('Switch player?')) {
    me = null;
    localStorage.removeItem('gp_me');
    boot();
  }
});

function setNavActive() {
  [...nav.querySelectorAll('button')].forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
}

async function boot() {
  clearInterval(pollTimer);
  if (!me) {
    nav.classList.add('hidden');
    whoami.textContent = '';
    renderLoginGate();
    return;
  }
  nav.classList.remove('hidden');
  whoami.textContent = `${me.name} (switch)`;
  renderTab();
}

function renderTab() {
  setNavActive();
  clearInterval(pollTimer);
  if (activeTab === 'lobby') renderLobby();
  else if (activeTab === 'draft') { renderDraft(); pollTimer = setInterval(renderDraft, 3000); }
  else if (activeTab === 'picks') renderPicks();
  else if (activeTab === 'scoreboard') renderScoreboard();
  else if (activeTab === 'host') renderHostAdmin();
}

// ---------------- Login gate ----------------
function renderLoginGate() {
  app.innerHTML = `
    <div class="card" style="max-width:420px;margin:40px auto;">
      <h1>Enter the league</h1>
      <p class="muted">Type the name and PIN you play under. If that name isn't recognized yet, you'll get the option to request entry — the host approves new players.</p>
      <div class="field"><label>Name</label><input id="lg-name" placeholder="Your name" /></div>
      <div class="field"><label>PIN</label><input id="lg-pin" type="password" placeholder="4+ digits" /></div>
      <button class="btn" id="lg-go">Continue</button>
      <div class="error" id="lg-err"></div>
      <div class="success" id="lg-ok"></div>
    </div>
  `;
  const err = document.getElementById('lg-err');
  const ok = document.getElementById('lg-ok');

  document.getElementById('lg-go').onclick = async () => {
    err.textContent = ''; ok.textContent = '';
    const name = document.getElementById('lg-name').value.trim();
    const pin = document.getElementById('lg-pin').value.trim();
    if (!name || !pin) { err.textContent = 'Enter both a name and a PIN.'; return; }

    try {
      const res = await api('/api/login', { method: 'POST', body: { name, pin } });
      if (res.status === 'ok') {
        me = { id: res.player.id, name: res.player.name, pin };
        localStorage.setItem('gp_me', JSON.stringify(me));
        boot();
        return;
      }
      // Unrecognized name — confirm before submitting a join request.
      if (res.pendingRequest) {
        ok.textContent = "You've already got a request pending — wait for the host to approve it, then log in again with the same name and PIN.";
        return;
      }
      const proceed = confirm(`No account found for "${name}". Submit a request to join the league with this name and PIN? The host will need to approve it before you can log in.`);
      if (!proceed) return;
      await api('/api/join-request', { method: 'POST', body: { name, pin } });
      ok.textContent = 'Request sent — check back once the host approves it, then log in with the same name and PIN.';
    } catch (e) { err.textContent = e.message; }
  };
}

// ---------------- Lobby ----------------
async function renderLobby() {
  const state = await api('/api/state');
  app.innerHTML = `
    <div class="card">
      <h2>League</h2>
      <h1>${state.phase === 'lobby' ? 'Waiting to draft' : state.phase === 'draft' ? 'Draft in progress' : `Season · Week ${state.currentWeek}`}</h1>
      <p class="muted">${state.players.length} player${state.players.length === 1 ? '' : 's'} joined${state.teamCap ? ` · each team draftable by up to ${state.teamCap} player${state.teamCap === 1 ? '' : 's'}` : ''}</p>
      <div class="row">${state.players.map(p => `<span class="pill ${p.id === me.id ? 'gold' : ''}">${p.name}</span>`).join('')}</div>
    </div>
    <div class="card">
      <h2>How this works</h2>
      <p class="muted">The host starts the draft once everyone's registered (Host tab). Then head to the <b>Draft</b> tab when it's live, <b>My Picks</b> once the season starts, and check the <b>Scoreboard</b> any time.</p>
    </div>
  `;
}

// ---------------- Draft ----------------
async function renderDraft() {
  await api('/api/draft/auto-check', { method: 'POST' }).catch(() => {});
  const state = await api('/api/state');

  if (state.phase === 'lobby') {
    app.innerHTML = `<div class="card"><h1>Draft hasn't started</h1><p class="muted">Waiting on the host to start the draft from the Host tab.</p></div>`;
    return;
  }

  const n = state.draftOrder ? state.draftOrder.length : 0;
  const totalPicks = n * state.rounds;
  const draftDone = state.phase !== 'draft' || state.currentPickIndex >= totalPicks;

  const nameById = {};
  state.players.forEach(p => { nameById[p.id] = p.name; });

  let timerHtml = '';
  if (!draftDone && state.pickDeadline) {
    const secsLeft = Math.max(0, Math.round((new Date(state.pickDeadline).getTime() - Date.now()) / 1000));
    const turnName = nameById[state.currentTurnPlayerId] || '?';
    timerHtml = `
      <div class="row" style="justify-content:space-between;align-items:center;">
        <div><span class="muted">On the clock:</span> <b>${turnName}</b>${state.currentTurnPlayerId === me.id ? ' <span class="pill gold">YOU</span>' : ''}</div>
        <div class="timer">${secsLeft}s</div>
      </div>
      <p class="muted">Round ${Math.floor(state.currentPickIndex / n) + 1} of ${state.rounds} · Pick ${state.currentPickIndex + 1} of ${totalPicks}</p>
    `;
  }

  const myTurn = !draftDone && state.currentTurnPlayerId === me.id;
  const draftedByMe = state.draftPicks.filter(p => p.player_id === me.id).map(p => p.team);

  const teamGrid = state.teams.map(t => {
    const full = t.drafted >= state.teamCap;
    const mine = draftedByMe.includes(t.abbr);
    const disabled = full || mine || !myTurn;
    return `
      <div class="team-card ${disabled ? 'disabled' : ''}" data-team="${t.abbr}" ${disabled ? '' : 'data-pickable="1"'}>
        <div class="team-abbr">${t.abbr}</div>
        <div class="team-meta">${t.name}</div>
        <div class="team-meta">${t.drafted}/${state.teamCap} drafted</div>
      </div>
    `;
  }).join('');

  app.innerHTML = `
    <div class="card">
      <h2>${draftDone ? 'Draft complete' : 'Live draft'}</h2>
      ${draftDone ? `<p class="muted">All 16 rounds are done. Waiting on the host to assign the shared 17th team.</p>` : timerHtml}
    </div>
    ${!draftDone ? `
    <div class="card">
      <h2>Team bank</h2>
      <p class="muted">${myTurn ? 'Your pick — click a team.' : 'Waiting for your turn.'}</p>
      <div class="team-grid">${teamGrid}</div>
      <div class="error" id="draft-err"></div>
    </div>` : ''}
    <div class="card">
      <h2>Your picks so far</h2>
      <div class="row">${draftedByMe.length ? draftedByMe.map(t => `<span class="pill">${t}</span>`).join('') : '<span class="muted">None yet</span>'}</div>
    </div>
  `;

  app.querySelectorAll('.team-card[data-pickable="1"]').forEach(card => {
    card.addEventListener('click', async () => {
      const team = card.dataset.team;
      const errEl = document.getElementById('draft-err');
      try {
        await api('/api/draft/pick', { method: 'POST', body: { team } });
        renderDraft();
      } catch (e) { if (errEl) errEl.textContent = e.message; }
    });
  });
}

// ---------------- Weekly picks ----------------
async function renderPicks() {
  const state = await api('/api/state');
  if (state.phase !== 'season') {
    app.innerHTML = `<div class="card"><h1>Season hasn't started</h1><p class="muted">Picks open once the draft is complete and the host locks in the 17th team.</p></div>`;
    return;
  }
  const week = state.currentWeek;
  const data = await api(`/api/week/${week}`);

  const existing = data.existingPick;
  const rows = data.remainingTeams.map(t => {
    const o = t.odds;
    const spreadTxt = o ? (Number(o.spread) < 0 ? `Favored by ${Math.abs(o.spread)}` : `Underdog by ${o.spread}`) : 'Odds not posted yet';
    const kicked = o && o.commence_time && new Date(o.commence_time).getTime() <= Date.now();
    const isCurrent = existing && existing.team === t.team;
    const disabled = !!existing && (existing.locked || existing.change_used || kicked) && !isCurrent;
    return `
      <div class="team-card ${disabled ? 'disabled' : ''} ${isCurrent ? 'selected' : ''}" data-team="${t.team}" ${disabled ? '' : 'data-pickable="1"'}>
        <div class="team-abbr">${t.team}${t.isSeventeenth ? ' <span class="pill gold" style="font-size:9px;">RISK-FREE</span>' : ''}</div>
        <div class="team-meta">${o ? `vs ${o.opponent}` : 'No matchup posted'}</div>
        <div class="team-meta">${spreadTxt}${kicked ? ' · KICKED OFF' : ''}</div>
      </div>
    `;
  }).join('');

  let statusHtml = '';
  if (existing) {
    statusHtml = `<p class="success">Current pick: <b>${existing.team}</b>${existing.auto_assigned ? ' (auto-assigned)' : ''}${existing.change_used ? ' · change already used' : data.canChange ? ' · you can change this once' : ''}</p>`;
  } else {
    statusHtml = `<p class="muted">No pick submitted yet for Week ${week}.</p>`;
  }

  app.innerHTML = `
    <div class="card">
      <h2>Week ${week} picks</h2>
      ${statusHtml}
      <div class="team-grid">${rows || '<p class="muted">No roster teams left to pick — all used.</p>'}</div>
      <div class="error" id="pick-err"></div>
    </div>
  `;

  app.querySelectorAll('.team-card[data-pickable="1"]').forEach(card => {
    card.addEventListener('click', async () => {
      const team = card.dataset.team;
      if (existing && !confirm('You can only change your pick once this week, and not after that team kicks off. Continue?')) return;
      const errEl = document.getElementById('pick-err');
      try {
        await api('/api/picks', { method: 'POST', body: { week, team } });
        renderPicks();
      } catch (e) { errEl.textContent = e.message; }
    });
  });
}

// ---------------- Scoreboard ----------------
async function renderScoreboard() {
  const board = await api('/api/scoreboard');
  const rows = board.map(e => `
    <tr class="${e.playerId === me.id ? 'me' : ''}">
      <td class="num">${e.rank}</td>
      <td>${e.name}</td>
      <td class="num">${e.total.toFixed(2)}</td>
      <td class="num">${e.currentStreak >= 2 ? `<span class="pill loss">${e.currentStreak}-loss streak</span>` : '—'}</td>
    </tr>
  `).join('');
  app.innerHTML = `
    <div class="card">
      <h2>Scoreboard</h2>
      <table>
        <thead><tr><th>Rank</th><th>Player</th><th>Points</th><th>Streak</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// ---------------- Host admin ----------------
async function renderHostAdmin() {
  const state = await api('/api/state');
  let pendingRequests = [];
  if (hostPw) {
    try { pendingRequests = await api('/api/join-requests', { asHost: true }); }
    catch (e) { hostPw = null; sessionStorage.removeItem('gp_host'); }
  }

  const pendingHtml = pendingRequests.length
    ? pendingRequests.map(r => `
        <div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding:8px 0;">
          <span>${r.name}</span>
          <span class="row">
            <button class="btn" data-approve="${r.id}">Approve</button>
            <button class="btn danger" data-deny="${r.id}">Deny</button>
          </span>
        </div>`).join('')
    : '<p class="muted">No pending requests.</p>';

  app.innerHTML = `
    <div class="card">
      <h2>Host login</h2>
      <p class="muted">This password is set in the server's environment — only whoever knows it sees host controls. It's separate from any player's name/PIN.</p>
      <div class="field"><label>Host password</label><input id="host-pw" type="password" value="${hostPw ? hostPw : ''}" /></div>
      <button class="btn secondary" id="host-login-btn">Unlock host controls</button>
      <div class="error" id="host-login-err"></div>
    </div>
    ${hostPw ? `
    <div class="card">
      <h2>Pending join requests</h2>
      ${pendingHtml}
      <div class="error" id="join-req-err"></div>
    </div>` : ''}
    <div class="card">
      <h2>Draft controls</h2>
      <p class="muted">Phase: <b>${state.phase}</b>${state.phase === 'draft' ? ` · pick ${state.currentPickIndex + 1}` : ''}</p>
      <div class="row">
        <button class="btn" id="start-draft-btn" ${state.phase !== 'lobby' ? 'disabled' : ''}>Start draft (random order)</button>
      </div>
      <div class="divider"></div>
      <div class="field"><label>17th team (shared / worst team)</label>
        <select id="seventeenth-select">${state.teams.map(t => `<option value="${t.abbr}">${t.abbr} — ${t.name}</option>`).join('')}</select>
      </div>
      <button class="btn" id="set-seventeenth-btn">Lock in 17th team & start season</button>
      <div class="error" id="draft-admin-err"></div>
      <div class="success" id="draft-admin-ok"></div>
    </div>
    <div class="card">
      <h2>Weekly odds &amp; results</h2>
      <p class="muted">Current active week: <b>${state.currentWeek || '—'}</b></p>
      <div class="field"><label>Week number</label><input id="week-num" type="number" value="${state.currentWeek || 1}" /></div>
      <div class="row">
        <button class="btn secondary" id="sync-odds-btn">Sync spreads for this week</button>
        <button class="btn secondary" id="sync-results-btn">Sync final scores for this week</button>
      </div>
      <div class="divider"></div>
      <div class="row">
        <button class="btn secondary" id="process-missed-btn">Auto-assign missed picks</button>
        <button class="btn" id="advance-week-btn">Advance to next week</button>
      </div>
      <div class="error" id="week-admin-err"></div>
      <div class="success" id="week-admin-ok"></div>
    </div>
  `;

  document.getElementById('host-login-btn').onclick = async () => {
    const pw = document.getElementById('host-pw').value;
    const err = document.getElementById('host-login-err');
    err.textContent = '';
    try {
      const headers = { 'Content-Type': 'application/json', 'x-host-password': pw };
      const res = await fetch('/api/host/login', { method: 'POST', headers });
      if (!res.ok) throw new Error((await res.json()).error || 'Wrong password');
      hostPw = pw;
      sessionStorage.setItem('gp_host', pw);
      renderHostAdmin();
    } catch (e) { err.className = 'error'; err.textContent = e.message; }
  };

  app.querySelectorAll('[data-approve]').forEach(btn => {
    btn.onclick = async () => {
      const err = document.getElementById('join-req-err');
      try { await api(`/api/host/join-requests/${btn.dataset.approve}/approve`, { method: 'POST', asHost: true }); renderHostAdmin(); }
      catch (e) { err.textContent = e.message; }
    };
  });
  app.querySelectorAll('[data-deny]').forEach(btn => {
    btn.onclick = async () => {
      const err = document.getElementById('join-req-err');
      try { await api(`/api/host/join-requests/${btn.dataset.deny}/deny`, { method: 'POST', asHost: true }); renderHostAdmin(); }
      catch (e) { err.textContent = e.message; }
    };
  });

  document.getElementById('start-draft-btn').onclick = async () => {
    const err = document.getElementById('draft-admin-err');
    try { await api('/api/host/start-draft', { method: 'POST', asHost: true }); renderHostAdmin(); }
    catch (e) { err.textContent = e.message; }
  };

  document.getElementById('set-seventeenth-btn').onclick = async () => {
    const err = document.getElementById('draft-admin-err');
    const ok = document.getElementById('draft-admin-ok');
    const team = document.getElementById('seventeenth-select').value;
    try {
      await api('/api/host/set-seventeenth', { method: 'POST', asHost: true, body: { team } });
      ok.textContent = `Season started with ${team} as the shared 17th team.`;
      err.textContent = '';
    } catch (e) { err.textContent = e.message; ok.textContent = ''; }
  };

  document.getElementById('sync-odds-btn').onclick = async () => {
    const err = document.getElementById('week-admin-err');
    const ok = document.getElementById('week-admin-ok');
    const week = Number(document.getElementById('week-num').value);
    try {
      const r = await api('/api/host/sync-odds', { method: 'POST', asHost: true, body: { week } });
      ok.textContent = `Synced spreads for ${r.rows} teams.`; err.textContent = '';
    } catch (e) { err.textContent = e.message; ok.textContent = ''; }
  };

  document.getElementById('sync-results-btn').onclick = async () => {
    const err = document.getElementById('week-admin-err');
    const ok = document.getElementById('week-admin-ok');
    const week = Number(document.getElementById('week-num').value);
    try {
      const r = await api('/api/host/sync-results', { method: 'POST', asHost: true, body: { week } });
      ok.textContent = `Synced results for ${r.rows} teams.`; err.textContent = '';
    } catch (e) { err.textContent = e.message; ok.textContent = ''; }
  };

  document.getElementById('process-missed-btn').onclick = async () => {
    const err = document.getElementById('week-admin-err');
    const ok = document.getElementById('week-admin-ok');
    const week = Number(document.getElementById('week-num').value);
    try {
      const r = await api('/api/host/process-missed', { method: 'POST', asHost: true, body: { week } });
      ok.textContent = `Auto-assigned team 17 for ${r.assigned}, forfeited ${r.forfeited}.`; err.textContent = '';
    } catch (e) { err.textContent = e.message; ok.textContent = ''; }
  };

  document.getElementById('advance-week-btn').onclick = async () => {
    const err = document.getElementById('week-admin-err');
    const ok = document.getElementById('week-admin-ok');
    try {
      const r = await api('/api/host/advance-week', { method: 'POST', asHost: true });
      ok.textContent = `Now on week ${r.currentWeek}.`; err.textContent = '';
      renderHostAdmin();
    } catch (e) { err.textContent = e.message; ok.textContent = ''; }
  };
}

boot();
