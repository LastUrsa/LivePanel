import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { Dashboard, ModulesPage } from './App';
import type { AnnounceStatus, CurrentProfile, EndStreamStatus, ModuleInfo } from './lib/api/livepanel';

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

const actions = {
  onStart: vi.fn(),
  onOpen: vi.fn(),
  onRefresh: vi.fn(),
};

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
    render(<Dashboard modules={[moduleFixture()]} workflow={workflowFixture()} {...actions} />);

    expect(screen.getByText('StreamSignal')).toBeInTheDocument();
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Gaming Stream')).toBeInTheDocument();
    expect(screen.getByText('Open StreamSignal')).toBeInTheDocument();
  });

  it('displays an unhealthy module', () => {
    render(<Dashboard modules={[moduleFixture({ healthy: false, healthStatus: 'error' })]} workflow={workflowFixture()} {...actions} />);

    expect(screen.getByText('Unhealthy')).toBeInTheDocument();
  });

  it('displays degraded modules distinctly from ready modules', () => {
    render(<Dashboard modules={[moduleFixture({ healthy: true, healthStatus: 'degraded' })]} workflow={workflowFixture()} {...actions} />);

    expect(screen.getByText('Degraded')).toBeInTheDocument();
  });

  it('displays offline installed modules with a start action', () => {
    render(<Dashboard modules={[moduleFixture({ running: false, healthy: false, mode: '', healthStatus: 'offline' })]} workflow={workflowFixture()} {...actions} />);

    expect(screen.getAllByText('Offline').length).toBeGreaterThan(0);
    expect(screen.getByText('Start Service Mode')).toBeInTheDocument();
  });

  it('keeps the start action visible when StreamSignal is unresolved', () => {
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
    render(<Dashboard modules={[moduleFixture()]} workflow={workflowFixture({ currentProfile: { id: '', name: '' } })} {...actions} />);

    expect(screen.getByText('No active StreamSignal profile selected.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Go Live/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /End Stream/i })).toBeDisabled();
  });

  it('displays duplicate confirmation modal', () => {
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
});

describe('ModulesPage', () => {
  it('renders detailed read-only module information', () => {
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
    render(<ModulesPage modules={[]} {...actions} />);

    expect(screen.getByText('No Starsong modules detected.')).toBeInTheDocument();
  });
});
