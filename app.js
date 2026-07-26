const { Pool } = require('pg');

// Railway injects DATABASE_URL automatically when you attach a Postgres plugin.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
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
      rounds INT NOT NULL DEFAULT 16
    );
    INSERT INTO config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

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
