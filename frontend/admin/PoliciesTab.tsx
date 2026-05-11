import { useEffect, useState } from 'react';
import { AlertTriangle, Pencil, Plus, Trash2, X, Gauge } from 'lucide-react';
import { api, fetchRoles, type Policy, type Role, type TvCountMode, type WindowUnit } from '../api';
import { ConfirmModal } from '../ConfirmModal';
import { useT } from '../i18n';

interface EditState {
  mode: 'create' | 'edit';
  policy: Partial<Policy>;
}

const DEFAULT_DRAFT: Partial<Policy> = {
  name: '',
  roleName: null,
  windowUnit: 'month',
  windowValue: 1,
  maxMovies: 10,
  maxTvShows: 5,
  tvCountMode: 'series',
};

function formatWindow(p: Policy): string {
  return `${p.windowValue} ${p.windowUnit}${p.windowValue > 1 ? 's' : ''}`;
}

export function PoliciesTab() {
  const t = useT();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Policy | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [{ policies: pol }, rolesResult] = await Promise.all([api.listPolicies(), fetchRoles()]);
      setPolicies(pol);
      setRoles(rolesResult.filter((r) => r.name !== 'admin'));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const save = async () => {
    if (!editing) return;
    const { name, roleName, windowUnit, windowValue, maxMovies, maxTvShows, tvCountMode } = editing.policy;
    if (!name?.trim()) { setError(t('policies.error.name_required')); return; }
    if (!windowUnit || typeof windowValue !== 'number' || windowValue <= 0) {
      setError(t('policies.error.window_invalid'));
      return;
    }
    if (!tvCountMode) { setError(t('policies.error.tv_mode_required')); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        roleName: roleName ?? null,
        windowUnit,
        windowValue,
        maxMovies: maxMovies ?? null,
        maxTvShows: maxTvShows ?? null,
        tvCountMode,
      };
      if (editing.mode === 'create') {
        await api.createPolicy(payload);
      } else if (editing.policy.id) {
        await api.updatePolicy(editing.policy.id, payload);
      }
      setEditing(null);
      setError(null);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(deleteConfirm.id);
    try {
      await api.deletePolicy(deleteConfirm.id);
      setDeleteConfirm(null);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-ndp-text">{t('policies.heading')}</h2>
          <p className="text-xs text-ndp-text-dim mt-0.5">{t('policies.subheading')}</p>
        </div>
        <button
          onClick={() => setEditing({ mode: 'create', policy: { ...DEFAULT_DRAFT } })}
          className="btn-primary text-sm flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {t('policies.new')}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-ndp-danger/10 border border-ndp-danger/30 rounded-xl text-sm text-ndp-danger animate-fade-in">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card p-4">
              <div className="skeleton h-5 w-40 rounded" />
              <div className="skeleton h-3 w-64 mt-2 rounded" />
            </div>
          ))}
        </div>
      ) : policies.length === 0 ? (
        <div className="card p-8 text-center">
          <Gauge className="w-10 h-10 text-ndp-text-dim mx-auto mb-3" />
          <p className="text-sm text-ndp-text-muted">{t('policies.empty.title')}</p>
          <p className="text-xs text-ndp-text-dim mt-1">{t('policies.empty.hint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {policies.map((p) => (
            <div key={p.id} className="card">
              <div className="flex items-center gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-ndp-text truncate">{p.name}</div>
                  <div className="text-xs text-ndp-text-dim mt-0.5 tabular-nums">
                    {t('policies.movies_label')}: <span className="text-ndp-text">{p.maxMovies ?? '∞'}</span>
                    {' · '}
                    {t('policies.tv_label', { mode: p.tvCountMode })}: <span className="text-ndp-text">{p.maxTvShows ?? '∞'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-ndp-accent/10 text-ndp-accent">
                    {p.roleName ?? t('policies.role.default')}
                  </span>
                  <span className="h-5 w-px bg-white/10" aria-hidden />
                  <span className="text-xs text-ndp-text-dim tabular-nums">{formatWindow(p)}</span>
                  <span className="h-5 w-px bg-white/10" aria-hidden />
                  <button
                    onClick={() => setEditing({ mode: 'edit', policy: { ...p } })}
                    className="p-1.5 rounded-lg text-ndp-text-dim hover:text-ndp-accent hover:bg-white/5 transition-colors"
                    title={t('policies.edit')}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(p)}
                    disabled={deleting === p.id}
                    className="p-1.5 rounded-lg text-ndp-text-dim hover:text-ndp-danger hover:bg-ndp-danger/10 transition-colors disabled:opacity-30"
                    title={t('policies.delete')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => !saving && setEditing(null)}
        >
          <div className="card w-full max-w-md mx-4 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-ndp-text">
                {editing.mode === 'create' ? t('policies.modal.new_title') : t('policies.modal.edit_title')}
              </h3>
              <button
                onClick={() => !saving && setEditing(null)}
                className="p-1 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-ndp-text-muted">{t('policies.modal.name')}</span>
                <input
                  className="input w-full"
                  placeholder={t('policies.modal.name_placeholder')}
                  value={editing.policy.name ?? ''}
                  onChange={(e) => setEditing({ ...editing, policy: { ...editing.policy, name: e.target.value } })}
                  autoFocus
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-ndp-text-muted">{t('policies.modal.role')}</span>
                <select
                  className="input w-full"
                  value={editing.policy.roleName ?? ''}
                  onChange={(e) => setEditing({ ...editing, policy: { ...editing.policy, roleName: e.target.value || null } })}
                >
                  <option value="">{t('policies.modal.role.default')}</option>
                  {roles.map((r) => (
                    <option key={r.name} value={r.name}>{r.name}</option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-ndp-text-muted">{t('policies.modal.window_value')}</span>
                  <input
                    type="number"
                    min={1}
                    className="input w-full tabular-nums"
                    value={editing.policy.windowValue ?? 1}
                    onChange={(e) => setEditing({ ...editing, policy: { ...editing.policy, windowValue: Number(e.target.value) } })}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-ndp-text-muted">{t('policies.modal.window_unit')}</span>
                  <select
                    className="input w-full"
                    value={editing.policy.windowUnit ?? 'month'}
                    onChange={(e) => setEditing({ ...editing, policy: { ...editing.policy, windowUnit: e.target.value as WindowUnit } })}
                  >
                    <option value="hour">{t('policies.modal.window.hour')}</option>
                    <option value="day">{t('policies.modal.window.day')}</option>
                    <option value="week">{t('policies.modal.window.week')}</option>
                    <option value="month">{t('policies.modal.window.month')}</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-ndp-text-muted">{t('policies.modal.max_movies')}</span>
                  <input
                    type="number"
                    min={0}
                    className="input w-full tabular-nums"
                    value={editing.policy.maxMovies ?? ''}
                    onChange={(e) => setEditing({ ...editing, policy: { ...editing.policy, maxMovies: e.target.value === '' ? null : Number(e.target.value) } })}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-ndp-text-muted">{t('policies.modal.max_tv')}</span>
                  <input
                    type="number"
                    min={0}
                    className="input w-full tabular-nums"
                    value={editing.policy.maxTvShows ?? ''}
                    onChange={(e) => setEditing({ ...editing, policy: { ...editing.policy, maxTvShows: e.target.value === '' ? null : Number(e.target.value) } })}
                  />
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-ndp-text-muted">{t('policies.modal.tv_mode')}</span>
                <select
                  className="input w-full"
                  value={editing.policy.tvCountMode ?? 'series'}
                  onChange={(e) => setEditing({ ...editing, policy: { ...editing.policy, tvCountMode: e.target.value as TvCountMode } })}
                >
                  <option value="series">{t('policies.modal.tv_mode.series')}</option>
                  <option value="season">{t('policies.modal.tv_mode.season')}</option>
                </select>
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setEditing(null)} disabled={saving} className="btn-secondary text-sm disabled:opacity-50">
                {t('policies.modal.cancel')}
              </button>
              <button onClick={save} disabled={saving} className="btn-primary text-sm disabled:opacity-50">
                {saving ? t('policies.modal.saving') : t('policies.modal.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteConfirm}
        title={t('policies.delete.title')}
        message={t('policies.delete.message', { name: deleteConfirm?.name ?? '' })}
        description={t('policies.delete.description')}
        confirmLabel={t('policies.delete.confirm')}
        cancelLabel={t('policies.modal.cancel')}
        variant="danger"
        busy={deleting === deleteConfirm?.id}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
