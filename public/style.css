:root {
  --bg: #0B1210;
  --surface: #141F1B;
  --surface-2: #1B2924;
  --line: #263731;
  --gold: #E8B94A;
  --green: #4A9B7F;
  --text: #EDEAE3;
  --muted: #8AA098;
  --danger: #C2493D;
  --win: #4A9B7F;
  --radius: 10px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: 'Inter', sans-serif;
  min-height: 100vh;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--line);
  background: linear-gradient(180deg, #101815, #0B1210);
  flex-wrap: wrap;
  gap: 12px;
}

.brand {
  font-family: 'Oswald', sans-serif;
  font-weight: 700;
  letter-spacing: 0.08em;
  font-size: 20px;
}
.brand span { color: var(--gold); }

.nav { display: flex; gap: 6px; flex-wrap: wrap; }
.nav.hidden { display: none; }
.nav button {
  background: transparent;
  border: 1px solid var(--line);
  color: var(--muted);
  padding: 8px 14px;
  border-radius: 999px;
  font-family: 'Oswald', sans-serif;
  font-size: 13px;
  letter-spacing: 0.04em;
  cursor: pointer;
  text-transform: uppercase;
}
.nav button:hover { border-color: var(--gold); color: var(--text); }
.nav button.active { background: var(--gold); color: #1a1400; border-color: var(--gold); }

.whoami { font-size: 13px; color: var(--muted); }

main { max-width: 960px; margin: 0 auto; padding: 28px 20px 80px; }

h1, h2, h3 { font-family: 'Oswald', sans-serif; font-weight: 600; letter-spacing: 0.02em; margin: 0 0 12px; }
h1 { font-size: 26px; }
h2 { font-size: 18px; color: var(--gold); text-transform: uppercase; font-size: 14px; letter-spacing: 0.1em; margin-bottom: 16px; }

.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 20px;
  margin-bottom: 20px;
}

.field { margin-bottom: 12px; }
.field label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
input {
  width: 100%;
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--text);
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 14px;
}
input:focus { outline: none; border-color: var(--gold); }

button.btn {
  background: var(--gold);
  color: #1a1400;
  border: none;
  padding: 10px 18px;
  border-radius: 6px;
  font-family: 'Oswald', sans-serif;
  font-weight: 600;
  letter-spacing: 0.03em;
  cursor: pointer;
  font-size: 13px;
  text-transform: uppercase;
}
button.btn:hover { filter: brightness(1.08); }
button.btn.secondary { background: transparent; border: 1px solid var(--green); color: var(--green); }
button.btn.danger { background: var(--danger); color: white; }
button.btn:disabled { opacity: 0.4; cursor: not-allowed; }

.row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }

.pill {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
  background: var(--surface-2);
  border: 1px solid var(--line);
}
.pill.gold { color: var(--gold); border-color: var(--gold); }
.pill.win { color: var(--win); border-color: var(--win); }
.pill.loss { color: var(--danger); border-color: var(--danger); }

.team-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}
.team-card {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: border-color 0.15s;
}
.team-card:hover { border-color: var(--gold); }
.team-card.disabled { opacity: 0.35; cursor: not-allowed; }
.team-card.selected { border-color: var(--gold); background: rgba(232,185,74,0.08); }
.team-abbr { font-family: 'Oswald', sans-serif; font-weight: 700; font-size: 16px; }
.team-meta { font-size: 11px; color: var(--muted); margin-top: 4px; font-family: 'JetBrains Mono', monospace; }

table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--line); font-size: 14px; }
th { color: var(--muted); text-transform: uppercase; font-size: 11px; letter-spacing: 0.06em; }
td.num { font-family: 'JetBrains Mono', monospace; }
tr.me { background: rgba(232,185,74,0.06); }

.timer {
  font-family: 'JetBrains Mono', monospace;
  font-size: 28px;
  color: var(--gold);
}

.muted { color: var(--muted); font-size: 13px; }
.error { color: var(--danger); font-size: 13px; margin-top: 6px; }
.success { color: var(--green); font-size: 13px; margin-top: 6px; }

.divider { height: 1px; background: var(--line); margin: 18px 0; }
