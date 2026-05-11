import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { PluginContext, RegisterRoutes } from './types.js';
import { PERMISSIONS } from './permissions.js';
import { QuotaStore } from './storage.js';
import { registerQuotaRoutes } from './routes.js';
import { buildRequestCreateGuard } from './guard.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(__dirname, '..', 'manifest.json');

export async function register(ctx: PluginContext) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));

  for (const perm of PERMISSIONS) {
    ctx.registerPluginPermission(perm.key, perm.description);
  }

  const store = new QuotaStore(ctx);
  await store.load();

  const registerRoutes: RegisterRoutes = async (app) => {
    await registerQuotaRoutes(app, ctx, store);
  };

  return {
    manifest,

    async registerRoutes(app: Parameters<RegisterRoutes>[0]) {
      await registerRoutes(app);
    },

    registerGuards() {
      return {
        'request.create': buildRequestCreateGuard(ctx, store),
      };
    },
  };
}
