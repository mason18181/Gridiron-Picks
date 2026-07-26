# Gridiron Picks

A custom fantasy-football pick'em league app: snake draft 16 NFL teams per
player, a shared 17th "worst team" pick, weekly picks scored against Vegas
spreads, loss streaks, and a live scoreboard.

## Deploying to Railway (one-time setup)

1. **Get the code onto GitHub.**
   - Create a new repository on github.com (e.g. `gridiron-picks`), and
     upload this whole folder to it (GitHub's web UI lets you drag-and-drop
     files if you don't want to use git on the command line — use "Add file
     → Upload files").
2. **Create a new Railway project.**
   - railway.app → New Project → Deploy from GitHub repo → pick the repo you
     just created.
3. **Add a Postgres database.**
   - In your Railway project, click "+ New" → Database → Add PostgreSQL.
     Railway automatically wires up a `DATABASE_URL` variable for your app
     service — you don't need to copy/paste it yourself.
4. **Set the two remaining environment variables on your app service** (not
   the database service): open your app service → Variables tab → add:
   - `ODDS_API_KEY` — your key from the-odds-api.com
   - `HOST_PASSWORD` — a password only you will use (pick anything private)
5. **Deploy.** Railway will build and deploy automatically. Once it's live,
   click the app service → Settings → Networking → "Generate Domain" to get
   a public URL. That URL is what you share with your league.
6. **Verify it's running:** open the URL — you should see the "Join the
   league" screen.

To ship code changes later, push/upload to the same GitHub repo — Railway
redeploys automatically.

## Running it

1. **Everyone registers** on the shared URL with a name + PIN (their own
   simple login, not the host password).
2. **You (host)** go to the Host tab, enter your host password to unlock
   controls, and click **Start draft** once everyone's joined. This
   randomizes draft order and sets the per-team draft cap automatically
   (⌊2/3 × player count⌋).
3. **Draft tab:** whoever's turn it is clicks a team from the bank; there's
   a 30-second clock — if it runs out, the app auto-assigns a random
   available team for them (any open browser tab polling the app will
   trigger this check, so it works even if that player stepped away).
4. Once all 16 rounds are done, go back to **Host → 17th team**, pick the
   shared "worst team" (or whatever team you've decided), and click **Lock
   in 17th team & start season**. This adds it to every player's roster and
   opens Week 1 picks.
5. **Each week, before games start:** Host tab → enter the week number →
   **Sync spreads for this week**. This pulls current Vegas spreads from
   the odds API and is what powers the matchup type (favorite / even /
   upset) and the point spread shown to players in the Picks tab.
6. **Players** go to **My Picks**, pick a roster team they expect to win,
   and submit. They can change it once, but not after that team's game has
   kicked off.
7. **After all of that week's games finish:** Host tab → same week number →
   **Sync final scores for this week**. This pulls results and the
   scoreboard updates automatically using the league's scoring rules.
8. **Anyone who never picked that week:** click **Auto-assign missed
   picks** — this gives them their (unused) 17th team automatically, or
   marks the week a forfeit loss if they'd already used it, per the
   league's rules.
9. Click **Advance to next week** to open picks for the following week, and
   repeat from step 5.

## Scoring rules implemented

- Correct favorite pick: **+1** · correct even matchup (spread < 4):
  **+1.5** · correct upset (spread ≥ 4, underdog wins): **+2**
- Incorrect favorite pick: **-0.5**, unless it's part of a loss streak
- 2+ consecutive losses (excluding the 17th team): **-1** per week from the
  2nd loss on (streak and favorite penalties never stack — -1 is the max
  loss in a week)
- The shared 17th team is always risk-free: a loss on it never costs points
  and never counts toward a streak; a win still scores normally
- Each roster team (including the 17th) can only be picked once per season

## Notes / limitations

- Odds and results are pulled **only when you click the sync buttons** —
  there's no background job polling constantly, to stay well within the
  free API tier and keep things predictable. Sync odds early in the week
  and results after Monday night.
- The free odds API plan (500 requests/month) is far more than this league
  needs — a weekly odds + results sync is ~2 requests/week.
- Player login is a simple name + PIN, stored in this app's own database —
  it's not tied to email or a real identity system, which is fine for a
  private friend league but don't reuse a sensitive password as a PIN.
