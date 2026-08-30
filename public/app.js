let me = JSON.parse(localStorage.getItem('gp_me') || 'null');
let hostPw = sessionStorage.getItem('gp_host') || null;

let activeTab = 'home';           // normal-mode tab: home | picks | scoreboard | host
let draftMode = false;            // true while the player is inside the Draft/Players pages
let draftSubTab = 'draft';        // draft-mode tab: draft | players
let scoreboardSubTab = 'overview'; // scoreboard subtab: overview | history | analytics
let scoreboardHistoryFilter = 'all';

let pollTimer = null;
let draftSelection = null; // team the player has clicked but not yet submitted, in the live draft
let pickSelection = null;  // team the player has clicked but not yet submitted, in My Picks

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
  if (draftMode) draftSubTab = btn.dataset.tab;
  else activeTab = btn.dataset.tab;
  renderTab();
});

whoami.addEventListener('click', () => {
  if (!me) return;
  if (confirm('Switch player?')) {
    me = null;
    draftMode = false;
    localStorage.removeItem('gp_me');
    boot();
  }
});

function renderNav() {
  if (draftMode) {
    nav.innerHTML = `
      <button data-tab="draft">Draft</button>
      <button data-tab="players">Players</button>
      <button data-tab="host">Host</button>
    `;
  } else {
    nav.innerHTML = `
      <button data-tab="home">Home</button>
      <button data-tab="picks">My Picks</button>
      <button data-tab="scoreboard">Scoreboard</button>
      <button data-tab="host">Host</button>
    `;
  }
  const current = draftMode ? draftSubTab : activeTab;
  [...nav.querySelectorAll('button')].forEach(b => b.classList.toggle('active', b.dataset.tab === current));
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
  renderNav();
  clearInterval(pollTimer);

  if (draftMode) {
    if (draftSubTab === 'players') { renderPlayersPage(); pollTimer = setInterval(renderPlayersPage, 1000); }
    else if (draftSubTab === 'host') { renderDraftHostPage(); pollTimer = setInterval(renderDraftHostPage, 3000); }
    else { renderDraftPage(); pollTimer = setInterval(renderDraftPage, 1000); }
    return;
  }

  if (activeTab === 'home') { renderHome(); pollTimer = setInterval(renderHome, 3000); }
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

// ---------------- Home ----------------
async function renderHome() {
  await api('/api/draft/auto-check', { method: 'POST' }).catch(() => {});
  const state = await api('/api/state');

  const rosterCard = `
    <div class="card">
      <h2>League</h2>
      <h1>${state.phase === 'lobby' ? 'Waiting to draft' : state.phase === 'draft' ? 'Draft in progress' : `Season · Week ${state.currentWeek}`}</h1>
      <p class="muted">${state.players.length} player${state.players.length === 1 ? '' : 's'} joined</p>
      <div class="row">${state.players.map(p => `<span class="pill ${p.id === me.id ? 'gold' : ''}">${p.name}</span>`).join('')}</div>
      <div class="divider"></div>
      <button class="btn" id="enter-draft-btn" ${state.phase !== 'draft' ? 'disabled' : ''}>Enter Draft</button>
    </div>
  `;

  let bodyCard = '';
  if (state.phase === 'lobby') {
    bodyCard = `
      <div class="card">
        <h2>How this works</h2>
        <p class="muted">The host starts the draft once everyone's registered (Host tab). Once it begins, <b>Enter Draft</b> above lights up and takes you to the live draft. Then it's <b>My Picks</b> once the season starts, and check the <b>Scoreboard</b> any time.</p>
      </div>
    `;
  } else if (state.phase === 'draft') {
    bodyCard = `
      <div class="card">
        <h2>Draft is live</h2>
        <p class="muted">Click <b>Enter Draft</b> above to see who's on the clock, browse rosters, and make your picks.</p>
      </div>
    `;
  } else {
    bodyCard = `
      <div class="card">
        <h2>Season underway</h2>
        <p class="muted">The draft's done. Head to <b>My Picks</b> to submit this week's pick, or check the <b>Scoreboard</b> any time.</p>
      </div>
    `;
  }

  app.innerHTML = rosterCard + bodyCard;

  const enterBtn = document.getElementById('enter-draft-btn');
  if (enterBtn) {
    enterBtn.onclick = () => {
      if (state.phase !== 'draft') return;
      draftMode = true;
      draftSubTab = 'draft';
      draftSelection = null;
      renderTab();
    };
  }
}

// ---------------- Draft mode: shared clock bar ----------------
function lastPickHtml(state, nameById) {
  if (!state.draftPicks || !state.draftPicks.length) return '';
  const last = state.draftPicks[state.draftPicks.length - 1];
  const name = nameById[last.player_id] || '?';
  return `<div class="card"><h2>Last pick</h2><p class="muted" style="margin:0;"><b>${name}</b> took <b>${last.team}</b></p></div>`;
}

function draftClockBarHtml(state, nameById, draftDone) {
  const lastPick = lastPickHtml(state, nameById);
  if (draftDone) {
    return `${lastPick}<div class="card"><h2>Draft status</h2><p class="muted">All ${state.rounds} rounds are done. Waiting on the host to assign the shared 17th team.</p></div>`;
  }
  if (!state.draftKickedOff) {
    return `${lastPick}<div class="card"><h2>Draft status</h2><p class="muted">The draft is open — take a look at the board below. The host is finishing setup (the shared 17th team) and will kick off the clock shortly.</p></div>`;
  }
  if (!state.pickDeadline) return lastPick;
  const n = state.draftOrder.length;
  const turnName = nameById[state.currentTurnPlayerId] || '?';
  if (state.draftPaused) {
    return `
      ${lastPick}
      <div class="card">
        <div class="row" style="justify-content:space-between;align-items:center;">
          <div><span class="muted">On the clock:</span> <b>${turnName}</b>${state.currentTurnPlayerId === me.id ? ' <span class="pill gold">YOU</span>' : ''}</div>
          <div class="timer" style="color:var(--muted);">PAUSED</div>
        </div>
        <p class="muted" style="margin:8px 0 0;">Round ${Math.floor(state.currentPickIndex / n) + 1} of ${state.rounds} · Pick ${state.currentPickIndex + 1} of ${n * state.rounds} · the host has paused the draft</p>
      </div>
    `;
  }
  const secsLeft = Math.max(0, Math.round((new Date(state.pickDeadline).getTime() - Date.now()) / 1000));
  return `
    ${lastPick}
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:center;">
        <div><span class="muted">On the clock:</span> <b>${turnName}</b>${state.currentTurnPlayerId === me.id ? ' <span class="pill gold">YOU</span>' : ''}</div>
        <div class="timer">${secsLeft}s</div>
      </div>
      <p class="muted" style="margin:8px 0 0;">Round ${Math.floor(state.currentPickIndex / n) + 1} of ${state.rounds} · Pick ${state.currentPickIndex + 1} of ${n * state.rounds}</p>
    </div>
  `;
}

function exitDraftModeIfOver(state) {
  if (state.phase !== 'draft') {
    draftMode = false;
    activeTab = 'home';
    renderTab();
    return true;
  }
  return false;
}

// ---------------- Draft mode: Draft page ----------------
async function renderDraftPage() {
  await api('/api/draft/auto-check', { method: 'POST' }).catch(() => {});
  const state = await api('/api/state');
  if (exitDraftModeIfOver(state)) return;

  const n = state.draftOrder ? state.draftOrder.length : 0;
  const totalPicks = n * state.rounds;
  const draftDone = state.currentPickIndex >= totalPicks;

  const nameById = {};
  state.players.forEach(p => { nameById[p.id] = p.name; });

  const myTurn = !draftDone && state.draftKickedOff && !state.draftPaused && state.currentTurnPlayerId === me.id;
  if (!myTurn) draftSelection = null; // clear any stale selection once it's not your turn

  const draftedByMe = state.draftPicks.filter(p => p.player_id === me.id).map(p => p.team);

  const teamGrid = state.teams.map(t => {
    const full = t.drafted >= state.teamCap;
    const mine = draftedByMe.includes(t.abbr);
    const isSeventeenth = t.abbr === state.seventeenthTeam;
    const disabled = full || mine || !myTurn || isSeventeenth;
    const selected = draftSelection === t.abbr;
    return `
      <div class="team-card ${disabled && !isSeventeenth ? 'disabled' : ''} ${selected ? 'selected' : ''}" data-team="${t.abbr}" ${!disabled ? 'data-pickable="1"' : ''} ${isSeventeenth ? 'style="border-color:var(--gold);background:rgba(232,185,74,0.08);opacity:1;"' : ''}>
        <div class="team-abbr">${t.abbr}${isSeventeenth ? ' <span class="pill gold" style="font-size:9px;">EVERYONE\'S</span>' : ''}</div>
        <div class="team-meta">${t.name}</div>
        <div class="team-meta">${isSeventeenth ? 'Shared 17th team' : `${t.drafted}/${state.teamCap} drafted`}</div>
      </div>
    `;
  }).join('');

  app.innerHTML = draftClockBarHtml(state, nameById, draftDone) + (draftDone ? '' : `
    <div class="card">
      <h2>Team bank</h2>
      <p class="muted">${!state.draftKickedOff ? 'The draft is open, but the host hasn\'t kicked off the clock yet.' : state.draftPaused ? 'The draft is paused — hang tight.' : (myTurn ? (draftSelection ? `Selected <b>${draftSelection}</b> — click Submit to confirm.` : 'Your pick — click a team, then submit.') : 'Waiting for your turn.')}</p>
      <div class="team-grid">${teamGrid}</div>
      <div class="row" style="margin-top:14px;">
        <button class="btn" id="submit-draft-pick-btn" ${myTurn && draftSelection ? '' : 'disabled'}>Submit pick</button>
      </div>
      <div class="error" id="draft-err"></div>
    </div>
  `) + `
    <div class="card">
      <h2>Your picks so far</h2>
      <div class="row">${draftedByMe.length ? draftedByMe.map(t => `<span class="pill">${t}</span>`).join('') : '<span class="muted">None yet</span>'}</div>
    </div>
  `;

  app.querySelectorAll('.team-card[data-pickable="1"]').forEach(card => {
    card.addEventListener('click', () => {
      draftSelection = card.dataset.team;
      renderDraftPage();
    });
  });

  const submitBtn = document.getElementById('submit-draft-pick-btn');
  if (submitBtn && !submitBtn.disabled) {
    submitBtn.onclick = async () => {
      const errEl = document.getElementById('draft-err');
      try {
        await api('/api/draft/pick', { method: 'POST', body: { team: draftSelection } });
        draftSelection = null;
        renderDraftPage();
      } catch (e) { if (errEl) errEl.textContent = e.message; }
    };
  }
}

// ---------------- Draft mode: Players page ----------------
async function renderPlayersPage() {
  const state = await api('/api/state');
  if (exitDraftModeIfOver(state)) return;

  const n = state.draftOrder ? state.draftOrder.length : 0;
  const totalPicks = n * state.rounds;
  const draftDone = state.currentPickIndex >= totalPicks;

  const nameById = {};
  state.players.forEach(p => { nameById[p.id] = p.name; });

  const byPlayer = {};
  state.players.forEach(p => { byPlayer[p.id] = []; });
  state.draftPicks.forEach(pk => { if (byPlayer[pk.player_id]) byPlayer[pk.player_id].push(pk.team); });

  const rosterCards = state.players.map(p => `
    <div class="card">
      <h2>${p.name}${p.id === me.id ? ' <span class="pill gold" style="font-size:10px;">YOU</span>' : ''}</h2>
      <div class="row">${byPlayer[p.id].length ? byPlayer[p.id].map(t => `<span class="pill">${t}</span>`).join('') : '<span class="muted">No picks yet</span>'}</div>
    </div>
  `).join('');

  app.innerHTML = draftClockBarHtml(state, nameById, draftDone) + rosterCards;
}

// ---------------- Draft mode: Host page ----------------
// The host is very likely drafting too, so the "end draft" controls need to
// be reachable without ever leaving draft mode — this is a slimmed-down
// version of the full Host tab, focused on just that.
async function renderDraftHostPage() {
  if (!hostPw) {
    // The poll timer calls this every 3s regardless of login state — without
    // this guard, it was rebuilding the whole login form (wiping out
    // whatever password had been typed so far) on every tick.
    if (document.getElementById('host-pw')) return;
    app.innerHTML = `
      <div class="card" style="max-width:420px;margin:40px auto;">
        <h2>Host login</h2>
        <p class="muted">Enter the host password to access draft controls.</p>
        <div class="field"><label>Host password</label><input id="host-pw" type="password" /></div>
        <button class="btn secondary" id="host-login-btn">Unlock</button>
        <div class="error" id="host-login-err"></div>
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
        renderDraftHostPage();
      } catch (e) { err.textContent = e.message; }
    };
    return;
  }

  const state = await api('/api/state');
  if (exitDraftModeIfOver(state)) return;

  const n = state.draftOrder ? state.draftOrder.length : 0;
  const totalPicks = n * state.rounds;
  const draftDone = state.currentPickIndex >= totalPicks;

  app.innerHTML = `
    <div class="card">
      <h2>Draft host controls</h2>
      <p class="muted">Phase: <b>${state.phase}</b> · pick ${Math.min(state.currentPickIndex + 1, totalPicks)} of ${totalPicks}${draftDone ? ' · all rounds complete' : ''}${!state.draftKickedOff ? ' · <b style="color:var(--gold);">OPEN, NOT KICKED OFF</b>' : ''}${state.draftPaused ? ' · <b style="color:var(--gold);">PAUSED</b>' : ''}</p>
      <div class="row">
        <button class="btn secondary" id="pause-draft-btn" ${draftDone || !state.draftKickedOff ? 'disabled' : ''}>${state.draftPaused ? 'Resume draft' : 'Pause draft'}</button>
        <button class="btn secondary" id="restart-draft-btn">Start draft over</button>
        <button class="btn danger" id="cancel-draft-btn">Cancel draft</button>
      </div>
      <p class="muted" style="margin-top:6px;">"Start over" re-randomizes order and wipes all picks, but keeps drafting. "Cancel" abandons the draft entirely and returns everyone to the lobby.</p>
      <div class="error" id="draft-host-manage-err"></div>
    </div>
    <div class="card">
      <h2>17th team &amp; kickoff</h2>
      ${!state.draftKickedOff ? `
        <p class="muted">Everyone can see the draft board, but nobody can pick yet. Set the shared 17th team first — it's pulled out of the pool immediately — then kick off the clock when you're ready.</p>
        <div class="field"><label>17th team (shared / worst team)</label>
          <select id="seventeenth-select-pre">${state.teams.map(t => `<option value="${t.abbr}" ${state.seventeenthTeam === t.abbr ? 'selected' : ''}>${t.abbr} — ${t.name}</option>`).join('')}</select>
        </div>
        <div class="row">
          <button class="btn secondary" id="set-seventeenth-pre-btn">${state.seventeenthTeam ? `Change (currently ${state.seventeenthTeam})` : 'Set 17th team'}</button>
          <button class="btn" id="kickoff-draft-btn" ${state.seventeenthTeam ? '' : 'disabled'}>Kick off draft</button>
        </div>
        ${!state.seventeenthTeam ? '<p class="muted" style="margin-top:6px;">Set the 17th team before kicking off.</p>' : ''}
      ` : `
        <p class="muted">17th team: <b>${state.seventeenthTeam}</b> — already excluded from the pool, draft is live.</p>
      `}
      <div class="error" id="seventeenth-kickoff-err"></div>
      <div class="success" id="seventeenth-kickoff-ok"></div>
    </div>
    <div class="card">
      <h2>End draft &amp; assign 17th team</h2>
      <p class="muted">${draftDone ? "All rounds are done — start the season. This ends the draft for everyone and opens Week 1 picks." : 'Available once all rounds are complete.'}</p>
      ${state.seventeenthTeam
        ? `<button class="btn" id="set-seventeenth-btn" ${draftDone ? '' : 'disabled'}>End draft &amp; start season</button>`
        : `<div class="field"><label>17th team (shared / worst team)</label>
             <select id="seventeenth-select" ${draftDone ? '' : 'disabled'}>${state.teams.map(t => `<option value="${t.abbr}">${t.abbr} — ${t.name}</option>`).join('')}</select>
           </div>
           <button class="btn" id="set-seventeenth-btn" ${draftDone ? '' : 'disabled'}>End draft &amp; start season</button>`}
      <div class="error" id="draft-host-err"></div>
      <div class="success" id="draft-host-ok"></div>
    </div>
  `;

  const preSeventeenthBtn = document.getElementById('set-seventeenth-pre-btn');
  if (preSeventeenthBtn) {
    preSeventeenthBtn.onclick = async () => {
      const err = document.getElementById('seventeenth-kickoff-err');
      const ok = document.getElementById('seventeenth-kickoff-ok');
      const team = document.getElementById('seventeenth-select-pre').value;
      try {
        await api('/api/host/set-seventeenth-pre-draft', { method: 'POST', asHost: true, body: { team } });
        ok.textContent = `${team} set as the shared 17th team.`;
        err.textContent = '';
        renderDraftHostPage();
      } catch (e) { err.textContent = e.message; ok.textContent = ''; }
    };
  }
  const kickoffBtn = document.getElementById('kickoff-draft-btn');
  if (kickoffBtn) {
    kickoffBtn.onclick = async () => {
      const err = document.getElementById('seventeenth-kickoff-err');
      if (!confirm(`Kick off the draft? The clock starts immediately and ${state.seventeenthTeam} won't be pickable by anyone.`)) return;
      try {
        await api('/api/host/kickoff-draft', { method: 'POST', asHost: true });
        renderDraftHostPage();
      } catch (e) { err.textContent = e.message; }
    };
  }
  document.getElementById('pause-draft-btn').onclick = async () => {
    const err = document.getElementById('draft-host-manage-err');
    try {
      await api(state.draftPaused ? '/api/host/resume-draft' : '/api/host/pause-draft', { method: 'POST', asHost: true });
      renderDraftHostPage();
    } catch (e) { err.textContent = e.message; }
  };
  document.getElementById('restart-draft-btn').onclick = async () => {
    const err = document.getElementById('draft-host-manage-err');
    if (!confirm('Restart the draft? This re-randomizes the order and wipes every pick made so far. Players stay the same.')) return;
    try {
      await api('/api/host/restart-draft', { method: 'POST', asHost: true });
      renderDraftHostPage();
    } catch (e) { err.textContent = e.message; }
  };
  document.getElementById('cancel-draft-btn').onclick = async () => {
    const err = document.getElementById('draft-host-manage-err');
    if (!confirm("Cancel the draft entirely? This wipes every pick and returns everyone to the lobby. You'll need to start the draft again from scratch.")) return;
    try {
      await api('/api/host/discard-draft', { method: 'POST', asHost: true });
      renderDraftHostPage();
    } catch (e) { err.textContent = e.message; }
  };

  const btn = document.getElementById('set-seventeenth-btn');
  if (btn && !btn.disabled) {
    btn.onclick = async () => {
      const err = document.getElementById('draft-host-err');
      const ok = document.getElementById('draft-host-ok');
      const team = document.getElementById('seventeenth-select').value;
      try {
        await api('/api/host/set-seventeenth', { method: 'POST', asHost: true, body: { team } });
        ok.textContent = `Season started with ${team} as the shared 17th team.`;
        err.textContent = '';
      } catch (e) { err.textContent = e.message; ok.textContent = ''; }
    };
  }
}

// Formats an ISO kickoff time in Eastern Time (the app's canonical time zone), e.g. "Sun 9/14, 1:00 PM ET".
function formatKickoff(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' });
  const date = d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'America/New_York' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
  return `${weekday} ${date}, ${time} ET`;
}

// Days/hours/minutes remaining until kickoff. Returns null once it's kicked off.
function formatCountdown(iso) {
  if (!iso) return null;
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return null;
  const totalMin = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (days || hours) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return `Kicks off in ${parts.join(' ')}`;
}

// Splits a player's remaining-team options into favorite/even/upset columns
// (plus a trailing bucket for byes or games with no odds posted yet), sorted
// within each column by kickoff time ascending, then spread descending.
function groupPickOptions(teams) {
  const groups = { favorite: [], even: [], upset: [], other: [] };
  teams.forEach(t => {
    (groups[t.matchupType] || groups.other).push(t);
  });
  const cmp = (a, b) => {
    const at = a.odds && a.odds.commence_time ? new Date(a.odds.commence_time).getTime() : Infinity;
    const bt = b.odds && b.odds.commence_time ? new Date(b.odds.commence_time).getTime() : Infinity;
    if (at !== bt) return at - bt;
    const as = a.odds ? Number(a.odds.spread) : 0;
    const bs = b.odds ? Number(b.odds.spread) : 0;
    return bs - as;
  };
  Object.values(groups).forEach(g => g.sort(cmp));
  return groups;
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
  const disabledAll = !!existing && (existing.locked || existing.change_used);
  if (disabledAll) pickSelection = null;

  function pointsPillsHtml(t) {
    const correct = `<span class="pill win">+${t.correctPoints}</span>`;
    const incorrect = t.incorrectPoints < 0
      ? `<span class="pill loss">${t.incorrectPoints}</span>`
      : `<span class="pill">${t.incorrectPoints}</span>`;
    return `<div class="row" style="gap:6px;margin-top:6px;">${correct}${incorrect}</div>`;
  }

  function cardHtml(t) {
    const o = t.odds;
    const spreadTxt = o ? (Number(o.spread) < 0 ? `Favored by ${Math.abs(o.spread)}` : `Underdog by ${o.spread}`) : (t.bye ? 'Bye week' : 'Odds not posted yet');
    const isCurrent = existing && existing.team === t.team;
    const isSelected = pickSelection ? pickSelection === t.team : isCurrent;
    const clickable = !disabledAll && t.available;
    const countdown = o && !t.kicked ? formatCountdown(o.commence_time) : null;
    return `
      <div class="team-card ${!clickable ? 'disabled' : ''} ${isSelected ? 'selected' : ''}" data-team="${t.team}" ${clickable ? 'data-pickable="1"' : ''}>
        <div class="team-abbr">${t.team}${t.isSeventeenth ? ' <span class="pill gold" style="font-size:9px;">RISK-FREE</span>' : ''}</div>
        <div class="team-meta">${o ? `vs ${o.opponent}` : (t.bye ? 'No game this week' : 'No matchup posted')}</div>
        <div class="team-meta">${spreadTxt}${t.kicked ? ' · KICKED OFF' : ''}</div>
        ${o && o.commence_time ? `<div class="team-meta">${formatKickoff(o.commence_time)}</div>` : ''}
        ${countdown ? `<div class="team-meta">${countdown}</div>` : ''}
        ${pointsPillsHtml(t)}
      </div>
    `;
  }

  const groups = groupPickOptions(data.remainingTeams);
  const columns = [
    { label: 'Favorites', items: groups.favorite },
    { label: 'Even', items: groups.even },
    { label: 'Upsets', items: groups.upset },
    { label: 'Bye / TBD', items: groups.other },
  ].filter(c => c.items.length);

  const columnsHtml = columns.length
    ? `<div style="display:flex;gap:0;">${columns.map((c, i) => `
        <div style="flex:1;min-width:0;padding:0 14px;${i > 0 ? 'border-left:1px solid var(--line);' : ''}">
          <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">${c.label}</div>
          <div style="display:flex;flex-direction:column;gap:10px;">${c.items.map(cardHtml).join('')}</div>
        </div>
      `).join('')}</div>`
    : '<p class="muted">No roster teams left to pick — all used.</p>';

  let statusHtml, submitBtnHtml;
  if (!existing) {
    statusHtml = `<p class="muted">No pick submitted yet for Week ${week}.</p>`;
    submitBtnHtml = `<button class="btn" id="submit-pick-btn" ${pickSelection ? '' : 'disabled'}>Submit pick</button>`;
  } else if (disabledAll) {
    statusHtml = `<p class="success">Locked in: <b>${existing.team}</b>${existing.auto_assigned ? ' (auto-assigned)' : ''}${existing.change_used ? ' · change already used' : ''}</p>`;
    submitBtnHtml = `<button class="btn" id="submit-pick-btn" disabled>${existing.change_used ? 'Change already used' : 'Locked in'}</button>`;
  } else {
    const changing = pickSelection && pickSelection !== existing.team;
    statusHtml = changing
      ? `<p class="muted">Current pick: <b>${existing.team}</b>. You can only change your pick <b>once</b> — submitting will lock in <b>${pickSelection}</b> and you won't be able to change it again this week.</p>`
      : `<p class="success">Current pick: <b>${existing.team}</b> · you can change this once</p>`;
    submitBtnHtml = `<button class="btn" id="submit-pick-btn" ${changing ? '' : 'disabled'}>${changing ? 'Confirm change' : 'Submit pick'}</button>`;
  }

  app.innerHTML = `
    <div class="card">
      <h2>Week ${week} picks</h2>
      ${statusHtml}
      ${columnsHtml}
      <div class="row" style="margin-top:14px;">${submitBtnHtml}</div>
      <div class="error" id="pick-err"></div>
    </div>
  `;

  app.querySelectorAll('.team-card[data-pickable="1"]').forEach(card => {
    card.addEventListener('click', () => {
      pickSelection = card.dataset.team;
      renderPicks();
    });
  });

  const submitBtn = document.getElementById('submit-pick-btn');
  if (submitBtn && !submitBtn.disabled) {
    submitBtn.onclick = async () => {
      const errEl = document.getElementById('pick-err');
      try {
        await api('/api/picks', { method: 'POST', body: { week, team: pickSelection } });
        pickSelection = null;
        renderPicks();
      } catch (e) { errEl.textContent = e.message; }
    };
  }
}

// ---------------- Scoreboard ----------------
async function renderScoreboard() {
  const board = await api('/api/scoreboard');
  const subnavHtml = `
    <div class="row" style="margin-bottom:16px;">
      <button class="btn ${scoreboardSubTab === 'overview' ? '' : 'secondary'}" data-sb="overview">Overview</button>
      <button class="btn ${scoreboardSubTab === 'history' ? '' : 'secondary'}" data-sb="history">History</button>
      <button class="btn ${scoreboardSubTab === 'analytics' ? '' : 'secondary'}" data-sb="analytics">Analytics</button>
    </div>
  `;
  if (scoreboardSubTab === 'history') renderScoreboardHistory(board, subnavHtml);
  else if (scoreboardSubTab === 'analytics') renderScoreboardAnalytics(board, subnavHtml);
  else renderScoreboardOverview(board, subnavHtml);
}

function bindScoreboardSubnav() {
  app.querySelectorAll('[data-sb]').forEach(btn => {
    btn.onclick = () => { scoreboardSubTab = btn.dataset.sb; renderScoreboard(); };
  });
}

function renderScoreboardOverview(board, subnavHtml) {
  const rows = board.map(e => {
    const lw = e.lastWeekPoints;
    const lwHtml = lw == null
      ? '<span class="muted">—</span>'
      : `<span class="pill ${lw > 0 ? 'win' : lw < 0 ? 'loss' : ''}">${lw > 0 ? '+' : ''}${lw}</span>`;
    return `
      <tr class="${e.playerId === me.id ? 'me' : ''}">
        <td class="num">${e.rank}</td>
        <td>${e.name}</td>
        <td class="num">${e.total.toFixed(2)}</td>
        <td class="num">${lwHtml}</td>
        <td class="num">${e.currentStreak >= 2 ? `<span class="pill loss">${e.currentStreak}-loss streak</span>` : '—'}</td>
      </tr>
    `;
  }).join('');
  app.innerHTML = `
    <div class="card">
      <h2>Scoreboard</h2>
      ${subnavHtml}
      <table>
        <thead><tr><th>Rank</th><th>Player</th><th>Points</th><th>Last Week</th><th>Streak</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
  bindScoreboardSubnav();
}

function renderScoreboardHistory(board, subnavHtml) {
  const options = ['<option value="all">All players</option>']
    .concat(board.map(e => `<option value="${e.playerId}">${e.name}</option>`)).join('');

  const filtered = scoreboardHistoryFilter === 'all'
    ? board
    : board.filter(e => String(e.playerId) === String(scoreboardHistoryFilter));

  const flatRows = [];
  filtered.forEach(e => { e.rows.forEach(r => flatRows.push({ name: e.name, ...r })); });
  flatRows.sort((a, b) => a.week - b.week || a.name.localeCompare(b.name));

  const rowsHtml = flatRows.map(r => `
    <tr>
      <td>${r.name}</td>
      <td class="num">${r.week}</td>
      <td>${r.team}</td>
      <td>${r.status === 'pending' ? '<span class="muted">Pending</span>' : r.status === 'W' ? '<span class="pill win">W</span>' : '<span class="pill loss">L</span>'}</td>
      <td>${r.matchupType}</td>
      <td class="num">${r.status === 'pending' ? '—' : (r.points > 0 ? '+' : '') + r.points}</td>
    </tr>
  `).join('');

  app.innerHTML = `
    <div class="card">
      <h2>Scoreboard</h2>
      ${subnavHtml}
      <div class="field" style="max-width:240px;">
        <label>Filter by player</label>
        <select id="history-filter">${options}</select>
      </div>
      <table>
        <thead><tr><th>Player</th><th>Week</th><th>Team</th><th>Result</th><th>Matchup</th><th>Points</th></tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="6" class="muted">No picks yet.</td></tr>'}</tbody>
      </table>
    </div>
  `;
  const sel = document.getElementById('history-filter');
  sel.value = scoreboardHistoryFilter;
  sel.onchange = (e) => { scoreboardHistoryFilter = e.target.value; renderScoreboardHistory(board, subnavHtml); };
  bindScoreboardSubnav();
}

function renderScoreboardAnalytics(board, subnavHtml) {
  const weekSet = new Set();
  board.forEach(e => e.rows.forEach(r => { if (r.status !== 'pending') weekSet.add(r.week); }));
  const weeks = [...weekSet].sort((a, b) => a - b);

  const checkboxesHtml = board.map(e => `
    <label class="pill" style="cursor:pointer;">
      <input type="checkbox" class="analytics-player-cb" data-pid="${e.playerId}" checked style="margin-right:4px;vertical-align:middle;" />${e.name}
    </label>
  `).join(' ');

  app.innerHTML = `
    <div class="card">
      <h2>Scoreboard</h2>
      ${subnavHtml}
      <p class="muted">Cumulative points at the end of each week. Toggle players below.</p>
      <div class="row" style="margin-bottom:14px;">${checkboxesHtml}</div>
      ${weeks.length ? '<canvas id="analytics-chart" height="110"></canvas>' : '<p class="muted">No resolved weeks yet — the chart fills in once results start coming in.</p>'}
    </div>
  `;
  bindScoreboardSubnav();
  if (!weeks.length) return;

  const palette = ['#E8B94A', '#4A9B7F', '#C2493D', '#6E9BC2', '#B084CC', '#D98E4A', '#5FBF9F', '#E36F9E'];
  const datasets = board.map((e, i) => {
    let running = 0;
    const byWeek = {};
    e.rows.filter(r => r.status !== 'pending').forEach(r => { byWeek[r.week] = r.points; });
    const data = weeks.map(w => {
      if (byWeek[w] !== undefined) running += byWeek[w];
      return Math.round(running * 100) / 100;
    });
    const color = palette[i % palette.length];
    return {
      label: e.name,
      data,
      borderColor: color,
      backgroundColor: color,
      tension: 0.25,
      pointRadius: 3,
      datalabels: {
        color,
        align: i % 2 === 0 ? 'top' : 'bottom',
        offset: 4 + (i % 3) * 3,
        font: { size: 10, weight: '500' },
        formatter: v => v,
      },
    };
  });

  function draw() {
    const checked = new Set([...app.querySelectorAll('.analytics-player-cb:checked')].map(cb => cb.dataset.pid));
    const visibleDatasets = datasets.filter((d, i) => checked.has(String(board[i].playerId)));
    if (window._analyticsChart) window._analyticsChart.destroy();
    const ctx = document.getElementById('analytics-chart').getContext('2d');
    window._analyticsChart = new Chart(ctx, {
      type: 'line',
      data: { labels: weeks.map(w => `Wk ${w}`), datasets: visibleDatasets },
      plugins: [ChartDataLabels],
      options: {
        responsive: true,
        layout: { padding: { top: 20, bottom: 10 } },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#EDEAE3', boxWidth: 12, font: { size: 12 } },
          },
        },
        scales: {
          x: { ticks: { color: '#8AA098' }, grid: { color: '#263731' } },
          y: { ticks: { color: '#8AA098' }, grid: { color: '#263731' } },
        },
      },
    });
  }
  draw();
  app.querySelectorAll('.analytics-player-cb').forEach(cb => cb.onchange = draw);
}

// ---------------- Host admin ----------------
async function renderHostAdmin() {
  if (!hostPw) {
    app.innerHTML = `
      <div class="card" style="max-width:420px;margin:40px auto;">
        <h2>Host login</h2>
        <p class="muted">This password is set in the server's environment — only whoever knows it sees host controls. It's separate from any player's name/PIN.</p>
        <div class="field"><label>Host password</label><input id="host-pw" type="password" /></div>
        <button class="btn secondary" id="host-login-btn">Unlock host controls</button>
        <div class="error" id="host-login-err"></div>
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
      } catch (e) { err.textContent = e.message; }
    };
    return;
  }

  const state = await api('/api/state');
  let pendingRequests;
  try {
    pendingRequests = await api('/api/join-requests', { asHost: true });
  } catch (e) {
    hostPw = null;
    sessionStorage.removeItem('gp_host');
    renderHostAdmin();
    return;
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

  const draftDone = state.phase === 'draft' && state.draftOrder && state.draftOrder.length && state.currentPickIndex >= state.draftOrder.length * state.rounds;

  app.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:center;">
        <h2 style="margin:0;">Host controls</h2>
        <button class="btn secondary" id="host-logout-btn" style="padding:6px 12px;font-size:11px;">Lock</button>
      </div>
    </div>
    <div class="card">
      <h2>Pending join requests</h2>
      ${pendingHtml}
      <div class="error" id="join-req-err"></div>
    </div>
    <div class="card">
      <h2>Draft controls</h2>
      <p class="muted">Phase: <b>${state.phase}</b>${state.phase === 'draft' ? ` · pick ${state.currentPickIndex + 1}${!state.draftKickedOff ? ' · <b style="color:var(--gold);">OPEN, NOT KICKED OFF</b>' : ''}${state.draftPaused ? ' · <b style="color:var(--gold);">PAUSED</b>' : ''}` : ''}</p>
      <div class="row">
        <button class="btn" id="start-draft-btn" ${state.phase !== 'lobby' ? 'disabled' : ''}>Start draft (random order)</button>
        ${state.phase === 'draft' ? '<button class="btn danger" id="discard-draft-btn">Discard draft</button>' : ''}
      </div>
      ${state.phase === 'draft' ? '<p class="muted" style="margin-top:6px;">Discard wipes every pick made so far and returns everyone to the lobby. Set the 17th team and kick off the draft from the Draft tab\'s host page — pause/resume/restart controls are there too.</p>' : ''}
      <div class="divider"></div>
      ${state.seventeenthTeam ? `
        <p class="muted">17th team: <b>${state.seventeenthTeam}</b></p>
        <button class="btn" id="finish-season-btn" ${draftDone ? '' : 'disabled'}>Start season</button>
      ` : `
        <div class="field"><label>17th team (shared / worst team)</label>
          <select id="seventeenth-select">${state.teams.map(t => `<option value="${t.abbr}">${t.abbr} — ${t.name}</option>`).join('')}</select>
        </div>
        <button class="btn" id="set-seventeenth-btn">Lock in 17th team & start season</button>
      `}
      <div class="error" id="draft-admin-err"></div>
      <div class="success" id="draft-admin-ok"></div>
    </div>
    <div class="card">
      <h2>Weekly odds &amp; results</h2>
      <p class="muted">Current active week: <b>${state.currentWeek || '—'}</b></p>
      <p class="muted">Spreads sync, results sync, missed-pick handling, and the week advance now run automatically every <b>Tuesday at 8:00am ET</b>${state.lastAutoRun ? ' · last ran ' + state.lastAutoRun : ' · hasn\'t run yet'}. The buttons below are a manual override — use them only if you need to force a re-sync or the automation didn\'t fire.</p>
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

  document.getElementById('host-logout-btn').onclick = () => {
    hostPw = null;
    sessionStorage.removeItem('gp_host');
    renderHostAdmin();
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

  const finishSeasonBtn = document.getElementById('finish-season-btn');
  if (finishSeasonBtn) {
    finishSeasonBtn.onclick = async () => {
      const err = document.getElementById('draft-admin-err');
      const ok = document.getElementById('draft-admin-ok');
      if (!confirm(`Start the season with ${state.seventeenthTeam} as the shared 17th team? This can't be undone and opens Week 1 picks for everyone.`)) return;
      try {
        await api('/api/host/set-seventeenth', { method: 'POST', asHost: true, body: {} });
        ok.textContent = `Season started with ${state.seventeenthTeam} as the shared 17th team.`;
        err.textContent = '';
        renderHostAdmin();
      } catch (e) { err.textContent = e.message; ok.textContent = ''; }
    };
  }
  document.getElementById('start-draft-btn').onclick = async () => {
    const err = document.getElementById('draft-admin-err');
    if (!confirm('Start the draft now with a random order? Make sure everyone who should be in the league has already joined.')) return;
    try { await api('/api/host/start-draft', { method: 'POST', asHost: true }); renderHostAdmin(); }
    catch (e) { err.textContent = e.message; }
  };

  const discardBtn = document.getElementById('discard-draft-btn');
  if (discardBtn) {
    discardBtn.onclick = async () => {
      const err = document.getElementById('draft-admin-err');
      if (!confirm("Discard the draft entirely? This wipes every pick made so far and returns everyone to the lobby. You'll need to start the draft again from scratch.")) return;
      try {
        await api('/api/host/discard-draft', { method: 'POST', asHost: true });
        renderHostAdmin();
      } catch (e) { err.textContent = e.message; }
    };
  }

  const oldSetSeventeenthBtn = document.getElementById('set-seventeenth-btn');
  if (oldSetSeventeenthBtn) {
    oldSetSeventeenthBtn.onclick = async () => {
      const err = document.getElementById('draft-admin-err');
      const ok = document.getElementById('draft-admin-ok');
      const team = document.getElementById('seventeenth-select').value;
      if (!confirm(`End the draft and start the season with ${team} as the shared 17th team? This can't be undone and opens Week 1 picks for everyone.`)) return;
      try {
        await api('/api/host/set-seventeenth', { method: 'POST', asHost: true, body: { team } });
        ok.textContent = `Season started with ${team} as the shared 17th team.`;
        err.textContent = '';
      } catch (e) { err.textContent = e.message; ok.textContent = ''; }
    };
  }

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
    if (!confirm(`Auto-assign the 17th team (or a forfeit) to anyone who didn't pick for week ${week}? This locks their pick for that week.`)) return;
    try {
      const r = await api('/api/host/process-missed', { method: 'POST', asHost: true, body: { week } });
      ok.textContent = `Auto-assigned team 17 for ${r.assigned}, forfeited ${r.forfeited}.`; err.textContent = '';
    } catch (e) { err.textContent = e.message; ok.textContent = ''; }
  };

  document.getElementById('advance-week-btn').onclick = async () => {
    const err = document.getElementById('week-admin-err');
    const ok = document.getElementById('week-admin-ok');
    if (!confirm('Advance to the next week? Make sure this week\'s results are synced and missed picks are processed first.')) return;
    try {
      const r = await api('/api/host/advance-week', { method: 'POST', asHost: true });
      ok.textContent = `Now on week ${r.currentWeek}.`; err.textContent = '';
      renderHostAdmin();
    } catch (e) { err.textContent = e.message; ok.textContent = ''; }
  };
}

boot();
