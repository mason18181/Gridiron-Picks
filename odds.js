const { pool } = require('./db');
const { abbrForTeamName } = require('./teams');

const BASE = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl';
const PREFERRED_BOOKS = ['draftkings', 'fanduel', 'betmgm'];

function pickBookmaker(bookmakers) {
  if (!bookmakers || !bookmakers.length) return null;
  for (const key of PREFERRED_BOOKS) {
    const found = bookmakers.find(b => b.key === key);
    if (found) return found;
  }
  return bookmakers[0];
}

// Pulls current spreads for all upcoming NFL games and stores them tagged
// under the given league "week" number (the host decides which week these
// games belong to — the API itself doesn't label NFL week numbers).
// The odds endpoint returns every upcoming game it currently has lines
// for with no date filtering at all — if sportsbooks have posted lines
// further out than just the immediate week (which they sometimes do),
// those get returned right alongside this week's games. Restricting to a
// near-term window is what keeps a genuinely future game (or any other
// anomalous entry) from getting mislabeled as "this week."
async function syncWeekOdds(week) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error('ODDS_API_KEY is not set');

  const url = `${BASE}/odds?regions=us&markets=spreads&oddsFormat=american&apiKey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Odds API error ${res.status}: ${text}`);
  }
  const events = await res.json();

  // Scoped to the current NFL week's boundary (games run Thursday through
  // Monday), ending at the upcoming Monday regardless of which day this
  // actually runs on — not a fixed day-count, since 10 days from a
  // Tuesday reaches all the way into the following week's Thursday game.
  const now = new Date();
  const daysUntilMonday = (8 - now.getDay()) % 7; // getDay(): 0=Sun..6=Sat; Monday=1
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + daysUntilMonday);
  windowEnd.setHours(23, 59, 59, 999); // include all of Monday's games, even a late Monday Night kickoff
  const nowMs = now.getTime();
  const windowEndMs = windowEnd.getTime();
  const inWindow = events.filter(ev => {
    const t = new Date(ev.commence_time).getTime();
    return t >= nowMs && t <= windowEndMs;
  });
  const skippedFarFuture = events.length - inWindow.length;

  const rows = [];
  let noBookmaker = 0, noMarket = 0;
  const unmappedTeamNames = [];
  for (const ev of inWindow) {
    const book = pickBookmaker(ev.bookmakers);
    if (!book) { noBookmaker++; continue; }
    const market = book.markets.find(m => m.key === 'spreads');
    if (!market) { noMarket++; continue; }

    const homeAbbr = abbrForTeamName(ev.home_team);
    const awayAbbr = abbrForTeamName(ev.away_team);
    if (!homeAbbr) unmappedTeamNames.push(ev.home_team);
    if (!awayAbbr) unmappedTeamNames.push(ev.away_team);
    if (!homeAbbr || !awayAbbr) continue;

    for (const outcome of market.outcomes) {
      const abbr = abbrForTeamName(outcome.name);
      if (!abbr) continue;
      const opponent = abbr === homeAbbr ? awayAbbr : homeAbbr;
      rows.push({
        team: abbr,
        opponent,
        spread: outcome.point,
        commence_time: ev.commence_time,
      });
    }
  }

  for (const r of rows) {
    await pool.query(
      `INSERT INTO weekly_odds (week, team, opponent, spread, commence_time)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (week, team) DO UPDATE
       SET opponent = EXCLUDED.opponent, spread = EXCLUDED.spread, commence_time = EXCLUDED.commence_time`,
      [week, r.team, r.opponent, r.spread, r.commence_time]
    );
  }

  return {
    written: rows.length,
    diagnostics: {
      rawEventCount: events.length,
      windowStart: new Date(nowMs).toISOString(),
      windowEnd: new Date(windowEndMs).toISOString(),
      firstRawEvent: events[0] ? { commence_time: events[0].commence_time, matchup: `${events[0].away_team} @ ${events[0].home_team}` } : null,
      inWindowCount: inWindow.length,
      skippedFarFuture,
      noBookmaker,
      noMarket,
      unmappedTeamNames: [...new Set(unmappedTeamNames)],
    },
  };
}

// Pulls final scores for recently completed games and stores W/L per team
// under the given league week.
async function syncWeekResults(week) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error('ODDS_API_KEY is not set');

  const url = `${BASE}/scores/?daysFrom=3&apiKey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Odds API error ${res.status}: ${text}`);
  }
  const events = await res.json();

  let written = 0;
  for (const ev of events) {
    if (!ev.completed || !ev.scores) continue;
    const homeAbbr = abbrForTeamName(ev.home_team);
    const awayAbbr = abbrForTeamName(ev.away_team);
    if (!homeAbbr || !awayAbbr) continue;

    const homeScore = ev.scores.find(s => abbrForTeamName(s.name) === homeAbbr);
    const awayScore = ev.scores.find(s => abbrForTeamName(s.name) === awayAbbr);
    if (!homeScore || !awayScore) continue;

    const hs = Number(homeScore.score);
    const as = Number(awayScore.score);
    if (Number.isNaN(hs) || Number.isNaN(as) || hs === as) continue; // skip ties/incomplete

    const homeResult = hs > as ? 'W' : 'L';
    const awayResult = hs > as ? 'L' : 'W';

    await pool.query(
      `INSERT INTO weekly_results (week, team, result) VALUES ($1,$2,$3)
       ON CONFLICT (week, team) DO UPDATE SET result = EXCLUDED.result`,
      [week, homeAbbr, homeResult]
    );
    await pool.query(
      `INSERT INTO weekly_results (week, team, result) VALUES ($1,$2,$3)
       ON CONFLICT (week, team) DO UPDATE SET result = EXCLUDED.result`,
      [week, awayAbbr, awayResult]
    );
    written += 2;
  }
  return written;
}

module.exports = { syncWeekOdds, syncWeekResults };
