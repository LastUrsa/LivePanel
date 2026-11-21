import { Activity, ListFilter, MessageSquare, Play, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  getLupusAriaFeatures,
  getLupusAriaLogs,
  setLupusAriaFeature,
  startModule,
  type LupusAriaFeature,
  type LupusAriaLog,
  type ModuleInfo,
} from './lib/api/livepanel';

export function lupusAriaStatus(module?: ModuleInfo): string {
  if (!module?.running) return module?.installed ? 'Service offline' : 'Unavailable';
  if (!module.capabilities.includes('bot-lifecycle')) return 'Update required';
  switch (module.status.botState) {
    case 'idle': return 'Bot idle';
    case 'starting': return 'Bot starting';
    case 'running': return 'Bot running';
    case 'stopping': return 'Bot stopping';
    case 'failed': return 'Bot failed';
    default: return 'Status unavailable';
  }
}

const chatFeatureIDs = new Set(['mentions', 'ask', 'lurk', 'commands', 'reset']);

export function LupusAriaDrawer({ module, onRefresh }: { module?: ModuleInfo; onRefresh: () => void }) {
  const [features, setFeatures] = useState<LupusAriaFeature[]>([]);
  const [logs, setLogs] = useState<LupusAriaLog[]>([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState('');
  const [featureErrors, setFeatureErrors] = useState<Record<string, string>>({});
  const [warningsOnly, setWarningsOnly] = useState(true);
  const featuresAvailable = Boolean(module?.running && module.capabilities.includes('bot-features'));
  const logsAvailable = Boolean(module?.running && module.capabilities.includes('recent-logs'));

  useEffect(() => {
    if (pending) return;
    let canceled = false;
    async function refresh() {
      const [nextFeatures, nextLogs] = await Promise.allSettled([
        featuresAvailable ? getLupusAriaFeatures() : Promise.resolve(null),
        logsAvailable ? getLupusAriaLogs() : Promise.resolve(null),
      ]);
      if (canceled) return;
      if (nextFeatures.status === 'fulfilled' && nextFeatures.value) setFeatures(nextFeatures.value.features ?? []);
      if (nextLogs.status === 'fulfilled' && nextLogs.value) setLogs(nextLogs.value.logs ?? []);
      if (nextFeatures.status === 'rejected' || nextLogs.status === 'rejected') {
        setError('Could not refresh LupusAria. Showing last known information.');
      } else if (featuresAvailable || logsAvailable) {
        setError('');
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 4000);
    return () => { canceled = true; window.clearInterval(timer); };
  }, [featuresAvailable, logsAvailable, pending]);

  async function toggle(feature: LupusAriaFeature, enabled: boolean) {
    setPending(feature.id);
    try {
      const result = await setLupusAriaFeature(feature.id, enabled);
      if (result.features) setFeatures(result.features);
      setFeatureErrors(current => ({ ...current, [feature.id]: result.success ? '' : result.error || 'Feature update failed.' }));
    } catch {
      setFeatureErrors(current => ({ ...current, [feature.id]: 'Could not confirm the feature update.' }));
    } finally {
      setPending('');
    }
  }

  async function launch() {
    setPending('launch');
    try {
      const modules = await startModule('lupusaria');
      const result = modules.find(item => item.id === 'lupusaria');
      setError(result?.error || (result?.running ? '' : 'LupusAria did not become ready. Check its startup log.'));
      onRefresh();
    } catch {
      setError('Could not launch LupusAria. Check Module Locations.');
    } finally {
      setPending('');
    }
  }

  const visibleLogs = logs.filter(entry => !warningsOnly || entry.level === 'warn' || entry.level === 'error');
  const botError = module?.status.botError;
  const botState = module?.status.botState;
  const botTone = botState === 'running' ? 'running' : botState === 'failed' ? 'error' : 'info';
  const featureGroups = [
    { label: 'Chat commands', icon: MessageSquare, items: features.filter(feature => chatFeatureIDs.has(feature.id)) },
    { label: 'Stream features', icon: SlidersHorizontal, items: features.filter(feature => !chatFeatureIDs.has(feature.id)) },
  ];

  return (
    <div className="drawer-content lupusaria-drawer">
      <div className="preview-field lupusaria-bot-status">
        <span>Bot status</span>
        <strong className={`status-pill status-${botTone}`} role="status">{lupusAriaStatus(module)}</strong>
      </div>
      {typeof botError === 'string' && botError && <p className="module-inline-message error" role="alert">{botError}</p>}
      {error && <p className="module-inline-message error" role="alert">{error}</p>}
      {!module?.running && module?.installed && (
        <button type="button" disabled={Boolean(pending)} onClick={() => void launch()}>
          <Play aria-hidden="true" /> Start LupusAria service
        </button>
      )}
      {featureGroups.filter(group => group.items.length > 0).map(({ label, icon: Icon, items }) => (
        <section key={label} className="drawer-control-group" aria-label={label}>
          <div className="drawer-control-heading lupusaria-group-heading">
            <span><Icon aria-hidden="true" /> {label}</span>
          </div>
          {items.map(feature => {
            const state = pending === feature.id ? 'Saving…' : feature.effective ? 'Active' : feature.enabled ? 'Enabled · inactive' : 'Off';
            const stateID = `lupusaria-${feature.id}-state`;
            return (
              <div className="lupusaria-feature" key={feature.id}>
                <label className="drawer-toggle-row lupusaria-toggle-row">
                  <span>
                    <strong>{feature.label}</strong>
                    <small id={stateID}>{state}</small>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label={feature.label}
                    aria-describedby={stateID}
                    checked={feature.enabled}
                    disabled={!featuresAvailable || Boolean(pending)}
                    onChange={event => void toggle(feature, event.currentTarget.checked)}
                  />
                </label>
                {featureErrors[feature.id] && <p className="module-inline-message error" role="alert">{featureErrors[feature.id]}</p>}
              </div>
            );
          })}
        </section>
      ))}
      {(logsAvailable || logs.length > 0) && (
        <section className="drawer-control-group" aria-label="Recent LupusAria logs">
          <div className="drawer-control-heading lupusaria-group-heading">
            <span><Activity aria-hidden="true" /> Recent logs</span>
            <button type="button" aria-pressed={warningsOnly} onClick={() => setWarningsOnly(current => !current)}>
              <ListFilter aria-hidden="true" /> Warnings &amp; errors
            </button>
          </div>
          {visibleLogs.length ? (
            <ul className="lupusaria-logs">
              {visibleLogs.slice().reverse().map((entry, index) => (
                <li className="announcement-field-row" key={`${entry.at}-${index}`}>
                  <div className="lupusaria-log-meta">
                    <strong className={`status-pill status-${entry.level === 'error' ? 'error' : entry.level === 'warn' ? 'warning' : 'info'}`}>{entry.level === 'warn' ? 'Warning' : entry.level === 'error' ? 'Error' : 'Info'}</strong>
                    <time dateTime={entry.at}>{new Date(entry.at).toLocaleTimeString()}</time>
                  </div>
                  <p>{entry.message}</p>
                </li>
              ))}
            </ul>
          ) : <p className="drawer-empty-line">{warningsOnly ? 'No warnings or errors.' : 'No recent messages.'}</p>}
        </section>
      )}
    </div>
  );
}
