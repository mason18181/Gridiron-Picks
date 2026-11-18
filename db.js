const { Pool } = require('pg');

// Railway injects DATABASE_URL automatically when you attach a Postgres plugin.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

// Without this, a background error on an IDLE connection in the pool (not
// one we're actively querying) crashes the whole Node process, regardless
// of try/catch anywhere else in the code — this is exactly what happens
// when Postgres briefly restarts ("the database system is starting up")
// and an idle client gets disconnected. Logging it here instead of
// leaving it unhandled is what keeps one transient DB blip from taking
// the entire app down.
pool.on('error', (err) => {
  console.error('Postgres pool emitted a background error (idle client) — not crashing the app for it:', err.message);
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      pin TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS config (
      id INT PRIMARY KEY DEFAULT 1,
      phase TEXT NOT NULL DEFAULT 'lobby', -- lobby | draft | season
      team_cap INT NOT NULL DEFAULT 0,
      current_week INT NOT NULL DEFAULT 1,
      seventeenth_team TEXT,
      draft_order INT[] DEFAULT '{}',
      current_pick_index INT NOT NULL DEFAULT 0,
      pick_deadline TIMESTAMPTZ,
      rounds INT NOT NULL DEFAULT 16,
      last_auto_run DATE,
      draft_paused BOOLEAN NOT NULL DEFAULT false,
      draft_kicked_off BOOLEAN NOT NULL DEFAULT false
    );
    INSERT INTO config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
    ALTER TABLE config ADD COLUMN IF NOT EXISTS last_auto_run DATE;
    ALTER TABLE config ADD COLUMN IF NOT EXISTS draft_paused BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE config ADD COLUMN IF NOT EXISTS draft_kicked_off BOOLEAN NOT NULL DEFAULT false;

    CREATE TABLE IF NOT EXISTS join_requests (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      pin TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | denied
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS draft_picks (
      id SERIAL PRIMARY KEY,
      player_id INT REFERENCES players(id),
      team TEXT NOT NULL,
      pick_number INT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS weekly_odds (
      week INT NOT NULL,
      team TEXT NOT NULL,
      opponent TEXT NOT NULL,
      spread NUMERIC NOT NULL, -- this team's own spread; negative = favored
      commence_time TIMESTAMPTZ,
      PRIMARY KEY (week, team)
    );

    CREATE TABLE IF NOT EXISTS weekly_results (
      week INT NOT NULL,
      team TEXT NOT NULL,
      result TEXT CHECK (result IN ('W','L')) NOT NULL,
      PRIMARY KEY (week, team)
    );

    -- A player who forfeits a week (no pick and the 17th team already used)
    -- loses one random unused team from their bank so they don't finish the
    -- season with more picks available than everyone else.
    CREATE TABLE IF NOT EXISTS removed_teams (
      player_id INT REFERENCES players(id),
      team TEXT NOT NULL,
      forfeit_week INT NOT NULL,
      PRIMARY KEY (player_id, team),
      UNIQUE (player_id, forfeit_week)
    );

    -- Final scores for every completed game, used for the matchup info pop-up
    -- (records and last-3 results are derived from these rows).
    CREATE TABLE IF NOT EXISTS game_results (
      week INT NOT NULL,
      team TEXT NOT NULL,
      opponent TEXT NOT NULL,
      team_score INT NOT NULL,
      opp_score INT NOT NULL,
      result TEXT CHECK (result IN ('W','L','T')) NOT NULL,
      PRIMARY KEY (week, team)
    );

    CREATE TABLE IF NOT EXISTS player_picks (
      id SERIAL PRIMARY KEY,
      player_id INT REFERENCES players(id),
      week INT NOT NULL,
      team TEXT NOT NULL,
      auto_assigned BOOLEAN NOT NULL DEFAULT false,
      locked BOOLEAN NOT NULL DEFAULT false,
      change_used BOOLEAN NOT NULL DEFAULT false,
      submitted_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (player_id, week)
    );
  `);
}

module.exports = { pool, initSchema };
