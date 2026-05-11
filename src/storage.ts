import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { PluginContext, QuotaState, Policy, Override } from './types.js';

const FILE_NAME = 'quotas.json';

const EMPTY_STATE: QuotaState = {
  version: 1,
  policies: [],
  overrides: [],
};

/** JSON-on-disk store for policies + overrides. One file per plugin, loaded once on boot
 *  and kept in memory — writes serialise through a promise chain so two concurrent
 *  HTTP handlers can't interleave a mutate-then-save sequence and clobber each other.
 *  No ledger here: usage is computed on the fly from `ctx.requests.listForUser` so a
 *  deleted/declined request drops out of the count without bookkeeping. */
export class QuotaStore {
  private state: QuotaState = { ...EMPTY_STATE };
  private filePath = '';
  private ctx: PluginContext;
  /** Serialises mutate+save sequences. Each `withLock` call awaits the previous one,
   *  so the array mutation and the subsequent writeFile happen atomically per request. */
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(ctx: PluginContext) {
    this.ctx = ctx;
  }

  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.writeQueue.then(fn, fn);
    // Swallow rejections in the chain itself so one failing write doesn't poison every
    // subsequent call — the caller still gets the rejected promise from `next`.
    this.writeQueue = next.catch(() => undefined);
    return next;
  }

  async load(): Promise<void> {
    const dir = await this.ctx.getPluginDataDir();
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    this.filePath = join(dir, FILE_NAME);
    if (!existsSync(this.filePath)) {
      this.state = { ...EMPTY_STATE };
      await this.save();
      return;
    }
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<QuotaState>;
      this.state = {
        version: 1,
        policies: Array.isArray(parsed.policies) ? parsed.policies : [],
        overrides: Array.isArray(parsed.overrides) ? parsed.overrides : [],
      };
    } catch (err) {
      this.ctx.log.error('[quotas] Failed to load quotas.json, starting empty:', err);
      this.state = { ...EMPTY_STATE };
    }
  }

  private async save(): Promise<void> {
    await writeFile(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8');
  }

  listPolicies(): Policy[] {
    return [...this.state.policies];
  }

  listOverrides(): Override[] {
    return [...this.state.overrides];
  }

  getPolicy(id: string): Policy | null {
    return this.state.policies.find((p) => p.id === id) ?? null;
  }

  /** Resolve which policy applies to a user — override beats role-match beats default. */
  resolveForUser(userId: number, role: string): Policy | null {
    const override = this.state.overrides.find((o) => o.userId === userId);
    if (override) {
      const stillValid = !override.expiresAt || new Date(override.expiresAt).getTime() > Date.now();
      if (stillValid) {
        const pol = this.getPolicy(override.policyId);
        if (pol) return pol;
      }
    }
    const byRole = this.state.policies.find((p) => p.roleName === role);
    if (byRole) return byRole;
    return this.state.policies.find((p) => p.roleName === null) ?? null;
  }

  createPolicy(input: Omit<Policy, 'id' | 'createdAt' | 'updatedAt'>): Promise<Policy> {
    return this.withLock(async () => {
      const now = new Date().toISOString();
      const policy: Policy = {
        id: `pol_${Math.random().toString(36).slice(2, 10)}`,
        createdAt: now,
        updatedAt: now,
        ...input,
      };
      this.state.policies.push(policy);
      await this.save();
      return policy;
    });
  }

  updatePolicy(id: string, patch: Partial<Omit<Policy, 'id' | 'createdAt'>>): Promise<Policy | null> {
    return this.withLock(async () => {
      const idx = this.state.policies.findIndex((p) => p.id === id);
      if (idx === -1) return null;
      this.state.policies[idx] = {
        ...this.state.policies[idx],
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      await this.save();
      return this.state.policies[idx];
    });
  }

  deletePolicy(id: string): Promise<boolean> {
    return this.withLock(async () => {
      const before = this.state.policies.length;
      this.state.policies = this.state.policies.filter((p) => p.id !== id);
      // Drop overrides that pointed at the deleted policy so the resolver doesn't
      // strand users on a phantom reference.
      this.state.overrides = this.state.overrides.filter((o) => o.policyId !== id);
      if (this.state.policies.length === before) return false;
      await this.save();
      return true;
    });
  }

  upsertOverride(input: Override): Promise<Override> {
    return this.withLock(async () => {
      this.state.overrides = this.state.overrides.filter((o) => o.userId !== input.userId);
      this.state.overrides.push(input);
      await this.save();
      return input;
    });
  }

  removeOverride(userId: number): Promise<boolean> {
    return this.withLock(async () => {
      const before = this.state.overrides.length;
      this.state.overrides = this.state.overrides.filter((o) => o.userId !== userId);
      if (this.state.overrides.length === before) return false;
      await this.save();
      return true;
    });
  }
}
