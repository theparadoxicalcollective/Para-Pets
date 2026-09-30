import { sql } from "drizzle-orm";

interface VeridianWatcherBackgroundJobDependencies {
  db: any;
  storage: any;
  postWatcherMessage: (message: string) => Promise<void>;
}

const VW_QUOTE_INTERVAL_MS = 60 * 60 * 1000;
const LEADERBOARD_CHECK_MS = 10 * 60 * 1000;
const PVP_LEADERBOARD_CHECK_MS = 5 * 60 * 1000;

export function startVeridianWatcherBackgroundJobs({
  db,
  storage,
  postWatcherMessage,
}: VeridianWatcherBackgroundJobDependencies): void {
  setInterval(async () => {
    try {
      const quotes = await storage.getVWQuotes();
      if (quotes.length === 0) return;
      const pick = quotes[Math.floor(Math.random() * quotes.length)];
      await postWatcherMessage(`𖢻 ${pick.message}`);
    } catch (err) {
      console.error("[VW] Quote error:", err);
    }
  }, VW_QUOTE_INTERVAL_MS);

  let hubLbSnapshot = new Map<string, number>();
  let fishingLbSnapshot = new Map<string, number>();
  let moltenLbSnapshot = new Map<string, number>();
  let lavaLbSnapshot = new Map<string, number>();
  let leaderboardPrimed = false;
  let leaderboardMonitorRunning = false;

  async function shoutoutEligible(userId: string): Promise<boolean> {
    const result: any = await db.execute(sql`
      SELECT watcher_shoutouts_enabled FROM users WHERE id = ${userId}
    `);
    const row = ((result.rows ?? result) as any[])[0];
    return row?.watcher_shoutouts_enabled !== false;
  }

  async function checkLeaderboardRanks(): Promise<void> {
    if (leaderboardMonitorRunning) return;
    leaderboardMonitorRunning = true;
    try {
      const hubRows: any = await db.execute(sql`
        SELECT cp.user_id AS user_id, u.username
        FROM coin_purchases cp
        JOIN users u ON cp.user_id = u.id
        WHERE u.is_admin = false AND u.is_bot = false
        GROUP BY cp.user_id, u.username
        ORDER BY SUM(cp.amount_usd) DESC
        LIMIT 5
      `);
      const hubTop = ((hubRows.rows ?? hubRows) as any[]).map((r: any, i: number) => ({
        userId: r.user_id as string,
        username: r.username as string,
        rank: i + 1,
      }));

      const fishRows: any = await db.execute(sql`
        SELECT fl.user_id AS user_id, u.username, SUM(fl.points) AS total_pts
        FROM fishing_leaderboard fl
        JOIN users u ON u.id = fl.user_id
        WHERE fl.points > 0 AND u.is_bot = false
        GROUP BY fl.user_id, u.username
        ORDER BY SUM(fl.points) DESC
        LIMIT 5
      `);
      const fishTop = ((fishRows.rows ?? fishRows) as any[]).map((r: any, i: number) => ({
        userId: r.user_id as string,
        username: r.username as string,
        rank: i + 1,
      }));

      const moltenRows: any = await db.execute(sql`
        SELECT id AS user_id, username
        FROM users
        WHERE molten_blocks_high_score > 0 AND is_bot = false AND is_admin = false
        ORDER BY molten_blocks_high_score DESC
        LIMIT 5
      `);
      const moltenTop = ((moltenRows.rows ?? moltenRows) as any[]).map((r: any, i: number) => ({
        userId: r.user_id as string,
        username: r.username as string,
        rank: i + 1,
      }));

      const lavaRows: any = await db.execute(sql`
        SELECT s.user_id AS user_id, u.username, MAX(s.score) AS best_score
        FROM lava_crawl_scores s
        JOIN users u ON s.user_id = u.id
        WHERE u.is_bot = false
        GROUP BY s.user_id, u.username
        ORDER BY MAX(s.score) DESC
        LIMIT 5
      `);
      const lavaTop = ((lavaRows.rows ?? lavaRows) as any[]).map((r: any, i: number) => ({
        userId: r.user_id as string,
        username: r.username as string,
        rank: i + 1,
      }));

      if (leaderboardPrimed) {
        const boards = [
          { top: hubTop, prev: hubLbSnapshot, boardName: "the Hall of Founders" },
          { top: fishTop, prev: fishingLbSnapshot, boardName: "the Fishing Leaderboard" },
          { top: moltenTop, prev: moltenLbSnapshot, boardName: "the Molten Blocks Leaderboard" },
          { top: lavaTop, prev: lavaLbSnapshot, boardName: "the Lava Crawl Leaderboard" },
        ];

        for (const { top, prev, boardName } of boards) {
          for (const entry of top) {
            if (entry.rank > 3) continue;
            const prevRank = prev.get(entry.username);
            if (prevRank !== undefined && prevRank <= 3 && prevRank === entry.rank) continue;
            if (!(await shoutoutEligible(entry.userId))) continue;
            await postWatcherMessage(
              `☆ ${entry.username} has reached rank #${entry.rank} on ${boardName}! A new champion rises!`,
            );
          }
        }
      }

      hubLbSnapshot = new Map(hubTop.map((entry) => [entry.username, entry.rank]));
      fishingLbSnapshot = new Map(fishTop.map((entry) => [entry.username, entry.rank]));
      moltenLbSnapshot = new Map(moltenTop.map((entry) => [entry.username, entry.rank]));
      lavaLbSnapshot = new Map(lavaTop.map((entry) => [entry.username, entry.rank]));
      leaderboardPrimed = true;
    } catch (err) {
      console.error("[VW] Leaderboard rank monitor error:", err);
    } finally {
      leaderboardMonitorRunning = false;
    }
  }

  void checkLeaderboardRanks();
  setInterval(() => {
    void checkLeaderboardRanks();
  }, LEADERBOARD_CHECK_MS);

  let pvpRankSnapshot = new Map<string, number>();
  let pvpLeaderboardPrimed = false;
  let pvpMonitorRunning = false;

  setInterval(async () => {
    if (pvpMonitorRunning) return;
    pvpMonitorRunning = true;
    try {
      const leaderboard = await storage.getPvpLeaderboard(20);
      const currentSnapshot = new Map<string, number>();
      leaderboard.forEach((entry: any, idx: number) => {
        currentSnapshot.set(entry.username, idx + 1);
      });

      const prevSnapshot = pvpRankSnapshot;
      pvpRankSnapshot = currentSnapshot;

      if (pvpLeaderboardPrimed) {
        for (const [username, newRank] of currentSnapshot.entries()) {
          const oldRank = prevSnapshot.get(username);
          const movedUp = oldRank !== undefined && newRank < oldRank;
          if (!movedUp) continue;
          if (newRank > 10) continue;

          const entry = leaderboard[newRank - 1] as any;
          if (!entry) continue;

          const fullUser = await storage.getUser(entry.userId).catch(() => null);
          if (fullUser?.watcherShoutoutsEnabled === false) continue;

          const star = newRank <= 3 ? "★ " : "";
          await postWatcherMessage(
            `𖤓 The Watcher observes... ${star}${username} has risen to rank #${newRank} on the PvP leaderboard. A formidable challenger emerges!`,
          );
        }
      }

      pvpLeaderboardPrimed = true;
    } catch (err) {
      console.error("[VW] PvP leaderboard monitor error:", err);
    } finally {
      pvpMonitorRunning = false;
    }
  }, PVP_LEADERBOARD_CHECK_MS);
}
