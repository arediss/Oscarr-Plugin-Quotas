import { useState } from 'react';
import { Gauge, Users as UsersIcon, Sliders } from 'lucide-react';
import { PoliciesTab } from './admin/PoliciesTab';
import { UsersTab } from './admin/UsersTab';
import { useT } from './i18n';

type TabId = 'policies' | 'users';

export default function QuotasAdmin() {
  const t = useT();
  const [tab, setTab] = useState<TabId>('policies');

  const TABS: Array<{ id: TabId; labelKey: string; icon: typeof Sliders }> = [
    { id: 'policies', labelKey: 'tab.policies', icon: Sliders },
    { id: 'users', labelKey: 'tab.users', icon: UsersIcon },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-ndp-accent/10 flex items-center justify-center text-ndp-accent">
          <Gauge className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-ndp-text">{t('title')}</h1>
          <p className="text-xs text-ndp-text-dim">{t('subtitle')}</p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-white/5 pb-3 overflow-x-auto">
        {TABS.map((tab_) => {
          const Icon = tab_.icon;
          const active = tab === tab_.id;
          return (
            <button
              key={tab_.id}
              onClick={() => setTab(tab_.id)}
              className={[
                'flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0',
                active
                  ? 'bg-ndp-accent/10 text-ndp-accent'
                  : 'text-ndp-text-muted hover:text-ndp-text hover:bg-white/5',
              ].join(' ')}
            >
              <Icon className="w-4 h-4" />
              {t(tab_.labelKey)}
            </button>
          );
        })}
      </div>

      {tab === 'policies' && <PoliciesTab />}
      {tab === 'users' && <UsersTab />}
    </div>
  );
}
