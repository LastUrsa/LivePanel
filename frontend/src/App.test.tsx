import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, vi } from 'vitest';
import App, { Dashboard, DiagnosticsPage, SettingsPage } from './App';
import * as api from './lib/api/livepanel';
import type { AnnounceStatus, CurrentProfile, EndStreamStatus, ModuleExecutableConfig, ModuleInfo } from './lib/api/livepanel';

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
    getStreamSignalCurrentProfile: vi.fn(),
    getStreamSignalEndStreamStatus: vi.fn(),
    getStreamSignalProfiles: vi.fn(),
    getTideReaderCurrentProfile: vi.fn(),
    getTideReaderOverlaySnapshot: vi.fn(),
    getTideReaderProfiles: vi.fn(),
    getTuberSwitchCurrentProfile: vi.fn(),
    getTuberSwitchProfiles: vi.fn(),
    listModules: vi.fn(),
    openModule: vi.fn(),
    pickModuleExecutablePath: vi.fn(),
    refreshModules: vi.fn(),
    setAutoStartManagedModules: vi.fn(),
    setModuleExecutablePath: vi.fn(),
    startModule: vi.fn(),
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
    announceStatus: { lastRun: '2026-06-05T12:00:00Z', success: true },
    endStreamStatus: { lastRun: '', success: false },
    selectedProfile: 'Gaming Stream',
    message: '',
    busy: false,
    pendingConfirmation: null,
    onSelectProfile: vi.fn(),
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
  busy: boolean;
}> = {}) {
  return {
    profiles: ['Listening Party', 'Gaming Overlay'],
    currentProfile: { id: 'listening-party', name: 'Listening Party' },
    selectedProfile: 'Listening Party',
    busy: false,
    onSelectProfile: vi.fn(),
    ...overrides,
  };
}

function tuberSwitchWorkflowFixture(overrides: Partial<{
  profiles: string[];
  currentProfile: CurrentProfile;
  selectedProfile: string;
  busy: boolean;
  error: string;
}> = {}) {
  return {
    profiles: ['Gaming Stream', 'Just Chatting'],
    currentProfile: { id: 'gaming', name: 'Gaming Stream' },
    selectedProfile: 'Gaming Stream',
    busy: false,
    onSelectProfile: vi.fn(),
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
    expect(screen.getByText('✓ All modules connected and ready.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Stream Status' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Modules' })).not.toBeInTheDocument();
    expect(screen.getAllByDisplayValue('Gaming Stream').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Go Live/i })).toBeEnabled();
    expect(screen.queryByText('Runtime')).not.toBeInTheDocument();
    expect(screen.queryByText('Protocol Version')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Activate$/i })).not.toBeInTheDocument();
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

    expect(screen.getByText('⚠ No StreamSignal profile selected.')).toBeInTheDocument();
    expect(screen.queryByText('1 Destination')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Go Live/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /End Stream/i })).toBeDisabled();
  });

  it('shows profile details only when the drawer is requested', async () => {
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

    await user.click(screen.getByRole('button', { name: 'View StreamSignal profile details' }));
    expect(screen.getByText('Announcement Failed')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close profile details' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'View TideReader profile details' }));
    expect(screen.getByRole('complementary', { name: 'Listening Party' })).toBeInTheDocument();
    expect(screen.getByLabelText('TideReader overlay preview')).toHaveTextContent('Paradigm');
    await user.click(screen.getByRole('button', { name: /Open in TideReader/i }));

    expect(tideReaderWorkflow.onSelectProfile).toHaveBeenCalledWith('Gaming Overlay');
    expect(actions.onOpen).toHaveBeenCalledWith('tidereader');
  });

  it('displays and controls TuberSwitch profiles and active mode', async () => {
    const user = userEvent.setup();
    const actions = actionFixture();
    const tuberSwitchWorkflow = tuberSwitchWorkflowFixture();

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
    await user.click(screen.getByRole('button', { name: 'View TuberSwitch profile details' }));
    expect(screen.getByRole('complementary', { name: /Gaming Stream \(3D\)/ })).toBeInTheDocument();
    expect(screen.getByText('Mode')).toBeInTheDocument();
    expect(screen.getByText('3D VTuber Mode')).toBeInTheDocument();
    expect(screen.getByText('Connected: Gaming / VTuber')).toBeInTheDocument();
    expect(screen.getByText('Enabled (2 manageable redeems)')).toBeInTheDocument();
    expect(screen.getByText('3D app detected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Open in TuberSwitch/i }));

    expect(tuberSwitchWorkflow.onSelectProfile).toHaveBeenCalledWith('Just Chatting');
    expect(actions.onOpen).toHaveBeenCalledWith('tuberswitch');
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
    vi.mocked(api.getStreamSignalAnnounceStatus).mockResolvedValue({ lastRun: '', success: false });
    vi.mocked(api.getStreamSignalEndStreamStatus).mockResolvedValue({ lastRun: '', success: false });
    vi.mocked(api.getTideReaderProfiles).mockResolvedValue(['Listening Party', 'Gaming Overlay']);
    vi.mocked(api.getTideReaderCurrentProfile).mockResolvedValue({ id: 'listening-party', name: 'Listening Party' });
    vi.mocked(api.getTideReaderOverlaySnapshot).mockResolvedValue(tideReaderOverlayFixture());
    vi.mocked(api.getTuberSwitchProfiles).mockResolvedValue(['Gaming Stream', 'Just Chatting']);
    vi.mocked(api.getTuberSwitchCurrentProfile).mockResolvedValue({ id: 'gaming', name: 'Gaming Stream' });
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
