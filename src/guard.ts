import type { GuardContext, PluginContext, PluginGuardResult } from './types.js';
import type { QuotaStore } from './storage.js';
import { computeUsage, windowMs } from './usage.js';

/** Format a friendly "wait X days/hours" message for the user. */
function formatRetryAfter(ms: number): string {
  if (ms <= 0) return 'soon';
  const hours = Math.ceil(ms / 3_600_000);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''}`;
  const days = Math.ceil(hours / 24);
  return `${days} day${days > 1 ? 's' : ''}`;
}

/** Build the `request.create` guard. Resolves the user's policy, counts their recent
 *  requests, applies the TV weight (series vs season), and returns a `blocked` result
 *  when the incoming request would push them over the cap. */
export function buildRequestCreateGuard(ctx: PluginContext, store: QuotaStore) {
  return async (userId: number, guardCtx?: GuardContext): Promise<PluginGuardResult | null> => {
    const user = await ctx.getUser(userId);
    if (!user) return null;

    const policy = store.resolveForUser(userId, user.role);
    if (!policy) return null;

    const incoming = guardCtx?.request;
    if (!incoming) return null;

    const usage = await computeUsage(ctx, userId, policy);

    if (incoming.mediaType === 'movie') {
      if (policy.maxMovies !== null && usage.movies + 1 > policy.maxMovies) {
        const retryMs = usage.earliestAt
          ? new Date(usage.earliestAt).getTime() + windowMs(policy) - Date.now()
          : windowMs(policy);
        return {
          blocked: true,
          statusCode: 429,
          error: `Movie quota reached (${usage.movies}/${policy.maxMovies}). Try again in ${formatRetryAfter(retryMs)}.`,
        };
      }
      return null;
    }

    // TV
    const weight = policy.tvCountMode === 'season'
      ? Math.max(1, incoming.seasons?.length ?? 0)
      : 1;

    if (policy.maxTvShows !== null && usage.tvShows + weight > policy.maxTvShows) {
      const retryMs = usage.earliestAt
        ? new Date(usage.earliestAt).getTime() + windowMs(policy) - Date.now()
        : windowMs(policy);
      const tvLabel = policy.tvCountMode === 'season' ? 'TV season' : 'TV show';
      return {
        blocked: true,
        statusCode: 429,
        error: `${tvLabel} quota reached (${usage.tvShows}/${policy.maxTvShows}). Try again in ${formatRetryAfter(retryMs)}.`,
      };
    }
    return null;
  };
}
