import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Eye,
  ExternalLink,
  Globe2,
  Info,
  LayoutDashboard,
  MessageSquare,
  Monitor,
  Package,
  Play,
  RefreshCw,
  Radio,
  Server,
  Settings,
  Square,
  XCircle,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  activateStreamSignalProfile,
  activateTideReaderProfile,
  activateTuberSwitchProfile,
  announceStreamSignal,
  clearModuleExecutablePath,
  confirmStreamSignalAnnouncement,
  endStreamSignalStream,
  getAutoStartManagedModules,
  getModuleExecutableConfigs,
  getStreamSignalAnnounceStatus,
  getStreamSignalAnnouncementFields,
  getStreamSignalCurrentProfile,
  getStreamSignalEndStreamStatus,
  getStreamSignalProfiles,
  getTideReaderBrowserSupport,
  getTideReaderCurrentProfile,
  getTideReaderOverlaySnapshot,
  getTideReaderProfiles,
  getTuberSwitchRedeems,
  getTuberSwitchCurrentProfile,
  getTuberSwitchProfiles,
  listModules,
  openModule,
  pickModuleExecutablePath,
  refreshModules,
  setTideReaderBrowserSupport,
  setTuberSwitchRedeem,
  setAutoStartManagedModules,
  setModuleExecutablePath,
  startModule,
  type AnnouncementField,
  type AnnounceResult,
  type AnnounceStatus,
  type BrowserSupport,
  type CurrentProfile,
  type EndStreamStatus,
  type ModuleExecutableConfig,
  type ModuleInfo,
  type Redeem,
  type TideReaderOverlaySnapshot,
} from './lib/api/livepanel';
import './App.css';
import livePanelIcon from './assets/images/LivePanelIcon.png';
import streamSignalIcon from './assets/images/StreamSignalIcon.png';
import tideReaderIcon from './assets/images/TideReaderIcon.png';
import tuberSwitchIcon from './assets/images/TuberSwitchIcon.png';

type Page = 'dashboard' | 'settings' | 'diagnostics';

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
  announcementFields: AnnouncementField[];
  announcementFieldDrafts: Record<string, string>;
  hasSessionChanges: boolean;
  announceStatus: AnnounceStatus;
  endStreamStatus: EndStreamStatus;
  selectedProfile: string;
  busy: boolean;
  pendingConfirmation: AnnounceResult | null;
  onSelectProfile: (profile: string) => void;
  onChangeAnnouncementField: (id: string, value: string) => void;
  onResetAnnouncementFields: () => void;
  onGoLive: () => void;
  onConfirmGoLive: () => void;
  onCancelConfirmation: () => void;
  onEndStream: () => void;
};

type TideReaderWorkflow = {
  profiles: string[];
  currentProfile: CurrentProfile;
  selectedProfile: string;
  busy: boolean;
  error?: string;
  hasSessionChanges?: boolean;
  browserSupport?: BrowserSupport;
  browserSupportPending?: boolean;
  redeems?: Redeem[];
  pendingRedeemIds?: string[];
  onSelectProfile: (profile: string) => void;
  onToggleBrowserSupport?: (enabled: boolean) => void;
  onToggleRedeem?: (id: string, enabled: boolean) => void;
};

type ProfilePreviewTarget = 'streamsignal' | 'tidereader' | 'tuberswitch';

const emptyTideReaderOverlay: TideReaderOverlaySnapshot = {
  available: false,
  nowPlaying: {},
  settings: {},
  overlayUrl: '',
  coverUrl: '',
};

function emptyWorkflowState() {
  return {
    profiles: [] as string[],
    currentProfile: { id: '', name: '' } as CurrentProfile,
    announcementFields: [] as AnnouncementField[],
    announcementFieldDrafts: {} as Record<string, string>,
    announceStatus: { lastRun: '', success: false } as AnnounceStatus,
    endStreamStatus: { lastRun: '', success: false } as EndStreamStatus,
  };
}

function fieldDraftsFrom(fields: AnnouncementField[]) {
  return fields.reduce<Record<string, string>>((drafts, field) => {
    drafts[field.id] = field.value;
    return drafts;
  }, {});
}

function fieldDraftsEqual(left: Record<string, string>, right: Record<string, string>) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if ((left[key] ?? '') !== (right[key] ?? '')) {
      return false;
    }
  }
  return true;
}

function fieldOverridesFrom(fields: AnnouncementField[], drafts: Record<string, string>) {
  return fields.map((field) => ({
    id: field.id,
    value: drafts[field.id] ?? field.value,
  }));
}

function announcementFieldDraftValue(workflow: StreamSignalWorkflow, id: string) {
  const field = workflow.announcementFields.find((item) => item.id === id);
  return workflow.announcementFieldDrafts[id] ?? field?.value ?? '';
}

const announcementFieldOrder = new Map([
  ['stream_title', 0],
  ['stream_url', 1],
  ['category', 2],
  ['hashtags', 3],
  ['message', 4],
]);

const announcementFieldLabels: Record<string, string> = {
  stream_title: 'Stream Title',
  stream_url: 'Stream URL',
  category: 'Category/Game',
  hashtags: 'Hashtags',
  message: 'Optional Message',
};

const announcementFieldStatusKeys: Record<string, string> = {
  stream_title: 'streamTitle',
  stream_url: 'streamUrl',
  category: 'category',
  hashtags: 'hashtags',
};

const optionalAnnouncementFieldStatusKeys: Record<string, string> = {
  message: 'optionalMessage',
};

function hydrateAnnouncementFieldsFromStatus(fields: AnnouncementField[], status: Record<string, unknown>) {
  const hasActiveProfile = Boolean(statusValue(status, 'activeProfile') || statusValue(status, 'activeProfileId'));
  return fields.map((field) => {
    const requiredStatusKey = announcementFieldStatusKeys[field.id];
    if (requiredStatusKey && hasActiveProfile) {
      return { ...field, value: statusValue(status, requiredStatusKey) };
    }
    const optionalStatusKey = optionalAnnouncementFieldStatusKeys[field.id];
    if (optionalStatusKey && Object.prototype.hasOwnProperty.call(status, optionalStatusKey)) {
      return { ...field, value: statusValue(status, optionalStatusKey) };
    }
    return field;
  });
}

function orderedAnnouncementFields(fields: AnnouncementField[]) {
  return fields
    .map((field, index) => ({ field, index }))
    .sort((left, right) => {
      const leftOrder = announcementFieldOrder.get(left.field.id) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = announcementFieldOrder.get(right.field.id) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return left.index - right.index;
    })
    .map(({ field }) => field);
}

function announcementFieldLabel(field: AnnouncementField) {
  return announcementFieldLabels[field.id] ?? (field.name || field.id);
}

function emptyProfileWorkflowState() {
  return {
    profiles: [] as string[],
    currentProfile: { id: '', name: '' } as CurrentProfile,
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

function tideReaderModule(modules: ModuleInfo[]) {
  return modules.find((module) => module.id === 'tidereader') ?? null;
}

function tuberSwitchModule(modules: ModuleInfo[]) {
  return modules.find((module) => module.id === 'tuberswitch') ?? null;
}

function statusValue(status: Record<string, unknown>, key: string) {
  const value = status?.[key];
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
}

function statusListValue(status: Record<string, unknown>, key: string) {
  const value = status?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : [];
}

function hasCapability(module: ModuleInfo | null, capability: string) {
  const target = capability.trim().toLowerCase();
  return (module?.capabilities ?? []).some((item) => item.trim().toLowerCase() === target);
}

function hasStatusKey(status: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(status ?? {}, key);
}

function recordValue(record: Record<string, unknown>, key: string) {
  const value = record?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function textValue(record: Record<string, unknown>, key: string, fallback = '') {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function numberValue(record: Record<string, unknown>, key: string, fallback: number) {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanValue(record: Record<string, unknown>, key: string, fallback: boolean) {
  const value = record?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

function truncateText(value: string, maxCharacters: number) {
  if (maxCharacters <= 0) {
    return value;
  }
  if (!value || value.length <= maxCharacters) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxCharacters - 1)).trimEnd()}...`;
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return null;
  }
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function withAlpha(hex: string, opacity: number) {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return `rgba(50, 51, 79, ${opacity})`;
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
}

function overlayBackground(settings: Record<string, unknown>) {
  const container = recordValue(settings, 'overlayContainerStyle');
  const opacity = numberValue(container, 'opacity', 0.86);
  if (textValue(container, 'backgroundMode', 'solid').toLowerCase() === 'gradient') {
    const gradient = recordValue(container, 'gradient');
    const color1 = withAlpha(textValue(gradient, 'color1Hex', '#3B3187'), opacity);
    const color2 = withAlpha(textValue(gradient, 'color2Hex', '#411F8C'), opacity);
    const color3 = withAlpha(textValue(gradient, 'color3Hex', '#282952'), opacity);
    return `linear-gradient(${numberValue(gradient, 'angleDeg', 135)}deg, ${color1}, ${color2} 52%, ${color3})`;
  }
  return withAlpha(textValue(container, 'backgroundColorHex', textValue(settings, 'backgroundColorHex', '#32334F')), opacity);
}

function textStyle(settings: Record<string, unknown>, key: string, fallbackSize: number) {
  const style = recordValue(settings, key);
  return {
    color: textValue(style, 'colorHex', '#E6E6E6'),
    fontFamily: `"${textValue(style, 'fontFamily', 'Segoe UI Variable Display')}", "Segoe UI", sans-serif`,
    fontSize: `${numberValue(style, 'fontSizePx', fallbackSize)}px`,
    fontWeight: booleanValue(style, 'bold', key === 'songTextStyle') ? 800 : 500,
    fontStyle: booleanValue(style, 'italic', false) ? 'italic' : 'normal',
    textDecoration: booleanValue(style, 'underline', false) ? 'underline' : 'none',
  } satisfies CSSProperties;
}

function coverURLWithCacheBuster(snapshot: TideReaderOverlaySnapshot) {
  if (!snapshot.coverUrl) {
    return '';
  }
  const token = textValue(snapshot.nowPlaying, 'title') + textValue(snapshot.nowPlaying, 'artist');
  const separator = snapshot.coverUrl.includes('?') ? '&' : '?';
  return `${snapshot.coverUrl}${separator}v=${encodeURIComponent(token)}`;
}

function tideReaderOverlayURL(module: ModuleInfo | null, snapshot: TideReaderOverlaySnapshot) {
  return snapshot.overlayUrl || statusValue(module?.status ?? {}, 'overlayUrl') || 'http://127.0.0.1:17655/overlay';
}

function tideReaderNowPlayingIsBrowser(snapshot: TideReaderOverlaySnapshot) {
  const nowPlaying = snapshot.nowPlaying ?? {};
  return textValue(nowPlaying, 'provider').toLowerCase() === 'browser' || Boolean(textValue(nowPlaying, 'browser'));
}

function tideReaderSnapshotForBrowserSupport(snapshot: TideReaderOverlaySnapshot, browserSupport?: BrowserSupport) {
  if (browserSupport?.enabled || !tideReaderNowPlayingIsBrowser(snapshot)) {
    return snapshot;
  }
  return {
    ...snapshot,
    nowPlaying: {},
    coverUrl: '',
  };
}

function tideReaderSourceLabel(status: Record<string, unknown>, snapshot: TideReaderOverlaySnapshot, browserSupport?: BrowserSupport) {
  const source = statusValue(status, 'source');
  if (!browserSupport?.enabled && (source.toLowerCase() === 'browser' || tideReaderNowPlayingIsBrowser(snapshot))) {
    return 'None';
  }
  return formatStatusState(source || 'none');
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function formatStatusState(value: string) {
  if (!value) {
    return 'Unavailable';
  }
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function tuberSwitchModeLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'png') {
    return 'PNG';
  }
  if (normalized === '3d') {
    return '3D';
  }
  return value ? formatStatusState(value) : 'Unavailable';
}

function tuberSwitchRedeemLabel(status: Record<string, unknown>) {
  const enabled = booleanValue(status, 'redeemsEnabled', false);
  const manageableCount = numberValue(status, 'manageableRedeemCount', numberValue(status, 'redeemCount', 0));
  const unmanageableCount = numberValue(status, 'unmanageableRedeemCount', 0);
  if (enabled) {
    return manageableCount > 0 ? `Enabled (${manageableCount} manageable ${manageableCount === 1 ? 'redeem' : 'redeems'})` : 'Enabled';
  }
  if (manageableCount > 0) {
    return `Configured (${manageableCount} manageable), disabled`;
  }
  if (unmanageableCount > 0) {
    return `${unmanageableCount} unmanageable ${unmanageableCount === 1 ? 'redeem' : 'redeems'}`;
  }
  return 'Not configured';
}

function tuberSwitchDetectionLabel(status: Record<string, unknown>) {
  const detectionStatus = statusValue(status, 'appDetectionStatus');
  if (!booleanValue(status, 'appDetectionEnabled', false)) {
    return detectionStatus && detectionStatus !== 'Disabled' ? `Disabled (${detectionStatus})` : 'Disabled';
  }
  return detectionStatus || 'Enabled';
}

function tuberSwitchOBSLabel(status: Record<string, unknown>) {
  const summary = statusValue(status, 'obsSummary');
  if (summary) {
    return summary;
  }
  return booleanValue(status, 'obsConnected', false) ? 'Connected' : 'Not connected';
}

function streamSignalOBSReadiness(status: Record<string, unknown>): { value: string; tone: 'running' | 'warning' | 'offline' } {
  const value = statusValue(status, 'obsStatus');
  if (!value) {
    return { value: 'Offline', tone: 'offline' };
  }
  const normalized = value.toLowerCase();
  const offline =
    normalized.includes('offline') ||
    normalized.includes('disconnected') ||
    normalized.includes('not connected') ||
    normalized.includes('unavailable') ||
    normalized.includes('missing');
  if (offline) {
    return { value, tone: 'offline' };
  }
  const connected =
    normalized.includes('connected') ||
    normalized.includes('ready') ||
    normalized.includes('running') ||
    normalized.includes('available');
  return { value, tone: connected ? 'running' : 'warning' };
}

function tideReaderLayoutLabel(status: Record<string, unknown>, settings: Record<string, unknown>) {
  return statusValue(status, 'layout') || textValue(settings, 'layout', textValue(settings, 'imagePosition', 'Current overlay'));
}

function tideReaderAlbumArtLabel(status: Record<string, unknown>, settings: Record<string, unknown>) {
  if (typeof status?.albumArtVisible === 'boolean') {
    return status.albumArtVisible ? 'Visible' : 'Hidden';
  }
  return numberValue(settings, 'imageSizePx', 0) > 0 ? 'Visible' : 'Hidden';
}

function tideReaderStatusPillLabel(status: Record<string, unknown>, settings: Record<string, unknown>) {
  if (typeof status?.statusPillVisible === 'boolean') {
    return status.statusPillVisible ? 'Visible' : 'Hidden';
  }
  return booleanValue(settings, 'showPlaybackState', true) ? 'Visible' : 'Hidden';
}

function tideReaderBackgroundLabel(status: Record<string, unknown>, container: Record<string, unknown>) {
  return formatStatusState(statusValue(status, 'backgroundMode') || textValue(container, 'backgroundMode', 'Solid'));
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

function destinationLabel(value: string) {
  if (!value) {
    return 'Unknown';
  }
  return value === '1' ? '1 Destination' : `${value} Destinations`;
}

function streamSignalDestinationLabel(status: Record<string, unknown>) {
  const total = statusValue(status, 'destinationCount');
  const enabled = statusValue(status, 'enabledDestinationCount');
  if (enabled && total && enabled !== total) {
    return `${enabled} enabled of ${destinationLabel(total).toLowerCase()}`;
  }
  return destinationLabel(enabled || total);
}

function streamSignalPlatformLabel(status: Record<string, unknown>) {
  const platforms = statusListValue(status, 'destinationPlatforms');
  return platforms.length > 0 ? platforms.map(formatStatusState).join(', ') : 'Not reported';
}

function latestActivity(announceStatus: AnnounceStatus, endStreamStatus: EndStreamStatus) {
  const announceTime = Date.parse(announceStatus.lastRun || '');
  const endStreamTime = Date.parse(endStreamStatus.lastRun || '');
  if (Number.isNaN(announceTime) && Number.isNaN(endStreamTime)) {
    return 'Unavailable';
  }
  if (!Number.isNaN(announceTime) && (Number.isNaN(endStreamTime) || announceTime >= endStreamTime)) {
    return announceStatus.success ? 'Announcement Successful' : 'Announcement Failed';
  }
  return endStreamStatus.success ? 'End Stream Successful' : 'End Stream Failed';
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

function ActivityCard({ title, status }: { title: string; status: AnnounceStatus | EndStreamStatus }) {
  const failed = Boolean(status.lastRun && !status.success);
  return (
    <article>
      <h3>{title}</h3>
      <StatusPill
        label={!status.lastRun ? 'No activity' : status.success ? 'Success' : 'Failed'}
        tone={!status.lastRun ? 'neutral' : status.success ? 'running' : 'error'}
      />
      <span>{formatRun(status.lastRun)}</span>
      {failed && status.error ? (
        <details className="activity-details">
          <summary>View Details</summary>
          <p>{status.error}</p>
        </details>
      ) : null}
    </article>
  );
}

export function Dashboard({
  modules,
  workflow,
  tideReaderWorkflow,
  tuberSwitchWorkflow,
  tideReaderOverlay = emptyTideReaderOverlay,
  onOpen,
  onRefresh,
}: { modules: ModuleInfo[]; workflow: StreamSignalWorkflow; tideReaderWorkflow: TideReaderWorkflow; tuberSwitchWorkflow?: TideReaderWorkflow; tideReaderOverlay?: TideReaderOverlaySnapshot } & Pick<ModuleActions, 'onOpen' | 'onRefresh'>) {
  tuberSwitchWorkflow = tuberSwitchWorkflow ?? {
    profiles: [],
    currentProfile: { id: '', name: '' },
    selectedProfile: '',
    busy: false,
    onSelectProfile: () => undefined,
  };
  const [detailTarget, setDetailTarget] = useState<ProfilePreviewTarget | null>(null);
  const streamSignal = streamSignalModule(modules);
  const tideReader = tideReaderModule(modules);
  const tuberSwitch = tuberSwitchModule(modules);
  const activeProfileName = workflow.currentProfile.name || statusValue(streamSignal?.status ?? {}, 'activeProfile');
  const goLiveDisabled = !streamSignal?.running || !activeProfileName || workflow.busy;
  const setupMessage = streamSetupMessage(modules, workflow, tideReaderWorkflow, tuberSwitchWorkflow);
  const setupTone = setupMessage === 'All modules connected and ready.' ? 'running' : 'warning';

  return (
    <main className="content" aria-labelledby="dashboard-title">
      <div className="page-heading">
        <div>
          <h1 id="dashboard-title">Stream Control</h1>
          <p>Profiles, overlays, and avatar setup for this session.</p>
        </div>
      </div>

      <div className="dashboard-console">
        <div className="dashboard-workspace">
          <section className="current-setup-card" aria-labelledby="current-setup-title">
            <div className="section-heading">
              <h2 id="current-setup-title">Current Stream Setup</h2>
              <StatusPill label={setupMessage} tone={setupTone} />
            </div>

            <div className="setup-profile-grid">
              <SetupProfileCard
                title="Announcements"
                moduleName="StreamSignal"
                icon={streamSignalIcon}
                module={streamSignal}
                profiles={workflow.profiles}
                selectedProfile={workflow.selectedProfile}
                currentProfile={activeProfileName}
                busy={workflow.busy}
                hasSessionChanges={workflow.hasSessionChanges}
                selected={detailTarget === 'streamsignal'}
                onSelectProfile={workflow.onSelectProfile}
                onPreview={() => setDetailTarget('streamsignal')}
              />
              <SetupProfileCard
                title="Overlay"
                moduleName="TideReader"
                icon={tideReaderIcon}
                module={tideReader}
                profiles={tideReaderWorkflow.profiles}
                selectedProfile={tideReaderWorkflow.selectedProfile}
                currentProfile={tideReaderWorkflow.currentProfile.name}
                busy={tideReaderWorkflow.busy}
                hasSessionChanges={false}
                statusBadge={tideReaderWorkflow.browserSupport?.enabled ? 'Browser Support On' : ''}
                selected={detailTarget === 'tidereader'}
                onSelectProfile={tideReaderWorkflow.onSelectProfile}
                onPreview={() => setDetailTarget('tidereader')}
              />
              <SetupProfileCard
                title="Avatar"
                moduleName="TuberSwitch"
                icon={tuberSwitchIcon}
                module={tuberSwitch}
                profiles={tuberSwitchWorkflow.profiles}
                selectedProfile={tuberSwitchWorkflow.selectedProfile}
                currentProfile={tuberSwitchDisplayProfile(tuberSwitch, tuberSwitchWorkflow)}
                busy={tuberSwitchWorkflow.busy}
                error={tuberSwitchWorkflow.error}
                hasSessionChanges={Boolean(tuberSwitchWorkflow.hasSessionChanges)}
                selected={detailTarget === 'tuberswitch'}
                onSelectProfile={tuberSwitchWorkflow.onSelectProfile}
                onPreview={() => setDetailTarget('tuberswitch')}
              />
            </div>

            <div className="primary-actions setup-actions">
              <button className="button-highlight" type="button" onClick={workflow.onGoLive} disabled={goLiveDisabled}>
                <Radio aria-hidden="true" />
                Go Live
              </button>
              <button className="button-danger" type="button" onClick={workflow.onEndStream} disabled={goLiveDisabled}>
                <Square aria-hidden="true" />
                End Stream
              </button>
            </div>
          </section>

          {workflow.pendingConfirmation ? (
            <ConfirmationModal workflow={workflow} />
          ) : null}
        </div>

        {detailTarget ? (
          <ProfileDetailDrawer
            target={detailTarget}
            modules={modules}
            workflow={workflow}
            tideReaderWorkflow={tideReaderWorkflow}
            tuberSwitchWorkflow={tuberSwitchWorkflow}
            tideReaderOverlay={tideReaderOverlay}
            onClose={() => setDetailTarget(null)}
            onOpen={onOpen}
            onRefresh={onRefresh}
          />
        ) : null}
      </div>
    </main>
  );
}

function streamSetupMessage(modules: ModuleInfo[], workflow: StreamSignalWorkflow, tideReaderWorkflow: TideReaderWorkflow, tuberSwitchWorkflow: TideReaderWorkflow) {
  const moduleChecks = [
    { name: 'StreamSignal', module: streamSignalModule(modules) },
    { name: 'TideReader', module: tideReaderModule(modules) },
    { name: 'TuberSwitch', module: tuberSwitchModule(modules) },
  ];
  const unavailable = moduleChecks.find((entry) => !entry.module?.running);
  if (unavailable) {
    return `${unavailable.name} unavailable.`;
  }
  if (!(workflow.currentProfile.name || workflow.selectedProfile)) {
    return 'No StreamSignal profile selected.';
  }
  if (!(tideReaderWorkflow.currentProfile.name || tideReaderWorkflow.selectedProfile)) {
    return 'No TideReader profile selected.';
  }
  if (!(tuberSwitchWorkflow.currentProfile.name || tuberSwitchWorkflow.selectedProfile)) {
    return 'No TuberSwitch profile selected.';
  }
  if (tuberSwitchWorkflow.error) {
    return 'Recovery actions require attention.';
  }
  return 'All modules connected and ready.';
}

function onlineModuleCount(modules: ModuleInfo[]) {
  return [streamSignalModule(modules), tideReaderModule(modules), tuberSwitchModule(modules)].filter((module) => module?.running).length;
}

function readinessValue(module: ModuleInfo | null, profileName: string) {
  if (!module?.running) {
    return 'Offline';
  }
  return profileName ? 'Ready' : 'Needs profile';
}

function readinessTone(module: ModuleInfo | null, profileName: string): 'running' | 'warning' {
  return module?.running && profileName ? 'running' : 'warning';
}

function tuberSwitchDisplayProfile(module: ModuleInfo | null, workflow: TideReaderWorkflow) {
  const name = workflow.currentProfile.name || statusValue(module?.status ?? {}, 'activeProfile');
  const mode = tuberSwitchModeLabel(statusValue(module?.status ?? {}, 'activeMode'));
  if (!name) {
    return '';
  }
  return mode && mode !== 'Unavailable' ? `${name} (${mode})` : name;
}

function SetupProfileCard({
  title,
  moduleName,
  icon,
  module,
  profiles,
  selectedProfile,
  currentProfile,
  busy,
  error,
  hasSessionChanges,
  statusBadge,
  selected,
  onSelectProfile,
  onPreview,
}: {
  title: string;
  moduleName: string;
  icon: string;
  module: ModuleInfo | null;
  profiles: string[];
  selectedProfile: string;
  currentProfile: string;
  busy: boolean;
  error?: string;
  hasSessionChanges?: boolean;
  statusBadge?: string;
  selected: boolean;
  onSelectProfile: (profile: string) => void;
  onPreview: () => void;
}) {
  const offline = !module?.running;
  const needsProfile = !offline && !currentProfile;
  return (
    <article className={`setup-profile-card ${selected ? 'selected' : ''}`}>
      <div className="setup-profile-header">
        <div className="setup-profile-label-row">
          <span>{title}</span>
          <button type="button" className={`detail-icon-button ${hasSessionChanges ? 'has-session-changes' : ''}`} onClick={onPreview} aria-label={`View ${moduleName} app details`}>
            <Eye aria-hidden="true" />
            {hasSessionChanges ? <span className="session-change-dot" aria-hidden="true" /> : null}
          </button>
        </div>
        <img className="module-hero-icon" src={icon} alt="" aria-hidden="true" />
      </div>
      <h3>{moduleName}</h3>
      <label className="profile-select-label">
        <span className="sr-only">{moduleName} profile</span>
        <select value={selectedProfile} onChange={(event) => onSelectProfile(event.currentTarget.value)} disabled={offline || busy}>
          <option value="">Select profile</option>
          {profiles.map((profile) => (
            <option value={profile} key={profile}>
              {profile}
            </option>
          ))}
        </select>
      </label>
      <div className="setup-profile-footer">
        <div className="setup-profile-status-row">
          <span className={offline ? 'inactive' : needsProfile ? 'warning-dot' : 'active-dot'}>{offline ? `${moduleName} unavailable` : needsProfile ? 'Needs profile' : 'Active'}</span>
          {hasSessionChanges ? <span className="session-change-pill">Manual edit</span> : null}
          {!offline && statusBadge ? <span className="app-state-pill">{statusBadge}</span> : null}
        </div>
        {needsProfile ? null : <small>{offline ? 'Offline' : currentProfile}</small>}
      </div>
      {error ? <p className="module-inline-message error">{error}</p> : null}
    </article>
  );
}

function ReadinessItem({ icon, label, value, tone }: { icon: 'modules' | 'obs' | 'internet' | 'twitch'; label: string; value: string; tone: 'running' | 'warning' | 'offline' }) {
  const Icon = icon === 'modules' ? Package : icon === 'obs' ? Monitor : icon === 'internet' ? Globe2 : MessageSquare;
  return (
    <article className={`readiness-item readiness-${tone}`}>
      <Icon aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function TopbarReadiness({ modules }: { modules: ModuleInfo[] }) {
  const streamSignal = streamSignalModule(modules);
  const onlineCount = onlineModuleCount(modules);
  const obsReadiness = streamSignalOBSReadiness(streamSignal?.status ?? {});
  return (
    <div className="topbar-readiness" aria-label="Stream readiness">
      <ReadinessItem icon="modules" label="Modules" value={`${onlineCount} / 3`} tone={onlineCount === 3 ? 'running' : 'warning'} />
      <ReadinessItem icon="obs" label="OBS" value={obsReadiness.value} tone={obsReadiness.tone} />
      <ReadinessItem icon="internet" label="Internet" value={statusValue(streamSignal?.status ?? {}, 'internetStatus') || 'Stable'} tone="running" />
      <ReadinessItem icon="twitch" label="Twitch" value={statusValue(streamSignal?.status ?? {}, 'twitchStatus') || 'Connected'} tone="running" />
    </div>
  );
}

function moduleVisual(id: string) {
  if (id === 'tidereader') {
    return { icon: tideReaderIcon, role: 'Now Playing Overlay' };
  }
  if (id === 'tuberswitch') {
    return { icon: tuberSwitchIcon, role: 'Avatar & Redeems' };
  }
  return { icon: streamSignalIcon, role: 'Announcements & Events' };
}

function ModuleManagementStrip({
  modules,
  workflow,
  tideReaderWorkflow,
  tuberSwitchWorkflow,
  onStart,
  onOpen,
  onRefresh,
}: { modules: ModuleInfo[]; workflow: StreamSignalWorkflow; tideReaderWorkflow: TideReaderWorkflow; tuberSwitchWorkflow: TideReaderWorkflow } & ModuleActions) {
  const moduleEntries = [
    { id: 'streamsignal', name: 'StreamSignal', module: streamSignalModule(modules), profile: workflow.currentProfile.name || workflow.selectedProfile },
    { id: 'tidereader', name: 'TideReader', module: tideReaderModule(modules), profile: tideReaderWorkflow.currentProfile.name || tideReaderWorkflow.selectedProfile },
    { id: 'tuberswitch', name: 'TuberSwitch', module: tuberSwitchModule(modules), profile: tuberSwitchDisplayProfile(tuberSwitchModule(modules), tuberSwitchWorkflow) || tuberSwitchWorkflow.selectedProfile },
  ];
  return (
    <div className="module-management-grid">
      {moduleEntries.map((entry) => {
        const module = entry.module;
        const visual = moduleVisual(entry.id);
        return (
          <article className={`module-mini-card module-${entry.id}`} key={entry.id}>
            <div className="module-mini-top">
              <img className="module-hero-icon" src={visual.icon} alt="" aria-hidden="true" />
              <StatusPill label={module ? healthLabel(module) : 'Offline'} tone={healthTone(module)} />
            </div>
            <div className="module-mini-copy">
              <h3>{module?.name || entry.name}</h3>
              <p>{visual.role}</p>
            </div>
            <div className="module-mini-profile">
              <span>Active Profile</span>
              <strong>{entry.profile || 'No profile selected'}</strong>
            </div>
            <div className="module-actions compact-actions">
              {module && !module.running ? (
                <button type="button" onClick={() => onStart(module.id)}>
                  <Play aria-hidden="true" />
                  Start
                </button>
              ) : null}
              {module?.running ? (
                <button type="button" onClick={() => onOpen(module.id)}>
                  <ExternalLink aria-hidden="true" />
                  Open
                </button>
              ) : null}
              <button type="button" onClick={onRefresh}>
                <RefreshCw aria-hidden="true" />
                Refresh
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ProfileDetailDrawer({
  target,
  modules,
  workflow,
  tideReaderWorkflow,
  tuberSwitchWorkflow,
  tideReaderOverlay,
  onClose,
  onOpen,
  onRefresh,
}: {
  target: ProfilePreviewTarget;
  modules: ModuleInfo[];
  workflow: StreamSignalWorkflow;
  tideReaderWorkflow: TideReaderWorkflow;
  tuberSwitchWorkflow: TideReaderWorkflow;
  tideReaderOverlay: TideReaderOverlaySnapshot;
  onClose: () => void;
  onOpen: (id: string) => void;
  onRefresh: () => void;
}) {
  const [drawerWidth, setDrawerWidth] = useState(380);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function beginResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const pointerID = event.pointerId;
    event.currentTarget.setPointerCapture(pointerID);
    const startX = event.clientX;
    const startWidth = drawerWidth;

    function onPointerMove(moveEvent: PointerEvent) {
      const maxWidth = Math.max(320, window.innerWidth - 28);
      const nextWidth = Math.min(maxWidth, Math.max(320, startWidth + startX - moveEvent.clientX));
      setDrawerWidth(nextWidth);
    }

    function onPointerUp() {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  }

  const meta = profileDetailMeta(target, modules, workflow, tideReaderWorkflow, tuberSwitchWorkflow);

  return (
    <div className="profile-detail-drawer-layer" role="presentation">
      <button className="profile-detail-scrim" type="button" onClick={onClose} aria-label="Dismiss app details" />
      <aside className="profile-detail-drawer" aria-labelledby="profile-detail-title" style={{ '--drawer-width': `${drawerWidth}px` } as CSSProperties}>
        <button className="drawer-resize-handle" type="button" onPointerDown={beginResize} aria-label="Resize app details drawer" />
        <button className="icon-button detail-close" type="button" onClick={onClose} aria-label="Close app details">
          <XCircle aria-hidden="true" />
        </button>
        <div className="profile-detail-header">
          <img className="module-hero-icon" src={meta.icon} alt="" aria-hidden="true" />
          <div>
            <h2 id="profile-detail-title">{meta.title}</h2>
            <p>{meta.subtitle}</p>
          </div>
        </div>
        {target === 'streamsignal' ? <StreamSignalPreview module={streamSignalModule(modules)} workflow={workflow} onOpen={onOpen} onRefresh={onRefresh} /> : null}
        {target === 'tidereader' ? <TideReaderPreview module={tideReaderModule(modules)} workflow={tideReaderWorkflow} overlaySnapshot={tideReaderOverlay} onOpen={onOpen} onRefresh={onRefresh} /> : null}
        {target === 'tuberswitch' ? <TuberSwitchPreview module={tuberSwitchModule(modules)} workflow={tuberSwitchWorkflow} onOpen={onOpen} onRefresh={onRefresh} /> : null}
      </aside>
    </div>
  );
}

function profileDetailMeta(target: ProfilePreviewTarget, modules: ModuleInfo[], workflow: StreamSignalWorkflow, tideReaderWorkflow: TideReaderWorkflow, tuberSwitchWorkflow: TideReaderWorkflow) {
  if (target === 'tidereader') {
    return {
      icon: tideReaderIcon,
      title: 'TideReader',
      subtitle: 'App Details',
    };
  }
  if (target === 'tuberswitch') {
    return {
      icon: tuberSwitchIcon,
      title: 'TuberSwitch',
      subtitle: 'App Details',
    };
  }
  return {
    icon: streamSignalIcon,
    title: 'StreamSignal',
    subtitle: 'App Details',
  };
}

function StreamSignalPreview({ module, workflow, onOpen, onRefresh }: { module: ModuleInfo | null; workflow: StreamSignalWorkflow; onOpen: (id: string) => void; onRefresh: () => void }) {
  const status = module?.status ?? {};
  const showAnnouncementFields = hasCapability(module, 'announcement-fields') || workflow.announcementFields.length > 0;
  return (
    <div className="drawer-content">
      <PreviewField label="Destinations" value={streamSignalDestinationLabel(status)} />
      <PreviewField label="Platforms" value={streamSignalPlatformLabel(status)} />
      {showAnnouncementFields ? <AnnouncementFieldsEditor workflow={workflow} /> : null}
      <PreviewField label="Included image" value={statusValue(status, 'image') || 'None included'} />
      <PreviewField label="Template" value={statusValue(status, 'template') || 'Not reported'} />
      <PreviewField label="Last Used" value={formatRun(workflow.announceStatus.lastRun)} />
      <PreviewField label="Last StreamSignal Action" value={latestActivity(workflow.announceStatus, workflow.endStreamStatus)} />
      <button type="button" onClick={onRefresh}>
        <RefreshCw aria-hidden="true" />
        Refresh
      </button>
      <button type="button" onClick={() => onOpen('streamsignal')}>
        <ExternalLink aria-hidden="true" />
        Open in StreamSignal
      </button>
    </div>
  );
}

function TideReaderPreview({ module, workflow, overlaySnapshot, onOpen, onRefresh }: { module: ModuleInfo | null; workflow: TideReaderWorkflow; overlaySnapshot: TideReaderOverlaySnapshot; onOpen: (id: string) => void; onRefresh: () => void }) {
  const status = module?.status ?? {};
  const displaySnapshot = tideReaderSnapshotForBrowserSupport(overlaySnapshot, workflow.browserSupport);
  const settings = displaySnapshot.settings ?? {};
  const container = recordValue(settings, 'overlayContainerStyle');
  const source = tideReaderSourceLabel(status, overlaySnapshot, workflow.browserSupport);
  const showBrowserSupport = hasCapability(module, 'browser-support') || hasStatusKey(status, 'browserSupportEnabled') || Boolean(workflow.browserSupport);
  return (
    <div className="drawer-content">
      <div className="drawer-preview-frame">
        <TideReaderOverlayPreview snapshot={displaySnapshot} />
      </div>
      <PreviewField label="Profile" value={workflow.currentProfile.name || workflow.selectedProfile || 'No profile selected'} />
      <PreviewField label="Current source" value={source} />
      {showBrowserSupport ? <BrowserSupportControl workflow={workflow} /> : null}
      <PreviewField label="Layout" value={tideReaderLayoutLabel(status, settings)} />
      <PreviewField label="Album art" value={tideReaderAlbumArtLabel(status, settings)} />
      <PreviewField label="Status pill" value={tideReaderStatusPillLabel(status, settings)} />
      <PreviewField label="Background" value={tideReaderBackgroundLabel(status, container)} />
      <PreviewField label="Overlay URL" value={statusValue(status, 'overlayUrl') || overlaySnapshot.overlayUrl || 'Managed in TideReader'} />
      <button type="button" onClick={onRefresh}>
        <RefreshCw aria-hidden="true" />
        Refresh
      </button>
      <button type="button" onClick={() => onOpen('tidereader')}>
        <ExternalLink aria-hidden="true" />
        Open in TideReader
      </button>
    </div>
  );
}

function TuberSwitchPreview({ module, workflow, onOpen, onRefresh }: { module: ModuleInfo | null; workflow: TideReaderWorkflow; onOpen: (id: string) => void; onRefresh: () => void }) {
  const status = module?.status ?? {};
  const activeMode = statusValue(status, 'currentModeLabel') || tuberSwitchModeLabel(statusValue(status, 'activeMode'));
  const showRedeems = hasCapability(module, 'redeems') || (workflow.redeems ?? []).length > 0 || hasStatusKey(status, 'redeemCount');
  return (
    <div className="drawer-content">
      <PreviewField label="Profile" value={workflow.currentProfile.name || workflow.selectedProfile || 'No profile selected'} />
      <PreviewField label="Mode" value={activeMode} />
      <PreviewField label="OBS configuration" value={tuberSwitchOBSLabel(status)} />
      {showRedeems ? <RedeemList workflow={workflow} status={status} /> : <PreviewField label="Redeems" value={tuberSwitchRedeemLabel(status)} />}
      <PreviewField label="Detection" value={tuberSwitchDetectionLabel(status)} />
      <PreviewField label="Runtime" value={modeLabel(module?.mode || '')} />
      <button type="button" onClick={onRefresh}>
        <RefreshCw aria-hidden="true" />
        Refresh
      </button>
      <button type="button" onClick={() => onOpen('tuberswitch')}>
        <ExternalLink aria-hidden="true" />
        Open in TuberSwitch
      </button>
    </div>
  );
}

function AnnouncementFieldsEditor({ workflow }: { workflow: StreamSignalWorkflow }) {
  const fields = orderedAnnouncementFields(workflow.announcementFields);
  return (
    <div className="drawer-control-group">
      <div className="drawer-control-heading">
        <span>Announcement Fields</span>
        <button type="button" onClick={workflow.onResetAnnouncementFields} disabled={workflow.busy || fields.length === 0}>
          <RefreshCw aria-hidden="true" />
          Reset
        </button>
      </div>
      {fields.length === 0 ? (
        <p className="drawer-empty-line">No fields reported.</p>
      ) : (
        fields.map((field) => (
          <label className="announcement-field-row" key={field.id}>
            <span>{announcementFieldLabel(field)}</span>
            <input
              value={workflow.announcementFieldDrafts[field.id] ?? field.value}
              disabled={workflow.busy}
              onChange={(event) => workflow.onChangeAnnouncementField(field.id, event.currentTarget.value)}
            />
          </label>
        ))
      )}
    </div>
  );
}

function BrowserSupportControl({ workflow }: { workflow: TideReaderWorkflow }) {
  const enabled = Boolean(workflow.browserSupport?.enabled);
  return (
    <div className="drawer-control-group browser-support-control">
      <label className="drawer-inline-toggle">
        <span>
          <strong>Browser Support</strong>
          <small>{enabled ? 'Enabled' : 'Disabled'}</small>
        </span>
        <input
          type="checkbox"
          checked={enabled}
          disabled={workflow.browserSupportPending || !workflow.onToggleBrowserSupport}
          onChange={(event) => workflow.onToggleBrowserSupport?.(event.currentTarget.checked)}
        />
      </label>
      {workflow.browserSupport?.error ? <p className="module-inline-message error">{workflow.browserSupport.error}</p> : null}
    </div>
  );
}

function RedeemList({ workflow, status }: { workflow: TideReaderWorkflow; status: Record<string, unknown> }) {
  const redeems = (workflow.redeems ?? []).filter((redeem) => redeem.available);
  const pendingRedeems = new Set(workflow.pendingRedeemIds ?? []);
  return (
    <div className="drawer-control-group">
      <div className="drawer-control-heading">
        <span>Redeems</span>
        {redeems.length > 0 ? <StatusPill label={`${redeems.length}`} tone="info" /> : null}
      </div>
      {redeems.length === 0 ? (
        <p className="drawer-empty-line">{tuberSwitchRedeemLabel(status)}</p>
      ) : (
        redeems.map((redeem) => (
          <label className="redeem-row" key={redeem.id}>
            <span>
              <strong>{redeem.name}</strong>
              <small>{redeem.enabled ? 'Enabled' : 'Disabled'}</small>
            </span>
            <input
              type="checkbox"
              checked={redeem.enabled}
              disabled={pendingRedeems.has(redeem.id) || !workflow.onToggleRedeem}
              onChange={(event) => workflow.onToggleRedeem?.(redeem.id, event.currentTarget.checked)}
            />
          </label>
        ))
      )}
    </div>
  );
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="preview-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TideReaderPanel({
  modules,
  workflow,
  overlaySnapshot = emptyTideReaderOverlay,
  onStart,
  onOpen,
  onRefresh,
}: { modules: ModuleInfo[]; workflow: TideReaderWorkflow; overlaySnapshot?: TideReaderOverlaySnapshot } & ModuleActions) {
  const module = tideReaderModule(modules);
  const offline = !module || !module.running;
  const statusState = statusValue(module?.status ?? {}, 'state');
  const statusMessage = statusValue(module?.status ?? {}, 'message');
  const overlayURL = tideReaderOverlayURL(module, overlaySnapshot);
  const displaySnapshot = tideReaderSnapshotForBrowserSupport(overlaySnapshot, workflow.browserSupport);
  const [copiedOverlayURL, setCopiedOverlayURL] = useState(false);

  function handleCopyOverlayURL() {
    void (async () => {
      await copyText(overlayURL);
      setCopiedOverlayURL(true);
      window.setTimeout(() => setCopiedOverlayURL(false), 1600);
    })();
  }

  return (
    <section className="module-workflow" aria-label="TideReader">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Overlay module</p>
          <div className="module-title-row">
            <h2>
              <img className="module-title-icon" src={tideReaderIcon} alt="" aria-hidden="true" />
              TideReader
            </h2>
            <button className="module-tooltip" type="button" aria-label={`Copy overlay URL: ${overlayURL}`} data-tooltip={copiedOverlayURL ? 'Copied' : overlayURL} onClick={handleCopyOverlayURL}>
              {copiedOverlayURL ? <CheckCircle2 aria-hidden="true" /> : <Copy aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>

      <div className="overlay-preview-panel">
        <div className="overlay-preview-topline">
          <h3>Overlay Preview</h3>
        </div>
        <div className="overlay-preview-frame">
          {offline ? (
            <div className="overlay-preview-empty">TideReader is offline</div>
          ) : (
            <TideReaderOverlayPreview snapshot={displaySnapshot} />
          )}
        </div>
      </div>

      <div className="profile-row">
        <label>
          <span>Profile</span>
          <select
            value={workflow.selectedProfile}
            onChange={(event) => workflow.onSelectProfile(event.currentTarget.value)}
            disabled={offline || workflow.busy}
          >
            <option value="">Select profile</option>
            {workflow.profiles.map((profile) => (
              <option value={profile} key={profile}>
                {profile}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="secondary-actions">
        {offline ? (
          <button className="button-primary" type="button" onClick={() => onStart(module?.id || 'tidereader')}>
            <Play aria-hidden="true" />
            Start Service Mode
          </button>
        ) : null}
        {module?.running ? (
          <button type="button" onClick={() => onOpen(module.id)}>
            <ExternalLink aria-hidden="true" />
            Open TideReader
          </button>
        ) : null}
        <button type="button" onClick={onRefresh}>
          <RefreshCw aria-hidden="true" />
          Refresh
        </button>
      </div>
    </section>
  );
}

function TuberSwitchPanel({
  modules,
  workflow,
  onStart,
  onOpen,
  onRefresh,
}: { modules: ModuleInfo[]; workflow: TideReaderWorkflow } & ModuleActions) {
  const module = tuberSwitchModule(modules);
  const offline = !module || !module.running;
  const activeProfile = workflow.currentProfile.name || statusValue(module?.status ?? {}, 'activeProfile') || 'No active profile';
  const activeMode = tuberSwitchModeLabel(statusValue(module?.status ?? {}, 'activeMode'));

  return (
    <section className="module-workflow compact-module" aria-label="TuberSwitch">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Avatar module</p>
          <h2>
            <img className="module-title-icon" src={tuberSwitchIcon} alt="" aria-hidden="true" />
            TuberSwitch
          </h2>
        </div>
      </div>

      <div className="module-summary-grid">
        <article>
          <span>Current Profile</span>
          <strong>{offline ? 'Unavailable' : activeProfile}</strong>
        </article>
        <article>
          <span>Current Mode</span>
          <strong>{offline ? 'Unavailable' : activeMode}</strong>
        </article>
      </div>

      {workflow.error ? <p className="module-inline-message error">{workflow.error}</p> : null}

      <div className="profile-row">
        <label>
          <span>Profile</span>
          <select
            value={workflow.selectedProfile}
            onChange={(event) => workflow.onSelectProfile(event.currentTarget.value)}
            disabled={offline || workflow.busy}
          >
            <option value="">Select profile</option>
            {workflow.profiles.map((profile) => (
              <option value={profile} key={profile}>
                {profile}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="secondary-actions">
        {offline ? (
          <button className="button-primary" type="button" onClick={() => onStart(module?.id || 'tuberswitch')}>
            <Play aria-hidden="true" />
            Start TuberSwitch
          </button>
        ) : null}
        <button type="button" onClick={() => onOpen(module?.id || 'tuberswitch')}>
          <ExternalLink aria-hidden="true" />
          Open TuberSwitch
        </button>
        <button type="button" onClick={onRefresh}>
          <RefreshCw aria-hidden="true" />
          Refresh
        </button>
      </div>
    </section>
  );
}

function TideReaderOverlayPreview({ snapshot }: { snapshot: TideReaderOverlaySnapshot }) {
  if (!snapshot.available) {
    return <div className="overlay-preview-empty">{snapshot.error || 'Overlay preview unavailable'}</div>;
  }

  const settings = snapshot.settings ?? {};
  const nowPlaying = snapshot.nowPlaying ?? {};
  const container = recordValue(settings, 'overlayContainerStyle');
  const pillStyle = recordValue(settings, 'statusPillStyle');
  const status = textValue(nowPlaying, 'status', 'idle');
  const titleStyle = recordValue(settings, 'songTextStyle');
  const artistStyle = recordValue(settings, 'artistTextStyle');
  const albumStyle = recordValue(settings, 'albumTextStyle');
  const imagePosition = textValue(settings, 'imagePosition', 'Left').toLowerCase();
  const textAlign = textValue(settings, 'textAlign', 'Left').toLowerCase();
  const coverURL = coverURLWithCacheBuster(snapshot);
  const title = truncateText(textValue(nowPlaying, 'title', 'Nothing playing'), numberValue(titleStyle, 'maxCharacters', 55));
  const artist = truncateText(textValue(nowPlaying, 'artist', 'Waiting for playback'), numberValue(artistStyle, 'maxCharacters', 60));
  const album = truncateText(textValue(nowPlaying, 'album', ''), numberValue(albumStyle, 'maxCharacters', 60));

  return (
    <div
      className="tr-live-preview"
      data-image-position={imagePosition}
      data-text-align={textAlign}
      style={{
        '--tr-preview-bg': overlayBackground(settings),
        '--tr-preview-radius': `${numberValue(container, 'cornerRadiusPx', 18)}px`,
        '--tr-preview-padding': `${numberValue(container, 'paddingPx', 14)}px`,
        '--tr-preview-gap': `${numberValue(container, 'gapPx', 14)}px`,
        '--tr-preview-border-width': `${booleanValue(container, 'borderEnabled', true) ? numberValue(container, 'borderWidthPx', 1) : 0}px`,
        '--tr-preview-border-color': textValue(container, 'borderColorHex', '#E6E6E6'),
        '--tr-preview-image-size': `${numberValue(settings, 'imageSizePx', 100)}px`,
        '--tr-pill-bg': withAlpha(textValue(pillStyle, 'backgroundColorHex', '#BBB3FF'), numberValue(pillStyle, 'opacity', 0.25)),
        '--tr-pill-color': textValue(pillStyle, 'textColorHex', '#E6E6E6'),
        '--tr-pill-radius': `${numberValue(pillStyle, 'cornerRadiusPx', 999)}px`,
        '--tr-pill-padding': `${numberValue(pillStyle, 'paddingVerticalPx', 4)}px ${numberValue(pillStyle, 'paddingHorizontalPx', 9)}px`,
        '--tr-pill-font-size': `${numberValue(pillStyle, 'fontSizePx', 11)}px`,
      } as CSSProperties}
      aria-label="TideReader overlay preview"
    >
      <div className={coverURL ? 'tr-preview-art has-artwork' : 'tr-preview-art'}>
        {coverURL ? <img src={coverURL} alt="" /> : <span>TR</span>}
      </div>
      <div className="tr-preview-copy">
        <div className="tr-preview-topline">
          {booleanValue(settings, 'showAppName', true) ? <span className="tr-preview-brand">TideReader</span> : null}
          {booleanValue(settings, 'showPlaybackState', true) ? <span className={`tr-preview-pill ${status}`}>{formatStatusState(status)}</span> : null}
        </div>
        <SmartPreviewText as="h4" settings={settings} styleKey="songTextStyle" fallbackSize={22}>
          {title}
        </SmartPreviewText>
        <SmartPreviewText as="p" settings={settings} styleKey="artistTextStyle" fallbackSize={16}>
          {artist}
        </SmartPreviewText>
        {album ? (
          <SmartPreviewText as="p" settings={settings} styleKey="albumTextStyle" fallbackSize={14}>
            {album}
          </SmartPreviewText>
        ) : null}
      </div>
    </div>
  );
}

function SmartPreviewText({
  as,
  settings,
  styleKey,
  fallbackSize,
  children,
}: {
  as: 'h4' | 'p';
  settings: Record<string, unknown>;
  styleKey: string;
  fallbackSize: number;
  children: string;
}) {
  const containerRef = useRef<HTMLElement | null>(null);
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const style = recordValue(settings, styleKey);
  const mode = textValue(style, 'textOverflowMode', 'Default');
  const fontSizePx = numberValue(style, 'fontSizePx', fallbackSize);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [autoSizePx, setAutoSizePx] = useState(fontSizePx);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure || mode === 'Default' || mode === 'TwoLines') {
      setIsOverflowing(false);
      setAutoSizePx(fontSizePx);
      return undefined;
    }

    const update = () => {
      const availableWidth = container.clientWidth;
      if (availableWidth <= 0) {
        setIsOverflowing(false);
        setAutoSizePx(fontSizePx);
        return;
      }
      measure.style.fontSize = `${fontSizePx}px`;
      const fullWidth = measure.scrollWidth;
      const overflowing = fullWidth > availableWidth + 1;
      setIsOverflowing(overflowing);
      if (mode === 'AutoSize' && overflowing) {
        const minimumSize = Math.max(1, Math.round(fontSizePx * 0.6));
        setAutoSizePx(Math.max(minimumSize, Math.floor((availableWidth / fullWidth) * fontSizePx)));
        return;
      }
      setAutoSizePx(fontSizePx);
    };

    update();
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [children, fontSizePx, mode, styleKey]);

  const Component = as;
  const baseStyle = textStyle(settings, styleKey, fallbackSize);
  const smartStyle = {
    ...baseStyle,
    ...(mode === 'AutoSize' ? { fontSize: `${autoSizePx}px` } : {}),
  };
  const shouldScroll = mode === 'Scroll' && isOverflowing;

  if (mode === 'Default') {
    return (
      <Component className="tr-smart-text tr-smart-text-default" style={baseStyle} data-overflow-mode={mode}>
        {children}
      </Component>
    );
  }

  return (
    <Component
      ref={containerRef as never}
      className={`tr-smart-text tr-smart-text-${mode.toLowerCase()} ${shouldScroll ? 'is-scrolling' : ''}`.trim()}
      style={smartStyle}
      data-overflow-mode={mode}
    >
      <span className="tr-smart-text-measure" ref={measureRef} aria-hidden="true">
        {children}
      </span>
      {shouldScroll ? (
        <span className="tr-smart-text-scroll-track">
          <span>{children}</span>
          <span aria-hidden="true">{children}</span>
        </span>
      ) : (
        <span className="tr-smart-text-content">{children}</span>
      )}
    </Component>
  );
}

function ConfirmationModal({ workflow }: { workflow: StreamSignalWorkflow }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const pendingConfirmation = workflow.pendingConfirmation;

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      workflow.onCancelConfirmation();
    }
    if (event.key !== 'Tab') {
      return;
    }
    const focusable = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLButtonElement[];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="duplicate-title" onKeyDown={onKeyDown}>
        <div className="modal-header">
          <AlertTriangle aria-hidden="true" />
          <div>
            <h2 id="duplicate-title">Send again?</h2>
            <p>A recent announcement appears to have already been sent.</p>
          </div>
        </div>
        {pendingConfirmation?.error ? <span>{pendingConfirmation.error}</span> : null}
        <div className="modal-actions">
          <button type="button" onClick={workflow.onCancelConfirmation} ref={cancelRef}>
            Cancel
          </button>
          <button className="button-highlight" type="button" onClick={workflow.onConfirmGoLive} ref={confirmRef}>
            Confirm
          </button>
        </div>
      </section>
    </div>
  );
}

type SettingsActions = {
  onToggleAutoStart: (enabled: boolean) => void;
  onSetExecutablePath: (id: string, executablePath: string) => void;
  onClearExecutablePath: (id: string) => void;
  onPickExecutablePath: (id: string) => void;
};

export function SettingsPage({
  moduleConfigs,
  autoStartEnabled,
  onToggleAutoStart,
  onSetExecutablePath,
  onClearExecutablePath,
  onPickExecutablePath,
}: { moduleConfigs: ModuleExecutableConfig[]; autoStartEnabled: boolean } & SettingsActions) {
  return (
    <main className="content" aria-labelledby="settings-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Application configuration</p>
          <h1 id="settings-title">Settings</h1>
        </div>
      </div>

      <section className="settings-section" aria-labelledby="module-locations-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Stream tools</p>
            <h2 id="module-locations-title">Module Locations</h2>
          </div>
        </div>

        <div className="settings-panel">
          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={autoStartEnabled}
              onChange={(event) => onToggleAutoStart(event.currentTarget.checked)}
            />
            Auto-start managed modules
          </label>
        </div>

        <div className="module-location-grid">
          {moduleConfigs.map((config) => (
            <ModuleLocationCard
              config={config}
              key={config.id}
              onSetExecutablePath={onSetExecutablePath}
              onClearExecutablePath={onClearExecutablePath}
              onPickExecutablePath={onPickExecutablePath}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

function ModuleLocationCard({
  config,
  onSetExecutablePath,
  onClearExecutablePath,
  onPickExecutablePath,
}: { config: ModuleExecutableConfig } & Pick<SettingsActions, 'onSetExecutablePath' | 'onClearExecutablePath' | 'onPickExecutablePath'>) {
  const [draftPath, setDraftPath] = useState(config.executablePath);
  useEffect(() => {
    setDraftPath(config.executablePath);
  }, [config.executablePath]);
  const icon = config.id === 'tidereader' ? tideReaderIcon : config.id === 'tuberswitch' ? tuberSwitchIcon : streamSignalIcon;
  const sourceLabel = config.pathSource === 'environment' ? 'Environment' : config.pathSource === 'configured' ? 'Configured' : config.pathSource === 'detected' ? 'Detected' : 'Fallback';
  function commitDraft() {
    if (draftPath !== config.executablePath) {
      onSetExecutablePath(config.id, draftPath);
    }
  }
  return (
    <article className="module-location-card">
      <div className="module-card-topline">
        <div>
          <h2>
            <img className="module-title-icon" src={icon} alt="" aria-hidden="true" />
            {config.name}
          </h2>
          <p>{sourceLabel}{config.envLocked ? ` via ${config.environmentKey}` : ''}</p>
        </div>
        <StatusPill label={config.valid ? sourceLabel : 'Invalid path'} tone={config.valid ? 'info' : 'error'} />
      </div>

      <label className="path-field">
        <span>Executable path</span>
        <input
          value={draftPath}
          placeholder={config.resolvedPath || 'Auto-detect executable'}
          disabled={config.envLocked}
          onBlur={commitDraft}
          onChange={(event) => setDraftPath(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
          }}
        />
      </label>

      <div className="path-meta">
        <span>{config.resolvedPath || 'No executable resolved'}</span>
        {config.error ? <strong>{config.error}</strong> : null}
      </div>

      <div className="secondary-actions">
        <button type="button" onClick={() => onPickExecutablePath(config.id)} disabled={config.envLocked}>
          <ExternalLink aria-hidden="true" />
          Browse
        </button>
        <button type="button" onClick={() => onClearExecutablePath(config.id)} disabled={config.envLocked || !config.executablePath}>
          <XCircle aria-hidden="true" />
          Clear
        </button>
      </div>
    </article>
  );
}

export function DiagnosticsPage({
  modules,
  onStart,
  onOpen,
  onRefresh,
}: { modules: ModuleInfo[] } & ModuleActions) {
  return (
    <main className="content" aria-labelledby="diagnostics-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Advanced support</p>
          <h1 id="diagnostics-title">Diagnostics</h1>
        </div>
      </div>

      <section className="settings-section" aria-labelledby="module-diagnostics-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Module state</p>
            <h2 id="module-diagnostics-title">Module Diagnostics</h2>
          </div>
        </div>
        <DiagnosticsContent modules={modules} onStart={onStart} onOpen={onOpen} onRefresh={onRefresh} />
      </section>
    </main>
  );
}

function DiagnosticsContent({ modules, onStart, onOpen, onRefresh }: { modules: ModuleInfo[] } & ModuleActions) {
  if (modules.length === 0) {
    return (
      <div className="empty-state compact">
        <Server aria-hidden="true" />
        <p>No Starsong modules detected.</p>
        <span>Install and launch a compatible application to begin using LivePanel.</span>
      </div>
    );
  }

  return (
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
  const [announcementFields, setAnnouncementFields] = useState<AnnouncementField[]>([]);
  const [announcementFieldDrafts, setAnnouncementFieldDrafts] = useState<Record<string, string>>({});
  const [announcementFieldsDirty, setAnnouncementFieldsDirty] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [tideReaderProfiles, setTideReaderProfiles] = useState<string[]>([]);
  const [tideReaderCurrentProfile, setTideReaderCurrentProfile] = useState<CurrentProfile>({ id: '', name: '' });
  const [tideReaderSelectedProfile, setTideReaderSelectedProfile] = useState('');
  const [tideReaderOverlay, setTideReaderOverlay] = useState<TideReaderOverlaySnapshot>(emptyTideReaderOverlay);
  const [tideReaderBrowserSupport, setTideReaderBrowserSupportState] = useState<BrowserSupport>({ enabled: false });
  const [tideReaderBrowserSupportPending, setTideReaderBrowserSupportPending] = useState(false);
  const [tuberSwitchProfiles, setTuberSwitchProfiles] = useState<string[]>([]);
  const [tuberSwitchCurrentProfile, setTuberSwitchCurrentProfile] = useState<CurrentProfile>({ id: '', name: '' });
  const [tuberSwitchSelectedProfile, setTuberSwitchSelectedProfile] = useState('');
  const [tuberSwitchProfileError, setTuberSwitchProfileError] = useState('');
  const [tuberSwitchRedeems, setTuberSwitchRedeems] = useState<Redeem[]>([]);
  const [tuberSwitchRedeemsDirty, setTuberSwitchRedeemsDirty] = useState(false);
  const [pendingTuberSwitchRedeemIds, setPendingTuberSwitchRedeemIds] = useState<string[]>([]);
  const [announceStatus, setAnnounceStatus] = useState<AnnounceStatus>({ lastRun: '', success: false });
  const [endStreamStatus, setEndStreamStatus] = useState<EndStreamStatus>({ lastRun: '', success: false });
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<AnnounceResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoStartEnabled, setAutoStartEnabled] = useState(true);
  const [moduleConfigs, setModuleConfigs] = useState<ModuleExecutableConfig[]>([]);
  const resetAnnouncementFieldDrafts = useRef(false);
  const announcementFieldsDirtyRef = useRef(false);
  const announcementFieldBaselineRef = useRef<Record<string, string>>({});
  const streamSignalProfileKeyRef = useRef('');
  const tuberSwitchRedeemsDirtyRef = useRef(false);
  const tuberSwitchProfileKeyRef = useRef('');
  const tuberSwitchRedeemOverridesRef = useRef<Record<string, boolean>>({});
  const tuberSwitchRedeemBaselineRef = useRef<Record<string, boolean>>({});

  function setTuberSwitchRedeemOverride(id: string, enabled: boolean) {
    const nextOverrides = { ...tuberSwitchRedeemOverridesRef.current };
    if (tuberSwitchRedeemBaselineRef.current[id] === enabled) {
      delete nextOverrides[id];
    } else {
      nextOverrides[id] = enabled;
    }
    tuberSwitchRedeemOverridesRef.current = nextOverrides;
    setTuberSwitchRedeems((current) => current.map((redeem) => (redeem.id === id ? { ...redeem, enabled } : redeem)));
    const isDirty = Object.keys(nextOverrides).length > 0;
    setTuberSwitchRedeemsDirty(isDirty);
    tuberSwitchRedeemsDirtyRef.current = isDirty;
  }

  function clearTuberSwitchRedeemOverrides() {
    tuberSwitchRedeemOverridesRef.current = {};
    setTuberSwitchRedeemsDirty(false);
    tuberSwitchRedeemsDirtyRef.current = false;
  }

  async function loadStreamSignalWorkflow(nextModules: ModuleInfo[]) {
    const module = streamSignalModule(nextModules);
    if (!module?.running) {
      const empty = emptyWorkflowState();
      setProfiles(empty.profiles);
      setCurrentProfile(empty.currentProfile);
      setAnnouncementFields(empty.announcementFields);
      setAnnouncementFieldDrafts(empty.announcementFieldDrafts);
      setAnnouncementFieldsDirty(false);
      announcementFieldsDirtyRef.current = false;
      announcementFieldBaselineRef.current = {};
      streamSignalProfileKeyRef.current = '';
      setAnnounceStatus(empty.announceStatus);
      setEndStreamStatus(empty.endStreamStatus);
      return;
    }
    try {
      const fieldRequest = getStreamSignalAnnouncementFields().catch(() => [] as AnnouncementField[]);
      const [nextProfiles, nextCurrentProfile, nextAnnouncementFields, nextAnnounceStatus, nextEndStreamStatus] = await Promise.all([
        getStreamSignalProfiles(),
        getStreamSignalCurrentProfile(),
        fieldRequest,
        getStreamSignalAnnounceStatus(),
        getStreamSignalEndStreamStatus(),
      ]);
      const hydratedAnnouncementFields = hydrateAnnouncementFieldsFromStatus(nextAnnouncementFields, module.status ?? {});
      const baselineDrafts = fieldDraftsFrom(hydratedAnnouncementFields);
      const nextProfileKey = nextCurrentProfile.id || nextCurrentProfile.name;
      const previousProfileKey = streamSignalProfileKeyRef.current;
      const profileChanged = Boolean(previousProfileKey && nextProfileKey && previousProfileKey !== nextProfileKey);
      setProfiles(nextProfiles);
      setCurrentProfile(nextCurrentProfile);
      setAnnouncementFields(hydratedAnnouncementFields);
      if (resetAnnouncementFieldDrafts.current || profileChanged || !announcementFieldsDirtyRef.current) {
        setAnnouncementFieldDrafts(baselineDrafts);
        setAnnouncementFieldsDirty(false);
        announcementFieldsDirtyRef.current = false;
        resetAnnouncementFieldDrafts.current = false;
      }
      announcementFieldBaselineRef.current = baselineDrafts;
      streamSignalProfileKeyRef.current = nextProfileKey;
      setSelectedProfile((current) => nextCurrentProfile.name || (nextProfiles.includes(current) ? current : ''));
      setAnnounceStatus(nextAnnounceStatus);
      setEndStreamStatus(nextEndStreamStatus);
    } catch {
      const empty = emptyWorkflowState();
      setProfiles(empty.profiles);
      setCurrentProfile(empty.currentProfile);
      setAnnouncementFields(empty.announcementFields);
      setAnnouncementFieldDrafts(empty.announcementFieldDrafts);
      setAnnouncementFieldsDirty(false);
      announcementFieldsDirtyRef.current = false;
      announcementFieldBaselineRef.current = {};
      streamSignalProfileKeyRef.current = '';
      setAnnounceStatus(empty.announceStatus);
      setEndStreamStatus(empty.endStreamStatus);
    }
  }

  async function loadTideReaderWorkflow(nextModules: ModuleInfo[]) {
    const module = tideReaderModule(nextModules);
    if (!module?.running) {
      const empty = emptyProfileWorkflowState();
      setTideReaderProfiles(empty.profiles);
      setTideReaderCurrentProfile(empty.currentProfile);
      setTideReaderSelectedProfile('');
      setTideReaderOverlay(emptyTideReaderOverlay);
      setTideReaderBrowserSupportState({ enabled: false });
      setTideReaderBrowserSupportPending(false);
      return;
    }
    try {
      const browserRequest =
        hasCapability(module, 'browser-support') || hasStatusKey(module.status, 'browserSupportEnabled')
          ? getTideReaderBrowserSupport().catch(() => ({ enabled: booleanValue(module.status, 'browserSupportEnabled', false) } as BrowserSupport))
          : Promise.resolve({ enabled: false } as BrowserSupport);
      const [nextProfiles, nextCurrentProfile, nextOverlay, nextBrowserSupport] = await Promise.all([
        getTideReaderProfiles(),
        getTideReaderCurrentProfile(),
        getTideReaderOverlaySnapshot(),
        browserRequest,
      ]);
      setTideReaderProfiles(nextProfiles);
      setTideReaderCurrentProfile(nextCurrentProfile);
      setTideReaderSelectedProfile((current) => nextCurrentProfile.name || (nextProfiles.includes(current) ? current : ''));
      setTideReaderOverlay(nextOverlay);
      setTideReaderBrowserSupportState(nextBrowserSupport);
    } catch {
      const empty = emptyProfileWorkflowState();
      setTideReaderProfiles(empty.profiles);
      setTideReaderCurrentProfile(empty.currentProfile);
      setTideReaderSelectedProfile('');
      setTideReaderOverlay(emptyTideReaderOverlay);
      setTideReaderBrowserSupportState({ enabled: false });
      setTideReaderBrowserSupportPending(false);
    }
  }

  async function loadTuberSwitchWorkflow(nextModules: ModuleInfo[]) {
    const module = tuberSwitchModule(nextModules);
    if (!module?.running) {
      const empty = emptyProfileWorkflowState();
      setTuberSwitchProfiles(empty.profiles);
      setTuberSwitchCurrentProfile(empty.currentProfile);
      setTuberSwitchSelectedProfile('');
      setTuberSwitchRedeems([]);
      setPendingTuberSwitchRedeemIds([]);
      clearTuberSwitchRedeemOverrides();
      tuberSwitchRedeemBaselineRef.current = {};
      tuberSwitchProfileKeyRef.current = '';
      return;
    }
    try {
      const redeemsRequest =
        hasCapability(module, 'redeems') || hasStatusKey(module.status, 'redeemCount')
          ? getTuberSwitchRedeems().catch(() => [] as Redeem[])
          : Promise.resolve([] as Redeem[]);
      const [nextProfiles, nextCurrentProfile, nextRedeems] = await Promise.all([
        getTuberSwitchProfiles(),
        getTuberSwitchCurrentProfile(),
        redeemsRequest,
      ]);
      const nextProfileKey = nextCurrentProfile.id || nextCurrentProfile.name;
      const previousProfileKey = tuberSwitchProfileKeyRef.current;
      const profileChanged = Boolean(previousProfileKey && nextProfileKey && previousProfileKey !== nextProfileKey);
      setTuberSwitchProfiles(nextProfiles);
      setTuberSwitchCurrentProfile(nextCurrentProfile);
      setTuberSwitchSelectedProfile((current) => nextCurrentProfile.name || (nextProfiles.includes(current) ? current : ''));
      if (profileChanged) {
        clearTuberSwitchRedeemOverrides();
      }
      if (!tuberSwitchRedeemsDirtyRef.current || profileChanged) {
        tuberSwitchRedeemBaselineRef.current = nextRedeems.reduce<Record<string, boolean>>((baseline, redeem) => {
          baseline[redeem.id] = redeem.enabled;
          return baseline;
        }, {});
      }
      const overrides = tuberSwitchRedeemOverridesRef.current;
      setTuberSwitchRedeems(nextRedeems.map((redeem) => (Object.prototype.hasOwnProperty.call(overrides, redeem.id) ? { ...redeem, enabled: overrides[redeem.id] } : redeem)));
      tuberSwitchProfileKeyRef.current = nextProfileKey;
    } catch {
      const empty = emptyProfileWorkflowState();
      setTuberSwitchProfiles(empty.profiles);
      setTuberSwitchCurrentProfile(empty.currentProfile);
      setTuberSwitchSelectedProfile('');
      setTuberSwitchRedeems([]);
      setPendingTuberSwitchRedeemIds([]);
      clearTuberSwitchRedeemOverrides();
      tuberSwitchRedeemBaselineRef.current = {};
      tuberSwitchProfileKeyRef.current = '';
    }
  }

  async function load(refresh = false) {
    setLoading(true);
    const [next, configs] = await Promise.all([
      refresh ? refreshModules() : listModules(),
      getModuleExecutableConfigs(),
    ]);
    setModules(next);
    setModuleConfigs(configs);
    await Promise.all([loadStreamSignalWorkflow(next), loadTideReaderWorkflow(next), loadTuberSwitchWorkflow(next)]);
    setLoading(false);
  }

  async function refreshDashboardState() {
    const next = await refreshModules();
    setModules(next);
    await Promise.all([loadStreamSignalWorkflow(next), loadTideReaderWorkflow(next), loadTuberSwitchWorkflow(next)]);
  }

  async function startAutoStartModules(nextModules: ModuleInfo[]) {
    let current = nextModules;
    for (const module of nextModules) {
      if (!module.autoStart || !module.installed || module.running) {
        continue;
      }
      current = await startModule(module.id);
    }
    return current;
  }

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const enabled = await getAutoStartManagedModules();
      setAutoStartEnabled(enabled);
      setModuleConfigs(await getModuleExecutableConfigs());
      let next = await refreshModules();
      if (enabled) {
        next = await startAutoStartModules(next);
      }
      setModules(next);
      await Promise.all([loadStreamSignalWorkflow(next), loadTideReaderWorkflow(next), loadTuberSwitchWorkflow(next)]);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (page !== 'dashboard') {
      return undefined;
    }
    const interval = window.setInterval(() => {
      void refreshDashboardState();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [page]);

  async function runAction(action: () => Promise<ModuleInfo[]>) {
    setLoading(true);
    const next = await action();
    setModules(next);
    await Promise.all([loadStreamSignalWorkflow(next), loadTideReaderWorkflow(next), loadTuberSwitchWorkflow(next)]);
    setLoading(false);
  }

  async function toggleAutoStart(enabled: boolean) {
    const nextEnabled = await setAutoStartManagedModules(enabled);
    setAutoStartEnabled(nextEnabled);
    if (!nextEnabled) {
      return;
    }
    setLoading(true);
    const next = await startAutoStartModules(modules);
    setModules(next);
    await Promise.all([loadStreamSignalWorkflow(next), loadTideReaderWorkflow(next), loadTuberSwitchWorkflow(next)]);
    setLoading(false);
  }

  async function updateModuleExecutablePath(id: string, executablePath: string) {
    const configs = await setModuleExecutablePath(id, executablePath);
    setModuleConfigs(configs);
    await load(true);
  }

  async function clearModuleExecutable(id: string) {
    const configs = await clearModuleExecutablePath(id);
    setModuleConfigs(configs);
    await load(true);
  }

  async function pickModuleExecutable(id: string) {
    const path = await pickModuleExecutablePath(id);
    if (!path) {
      return;
    }
    await updateModuleExecutablePath(id, path);
  }

  const workflow: StreamSignalWorkflow = {
    profiles,
    currentProfile,
    announcementFields,
    announcementFieldDrafts,
    hasSessionChanges: announcementFieldsDirty,
    announceStatus,
    endStreamStatus,
    selectedProfile,
    busy: workflowBusy,
    pendingConfirmation,
    onSelectProfile: (profile: string) => {
      void (async () => {
        setSelectedProfile(profile);
        if (!profile || profile === currentProfile.name) {
          return;
        }
        setWorkflowBusy(true);
        const activated = await activateStreamSignalProfile(profile);
        if (activated.success) {
          setCurrentProfile({ id: activated.profileId || '', name: activated.profile || profile });
          resetAnnouncementFieldDrafts.current = true;
          await load(true);
        }
        setWorkflowBusy(false);
      })();
    },
    onChangeAnnouncementField: (id: string, value: string) => {
      setAnnouncementFieldDrafts((current) => {
        const next = { ...current, [id]: value };
        const isDirty = !fieldDraftsEqual(next, announcementFieldBaselineRef.current);
        setAnnouncementFieldsDirty(isDirty);
        announcementFieldsDirtyRef.current = isDirty;
        return next;
      });
    },
    onResetAnnouncementFields: () => {
      setAnnouncementFieldDrafts(fieldDraftsFrom(announcementFields));
      setAnnouncementFieldsDirty(false);
      announcementFieldsDirtyRef.current = false;
    },
    onGoLive: () => {
      void (async () => {
        setWorkflowBusy(true);
        const response = await announceStreamSignal(fieldOverridesFrom(announcementFields, announcementFieldDrafts));
        if (response.requiresConfirmation) {
          setPendingConfirmation(response);
        } else if (response.success) {
          resetAnnouncementFieldDrafts.current = true;
          setAnnounceStatus(await getStreamSignalAnnounceStatus());
          await load(true);
        } else {
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
        if (response.success) {
          resetAnnouncementFieldDrafts.current = true;
          await load(true);
        }
        setAnnounceStatus(await getStreamSignalAnnounceStatus());
        setWorkflowBusy(false);
      })();
    },
    onCancelConfirmation: () => setPendingConfirmation(null),
    onEndStream: () => {
      void (async () => {
        setWorkflowBusy(true);
        const response = await endStreamSignalStream();
        setEndStreamStatus(await getStreamSignalEndStreamStatus());
        setWorkflowBusy(false);
      })();
    },
  };

  const tideReaderWorkflow: TideReaderWorkflow = {
    profiles: tideReaderProfiles,
    currentProfile: tideReaderCurrentProfile,
    selectedProfile: tideReaderSelectedProfile,
    busy: workflowBusy,
    browserSupport: tideReaderBrowserSupport,
    browserSupportPending: tideReaderBrowserSupportPending,
    onSelectProfile: (profile: string) => {
      void (async () => {
        setTideReaderSelectedProfile(profile);
        if (!profile || profile === tideReaderCurrentProfile.name) {
          return;
        }
        setWorkflowBusy(true);
        const activated = await activateTideReaderProfile(profile);
        if (activated.success) {
          setTideReaderCurrentProfile({ id: activated.profileId || '', name: activated.profile || profile });
          await load(true);
        }
        setWorkflowBusy(false);
      })();
    },
    onToggleBrowserSupport: (enabled: boolean) => {
      void (async () => {
        const previous = tideReaderBrowserSupport;
        setTideReaderBrowserSupportState({ enabled });
        setTideReaderBrowserSupportPending(true);
        try {
          const response = await setTideReaderBrowserSupport(enabled);
          if (response.success) {
            await load(true);
          } else {
            setTideReaderBrowserSupportState({ ...previous, error: response.error || 'Browser support update failed.' });
          }
        } catch {
          setTideReaderBrowserSupportState({ ...previous, error: 'Browser support update failed.' });
        } finally {
          setTideReaderBrowserSupportPending(false);
        }
      })();
    },
  };

  const tuberSwitchWorkflow: TideReaderWorkflow = {
    profiles: tuberSwitchProfiles,
    currentProfile: tuberSwitchCurrentProfile,
    selectedProfile: tuberSwitchSelectedProfile,
    busy: workflowBusy,
    error: tuberSwitchProfileError,
    redeems: tuberSwitchRedeems,
    pendingRedeemIds: pendingTuberSwitchRedeemIds,
    hasSessionChanges: tuberSwitchRedeemsDirty,
    onSelectProfile: (profile: string) => {
      void (async () => {
        setTuberSwitchSelectedProfile(profile);
        setTuberSwitchProfileError('');
        if (!profile || profile === tuberSwitchCurrentProfile.name) {
          return;
        }
        setWorkflowBusy(true);
        const activated = await activateTuberSwitchProfile(profile);
        if (activated.success) {
          setTuberSwitchCurrentProfile({ id: activated.profileId || '', name: activated.profile || profile });
          clearTuberSwitchRedeemOverrides();
          await load(true);
        } else {
          setTuberSwitchProfileError(activated.error || 'Profile activation failed.');
        }
        setWorkflowBusy(false);
      })();
    },
    onToggleRedeem: (id: string, enabled: boolean) => {
      void (async () => {
        const previous = tuberSwitchRedeems.find((redeem) => redeem.id === id)?.enabled;
        setTuberSwitchRedeemOverride(id, enabled);
        setPendingTuberSwitchRedeemIds((current) => (current.includes(id) ? current : [...current, id]));
        setTuberSwitchProfileError('');
        const response = await setTuberSwitchRedeem(id, enabled);
        if (response.success) {
          await load(true);
        } else {
          if (typeof previous === 'boolean') {
            setTuberSwitchRedeemOverride(id, previous);
          }
          setTuberSwitchProfileError(response.error || 'Redeem update failed.');
        }
        setPendingTuberSwitchRedeemIds((current) => current.filter((redeemID) => redeemID !== id));
      })();
    },
  };

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="LivePanel navigation">
        <div className="brand-lockup">
          <img className="app-logo" src={livePanelIcon} alt="" aria-hidden="true" />
          <div>
            <strong>LivePanel</strong>
            <span>Starsong Tools</span>
          </div>
        </div>
        <nav className="sidenav" aria-label="Primary">
          <button className={page === 'dashboard' ? 'active' : ''} onClick={() => setPage('dashboard')}>
            <LayoutDashboard aria-hidden="true" />
            Dashboard
          </button>
          <button className={page === 'settings' ? 'active' : ''} onClick={() => setPage('settings')}>
            <Settings aria-hidden="true" />
            Settings
          </button>
          <button className={page === 'diagnostics' ? 'active' : ''} onClick={() => setPage('diagnostics')}>
            <Server aria-hidden="true" />
            Diagnostics
          </button>
        </nav>
        <button className="system-status-card" type="button" onClick={() => setPage('diagnostics')}>
          <span className="system-dot" aria-hidden="true" />
          <span>
            <strong>All Systems</strong>
            <small>Operational</small>
          </span>
          <ExternalLink aria-hidden="true" />
        </button>
      </aside>
      <div className="main-panel">
        <header className="topbar">
          <TopbarReadiness modules={modules} />
          <button className="icon-button" onClick={() => void load(true)} aria-label="Refresh modules" title="Refresh modules">
            <RefreshCw aria-hidden="true" />
          </button>
        </header>

        {page === 'dashboard' ? (
          <Dashboard
            modules={modules}
            workflow={workflow}
            tideReaderWorkflow={tideReaderWorkflow}
            tuberSwitchWorkflow={tuberSwitchWorkflow}
            tideReaderOverlay={tideReaderOverlay}
            onOpen={(id) => void runAction(() => openModule(id))}
            onRefresh={() => void refreshDashboardState()}
          />
        ) : page === 'settings' ? (
          <SettingsPage
            moduleConfigs={moduleConfigs}
            autoStartEnabled={autoStartEnabled}
            onToggleAutoStart={(enabled) => void toggleAutoStart(enabled)}
            onSetExecutablePath={(id, executablePath) => void updateModuleExecutablePath(id, executablePath)}
            onClearExecutablePath={(id) => void clearModuleExecutable(id)}
            onPickExecutablePath={(id) => void pickModuleExecutable(id)}
          />
        ) : (
          <DiagnosticsPage
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
