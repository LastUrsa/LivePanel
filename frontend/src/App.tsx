import {
  AlertTriangle,
  Blocks,
  CheckCircle2,
  ExternalLink,
  Gauge,
  Info,
  LayoutDashboard,
  Play,
  RefreshCw,
  Radio,
  Server,
  Square,
  UserRound,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  activateStreamSignalProfile,
  announceStreamSignal,
  confirmStreamSignalAnnouncement,
  endStreamSignalStream,
  getAutoStartManagedModules,
  getStreamSignalAnnounceStatus,
  getStreamSignalCurrentProfile,
  getStreamSignalEndStreamStatus,
  getStreamSignalProfiles,
  listModules,
  openModule,
  refreshModules,
  setAutoStartManagedModules,
  startModule,
  type AnnounceResult,
  type AnnounceStatus,
  type CurrentProfile,
  type EndStreamStatus,
  type ModuleInfo,
} from './lib/api/livepanel';
import './App.css';

type Page = 'dashboard' | 'diagnostics';

function healthLabel(module: ModuleInfo) {
  if (module.error?.startsWith('Failed to Start')) {
    return 'Failed to Start';
  }
  if (!module.running) {
    return 'Offline';
  }
  if (module.healthy) {
    return module.healthStatus === 'degraded' ? 'Degraded' : 'Healthy';
  }
  return module.healthStatus ? 'Unhealthy' : 'Unavailable';
}

function healthTone(module: ModuleInfo | null) {
  if (!module || !module.running) {
    return 'offline';
  }
  if (module.error?.startsWith('Failed to Start')) {
    return 'error';
  }
  if (module.healthy && module.healthStatus !== 'degraded') {
    return 'running';
  }
  if (module.healthStatus === 'degraded') {
    return 'warning';
  }
  return 'error';
}

function statusEntries(status: Record<string, unknown>) {
  return Object.entries(status ?? {}).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value),
  }));
}

type ModuleActions = {
  onStart: (id: string) => void;
  onOpen: (id: string) => void;
  onRefresh: () => void;
};

type StreamSignalWorkflow = {
  profiles: string[];
  currentProfile: CurrentProfile;
  announceStatus: AnnounceStatus;
  endStreamStatus: EndStreamStatus;
  selectedProfile: string;
  message: string;
  busy: boolean;
  pendingConfirmation: AnnounceResult | null;
  onSelectProfile: (profile: string) => void;
  onActivateProfile: () => void;
  onGoLive: () => void;
  onConfirmGoLive: () => void;
  onCancelConfirmation: () => void;
  onEndStream: () => void;
};

function emptyWorkflowState() {
  return {
    profiles: [] as string[],
    currentProfile: { id: '', name: '' } as CurrentProfile,
    announceStatus: { lastRun: '', success: false } as AnnounceStatus,
    endStreamStatus: { lastRun: '', success: false } as EndStreamStatus,
  };
}

function modeLabel(mode: string) {
  if (!mode) {
    return 'Offline';
  }
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

function installedLabel(module: ModuleInfo) {
  return module.installed ? 'Installed' : 'Not installed';
}

function streamSignalModule(modules: ModuleInfo[]) {
  return modules.find((module) => module.id === 'streamsignal') ?? null;
}

function statusValue(status: Record<string, unknown>, key: string) {
  const value = status?.[key];
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
}

function formatRun(value: string) {
  if (!value) {
    return 'Never';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function resultLabel(success: boolean, lastRun: string, error?: string) {
  if (!lastRun) {
    return 'No activity';
  }
  if (success) {
    return 'Success';
  }
  return error || 'Failed';
}

function StatusPill({ label, tone = 'neutral' }: { label: string; tone?: 'running' | 'warning' | 'error' | 'offline' | 'neutral' | 'info' }) {
  const Icon = tone === 'running' ? CheckCircle2 : tone === 'warning' ? AlertTriangle : tone === 'error' ? XCircle : tone === 'offline' ? XCircle : Info;
  return (
    <span className={`status-pill status-${tone}`}>
      <Icon aria-hidden="true" />
      {label}
    </span>
  );
}

function WorkflowNotice({ message, kind = 'info' }: { message: string; kind?: 'info' | 'warning' | 'error' | 'success' }) {
  const Icon = kind === 'warning' ? AlertTriangle : kind === 'error' ? XCircle : kind === 'success' ? CheckCircle2 : Info;
  return (
    <div className={`inline-notice notice-${kind}`} role="status" aria-live="polite">
      <Icon aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export function Dashboard({ modules, workflow, onStart, onOpen, onRefresh }: { modules: ModuleInfo[]; workflow: StreamSignalWorkflow } & ModuleActions) {
  const module = streamSignalModule(modules);
  const offline = !module || !module.running;
  const activeProfileName = workflow.currentProfile.name || statusValue(module?.status ?? {}, 'activeProfile');
  const goLiveDisabled = offline || !activeProfileName || workflow.busy;
  const serviceState = offline ? 'Offline' : statusValue(module.status, 'state') || module.healthStatus || 'Unknown';

  return (
    <main className="content" aria-labelledby="dashboard-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">StreamSignal workflow</p>
          <h1 id="dashboard-title">Control Center</h1>
        </div>
      </div>

      <section className="status-strip" aria-label="StreamSignal summary">
        <div>
          <span>Service</span>
          <strong>{serviceState}</strong>
        </div>
        <div>
          <span>Mode</span>
          <strong>{modeLabel(module?.mode || '')}</strong>
        </div>
        <div>
          <span>Active profile</span>
          <strong>{activeProfileName || 'None'}</strong>
        </div>
        <div>
          <span>Destinations</span>
          <strong>{statusValue(module?.status ?? {}, 'destinationCount') || 'Unknown'}</strong>
        </div>
      </section>

      <section className="stream-control" aria-label="StreamSignal">
        <div className="control-header">
          <div>
            <h2>StreamSignal</h2>
            <p>{offline ? 'StreamSignal unavailable.' : module.healthText || statusValue(module.status, 'message') || 'Ready for announcement setup.'}</p>
          </div>
          <StatusPill label={module ? healthLabel(module) : 'Offline'} tone={healthTone(module)} />
        </div>

        {offline ? (
          <div className="offline-actions inline-panel">
            <p>Start StreamSignal in service mode to load profiles and stream controls.</p>
            <div className="module-actions">
              <button className="button-primary" type="button" onClick={() => onStart(module?.id || 'streamsignal')}>
                <Play aria-hidden="true" />
                Start Service Mode
              </button>
              <button type="button" onClick={onRefresh}>
                <RefreshCw aria-hidden="true" />
                Refresh
              </button>
            </div>
          </div>
        ) : (
          <div className="control-grid">
            <div className="control-panel">
              <h3>Status</h3>
              <div className="meta-row">
                <span>Current State</span>
                <strong>{statusValue(module.status, 'state') || module.healthStatus || 'Unknown'}</strong>
              </div>
              <div className="meta-row">
                <span>Active Profile</span>
                <strong>{activeProfileName || 'None'}</strong>
              </div>
              <div className="meta-row">
                <span>Destination Count</span>
                <strong>{statusValue(module.status, 'destinationCount') || 'Unknown'}</strong>
              </div>
            </div>

            <div className="control-panel">
              <h3>Runtime</h3>
              <div className="meta-row">
                <span>Version</span>
                <strong>{module.version || 'Unknown'}</strong>
              </div>
              <div className="meta-row">
                <span>Mode</span>
                <strong>{modeLabel(module.mode)}</strong>
              </div>
              <div className="meta-row">
                <span>Protocol</span>
                <strong>{module.protocol || 'Unknown'}</strong>
              </div>
            </div>
          </div>
        )}

        <div className="profile-row">
          <label>
            <span>Profile</span>
            <select value={workflow.selectedProfile} onChange={(event) => workflow.onSelectProfile(event.currentTarget.value)} disabled={offline || workflow.busy}>
              <option value="">Select profile</option>
              {workflow.profiles.map((profile) => (
                <option value={profile} key={profile}>
                  {profile}
                </option>
              ))}
            </select>
          </label>
          <button className="button-primary" type="button" onClick={workflow.onActivateProfile} disabled={offline || !workflow.selectedProfile || workflow.busy}>
            <UserRound aria-hidden="true" />
            Activate
          </button>
        </div>

        {!activeProfileName && !offline ? <WorkflowNotice kind="warning" message="No active StreamSignal profile selected." /> : null}
        {workflow.message ? <WorkflowNotice kind={workflow.message.toLowerCase().includes('failed') ? 'error' : 'success'} message={workflow.message} /> : null}

        <div className="primary-actions">
          <button className="button-highlight" type="button" onClick={workflow.onGoLive} disabled={goLiveDisabled}>
            <Radio aria-hidden="true" />
            Go Live
          </button>
          <button className="button-danger" type="button" onClick={workflow.onEndStream} disabled={goLiveDisabled}>
            <Square aria-hidden="true" />
            End Stream
          </button>
          {module?.running ? (
            <button type="button" onClick={() => onOpen(module.id)}>
              <ExternalLink aria-hidden="true" />
              Open StreamSignal
            </button>
          ) : null}
          <button type="button" onClick={onRefresh}>
            <RefreshCw aria-hidden="true" />
            Refresh
          </button>
        </div>
      </section>

      <section className="section recent-activity" aria-label="Recent Activity">
        <div className="section-heading">
          <h2>Recent Activity</h2>
        </div>
        <div className="activity-grid">
          <article>
            <h3>Announcement</h3>
            <StatusPill
              label={resultLabel(workflow.announceStatus.success, workflow.announceStatus.lastRun, workflow.announceStatus.error)}
              tone={!workflow.announceStatus.lastRun ? 'neutral' : workflow.announceStatus.success ? 'running' : 'error'}
            />
            <span>{formatRun(workflow.announceStatus.lastRun)}</span>
          </article>
          <article>
            <h3>End Stream</h3>
            <StatusPill
              label={resultLabel(workflow.endStreamStatus.success, workflow.endStreamStatus.lastRun, workflow.endStreamStatus.error)}
              tone={!workflow.endStreamStatus.lastRun ? 'neutral' : workflow.endStreamStatus.success ? 'running' : 'error'}
            />
            <span>{formatRun(workflow.endStreamStatus.lastRun)}</span>
          </article>
        </div>
      </section>

      {workflow.pendingConfirmation ? (
        <div className="modal-backdrop" role="presentation">
          <section className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="duplicate-title">
            <div className="modal-header">
              <AlertTriangle aria-hidden="true" />
              <div>
                <h2 id="duplicate-title">Send again?</h2>
                <p>A recent announcement appears to have already been sent.</p>
              </div>
            </div>
            {workflow.pendingConfirmation.error ? <span>{workflow.pendingConfirmation.error}</span> : null}
            <div className="modal-actions">
              <button type="button" onClick={workflow.onCancelConfirmation}>
                Cancel
              </button>
              <button className="button-highlight" type="button" onClick={workflow.onConfirmGoLive}>
                Confirm
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export function ModulesPage({ modules, onStart, onOpen, onRefresh }: { modules: ModuleInfo[] } & ModuleActions) {
  return (
    <main className="content" aria-labelledby="diagnostics-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Read-only SIP details</p>
          <h1 id="diagnostics-title">Diagnostics</h1>
        </div>
      </div>

      {modules.length === 0 ? (
        <div className="empty-state compact">
          <Server aria-hidden="true" />
          <p>No Starsong modules detected.</p>
          <span>Install and launch a compatible application to begin using LivePanel.</span>
        </div>
      ) : (
        <div className="module-details">
          {modules.map((module) => (
            <article className="module-detail" key={module.id}>
              <div className="module-card-topline">
                <div>
                  <h2>{module.name}</h2>
                  <p>{module.endpoint || module.executable || 'No endpoint available'}</p>
                </div>
                <StatusPill label={healthLabel(module)} tone={healthTone(module)} />
              </div>

              <dl className="detail-list">
                <div>
                  <dt>Application</dt>
                  <dd>{module.name}</dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>{module.version || 'Unknown'}</dd>
                </div>
                <div>
                  <dt>Installed</dt>
                  <dd>{installedLabel(module)}</dd>
                </div>
                <div>
                  <dt>Running</dt>
                  <dd>{module.running ? 'Yes' : 'No'}</dd>
                </div>
                <div>
                  <dt>Mode</dt>
                  <dd>{modeLabel(module.mode)}</dd>
                </div>
                <div>
                  <dt>Health</dt>
                  <dd>{module.error || module.healthText || module.healthStatus || 'Unknown'}</dd>
                </div>
              </dl>

              <CapabilityList capabilities={module.capabilities} />
              <ModuleActionBar module={module} onStart={onStart} onOpen={onOpen} onRefresh={onRefresh} />

              <div className="raw-status">
                <h3>Status</h3>
                {statusEntries(module.status).length === 0 ? (
                  <p>No status data returned.</p>
                ) : (
                  <dl>
                    {statusEntries(module.status).map((entry) => (
                      <div key={entry.key}>
                        <dt>{entry.key}</dt>
                        <dd>{entry.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

function ModuleActionBar({ module, onStart, onOpen, onRefresh }: { module: ModuleInfo } & ModuleActions) {
  return (
    <div className="module-actions">
      {module.installed && !module.running ? (
        <button className="button-primary" type="button" onClick={() => onStart(module.id)}>
          <Play aria-hidden="true" />
          Start service mode
        </button>
      ) : null}
      {module.running ? (
        <button type="button" onClick={() => onOpen(module.id)}>
          <ExternalLink aria-hidden="true" />
          Open UI
        </button>
      ) : null}
      <button type="button" onClick={onRefresh}>
        <RefreshCw aria-hidden="true" />
        Refresh
      </button>
    </div>
  );
}

function CapabilityList({ capabilities }: { capabilities: string[] }) {
  return (
    <div className="capability-list" aria-label="Capabilities">
      {capabilities.length === 0 ? (
        <span className="capability muted">No capabilities reported</span>
      ) : (
        capabilities.map((capability) => (
          <span className="capability" key={capability}>
            {capability}
          </span>
        ))
      )}
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [profiles, setProfiles] = useState<string[]>([]);
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile>({ id: '', name: '' });
  const [selectedProfile, setSelectedProfile] = useState('');
  const [announceStatus, setAnnounceStatus] = useState<AnnounceStatus>({ lastRun: '', success: false });
  const [endStreamStatus, setEndStreamStatus] = useState<EndStreamStatus>({ lastRun: '', success: false });
  const [workflowMessage, setWorkflowMessage] = useState('');
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<AnnounceResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoStartEnabled, setAutoStartEnabled] = useState(true);

  async function loadStreamSignalWorkflow(nextModules: ModuleInfo[]) {
    const module = streamSignalModule(nextModules);
    if (!module?.running) {
      const empty = emptyWorkflowState();
      setProfiles(empty.profiles);
      setCurrentProfile(empty.currentProfile);
      setAnnounceStatus(empty.announceStatus);
      setEndStreamStatus(empty.endStreamStatus);
      return;
    }
    try {
      const [nextProfiles, nextCurrentProfile, nextAnnounceStatus, nextEndStreamStatus] = await Promise.all([
        getStreamSignalProfiles(),
        getStreamSignalCurrentProfile(),
        getStreamSignalAnnounceStatus(),
        getStreamSignalEndStreamStatus(),
      ]);
      setProfiles(nextProfiles);
      setCurrentProfile(nextCurrentProfile);
      setSelectedProfile((current) => current || nextCurrentProfile.name || nextProfiles[0] || '');
      setAnnounceStatus(nextAnnounceStatus);
      setEndStreamStatus(nextEndStreamStatus);
    } catch {
      const empty = emptyWorkflowState();
      setProfiles(empty.profiles);
      setCurrentProfile(empty.currentProfile);
      setAnnounceStatus(empty.announceStatus);
      setEndStreamStatus(empty.endStreamStatus);
    }
  }

  async function load(refresh = false) {
    setLoading(true);
    const next = refresh ? await refreshModules() : await listModules();
    setModules(next);
    await loadStreamSignalWorkflow(next);
    setLoading(false);
  }

  useEffect(() => {
    void load(true);
    void getAutoStartManagedModules().then(setAutoStartEnabled);
  }, []);

  async function runAction(action: () => Promise<ModuleInfo[]>) {
    setLoading(true);
    const next = await action();
    setModules(next);
    await loadStreamSignalWorkflow(next);
    setLoading(false);
  }

  async function toggleAutoStart(enabled: boolean) {
    setAutoStartEnabled(await setAutoStartManagedModules(enabled));
  }

  const healthyCount = useMemo(() => modules.filter((module) => module.healthy).length, [modules]);
  const workflow: StreamSignalWorkflow = {
    profiles,
    currentProfile,
    announceStatus,
    endStreamStatus,
    selectedProfile,
    message: workflowMessage,
    busy: workflowBusy,
    pendingConfirmation,
    onSelectProfile: setSelectedProfile,
    onActivateProfile: () => {
      void (async () => {
        setWorkflowBusy(true);
        setWorkflowMessage('');
        const activated = await activateStreamSignalProfile(selectedProfile);
        if (activated.success) {
          setCurrentProfile({ id: activated.profileId || '', name: activated.profile || selectedProfile });
          setWorkflowMessage('Profile activated');
          await load(true);
        } else {
          setWorkflowMessage('Profile activation failed');
        }
        setWorkflowBusy(false);
      })();
    },
    onGoLive: () => {
      void (async () => {
        setWorkflowBusy(true);
        setWorkflowMessage('');
        const response = await announceStreamSignal();
        if (response.requiresConfirmation) {
          setPendingConfirmation(response);
          setWorkflowMessage('');
        } else if (response.success) {
          setWorkflowMessage('Announcement Sent');
          setAnnounceStatus(await getStreamSignalAnnounceStatus());
        } else {
          setWorkflowMessage(response.error || 'Announcement failed');
          setAnnounceStatus(await getStreamSignalAnnounceStatus());
        }
        setWorkflowBusy(false);
      })();
    },
    onConfirmGoLive: () => {
      void (async () => {
        if (!pendingConfirmation?.confirmationId) {
          return;
        }
        setWorkflowBusy(true);
        const response = await confirmStreamSignalAnnouncement(pendingConfirmation.confirmationId);
        setPendingConfirmation(null);
        setWorkflowMessage(response.success ? 'Announcement Sent' : response.error || 'Announcement failed');
        setAnnounceStatus(await getStreamSignalAnnounceStatus());
        setWorkflowBusy(false);
      })();
    },
    onCancelConfirmation: () => setPendingConfirmation(null),
    onEndStream: () => {
      void (async () => {
        setWorkflowBusy(true);
        setWorkflowMessage('');
        const response = await endStreamSignalStream();
        setWorkflowMessage(response.success ? 'End Stream Complete' : response.error || 'End Stream failed');
        setEndStreamStatus(await getStreamSignalEndStreamStatus());
        setWorkflowBusy(false);
      })();
    },
  };

  return (
    <div className="app-shell">
      <div className="main-panel">
        <header className="topbar">
          <div className="brand-lockup">
            <Gauge aria-hidden="true" />
            <div>
              <strong>LivePanel</strong>
              <span>Starsong Tools</span>
            </div>
          </div>
          <nav className="topnav" aria-label="Primary">
            <button className={page === 'dashboard' ? 'active' : ''} onClick={() => setPage('dashboard')}>
              <LayoutDashboard aria-hidden="true" />
              Dashboard
            </button>
            <button className={page === 'diagnostics' ? 'active' : ''} onClick={() => setPage('diagnostics')}>
              <Blocks aria-hidden="true" />
              Diagnostics
            </button>
          </nav>
          <div className="topbar-status">
            <StatusPill label={loading ? 'Refreshing' : `${healthyCount}/${modules.length} healthy`} tone={healthyCount === modules.length && modules.length > 0 ? 'running' : 'info'} />
            <span className="environment-badge">Dev</span>
            <span className="version-badge">SIP v1</span>
          </div>
          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={autoStartEnabled}
              onChange={(event) => void toggleAutoStart(event.currentTarget.checked)}
            />
            Auto-start managed modules
          </label>
          <button className="icon-button" onClick={() => void load(true)} aria-label="Refresh modules" title="Refresh modules">
            <RefreshCw aria-hidden="true" />
          </button>
        </header>

        {page === 'dashboard' ? (
          <Dashboard
            modules={modules}
            workflow={workflow}
            onStart={(id) => void runAction(() => startModule(id))}
            onOpen={(id) => void runAction(() => openModule(id))}
            onRefresh={() => void load(true)}
          />
        ) : (
          <ModulesPage
            modules={modules}
            onStart={(id) => void runAction(() => startModule(id))}
            onOpen={(id) => void runAction(() => openModule(id))}
            onRefresh={() => void load(true)}
          />
        )}
      </div>
    </div>
  );
}
