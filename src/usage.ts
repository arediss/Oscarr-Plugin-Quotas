import type { Policy, PluginContext, PluginMediaRequest, WindowUnit } from './types.js';

/** Statuses that don't count against a user's quota — failed/declined requests are mistakes
 *  and shouldn't eat someone's budget. "pending" / "approved" / "processing" / "available"
 *  all count: they all represent an actual download slot the user claimed. */
const NON_COUNTING_STATUSES = new Set(['declined', 'failed', 'cancelled']);

const WINDOW_MS: Record<WindowUnit, number> = {
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
  // 30-day "month" approximation — quotas don't need calendar precision, the user just sees
  // "every 30 days from your last consuming request" which is consistent enough.
  month: 30 * 86_400_000,
};

export function windowMs(policy: Policy): number {
  return WINDOW_MS[policy.windowUnit] * Math.max(1, policy.windowValue);
}

export interface UsageSnapshot {
  movies: number;
  tvShows: number;
  /** Earliest createdAt of a counted request that's still inside the window — informational
   *  for the "your quota resets at …" hint. null when nothing has been counted yet. */
  earliestAt: string | null;
}

/** Count consuming requests inside the policy window. TV is weighted by `tvCountMode`:
 *    - "series" → every TV request = 1
 *    - "season" → each requested season = 1 (no seasons array → defaults to 1) */
export function snapshotUsage(requests: PluginMediaRequest[], policy: Policy): UsageSnapshot {
  const cutoff = Date.now() - windowMs(policy);
  let movies = 0;
  let tvShows = 0;
  let earliestMs: number | null = null;

  for (const r of requests) {
    const ms = new Date(r.createdAt).getTime();
    if (ms < cutoff) continue;
    if (NON_COUNTING_STATUSES.has(r.status)) continue;

    if (r.mediaType === 'movie') {
      movies += 1;
    } else {
      const weight = policy.tvCountMode === 'season'
        ? Math.max(1, (r.seasons?.length ?? 0))
        : 1;
      tvShows += weight;
    }
    if (earliestMs === null || ms < earliestMs) earliestMs = ms;
  }

  return {
    movies,
    tvShows,
    earliestAt: earliestMs !== null ? new Date(earliestMs).toISOString() : null,
  };
}

/** Pull requests + compute usage for a user against a policy. Used by both the guard and
 *  the admin/user view endpoints so they always agree on the numbers. */
export async function computeUsage(
  ctx: PluginContext,
  userId: number,
  policy: Policy,
): Promise<UsageSnapshot> {
  // listForUser caps at 200; way past anything realistic for a quota window.
  const requests = await ctx.requests.listForUser(userId, { limit: 200 });
  return snapshotUsage(requests, policy);
}
