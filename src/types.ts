import type { FastifyInstance } from 'fastify';

export interface PluginLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

export interface PluginUser {
  id: number;
  email: string;
  displayName: string | null;
  role: string;
}

export interface PluginMediaRequest {
  id: number;
  userId: number;
  mediaType: 'movie' | 'tv';
  status: string;
  seasons: number[] | null;
  createdAt: string;
}

export interface GuardContextRequest {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  seasons?: number[] | null;
}

export interface GuardContext {
  request?: GuardContextRequest;
}

export interface PluginGuardResult {
  blocked: true;
  error: string;
  statusCode?: number;
}

export interface PluginContext {
  log: PluginLogger;
  getUser(userId: number): Promise<PluginUser | null>;
  getPluginDataDir(): Promise<string>;
  registerPluginPermission(permission: string, description?: string): void;
  registerRoutePermission(
    routeKey: string,
    rule: { permission: string; ownerScoped?: boolean },
  ): void;
  requests: {
    listForUser(
      userId: number,
      options?: { limit?: number; status?: string },
    ): Promise<PluginMediaRequest[]>;
  };
}

export type RegisterRoutes = (app: FastifyInstance) => Promise<void> | void;

export type WindowUnit = 'hour' | 'day' | 'week' | 'month';

export interface Policy {
  id: string;
  name: string;
  /** null = default policy applied when no role-specific policy matches. */
  roleName: string | null;
  windowUnit: WindowUnit;
  windowValue: number;
  /** null = unlimited movies. */
  maxMovies: number | null;
  /** null = unlimited TV requests. */
  maxTvShows: number | null;
  /** "series" — one TV request counts as 1 regardless of seasons.
   *  "season" — each requested season counts as 1. */
  tvCountMode: 'series' | 'season';
  createdAt: string;
  updatedAt: string;
}

export interface Override {
  userId: number;
  policyId: string;
  /** null = permanent. */
  expiresAt: string | null;
}

export interface QuotaState {
  version: 1;
  policies: Policy[];
  overrides: Override[];
}
