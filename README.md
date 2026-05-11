# Oscarr Plugin — Quotas

Per-user / per-role request quotas for [Oscarr](https://github.com/arediss/Oscarr). Caps how many movies and TV shows a user can request inside a sliding window (hour / day / week / month). Admins bypass.

## Features

- **Policies** — name, role target (or default fallback), window unit + value, max movies, max TV shows, TV counting mode (`series` = 1 unit per request, `season` = 1 unit per requested season).
- **Per-user overrides** — drop a single user onto a different policy without changing their role.
- **Hard pre-request gate** — a request is rejected before it hits the *arr stack, with a friendly "try again in X hours/days" message based on the user's current window.
- **Admin UI** — two sub-tabs (Policies, Users) under the Oscarr admin panel. Live progress bars per user.
- **i18n** — EN + FR, hot-switchable via the Oscarr language picker.

No payment processing. No external SaaS. Policies + overrides live in a single JSON file under the Oscarr data directory — delete the plugin folder and nothing remains in the core DB beyond a single `PluginState` row.

## Installation

Requires Oscarr **≥ 0.8.1** (relies on the `request.create` guard context introduced in that release).

1. Download the latest `quotas-<version>.tar.gz` from [Releases](https://github.com/arediss/Oscarr-Plugin-Quotas/releases).
2. Extract into your Oscarr `plugins/` directory:
   ```bash
   tar -xzf quotas-<version>.tar.gz -C /path/to/oscarr/plugins/quotas
   ```
3. Restart Oscarr — the plugin appears under *Admin → Plugins → Discover* (or directly under *Admin → Quotas* once enabled).

## How counting works

For each request the user makes, the plugin asks Oscarr for their existing requests in the current window and computes:

- **Movies**: `count(non-declined movie requests within window) + 1`
- **TV (series mode)**: `count(non-declined TV requests within window) + 1`
- **TV (season mode)**: `sum(seasons of non-declined TV requests within window) + len(incoming seasons)`

If that exceeds the policy cap, the request is blocked with HTTP 429 and a localized message indicating when the user can retry. Cancelled or declined requests are not counted, so refunding a user is as simple as deleting their request.

## Development

```bash
npm install
npm run build      # one-shot
npm run dev        # watch mode
```

Symlink your local checkout into your Oscarr dev tree:

```bash
ln -s /path/to/Oscarr-Plugin-Quotas /path/to/oscarr/app/packages/plugins/quotas
```

Restart the Oscarr backend to pick up the new plugin.

## License

MIT — see [LICENSE](LICENSE).
