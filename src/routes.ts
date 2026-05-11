import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PluginContext, Policy } from './types.js';
import type { QuotaStore } from './storage.js';
import { computeUsage } from './usage.js';

const PREFIX = '/api/plugins/quotas';
const PERM_MANAGE = 'quotas.manage';

function getAuthUserId(request: FastifyRequest): number | null {
  const user = (request as unknown as { user?: { id?: number } }).user;
  return typeof user?.id === 'number' ? user.id : null;
}

function validatePolicyBody(body: Partial<Policy>): string | null {
  if (typeof body.name !== 'string' || !body.name.trim()) return 'name is required';
  if (body.roleName !== null && typeof body.roleName !== 'string') return 'roleName must be a string or null';
  const allowedUnits = ['hour', 'day', 'week', 'month'] as const;
  if (!allowedUnits.includes(body.windowUnit as typeof allowedUnits[number])) return 'windowUnit must be one of hour|day|week|month';
  if (typeof body.windowValue !== 'number' || !Number.isInteger(body.windowValue) || body.windowValue <= 0) {
    return 'windowValue must be a positive integer';
  }
  if (body.maxMovies !== null && (typeof body.maxMovies !== 'number' || body.maxMovies < 0)) {
    return 'maxMovies must be a non-negative number or null';
  }
  if (body.maxTvShows !== null && (typeof body.maxTvShows !== 'number' || body.maxTvShows < 0)) {
    return 'maxTvShows must be a non-negative number or null';
  }
  if (body.tvCountMode !== 'series' && body.tvCountMode !== 'season') {
    return 'tvCountMode must be "series" or "season"';
  }
  return null;
}

export async function registerQuotaRoutes(
  app: FastifyInstance,
  ctx: PluginContext,
  store: QuotaStore,
): Promise<void> {
  ctx.registerRoutePermission(`GET:${PREFIX}/policies`, { permission: PERM_MANAGE });
  ctx.registerRoutePermission(`POST:${PREFIX}/policies`, { permission: PERM_MANAGE });
  ctx.registerRoutePermission(`PATCH:${PREFIX}/policies/:id`, { permission: PERM_MANAGE });
  ctx.registerRoutePermission(`DELETE:${PREFIX}/policies/:id`, { permission: PERM_MANAGE });
  ctx.registerRoutePermission(`GET:${PREFIX}/overrides`, { permission: PERM_MANAGE });
  ctx.registerRoutePermission(`PUT:${PREFIX}/overrides`, { permission: PERM_MANAGE });
  ctx.registerRoutePermission(`DELETE:${PREFIX}/overrides/:userId`, { permission: PERM_MANAGE });
  ctx.registerRoutePermission(`GET:${PREFIX}/usage`, { permission: PERM_MANAGE });

  // /me inherits the default plugin AUTH rule — any logged-in user can read their own quota.

  app.get('/policies', async () => ({ policies: store.listPolicies() }));

  app.post<{ Body: Partial<Policy> }>('/policies', async (request, reply) => {
    const body = request.body ?? {};
    const err = validatePolicyBody(body);
    if (err) return reply.status(400).send({ error: err });
    const created = await store.createPolicy({
      name: body.name!.trim(),
      roleName: body.roleName ?? null,
      windowUnit: body.windowUnit!,
      windowValue: body.windowValue!,
      maxMovies: body.maxMovies ?? null,
      maxTvShows: body.maxTvShows ?? null,
      tvCountMode: body.tvCountMode!,
    });
    return { policy: created };
  });

  app.patch<{ Params: { id: string }; Body: Partial<Policy> }>('/policies/:id', async (request, reply) => {
    const updated = await store.updatePolicy(request.params.id, request.body ?? {});
    if (!updated) return reply.status(404).send({ error: 'Policy not found' });
    return { policy: updated };
  });

  app.delete<{ Params: { id: string } }>('/policies/:id', async (request, reply) => {
    const ok = await store.deletePolicy(request.params.id);
    if (!ok) return reply.status(404).send({ error: 'Policy not found' });
    return { ok: true };
  });

  app.get('/overrides', async () => ({ overrides: store.listOverrides() }));

  app.put<{ Body: { userId: number; policyId: string; expiresAt?: string | null } }>(
    '/overrides',
    async (request, reply) => {
      const { userId, policyId, expiresAt = null } = request.body ?? ({} as { userId: number; policyId: string });
      if (!Number.isSafeInteger(userId) || userId <= 0 || !policyId) {
        return reply.status(400).send({ error: 'userId (positive safe integer) and policyId are required' });
      }
      if (!store.getPolicy(policyId)) {
        return reply.status(400).send({ error: 'Unknown policyId' });
      }
      const saved = await store.upsertOverride({ userId, policyId, expiresAt });
      return { override: saved };
    },
  );

  app.delete<{ Params: { userId: string } }>('/overrides/:userId', async (request, reply) => {
    const uid = Number(request.params.userId);
    // Reject malformed input AND values past Number.MAX_SAFE_INTEGER — beyond that
    // range integer precision is lost, so two distinct user ids can collapse to the
    // same number and target the wrong override.
    if (!Number.isSafeInteger(uid) || uid <= 0) {
      return reply.status(400).send({ error: 'Invalid userId' });
    }
    const ok = await store.removeOverride(uid);
    if (!ok) return reply.status(404).send({ error: 'Override not found' });
    return { ok: true };
  });

  // Admin: list every user-with-policy + their current usage. The user list itself isn't
  // exposed by the plugin API (no users:list capability), so the admin tab pre-fetches users
  // from /api/admin/users and then queries this endpoint per user it cares about.
  app.get<{ Querystring: { userId?: string } }>('/usage', async (request, reply) => {
    const target = request.query?.userId ? Number(request.query.userId) : null;
    if (target === null || !Number.isSafeInteger(target) || target <= 0) {
      return reply.status(400).send({ error: 'userId query (positive safe integer) is required' });
    }
    const user = await ctx.getUser(target);
    if (!user) return reply.status(404).send({ error: 'User not found' });
    const policy = store.resolveForUser(target, user.role);
    if (!policy) return { policy: null, usage: null };
    const usage = await computeUsage(ctx, target, policy);
    return { policy, usage };
  });

  app.get('/me', async (request, reply) => {
    const uid = getAuthUserId(request);
    if (!uid) return reply.status(401).send({ error: 'Not authenticated' });
    const user = await ctx.getUser(uid);
    if (!user) return reply.status(404).send({ error: 'User not found' });
    const policy = store.resolveForUser(uid, user.role);
    if (!policy) return { policy: null, usage: null };
    const usage = await computeUsage(ctx, uid, policy);
    return { policy, usage };
  });
}
