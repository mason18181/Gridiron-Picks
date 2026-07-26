// Computes each player's running score, week by week, applying the
// loss-streak and team-17 risk-free rules.
//
// picksByPlayer: { playerId: [{ week, team }, ...] }  (any order; we sort by week)
// oddsByWeek:    { week: { TEAM: { opponent, spread, commence_time } } }
// resultsByWeek: { week: { TEAM: 'W' | 'L' } }
function matchupType(spread) {
  if (spread === null || spread === undefined) return 'unknown';
  const abs = Math.abs(Number(spread));
  if (abs < 4) return 'even';
  return Number(spread) < 0 ? 'favorite' : 'upset';
}

function pointsForWin(type) {
  if (type === 'even') return 1.5;
  if (type === 'upset') return 2;
  return 1; // favorite or unknown treated as favorite-value
}

function computePlayerHistory(picks, oddsByWeek, resultsByWeek, seventeenthTeam) {
  const sorted = [...picks].sort((a, b) => a.week - b.week);
  let streak = 0;
  let total = 0;
  const rows = [];

  for (const pick of sorted) {
    const { week, team } = pick;
    const result = resultsByWeek[week] && resultsByWeek[week][team];
    const odds = oddsByWeek[week] && oddsByWeek[week][team];
    const spread = odds ? odds.spread : null;
    const type = matchupType(spread);
    const isTeam17 = seventeenthTeam && team === seventeenthTeam;

    if (!result) {
      rows.push({ week, team, status: 'pending', points: 0, matchupType: type });
      continue;
    }

    let points;
    if (result === 'W') {
      points = pointsForWin(type);
      if (!isTeam17) streak = 0;
    } else if (isTeam17) {
      points = 0; // risk-free pick, no penalty, streak untouched
    } else {
      streak += 1;
      if (streak >= 2) {
        points = -1;
      } else {
        points = type === 'favorite' ? -0.5 : 0;
      }
    }

    total += points;
    rows.push({ week, team, status: result, points, matchupType: type, streakAtPick: isTeam17 ? null : streak });
  }

  return { total, rows, currentStreak: streak };
}

function computeScoreboard(players, picksByPlayer, oddsByWeek, resultsByWeek, seventeenthTeam) {
  const entries = players.map(p => {
    const picks = picksByPlayer[p.id] || [];
    const { total, rows, currentStreak } = computePlayerHistory(picks, oddsByWeek, resultsByWeek, seventeenthTeam);
    return { playerId: p.id, name: p.name, total: Math.round(total * 100) / 100, rows, currentStreak };
  });

  entries.sort((a, b) => b.total - a.total);
  let rank = 0;
  let prevScore = null;
  entries.forEach((e, i) => {
    if (e.total !== prevScore) rank = i + 1;
    e.rank = rank;
    prevScore = e.total;
  });

  return entries;
}

module.exports = { computeScoreboard, computePlayerHistory, matchupType };
