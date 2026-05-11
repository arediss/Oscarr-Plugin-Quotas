import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Users as UsersIcon, X } from 'lucide-react';
import { api, fetchUsers, type AdminUser, type Override, type Policy, type Usage } from '../api';
import { useT } from '../i18n';

interface UsageView {
  policy: Policy | null;
  usage: Usage | null;
}

/** Compact inline quota chip: label + count + mini progress bar, all on one line. */
function QuotaChip({
  label, value, max,
}: Readonly<{ label: string; value: number; max: number | null }>) {
  const unlimited = max === null;
  const pct = unlimited ? 0 : (max === 0 ? 100 : Math.min(100, Math.round((value / max) * 100)));
  const tone = unlimited
    ? 'bg-white/10'
    : pct >= 100 ? 'bg-ndp-danger' : pct >= 80 ? 'bg-ndp-warning' : 'bg-ndp-accent';
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[11px] text-ndp-text-dim shrink-0">{label}</span>
      <span className="text-xs text-ndp-text tabular-nums shrink-0">
        {value}<span className="text-ndp-text-dim">/{max ?? '∞'}</span>
      </span>
      <div className="h-1 bg-white/5 rounded-full w-16 overflow-hidden shrink-0">
        {!unlimited && <div className={`h-full ${tone} transition-all`} style={{ width: `${pct}%` }} />}
      </div>
    </div>
  );
}

export function UsersTab() {
  const t = useT();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usage, setUsage] = useState<Record<number, UsageView>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const policyById = useMemo(() => new Map(policies.map((p) => [p.id, p])), [policies]);

  const refresh = async () => {
    setLoading(true);
    try {
      const [{ policies: pol }, { overrides: ovr }, userList] = await Promise.all([
        api.listPolicies(),
        api.listOverrides(),
        fetchUsers(),
      ]);
      setPolicies(pol);
      setOverrides(ovr);
      setUsers(userList);
      const targets = userList.filter((u) => u.role !== 'admin');
      const results = await Promise.all(
        targets.map((u) => api.getUsage(u.id).catch(() => ({ policy: null, usage: null }))),
      );
      const map: Record<number, UsageView> = {};
      targets.forEach((u, i) => { map[u.id] = results[i]; });
      setUsage(map);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const applyOverride = async (userId: number, policyId: string) => {
    try { await api.upsertOverride({ userId, policyId, expiresAt: null }); await refresh(); }
    catch (err) { setError((err as Error).message); }
  };

  const clearOverride = async (userId: number) => {
    try { await api.removeOverride(userId); await refresh(); }
    catch (err) { setError((err as Error).message); }
  };

  const visibleUsers = users.filter((u) => u.role !== 'admin');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-ndp-text">{t('users.heading')}</h2>
          <p className="text-xs text-ndp-text-dim mt-0.5">{t('users.subheading')}</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-ndp-danger/10 border border-ndp-danger/30 rounded-xl text-sm text-ndp-danger animate-fade-in">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="card overflow-hidden">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="px-4 py-3 border-b border-white/5 last:border-0 flex items-center gap-4">
              <div className="skeleton w-9 h-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3 w-40 rounded" />
                <div className="skeleton h-2 w-56 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : visibleUsers.length === 0 ? (
        <div className="card p-8 text-center">
          <UsersIcon className="w-10 h-10 text-ndp-text-dim mx-auto mb-3" />
          <p className="text-sm text-ndp-text-muted">{t('users.empty')}</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* Header row — locks column widths shared by every row below. */}
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.6fr)_minmax(180px,1fr)] gap-4 px-4 py-2.5 bg-white/[0.02] border-b border-white/5 text-[10px] font-semibold uppercase tracking-wider text-ndp-text-dim">
            <div>{t('users.col.user')}</div>
            <div>{t('users.col.policy')}</div>
            <div>{t('users.col.quotas')}</div>
            <div className="text-right">{t('users.col.override')}</div>
          </div>

          {visibleUsers.map((u) => {
            const v = usage[u.id];
            const override = overrides.find((o) => o.userId === u.id);
            const overriddenPolicy = override ? policyById.get(override.policyId) : null;
            return (
              <div
                key={u.id}
                className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.6fr)_minmax(180px,1fr)] gap-4 px-4 py-2.5 border-b border-white/5 last:border-0 items-center hover:bg-white/[0.015] transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ndp-text truncate">{u.displayName || u.email}</div>
                  <div className="text-xs text-ndp-text-dim truncate flex items-center gap-2">
                    <span className="truncate">{u.email}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-white/5 text-ndp-text-dim flex-shrink-0">
                      {u.role}
                    </span>
                  </div>
                </div>

                <div className="min-w-0">
                  {v?.policy ? (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs text-ndp-text truncate">{v.policy.name}</span>
                      {overriddenPolicy && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-500/15 text-amber-300 flex-shrink-0">
                          {t('users.override_badge')}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-ndp-text-dim">{t('users.dash')}</span>
                  )}
                </div>

                <div className="min-w-0">
                  {v?.policy ? (
                    <div className="flex items-center gap-4 flex-wrap">
                      <QuotaChip label={t('users.tv_movies')} value={v.usage?.movies ?? 0} max={v.policy.maxMovies} />
                      <QuotaChip label={t('users.tv_label', { mode: v.policy.tvCountMode })} value={v.usage?.tvShows ?? 0} max={v.policy.maxTvShows} />
                    </div>
                  ) : <span className="text-xs text-ndp-text-dim">{t('users.dash')}</span>}
                </div>

                <div className="flex items-center gap-1 justify-end">
                  <select
                    value={override?.policyId ?? ''}
                    onChange={(e) => {
                      if (!e.target.value) clearOverride(u.id);
                      else applyOverride(u.id, e.target.value);
                    }}
                    className="input text-xs py-1 px-2 max-w-full"
                    title={t('users.override.title')}
                  >
                    <option value="">{t('users.override.placeholder')}</option>
                    {policies.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {override && (
                    <button
                      onClick={() => clearOverride(u.id)}
                      className="p-1.5 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors flex-shrink-0"
                      title={t('users.override.clear')}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
