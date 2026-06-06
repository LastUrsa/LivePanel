import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, vi } from 'vitest';
import App, { Dashboard, ModulesPage } from './App';
import * as api from './lib/api/livepanel';
import type { AnnounceStatus, CurrentProfile, EndStreamStatus, ModuleInfo } from './lib/api/livepanel';

vi.mock('./lib/api/livepanel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/api/livepanel')>();
  return {
    ...actual,
    activateStreamSignalProfile: vi.fn(),
    announceStreamSignal: vi.fn(),
    confirmStreamSignalAnnouncement: vi.fn(),
    endStreamSignalStream: vi.fn(),
    getAutoStartManagedModules: vi.fn(),
    getStreamSignalAnnounceStatus: vi.fn(),
    getStreamSignalCurrentProfile: vi.fn(),
    getStreamSignalEndStreamStatus: vi.fn(),
    getStreamSignalProfiles: vi.fn(),
    listModules: vi.fn(),
    openModule: vi.fn(),
    refreshModules: vi.fn(),
    setAutoStartManagedModules: vi.fn(),
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
    onActivateProfile: vi.fn(),
    onGoLive: vi.fn(),
    onConfirmGoLive: vi.fn(),
    onCancelConfirmation: vi.fn(),
    onEndStream: vi.fn(),
    ...overrides,
  };
}

describe('Dashboard', () => {
  it('displays a healthy module', () => {
    const actions = actionFixture();
    render(<Dashboard modules={[moduleFixture()]} workflow={workflowFixture()} {...actions} />);

    expect(screen.getByText('StreamSignal')).toBeInTheDocument();
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Gaming Stream')).toBeInTheDocument();
    expect(screen.getByText('Open StreamSignal')).toBeInTheDocument();
  });

  it('displays an unhealthy module', () => {
    const actions = actionFixture();
    render(<Dashboard modules={[moduleFixture({ healthy: false, healthStatus: 'error' })]} workflow={workflowFixture()} {...actions} />);

    expect(screen.getByText('Unhealthy')).toBeInTheDocument();
  });

  it('displays degraded modules distinctly from ready modules', () => {
    const actions = actionFixture();
    render(<Dashboard modules={[moduleFixture({ healthy: true, healthStatus: 'degraded' })]} workflow={workflowFixture()} {...actions} />);

    expect(screen.getByText('Degraded')).toBeInTheDocument();
  });

  it('displays offline installed modules with a start action', () => {
    const actions = actionFixture();
    render(<Dashboard modules={[moduleFixture({ running: false, healthy: false, mode: '', healthStatus: 'offline' })]} workflow={workflowFixture()} {...actions} />);

    expect(screen.getAllByText('Offline').length).toBeGreaterThan(0);
    expect(screen.getByText('Start Service Mode')).toBeInTheDocument();
  });

  it('keeps the start action visible when StreamSignal is unresolved', () => {
    const actions = actionFixture();
    render(
      <Dashboard
        modules={[moduleFixture({ installed: false, running: false, healthy: false, mode: '', healthStatus: 'offline' })]}
        workflow={workflowFixture()}
        {...actions}
      />,
    );

    expect(screen.getByText('Start Service Mode')).toBeInTheDocument();
  });

  it('disables lifecycle actions without an active profile', () => {
    const actions = actionFixture();
    render(<Dashboard modules={[moduleFixture()]} workflow={workflowFixture({ currentProfile: { id: '', name: '' } })} {...actions} />);

    expect(screen.getByText('No active StreamSignal profile selected.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Go Live/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /End Stream/i })).toBeDisabled();
  });

  it('displays duplicate confirmation modal', () => {
    const actions = actionFixture();
    render(
      <Dashboard
        modules={[moduleFixture()]}
        workflow={workflowFixture({
          pendingConfirmation: {
            success: false,
            requiresConfirmation: true,
            confirmationId: 'confirm-1',
            error: 'A similar announcement was recently posted within the last 10 minutes. Continue?',
          },
        })}
        {...actions}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Send again?' })).toBeInTheDocument();
    expect(screen.getByText('Confirm')).toBeInTheDocument();
  });

  it('calls service actions from visible controls', async () => {
    const user = userEvent.setup();
    const actions = actionFixture();

    render(<Dashboard modules={[moduleFixture({ running: false, healthy: false, mode: '', healthStatus: 'offline' })]} workflow={workflowFixture()} {...actions} />);

    await user.click(screen.getByRole('button', { name: /Start Service Mode/i }));
    await user.click(screen.getAllByRole('button', { name: /Refresh/i })[0]);

    expect(actions.onStart).toHaveBeenCalledWith('streamsignal');
    expect(actions.onRefresh).toHaveBeenCalledTimes(1);
  });

  it('calls workflow actions from profile and lifecycle controls', async () => {
    const user = userEvent.setup();
    const actions = actionFixture();
    const workflow = workflowFixture();

    render(<Dashboard modules={[moduleFixture()]} workflow={workflow} {...actions} />);

    await user.selectOptions(screen.getByLabelText(/Profile/i), 'Music Stream');
    await user.click(screen.getByRole('button', { name: /^Activate$/i }));
    await user.click(screen.getByRole('button', { name: /Go Live/i }));
    await user.click(screen.getByRole('button', { name: /End Stream/i }));
    await user.click(screen.getByRole('button', { name: /Open StreamSignal/i }));

    expect(workflow.onSelectProfile).toHaveBeenCalledWith('Music Stream');
    expect(workflow.onActivateProfile).toHaveBeenCalledTimes(1);
    expect(workflow.onGoLive).toHaveBeenCalledTimes(1);
    expect(workflow.onEndStream).toHaveBeenCalledTimes(1);
    expect(actions.onOpen).toHaveBeenCalledWith('streamsignal');
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

    render(<Dashboard modules={[moduleFixture()]} workflow={workflow} {...actions} />);

    await user.click(screen.getByRole('button', { name: /Cancel/i }));
    await user.click(screen.getByRole('button', { name: /Confirm/i }));

    expect(workflow.onCancelConfirmation).toHaveBeenCalledTimes(1);
    expect(workflow.onConfirmGoLive).toHaveBeenCalledTimes(1);
  });
});

describe('ModulesPage', () => {
  it('renders detailed read-only module information', () => {
    const actions = actionFixture();
    render(
      <ModulesPage
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
    expect(screen.getByText('http://127.0.0.1:47020')).toBeInTheDocument();
    expect(screen.getAllByText('Pending Live Now recovery sessions need attention.')).toHaveLength(2);
    expect(screen.getByText('activeProfile')).toBeInTheDocument();
    expect(screen.getByText('Music Stream')).toBeInTheDocument();
  });

  it('renders the modules empty state', () => {
    const actions = actionFixture();
    render(<ModulesPage modules={[]} {...actions} />);

    expect(screen.getByText('No Starsong modules detected.')).toBeInTheDocument();
  });
});

describe('App workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.refreshModules).mockResolvedValue([moduleFixture()]);
    vi.mocked(api.listModules).mockResolvedValue([moduleFixture()]);
    vi.mocked(api.getAutoStartManagedModules).mockResolvedValue(true);
    vi.mocked(api.getStreamSignalProfiles).mockResolvedValue(['Gaming Stream', 'Music Stream']);
    vi.mocked(api.getStreamSignalCurrentProfile).mockResolvedValue({ id: 'gaming', name: 'Gaming Stream' });
    vi.mocked(api.getStreamSignalAnnounceStatus).mockResolvedValue({ lastRun: '', success: false });
    vi.mocked(api.getStreamSignalEndStreamStatus).mockResolvedValue({ lastRun: '', success: false });
    vi.mocked(api.activateStreamSignalProfile).mockResolvedValue({ success: true, profile: 'Music Stream', profileId: 'music' });
    vi.mocked(api.announceStreamSignal).mockResolvedValue({ success: true });
    vi.mocked(api.confirmStreamSignalAnnouncement).mockResolvedValue({ success: true });
    vi.mocked(api.endStreamSignalStream).mockResolvedValue({ success: true });
    vi.mocked(api.openModule).mockResolvedValue([moduleFixture()]);
    vi.mocked(api.startModule).mockResolvedValue([moduleFixture()]);
    vi.mocked(api.setAutoStartManagedModules).mockResolvedValue(false);
  });

  it('loads StreamSignal workflow data on startup', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Control Center' })).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Gaming Stream')).toBeInTheDocument();
    expect(api.refreshModules).toHaveBeenCalledTimes(1);
    expect(api.getStreamSignalProfiles).toHaveBeenCalledTimes(1);
    expect(api.getStreamSignalCurrentProfile).toHaveBeenCalledTimes(1);
  });

  it('activates a selected profile through the full app wiring', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(await screen.findByLabelText(/Profile/i), 'Music Stream');
    await user.click(screen.getByRole('button', { name: /^Activate$/i }));

    await waitFor(() => expect(api.activateStreamSignalProfile).toHaveBeenCalledWith('Music Stream'));
    expect(await screen.findByText('Profile activated')).toBeInTheDocument();
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
    expect(await screen.findByText('Announcement Sent')).toBeInTheDocument();
  });

  it('switches to diagnostics with keyboard-accessible navigation', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('heading', { name: 'Control Center' });
    await user.tab();
    expect(screen.getByRole('button', { name: /^Dashboard$/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /Diagnostics/i })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('heading', { name: 'Diagnostics' })).toBeInTheDocument();
    expect(screen.getByText('http://127.0.0.1:47020')).toBeInTheDocument();
  });
});
