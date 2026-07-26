// Static list of the 32 NFL teams. Keys match the abbreviations used by
// the-odds-api.com's team names are full names, so we keep a lookup both ways.
const TEAMS = [
  { abbr: 'BUF', name: 'Buffalo Bills' },
  { abbr: 'MIA', name: 'Miami Dolphins' },
  { abbr: 'NE', name: 'New England Patriots' },
  { abbr: 'NYJ', name: 'New York Jets' },
  { abbr: 'BAL', name: 'Baltimore Ravens' },
  { abbr: 'CIN', name: 'Cincinnati Bengals' },
  { abbr: 'CLE', name: 'Cleveland Browns' },
  { abbr: 'PIT', name: 'Pittsburgh Steelers' },
  { abbr: 'HOU', name: 'Houston Texans' },
  { abbr: 'IND', name: 'Indianapolis Colts' },
  { abbr: 'JAX', name: 'Jacksonville Jaguars' },
  { abbr: 'TEN', name: 'Tennessee Titans' },
  { abbr: 'DEN', name: 'Denver Broncos' },
  { abbr: 'KC', name: 'Kansas City Chiefs' },
  { abbr: 'LV', name: 'Las Vegas Raiders' },
  { abbr: 'LAC', name: 'Los Angeles Chargers' },
  { abbr: 'DAL', name: 'Dallas Cowboys' },
  { abbr: 'NYG', name: 'New York Giants' },
  { abbr: 'PHI', name: 'Philadelphia Eagles' },
  { abbr: 'WAS', name: 'Washington Commanders' },
  { abbr: 'CHI', name: 'Chicago Bears' },
  { abbr: 'DET', name: 'Detroit Lions' },
  { abbr: 'GB', name: 'Green Bay Packers' },
  { abbr: 'MIN', name: 'Minnesota Vikings' },
  { abbr: 'ATL', name: 'Atlanta Falcons' },
  { abbr: 'CAR', name: 'Carolina Panthers' },
  { abbr: 'NO', name: 'New Orleans Saints' },
  { abbr: 'TB', name: 'Tampa Bay Buccaneers' },
  { abbr: 'ARI', name: 'Arizona Cardinals' },
  { abbr: 'LAR', name: 'Los Angeles Rams' },
  { abbr: 'SF', name: 'San Francisco 49ers' },
  { abbr: 'SEA', name: 'Seattle Seahawks' },
];

const NAME_TO_ABBR = {};
TEAMS.forEach(t => { NAME_TO_ABBR[t.name] = t.abbr; });

// A few name variants the-odds-api has used historically, mapped to our abbr.
const ALIASES = {
  'Washington Football Team': 'WAS',
  'Oakland Raiders': 'LV',
  'San Diego Chargers': 'LAC',
  'St. Louis Rams': 'LAR',
};

function abbrForTeamName(name) {
  return NAME_TO_ABBR[name] || ALIASES[name] || null;
}

module.exports = { TEAMS, abbrForTeamName };
