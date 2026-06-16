import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, vi } from 'vitest';
import App, { Dashboard, DiagnosticsPage, SettingsPage } from './App';
import * as api from './lib/api/livepanel';
import type { AnnounceStatus, CurrentProfile, EndStreamStatus, ModuleExecutableConfig, ModuleInfo, Redeem } from './lib/api/livepanel';

vi.mock('./lib/api/livepanel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/api/livepanel')>();
  return {
    ...actual,
    activateStreamSignalProfile: vi.fn(),
    activateTideReaderProfile: vi.fn(),
    activateTuberSwitchProfile: vi.fn(),
    announceStreamSignal: vi.fn(),
    clearModuleExecutablePath: vi.fn(),
    confirmStreamSignalAnnouncement: vi.fn(),
    endStreamSignalStream: vi.fn(),
    getAutoStartManagedModules: vi.fn(),
    getModuleExecutableConfigs: vi.fn(),
    getStreamSignalAnnounceStatus: vi.fn(),
    getStreamSignalAnnouncementFields: vi.fn(),
    getStreamSignalCurrentProfile: vi.fn(),
    getStreamSignalEndStreamStatus: vi.fn(),
    getStreamSignalProfiles: vi.fn(),
    getTideReaderCurrentProfile: vi.fn(),
    getTideReaderOverlaySnapshot: vi.fn(),
    getTideReaderProfiles: vi.fn(),
    getTuberSwitchCurrentProfile: vi.fn(),
    getTuberSwitchProfiles: vi.fn(),
    getTuberSwitchRedeems: vi.fn(),
    listModules: vi.fn(),
    openModule: vi.fn(),
    pickModuleExecutablePath: vi.fn(),
    refreshModules: vi.fn(),
    setAutoStartManagedModules: vi.fn(),
    setTideReaderBrowserSupport: vi.fn(),
    setTuberSwitchRedeem: vi.fn(),
    setModuleExecutablePath: vi.fn(),
    startModule: vi.fn(),
    updateStreamSignalAnnouncementFields: vi.fn(),
  };
});

function moduleFixture(overrides: Partial<ModuleInfo> = {}): ModuleInfo {
  return {
    id: 'streamsignal',
    name: 'StreamSignal',
    executable: 'StreamSignal.exe',
    installed: true,
    running: true,
    autoStart: true,
    version: '0.4.0',
    mode: 'standalone',
    protocol: '1.1',
    healthy: true,
    healthStatus: 'ready',
    healthText: 'StreamSignal is ready.',
    capabilities: ['Profiles', 'Status Reporting'],
    status: { state: 'idle', message: 'Ready' },
    endpoint: 'http://127.0.0.1:47020',
    lastSeen: new Date('2026-06-05T12:00:00Z').toISOString(),
    ...overrides,
  };
}

function tideReaderModuleFixture(overrides: Partial<ModuleInfo> = {}): ModuleInfo {
  return moduleFixture({
    id: 'tidereader',
    name: 'TideReader',
    executable: 'TideReader.Desktop.exe',
    version: '0.4.0',
    healthText: 'TideReader operational',
    capabilities: ['Profiles', 'Status Reporting'],
    status: {
      state: 'active',
      message: 'Overlay active',
      healthy: true,
      activeProfile: 'Listening Party',
      activeProfileId: 'listening-party',
      overlayUrl: 'http://127.0.0.1:17660/overlay',
      overlayEnabled: true,
      overlayPort: 17660,
      layout: 'Right',
      albumArtVisible: false,
      imageSizePx: 0,
      statusPillVisible: false,
      backgroundMode: 'gradient',
      textAlign: 'Center',
      profileCount: 2,
      nowPlaying: {
        status: 'playing',
        title: 'Signal Bloom',
        artist: 'Starsong',
        album: 'Local Skies',
        hasArtwork: true,
        provider: 'tidal',
      },
    },
    endpoint: 'http://127.0.0.1:47030',
    ...overrides,
  });
}

function tuberSwitchModuleFixture(overrides: Partial<ModuleInfo> = {}): ModuleInfo {
  return moduleFixture({
    id: 'tuberswitch',
    name: 'TuberSwitch',
    executable: 'TuberSwitch.exe',
    version: '0.5.0',
    mode: 'service',
    healthText: 'TuberSwitch operational',
    capabilities: ['Profiles', 'Status Reporting'],
    status: {
      state: 'ready',
      message: 'Profile active',
      healthy: true,
      activeProfile: 'Gaming Stream',
      activeProfileId: 'gaming',
      activeMode: '3d',
      obsSummary: 'Connected: Gaming / VTuber',
      obsConnected: true,
      activeScene: 'Gaming',
      activeSource: 'VTuber',
      redeemsEnabled: true,
      redeemCount: 5,
      manageableRedeemCount: 2,
      unmanageableRedeemCount: 3,
      appDetectionStatus: '3D app detected',
      appDetectionEnabled: true,
      currentModeLabel: '3D VTuber Mode',
    },
    endpoint: 'http://127.0.0.1:47040',
    ...overrides,
  });
}

function actionFixture() {
  return {
    onStart: vi.fn(),
    onOpen: vi.fn(),
    onRefresh: vi.fn(),
  };
}

function workflowFixture(overrides: Partial<{
  profiles: string[];
  currentProfile: CurrentProfile;
  announcementFields: api.AnnouncementField[];
  announcementFieldDrafts: Record<string, string>;
  hasSessionChanges: boolean;
  announceStatus: AnnounceStatus;
  endStreamStatus: EndStreamStatus;
  selectedProfile: string;
  message: string;
  busy: boolean;
  pendingConfirmation: { success: boolean; requiresConfirmation?: boolean; confirmationId?: string; error?: string } | null;
}> = {}) {
  return {
    profiles: ['Gaming Stream', 'Music Stream'],
    currentProfile: { id: 'gaming', name: 'Gaming Stream' },
    announcementFields: [],
    announcementFieldDrafts: {},
    hasSessionChanges: false,
    announceStatus: { lastRun: '2026-06-05T12:00:00Z', success: true },
    endStreamStatus: { lastRun: '', success: false },
    selectedProfile: 'Gaming Stream',
    message: '',
    busy: false,
    pendingConfirmation: null,
    onSelectProfile: vi.fn(),
    onChangeAnnouncementField: vi.fn(),
    onResetAnnouncementFields: vi.fn(),
    onGoLive: vi.fn(),
    onConfirmGoLive: vi.fn(),
    onCancelConfirmation: vi.fn(),
    onEndStream: vi.fn(),
    ...overrides,
  };
}

function tideReaderWorkflowFixture(overrides: Partial<{
  profiles: string[];
  currentProfile: CurrentProfile;
  selectedProfile: string;
  browserSupport: api.BrowserSupport;
  browserSupportPending: boolean;
  busy: boolean;
}> = {}) {
  return {
    profiles: ['Listening Party', 'Gaming Overlay'],
    currentProfile: { id: 'listening-party', name: 'Listening Party' },
    selectedProfile: 'Listening Party',
    browserSupport: { enabled: true },
    browserSupportPending: false,
    busy: false,
    onSelectProfile: vi.fn(),
    onToggleBrowserSupport: vi.fn(),
    ...overrides,
  };
}

function tuberSwitchWorkflowFixture(overrides: Partial<{
  profiles: string[];
  currentProfile: CurrentProfile;
  selectedProfile: string;
  redeems: Redeem[];
  pendingRedeemIds: string[];
  hasSessionChanges: boolean;
  busy: boolean;
  error: string;
}> = {}) {
  return {
    profiles: ['Gaming Stream', 'Just Chatting'],
    currentProfile: { id: 'gaming', name: 'Gaming Stream' },
    selectedProfile: 'Gaming Stream',
    redeems: [],
    pendingRedeemIds: [],
    hasSessionChanges: false,
    busy: false,
    onSelectProfile: vi.fn(),
    onToggleRedeem: vi.fn(),
    ...overrides,
  };
}

function tideReaderOverlayFixture(overrides: Partial<api.TideReaderOverlaySnapshot> = {}): api.TideReaderOverlaySnapshot {
  return {
    available: true,
    nowPlaying: {
      status: 'playing',
      title: 'Paradigm (from "Gimmick!")',
      artist: 'Ian Martyn, GameGrooves',
      album: 'Lion Heart',
      artworkPath: 'cover.jpg',
    },
    settings: {
      songTextStyle: { fontSizePx: 22, maxCharacters: 55, bold: true, colorHex: '#E6E6E6' },
      artistTextStyle: { fontSizePx: 16, maxCharacters: 60, bold: true, colorHex: '#E6E6E6' },
      albumTextStyle: { fontSizePx: 14, maxCharacters: 60, colorHex: '#BFBFBF' },
      imageSizePx: 100,
      overlayContainerStyle: {
        backgroundMode: 'solid',
        backgroundColorHex: '#32334F',
        opacity: 0.86,
        cornerRadiusPx: 18,
        paddingPx: 14,
        gapPx: 14,
        borderEnabled: true,
        borderColorHex: '#E6E6E6',
        borderWidthPx: 1,
      },
      statusPillStyle: {
        backgroundColorHex: '#BBB3FF',
        textColorHex: '#E6E6E6',
        opacity: 0.25,
        fontSizePx: 11,
        cornerRadiusPx: 999,
        paddingHorizontalPx: 9,
        paddingVerticalPx: 4,
      },
      imagePosition: 'Left',
      textAlign: 'Left',
      showAppName: true,
      showPlaybackState: true,
    },
    overlayUrl: 'http://127.0.0.1:17655/overlay',
    coverUrl: 'http://127.0.0.1:17655/cover.jpg',
    ...overrides,
  };
}

function executableConfigFixture(overrides: Partial<ModuleExecutableConfig> = {}): ModuleExecutableConfig {
  return {
    id: 'streamsignal',
    name: 'StreamSignal',
    executablePath: '',
    resolvedPath: 'C:/Tools/StreamSignal.exe',
    pathSource: 'detected',
    environmentKey: 'LIVEPANEL_STREAMSIGNAL_EXECUTABLE',
    envLocked: false,
    valid: true,
    ...overrides,
  };
}

function renderDashboard(modules: ModuleInfo[], workflow = workflowFixture(), actions = actionFixture()) {
  render(
    <Dashboard
      modules={modules}
      workflow={workflow}
      tideReaderWorkflow={tideReaderWorkflowFixture()}
      tuberSwitchWorkflow={tuberSwitchWorkflowFixture()}
      tideReaderOverlay={tideReaderOverlayFixture()}
      {...actions}
    />,
  );
  return actions;
}

describe('Dashboard', () => {
  it('displays a healthy module', () => {
    renderDashboard([moduleFixture(), tideReaderModuleFixture(), tuberSwitchModuleFixture()]);

    expect(screen.getByRole('heading', { name: 'Current Stream Setup' })).toBeInTheDocument();
    expect(screen.getByText('All modules connected and ready.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Stream Status' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Modules' })).not.toBeInTheDocument();
    expect(screen.getAllByDisplayValue('Gaming Stream').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Go Live/i })).toBeEnabled();
    expect(screen.queryByText('Runtime')).not.toBeInTheDocument();
    expect(screen.queryByText('Protocol Version')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Activate$/i })).not.toBeInTheDocument();
  });

  it('marks cards and detail buttons with session changes', () => {
    renderDashboard(
      [moduleFixture(), tideReaderModuleFixture(), tuberSwitchModuleFixture()],
      workflowFixture({ hasSessionChanges: true }),
      actionFixture(),
    );

    expect(screen.getByText('Manual edit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View StreamSignal app details' })).toHaveClass('has-session-changes');
    expect(screen.getByRole('button', { name: 'View TideReader app details' })).not.toHaveClass('has-session-changes');
  });

  it('marks TuberSwitch cards with session changes', () => {
    render(
      <Dashboard
        modules={[moduleFixture(), tideReaderModuleFixture(), tuberSwitchModuleFixture()]}
        workflow={workflowFixture()}
        tideReaderWorkflow={tideReaderWorkflowFixture()}
        tuberSwitchWorkflow={tuberSwitchWorkflowFixture({ hasSessionChanges: true })}
        tideReaderOverlay={tideReaderOverlayFixture()}
        {...actionFixture()}
      />,
    );

    expect(screen.getByText('Manual edit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View TuberSwitch app details' })).toHaveClass('has-session-changes');
    expect(screen.getByRole('button', { name: 'View TideReader app details' })).not.toHaveClass('has-session-changes');
  });

  it('displays an unhealthy module', () => {
    renderDashboard([moduleFixture({ healthy: false, healthStatus: 'error' }), tideReaderModuleFixture(), tuberSwitchModuleFixture()]);

    expect(screen.getByRole('button', { name: /Go Live/i })).toBeEnabled();
  });

  it('displays degraded modules distinctly from ready modules', () => {
    renderDashboard([moduleFixture({ healthy: true, healthStatus: 'degraded' }), tideReaderModuleFixture(), tuberSwitchModuleFixture()]);

    expect(screen.getByRole('button', { name: /Go Live/i })).toBeEnabled();
  });

  it('shows offline app status without module lifecycle actions', () => {
    renderDashboard([moduleFixture({ running: false, healthy: false, mode: '', healthStatus: 'offline' }), tideReaderModuleFixture(), tuberSwitchModuleFixture()]);

    expect(screen.getByText('StreamSignal unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Start$/i })).not.toBeInTheDocument();
  });

  it('keeps unresolved apps visible in setup without adding module cards', () => {
    renderDashboard([moduleFixture({ installed: false, running: false, healthy: false, mode: '', healthStatus: 'offline' }), tideReaderModuleFixture(), tuberSwitchModuleFixture()]);

    expect(screen.getByText('StreamSignal unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Modules' })).not.toBeInTheDocument();
  });

  it('disables lifecycle actions without an active profile', () => {
    render(
      <Dashboard
        modules={[moduleFixture({ status: { state: 'idle', message: 'Ready', destinationCount: 1 } }), tideReaderModuleFixture(), tuberSwitchModuleFixture()]}
        workflow={workflowFixture({ currentProfile: { id: '', name: '' }, selectedProfile: '' })}
        tideReaderWorkflow={tideReaderWorkflowFixture()}
        tuberSwitchWorkflow={tuberSwitchWorkflowFixture()}
        {...actionFixture()}
      />,
    );

    expect(screen.getByText('No StreamSignal profile selected.')).toBeInTheDocument();
    expect(screen.getByText('Needs profile')).toBeInTheDocument();
    expect(screen.queryByText('No profile selected')).not.toBeInTheDocument();
    expect(screen.queryByText('1 Destination')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Go Live/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /End Stream/i })).toBeDisabled();
  });

  it('shows app details only when the drawer is requested', async () => {
    const user = userEvent.setup();
    const actions = actionFixture();
    render(
      <Dashboard
        modules={[moduleFixture(), tideReaderModuleFixture(), tuberSwitchModuleFixture()]}
        workflow={workflowFixture({
          announceStatus: { lastRun: '2026-06-05T12:00:00Z', success: false, error: 'SIP announcement request failed.' },
        })}
        tideReaderWorkflow={tideReaderWorkflowFixture()}
        tuberSwitchWorkflow={tuberSwitchWorkflowFixture()}
        {...actions}
      />,
    );

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'View StreamSignal app details' }));
    expect(screen.getByText('Announcement Failed')).toBeInTheDocument();
    expect(screen.getByText('None included')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resize app details drawer' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close app details' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('shows StreamSignal drawer metadata from SIP status', async () => {
    const user = userEvent.setup();
    render(
      <Dashboard
        modules={[
          moduleFixture({
            status: {
              state: 'idle',
              message: 'Ready',
              destinationCount: 3,
              enabledDestinationCount: 2,
              destinationGroup: 'Main Announcements',
              destinationPlatforms: ['bluesky', 'discord'],
              image: 'Announcement image + Bluesky card thumbnail',
              template: '2 destination templates',
              streamTitle: 'Late Night Music',
            },
          }),
          tideReaderModuleFixture(),
          tuberSwitchModuleFixture(),
        ]}
        workflow={workflowFixture()}
        tideReaderWorkflow={tideReaderWorkflowFixture()}
        tuberSwitchWorkflow={tuberSwitchWorkflowFixture()}
        {...actionFixture()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'View StreamSignal app details' }));

    expect(screen.getByText('2 enabled of 3 destinations')).toBeInTheDocument();
    expect(screen.getByText('Bluesky, Discord')).toBeInTheDocument();
    expect(screen.getByText('Announcement image + Bluesky card thumbnail')).toBeInTheDocument();
    expect(screen.getByText('2 destination templates')).toBeInTheDocument();
    expect(screen.queryByText('Gaming Stream Template')).not.toBeInTheDocument();
  });

  it('orders StreamSignal announcement fields for manual announcement entry', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Dashboard
        modules={[moduleFixture(), tideReaderModuleFixture(), tuberSwitchModuleFixture()]}
        workflow={workflowFixture({
          announcementFields: [
            { id: 'message', name: 'Message', value: '' },
            { id: 'hashtags', name: 'Hashtags', value: '#vtuber' },
            { id: 'stream_url', name: 'Stream URL', value: 'https://example.com/live' },
            { id: 'category', name: 'Category', value: 'Music' },
            { id: 'stream_title', name: 'Stream Title', value: 'Late Night Music' },
          ],
          announcementFieldDrafts: {
            message: '',
            hashtags: '#vtuber',
            stream_url: 'https://example.com/live',
            category: 'Music',
            stream_title: 'Late Night Music',
          },
        })}
        tideReaderWorkflow={tideReaderWorkflowFixture()}
        tuberSwitchWorkflow={tuberSwitchWorkflowFixture()}
        {...actionFixture()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'View StreamSignal app details' }));

    const labels = Array.from(container.querySelectorAll('.announcement-field-row span')).map((label) => label.textContent);
    expect(labels).toEqual(['Stream Title', 'Stream URL', 'Category/Game', 'Hashtags', 'Optional Message']);
  });

  it('keeps redundant announcement values out of the StreamSignal drawer summary', async () => {
    const user = userEvent.setup();
    render(
      <Dashboard
        modules={[moduleFixture({ status: { state: 'idle', message: 'Ready', destinationCount: 1 } }), tideReaderModuleFixture(), tuberSwitchModuleFixture()]}
        workflow={workflowFixture({
          announcementFields: [
            { id: 'stream_title', name: 'Stream Title', value: 'Field Stream Title' },
            { id: 'stream_url', name: 'Stream URL', value: 'https://example.com/field' },
            { id: 'category', name: 'Category', value: 'Field Category' },
            { id: 'hashtags', name: 'Hashtags', value: '#field' },
          ],
          announcementFieldDrafts: {
            stream_title: 'Field Stream Title',
            stream_url: 'https://example.com/field',
            category: 'Field Category',
            hashtags: '#field',
          },
        })}
        tideReaderWorkflow={tideReaderWorkflowFixture()}
        tuberSwitchWorkflow={tuberSwitchWorkflowFixture()}
        {...actionFixture()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'View StreamSignal app details' }));

    expect(screen.queryByText('https://example.com/field')).not.toBeInTheDocument();
    expect(screen.queryByText('Field Category')).not.toBeInTheDocument();
    expect(screen.queryByText('#field')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('https://example.com/field')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Field Category')).toBeInTheDocument();
    expect(screen.getByDisplayValue('#field')).toBeInTheDocument();
    expect(screen.queryByText('Managed in StreamSignal')).not.toBeInTheDocument();
  });

  it('displays duplicate confirmation modal', () => {
    const actions = actionFixture();
    render(
      <Dashboard
        modules={[moduleFixture(), tideReaderModuleFixture(), tuberSwitchModuleFixture()]}
        workflow={workflowFixture({
          pendingConfirmation: {
            success: false,
            requiresConfirmation: true,
            confirmationId: 'confirm-1',
            error: 'A similar announcement was recently posted within the last 10 minutes. Continue?',
          },
        })}
        tideReaderWorkflow={tideReaderWorkflowFixture()}
        tuberSwitchWorkflow={tuberSwitchWorkflowFixture()}
        {...actions}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Send again?' })).toBeInTheDocument();
    expect(screen.getByText('Confirm')).toBeInTheDocument();
  });

  it('calls workflow actions from profile and lifecycle controls', async () => {
    const user = userEvent.setup();
    const actions = actionFixture();
    const workflow = workflowFixture();

    render(
      <Dashboard
        modules={[moduleFixture(), tideReaderModuleFixture(), tuberSwitchModuleFixture()]}
        workflow={workflow}
        tideReaderWorkflow={tideReaderWorkflowFixture()}
        tuberSwitchWorkflow={tuberSwitchWorkflowFixture()}
        {...actions}
      />,
    );

    await user.selectOptions(screen.getAllByLabelText(/Profile/i)[0], 'Music Stream');
    await user.click(screen.getByRole('button', { name: /Go Live/i }));
    await user.click(screen.getByRole('button', { name: /End Stream/i }));

    expect(workflow.onSelectProfile).toHaveBeenCalledWith('Music Stream');
    expect(workflow.onGoLive).toHaveBeenCalledTimes(1);
    expect(workflow.onEndStream).toHaveBeenCalledTimes(1);
  });

  it('displays and controls TideReader overlay profiles', async () => {
    const user = userEvent.setup();
    const actions = actionFixture();
    const tideReaderWorkflow = tideReaderWorkflowFixture();

    render(
      <Dashboard
        modules={[moduleFixture(), tideReaderModuleFixture(), tuberSwitchModuleFixture()]}
        workflow={workflowFixture()}
        tideReaderWorkflow={tideReaderWorkflow}
        tuberSwitchWorkflow={tuberSwitchWorkflowFixture()}
        tideReaderOverlay={tideReaderOverlayFixture()}
        {...actions}
      />,
    );

    expect(screen.getAllByText('Overlay').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'Active Profile' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Listening Party').length).toBeGreaterThan(0);
    expect(screen.queryByText('Copy overlay URL: http://127.0.0.1:17655/overlay')).not.toBeInTheDocument();
    expect(screen.queryByTitle('TideReader overlay preview')).not.toBeInTheDocument();
    expect(screen.getAllByDisplayValue('Listening Party').length).toBeGreaterThan(0);

    await user.selectOptions(screen.getAllByLabelText(/Profile/i)[1], 'Gaming Overlay');
    await user.click(screen.getByRole('button', { name: 'View TideReader app details' }));
    expect(screen.getByRole('complementary', { name: 'TideReader' })).toBeInTheDocument();
    expect(screen.getByLabelText('TideReader overlay preview')).toHaveTextContent('Paradigm');
    expect(screen.getByText('Right')).toBeInTheDocument();
    expect(screen.getAllByText('Hidden')).toHaveLength(2);
    expect(screen.getByText('Gradient')).toBeInTheDocument();
    expect(screen.getByText('http://127.0.0.1:17660/overlay')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Open in TideReader/i }));

    expect(tideReaderWorkflow.onSelectProfile).toHaveBeenCalledWith('Gaming Overlay');
    expect(actions.onOpen).toHaveBeenCalledWith('tidereader');
  });

  it('marks TideReader browser support on without treating it as a manual edit', () => {
    render(
      <Dashboard
        modules={[moduleFixture(), tideReaderModuleFixture(), tuberSwitchModuleFixture()]}
        workflow={workflowFixture()}
        tideReaderWorkflow={tideReaderWorkflowFixture({ browserSupport: { enabled: true } })}
        tuberSwitchWorkflow={tuberSwitchWorkflowFixture()}
        tideReaderOverlay={tideReaderOverlayFixture()}
        {...actionFixture()}
      />,
    );

    expect(screen.getByText('Browser Support On')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View TideReader app details' })).not.toHaveClass('has-session-changes');
  });

  it('keeps profile controls enabled while TideReader browser support is pending', async () => {
    const user = userEvent.setup();

    render(
      <Dashboard
        modules={[moduleFixture(), tideReaderModuleFixture(), tuberSwitchModuleFixture()]}
        workflow={workflowFixture()}
        tideReaderWorkflow={tideReaderWorkflowFixture({ browserSupport: { enabled: true }, browserSupportPending: true })}
        tuberSwitchWorkflow={tuberSwitchWorkflowFixture()}
        tideReaderOverlay={tideReaderOverlayFixture()}
        {...actionFixture()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'View TideReader app details' }));

    const drawer = screen.getByRole('complementary', { name: 'TideReader' });
    expect(within(drawer).getByRole('checkbox')).toBeDisabled();
    for (const select of screen.getAllByLabelText(/Profile/i)) {
      expect(select).toBeEnabled();
    }
  });

  it('hides browser now-playing data in TideReader previews when browser support is disabled', async () => {
    const user = userEvent.setup();
    const browserSnapshot = tideReaderOverlayFixture({
      nowPlaying: {
        status: 'playing',
        title: 'Browser Song',
        artist: 'Browser Artist',
        album: 'Browser Album',
        provider: 'browser',
        browser: 'chrome',
      },
      settings: {
        ...tideReaderOverlayFixture().settings,
        songTextStyle: { fontSizePx: 22, maxCharacters: 0, bold: true, colorHex: '#E6E6E6' },
        artistTextStyle: { fontSizePx: 16, maxCharacters: 0, bold: true, colorHex: '#E6E6E6' },
        albumTextStyle: { fontSizePx: 14, maxCharacters: 0, colorHex: '#BFBFBF' },
      },
    });

    render(
      <Dashboard
        modules={[moduleFixture(), tideReaderModuleFixture({ capabilities: ['Profiles', 'Status Reporting', 'browser-support'], status: { ...tideReaderModuleFixture().status, source: 'browser', browserSupportEnabled: false } }), tuberSwitchModuleFixture()]}
        workflow={workflowFixture()}
        tideReaderWorkflow={tideReaderWorkflowFixture({ browserSupport: { enabled: false } })}
        tuberSwitchWorkflow={tuberSwitchWorkflowFixture()}
        tideReaderOverlay={browserSnapshot}
        {...actionFixture()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'View TideReader app details' }));

    expect(screen.queryByText('Browser Song')).not.toBeInTheDocument();
    expect(screen.getByText('Nothing playing')).toBeInTheDocument();
    expect(screen.getByText('Waiting for playback')).toBeInTheDocument();
    expect(screen.queryByText('...')).not.toBeInTheDocument();
    expect(screen.getByText('Current source')).toBeInTheDocument();
    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('marks TideReader smart text modes in the drawer preview', async () => {
    const user = userEvent.setup();
    const smartSnapshot = tideReaderOverlayFixture({
      nowPlaying: {
        status: 'playing',
        title: 'A Very Long Song Title That Should Use Smart Text',
        artist: 'A Very Long Artist Name',
        album: 'A Very Long Album Name',
        provider: 'tidal',
      },
      settings: {
        ...tideReaderOverlayFixture().settings,
        songTextStyle: { fontSizePx: 22, maxCharacters: 0, bold: true, colorHex: '#E6E6E6', textOverflowMode: 'TwoLines' },
        artistTextStyle: { fontSizePx: 16, maxCharacters: 0, bold: true, colorHex: '#E6E6E6', textOverflowMode: 'Scroll' },
        albumTextStyle: { fontSizePx: 14, maxCharacters: 0, colorHex: '#BFBFBF', textOverflowMode: 'AutoSize' },
      },
    });

    render(
      <Dashboard
        modules={[moduleFixture(), tideReaderModuleFixture(), tuberSwitchModuleFixture()]}
        workflow={workflowFixture()}
        tideReaderWorkflow={tideReaderWorkflowFixture()}
        tuberSwitchWorkflow={tuberSwitchWorkflowFixture()}
        tideReaderOverlay={smartSnapshot}
        {...actionFixture()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'View TideReader app details' }));

    const smartTextFor = (text: string) =>
      screen.getAllByText(text).find((element) => !element.hasAttribute('aria-hidden'))?.closest('.tr-smart-text');
    expect(smartTextFor('A Very Long Song Title That Should Use Smart Text')).toHaveAttribute('data-overflow-mode', 'TwoLines');
    expect(smartTextFor('A Very Long Artist Name')).toHaveAttribute('data-overflow-mode', 'Scroll');
    expect(smartTextFor('A Very Long Album Name')).toHaveAttribute('data-overflow-mode', 'AutoSize');
  });

  it('displays and controls TuberSwitch profiles and active mode', async () => {
    const user = userEvent.setup();
    const actions = actionFixture();
    const tuberSwitchWorkflow = tuberSwitchWorkflowFixture({
      redeems: [
        { id: 'headpat', name: 'Headpats', available: true, enabled: true },
        { id: 'instrument', name: 'Throw Instruments', available: true, enabled: false },
        { id: 'readonly', name: 'Read-only Reward', available: false, enabled: false },
      ],
    });

    render(
      <Dashboard
        modules={[moduleFixture(), tideReaderModuleFixture(), tuberSwitchModuleFixture()]}
        workflow={workflowFixture()}
        tideReaderWorkflow={tideReaderWorkflowFixture()}
        tuberSwitchWorkflow={tuberSwitchWorkflow}
        tideReaderOverlay={tideReaderOverlayFixture()}
        {...actions}
      />,
    );

    expect(screen.getAllByText('Avatar').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Gaming Stream (3D)').length).toBeGreaterThan(0);
    expect(screen.queryByText('Status')).not.toBeInTheDocument();
    expect(screen.queryByText('Protocol Version')).not.toBeInTheDocument();

    await user.selectOptions(screen.getAllByLabelText(/Profile/i)[2], 'Just Chatting');
    await user.click(screen.getByRole('button', { name: 'View TuberSwitch app details' }));
    expect(screen.getByRole('complementary', { name: 'TuberSwitch' })).toBeInTheDocument();
    expect(screen.getByText('Mode')).toBeInTheDocument();
    expect(screen.getByText('3D VTuber Mode')).toBeInTheDocument();
    expect(screen.getByText('Connected: Gaming / VTuber')).toBeInTheDocument();
    expect(screen.getByText('Headpats')).toBeInTheDocument();
    expect(screen.getByText('Throw Instruments')).toBeInTheDocument();
    expect(screen.queryByText('Read-only Reward')).not.toBeInTheDocument();
    expect(screen.getByText('3D app detected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Open in TuberSwitch/i }));

    expect(tuberSwitchWorkflow.onSelectProfile).toHaveBeenCalledWith('Just Chatting');
    expect(actions.onOpen).toHaveBeenCalledWith('tuberswitch');
  });

  it('only marks the clicked TuberSwitch redeem as pending', async () => {
    const user = userEvent.setup();
    render(
      <Dashboard
        modules={[moduleFixture(), tideReaderModuleFixture(), tuberSwitchModuleFixture()]}
        workflow={workflowFixture()}
        tideReaderWorkflow={tideReaderWorkflowFixture()}
        tuberSwitchWorkflow={tuberSwitchWorkflowFixture({
          redeems: [
            { id: 'headpat', name: 'Headpats', available: true, enabled: true },
            { id: 'instrument', name: 'Throw Instruments', available: true, enabled: false },
          ],
          pendingRedeemIds: ['headpat'],
        })}
        tideReaderOverlay={tideReaderOverlayFixture()}
        {...actionFixture()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'View TuberSwitch app details' }));

    const toggles = screen.getAllByRole('checkbox');
    expect(toggles[0]).toBeDisabled();
    expect(toggles[1]).toBeEnabled();
  });

  it('shows TuberSwitch activation failures from SIP', () => {
    const actions = actionFixture();

    render(
      <Dashboard
        modules={[moduleFixture(), tideReaderModuleFixture(), tuberSwitchModuleFixture()]}
        workflow={workflowFixture()}
        tideReaderWorkflow={tideReaderWorkflowFixture()}
        tuberSwitchWorkflow={tuberSwitchWorkflowFixture({ error: 'ProfileNotFound' })}
        {...actions}
      />,
    );

    expect(screen.getByText('ProfileNotFound')).toBeInTheDocument();
  });

  it('calls duplicate confirmation actions', async () => {
    const user = userEvent.setup();
    const actions = actionFixture();
    const workflow = workflowFixture({
      pendingConfirmation: {
        success: false,
        requiresConfirmation: true,
        confirmationId: 'confirm-1',
        error: 'A similar announcement was recently posted within the last 10 minutes. Continue?',
      },
    });

    render(
      <Dashboard
        modules={[moduleFixture(), tideReaderModuleFixture(), tuberSwitchModuleFixture()]}
        workflow={workflow}
        tideReaderWorkflow={tideReaderWorkflowFixture()}
        tuberSwitchWorkflow={tuberSwitchWorkflowFixture()}
        {...actions}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Cancel/i }));
    await user.click(screen.getByRole('button', { name: /Confirm/i }));

    expect(workflow.onCancelConfirmation).toHaveBeenCalledTimes(1);
    expect(workflow.onConfirmGoLive).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsPage', () => {
  it('renders and edits module executable locations', async () => {
    const user = userEvent.setup();
    const onSetExecutablePath = vi.fn();
    const onClearExecutablePath = vi.fn();
    const onPickExecutablePath = vi.fn();
    render(
      <SettingsPage
        moduleConfigs={[executableConfigFixture(), executableConfigFixture({ id: 'tidereader', name: 'TideReader', resolvedPath: 'C:/Tools/TideReader.Desktop.exe' })]}
        autoStartEnabled={true}
        onToggleAutoStart={vi.fn()}
        onSetExecutablePath={onSetExecutablePath}
        onClearExecutablePath={onClearExecutablePath}
        onPickExecutablePath={onPickExecutablePath}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Module Locations' })).toBeInTheDocument();
    const pathInputs = screen.getAllByLabelText('Executable path');

    await user.clear(pathInputs[0]);
    await user.type(pathInputs[0], 'D:/Apps/StreamSignal.exe');
    pathInputs[0].blur();
    await user.click(screen.getAllByRole('button', { name: /Browse/i })[1]);

    expect(onSetExecutablePath).toHaveBeenCalledWith('streamsignal', 'D:/Apps/StreamSignal.exe');
    expect(onPickExecutablePath).toHaveBeenCalledWith('tidereader');
  });

  it('locks environment-provided executable paths', () => {
    render(
      <SettingsPage
        moduleConfigs={[executableConfigFixture({ pathSource: 'environment', envLocked: true, executablePath: '', resolvedPath: 'C:/Env/StreamSignal.exe' })]}
        autoStartEnabled={true}
        onToggleAutoStart={vi.fn()}
        onSetExecutablePath={vi.fn()}
        onClearExecutablePath={vi.fn()}
        onPickExecutablePath={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Executable path')).toBeDisabled();
    expect(screen.getByRole('button', { name: /Browse/i })).toBeDisabled();
  });
});

describe('DiagnosticsPage', () => {
  it('renders detailed read-only module information', () => {
    const actions = actionFixture();
    render(
      <DiagnosticsPage
        modules={[
          moduleFixture({
            healthText: 'Pending Live Now recovery sessions need attention.',
            healthStatus: 'degraded',
            status: { state: 'warning', message: 'Pending Live Now recovery sessions need attention.', activeProfile: 'Music Stream' },
          }),
        ]}
        {...actions}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Diagnostics' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Module Diagnostics' })).toBeInTheDocument();
    expect(screen.getByText('http://127.0.0.1:47020')).toBeInTheDocument();
    expect(screen.getAllByText('Pending Live Now recovery sessions need attention.')).toHaveLength(2);
    expect(screen.getByText('activeProfile')).toBeInTheDocument();
    expect(screen.getByText('Music Stream')).toBeInTheDocument();
  });

  it('renders the modules empty state', () => {
    const actions = actionFixture();
    render(<DiagnosticsPage modules={[]} {...actions} />);

    expect(screen.getByText('No Starsong modules detected.')).toBeInTheDocument();
  });
});

describe('App workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.refreshModules).mockResolvedValue([moduleFixture(), tideReaderModuleFixture(), tuberSwitchModuleFixture()]);
    vi.mocked(api.listModules).mockResolvedValue([moduleFixture(), tideReaderModuleFixture(), tuberSwitchModuleFixture()]);
    vi.mocked(api.getAutoStartManagedModules).mockResolvedValue(true);
    vi.mocked(api.getModuleExecutableConfigs).mockResolvedValue([
      executableConfigFixture(),
      executableConfigFixture({ id: 'tidereader', name: 'TideReader', resolvedPath: 'C:/Tools/TideReader.Desktop.exe' }),
    ]);
    vi.mocked(api.getStreamSignalProfiles).mockResolvedValue(['Gaming Stream', 'Music Stream']);
    vi.mocked(api.getStreamSignalCurrentProfile).mockResolvedValue({ id: 'gaming', name: 'Gaming Stream' });
    vi.mocked(api.getStreamSignalAnnouncementFields).mockResolvedValue([]);
    vi.mocked(api.getStreamSignalAnnounceStatus).mockResolvedValue({ lastRun: '', success: false });
    vi.mocked(api.getStreamSignalEndStreamStatus).mockResolvedValue({ lastRun: '', success: false });
    vi.mocked(api.getTideReaderProfiles).mockResolvedValue(['Listening Party', 'Gaming Overlay']);
    vi.mocked(api.getTideReaderCurrentProfile).mockResolvedValue({ id: 'listening-party', name: 'Listening Party' });
    vi.mocked(api.getTideReaderOverlaySnapshot).mockResolvedValue(tideReaderOverlayFixture());
    vi.mocked(api.getTuberSwitchProfiles).mockResolvedValue(['Gaming Stream', 'Just Chatting']);
    vi.mocked(api.getTuberSwitchCurrentProfile).mockResolvedValue({ id: 'gaming', name: 'Gaming Stream' });
    vi.mocked(api.getTuberSwitchRedeems).mockResolvedValue([]);
    vi.mocked(api.activateStreamSignalProfile).mockResolvedValue({ success: true, profile: 'Music Stream', profileId: 'music' });
    vi.mocked(api.activateTideReaderProfile).mockResolvedValue({ success: true, profile: 'Gaming Overlay', profileId: 'gaming-overlay' });
    vi.mocked(api.activateTuberSwitchProfile).mockResolvedValue({ success: true, profile: 'Just Chatting', profileId: 'just-chatting' });
    vi.mocked(api.announceStreamSignal).mockResolvedValue({ success: true });
    vi.mocked(api.confirmStreamSignalAnnouncement).mockResolvedValue({ success: true });
    vi.mocked(api.endStreamSignalStream).mockResolvedValue({ success: true });
    vi.mocked(api.openModule).mockResolvedValue([moduleFixture(), tideReaderModuleFixture(), tuberSwitchModuleFixture()]);
    vi.mocked(api.pickModuleExecutablePath).mockResolvedValue('D:/Apps/TideReader.Desktop.exe');
    vi.mocked(api.startModule).mockResolvedValue([moduleFixture(), tideReaderModuleFixture(), tuberSwitchModuleFixture()]);
    vi.mocked(api.setAutoStartManagedModules).mockResolvedValue(false);
    vi.mocked(api.setModuleExecutablePath).mockResolvedValue([
      executableConfigFixture(),
      executableConfigFixture({ id: 'tidereader', name: 'TideReader', executablePath: 'D:/Apps/TideReader.Desktop.exe', resolvedPath: 'D:/Apps/TideReader.Desktop.exe', pathSource: 'configured' }),
    ]);
    vi.mocked(api.clearModuleExecutablePath).mockResolvedValue([executableConfigFixture()]);
  });

  it('loads StreamSignal workflow data on startup', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Stream Control' })).toBeInTheDocument();
    expect((await screen.findAllByDisplayValue('Gaming Stream')).length).toBeGreaterThan(0);
    expect(api.refreshModules).toHaveBeenCalledTimes(1);
    expect(api.startModule).not.toHaveBeenCalled();
    expect(api.getStreamSignalProfiles).toHaveBeenCalledTimes(1);
    expect(api.getStreamSignalCurrentProfile).toHaveBeenCalledTimes(1);
    expect(api.getTideReaderProfiles).toHaveBeenCalledTimes(1);
    expect(api.getTideReaderCurrentProfile).toHaveBeenCalledTimes(1);
    expect(api.getTuberSwitchProfiles).toHaveBeenCalledTimes(1);
    expect(api.getTuberSwitchCurrentProfile).toHaveBeenCalledTimes(1);
  });

  it('shows OBS offline when StreamSignal omits OBS status', async () => {
    render(<App />);

    const readiness = await screen.findByLabelText('Stream readiness');
    const obsItem = within(readiness).getByText('OBS').closest('article');
    expect(obsItem).not.toBeNull();
    expect(obsItem).toHaveClass('readiness-offline');
    expect(within(obsItem as HTMLElement).getByText('Offline')).toBeInTheDocument();
    expect(within(obsItem as HTMLElement).queryByText('Connected')).not.toBeInTheDocument();
  });

  it('starts installed offline modules when auto-start is enabled', async () => {
    vi.mocked(api.refreshModules).mockResolvedValue([
      moduleFixture({
        running: false,
        healthy: false,
        mode: '',
        healthStatus: 'offline',
      }),
    ]);
    vi.mocked(api.startModule).mockResolvedValue([moduleFixture()]);

    render(<App />);

    await waitFor(() => expect(api.startModule).toHaveBeenCalledWith('streamsignal'));
    expect(await screen.findByDisplayValue('Gaming Stream')).toBeInTheDocument();
  });

  it('activates a selected profile through the full app wiring', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions((await screen.findAllByLabelText(/Profile/i))[0], 'Music Stream');

    await waitFor(() => expect(api.activateStreamSignalProfile).toHaveBeenCalledWith('Music Stream'));
  });

  it('reloads StreamSignal announcement fields after profile activation', async () => {
    const user = userEvent.setup();
    vi.mocked(api.refreshModules)
      .mockResolvedValueOnce([moduleFixture(), tideReaderModuleFixture(), tuberSwitchModuleFixture()])
      .mockResolvedValueOnce([
        moduleFixture({
          status: {
            state: 'idle',
            message: 'Ready',
            activeProfile: 'Music Stream',
            activeProfileId: 'music',
            streamTitle: 'Music Stream Title',
            streamUrl: 'https://example.com/music',
            category: 'Music',
            hashtags: '#music',
          },
        }),
        tideReaderModuleFixture(),
        tuberSwitchModuleFixture(),
      ]);
    vi.mocked(api.getStreamSignalCurrentProfile)
      .mockResolvedValueOnce({ id: 'gaming', name: 'Gaming Stream' })
      .mockResolvedValue({ id: 'music', name: 'Music Stream' });
    vi.mocked(api.getStreamSignalAnnouncementFields).mockResolvedValue([
      { id: 'stream_title', name: 'Stream Title', value: 'Stale Stored Title' },
      { id: 'stream_url', name: 'Stream URL', value: 'https://example.com/stale' },
      { id: 'category', name: 'Category/Game', value: 'Stale Category' },
      { id: 'hashtags', name: 'Hashtags', value: '#stale' },
    ]);

    render(<App />);

    await user.selectOptions((await screen.findAllByLabelText(/Profile/i))[0], 'Music Stream');
    await waitFor(() => expect(api.activateStreamSignalProfile).toHaveBeenCalledWith('Music Stream'));
    await user.click(await screen.findByRole('button', { name: 'View StreamSignal app details' }));

    expect(await screen.findByDisplayValue('Music Stream Title')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://example.com/music')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Music')).toBeInTheDocument();
    expect(screen.getByDisplayValue('#music')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Stale Stored Title')).not.toBeInTheDocument();
  });

  it('keeps manual announcement field edits during dashboard polling', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getStreamSignalAnnouncementFields).mockResolvedValue([
      { id: 'stream_title', name: 'Stream Title', value: 'Profile Title' },
      { id: 'stream_url', name: 'Stream URL', value: 'https://example.com/profile' },
    ]);

    render(<App />);

    await screen.findByRole('heading', { name: 'Stream Control' });
    await user.click(await screen.findByRole('button', { name: 'View StreamSignal app details' }));

    const titleInput = await screen.findByDisplayValue('Profile Title');
    await user.clear(titleInput);
    await user.type(titleInput, 'One Time Title');

    await waitFor(() => expect(api.refreshModules).toHaveBeenCalledTimes(2), { timeout: 4000 });
    expect(screen.getByDisplayValue('One Time Title')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Profile Title')).not.toBeInTheDocument();

    expect(screen.getByText('Manual edit')).toBeInTheDocument();
    await user.clear(titleInput);
    await user.type(titleInput, 'Profile Title');
    expect(screen.queryByText('Manual edit')).not.toBeInTheDocument();
  }, 7000);

  it('activates a TideReader profile through the full app wiring', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions((await screen.findAllByLabelText(/Profile/i))[1], 'Gaming Overlay');

    await waitFor(() => expect(api.activateTideReaderProfile).toHaveBeenCalledWith('Gaming Overlay'));
  });

  it('activates a TuberSwitch profile through the full app wiring', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions((await screen.findAllByLabelText(/Profile/i))[2], 'Just Chatting');

    await waitFor(() => expect(api.activateTuberSwitchProfile).toHaveBeenCalledWith('Just Chatting'));
  });

  it('keeps manual TuberSwitch redeem toggle state when the service rereads profile values', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getTuberSwitchRedeems).mockResolvedValue([
      { id: 'hydrate', name: 'Hydrate', available: true, enabled: true },
    ]);
    vi.mocked(api.setTuberSwitchRedeem).mockResolvedValue({ success: true });

    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'View TuberSwitch app details' }));
    const redeemToggle = await screen.findByRole('checkbox');
    expect(redeemToggle).toBeChecked();

    await user.click(redeemToggle);

    await waitFor(() => expect(api.setTuberSwitchRedeem).toHaveBeenCalledWith('hydrate', false));
    expect(redeemToggle).not.toBeChecked();
    expect(screen.getByText('Manual edit')).toBeInTheDocument();

    await user.click(redeemToggle);

    await waitFor(() => expect(api.setTuberSwitchRedeem).toHaveBeenCalledWith('hydrate', true));
    expect(redeemToggle).toBeChecked();
    expect(screen.queryByText('Manual edit')).not.toBeInTheDocument();
  });

  it('updates module executable locations through settings', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Settings' }));
    await user.click(await screen.findAllByRole('button', { name: /Browse/i }).then((buttons) => buttons[1]));

    await waitFor(() => expect(api.pickModuleExecutablePath).toHaveBeenCalledWith('tidereader'));
    expect(api.setModuleExecutablePath).toHaveBeenCalledWith('tidereader', 'D:/Apps/TideReader.Desktop.exe');
  });

  it('opens diagnostics as a top-level page', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Diagnostics' }));

    expect(await screen.findByRole('heading', { name: 'Diagnostics' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Module Diagnostics' })).toBeInTheDocument();
  });

  it('handles go-live confirmation through the full app wiring', async () => {
    const user = userEvent.setup();
    vi.mocked(api.announceStreamSignal).mockResolvedValue({
      success: false,
      requiresConfirmation: true,
      confirmationId: 'confirm-1',
      error: 'A similar announcement was recently posted within the last 10 minutes. Continue?',
    });

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Go Live/i }));
    expect(await screen.findByRole('dialog', { name: 'Send again?' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Confirm/i }));
    await waitFor(() => expect(api.confirmStreamSignalAnnouncement).toHaveBeenCalledWith('confirm-1'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Send again?' })).not.toBeInTheDocument());
  });

  it('switches to settings with keyboard-accessible navigation', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('heading', { name: 'Stream Control' });
    await user.tab();
    expect(screen.getByRole('button', { name: /^Dashboard$/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /Settings/i })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Module Locations' })).toBeInTheDocument();
    expect(screen.getByText('C:/Tools/StreamSignal.exe')).toBeInTheDocument();
  });
});
