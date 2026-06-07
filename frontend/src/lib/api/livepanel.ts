import {
  ActivateStreamSignalProfile,
  ActivateTideReaderProfile,
  AnnounceStreamSignal,
  ConfirmStreamSignalAnnouncement,
  EndStreamSignalStream,
  GetAutoStartManagedModules,
  ClearModuleExecutablePath,
  GetModules,
  GetModuleExecutableConfigs,
  GetStreamSignalAnnounceStatus,
  GetStreamSignalCurrentProfile,
  GetStreamSignalEndStreamStatus,
  GetStreamSignalProfiles,
  GetTideReaderCurrentProfile,
  GetTideReaderOverlaySnapshot,
  GetTideReaderProfiles,
  OpenModule,
  PickModuleExecutablePath,
  RefreshModules,
  SetAutoStartManagedModules,
  SetModuleExecutablePath,
  StartModule,
} from '../../../wailsjs/go/main/App';

export type ModuleInfo = {
  id: string;
  name: string;
  executable: string;
  installed: boolean;
  running: boolean;
  autoStart: boolean;
  version: string;
  mode: string;
  protocol: string;
  healthy: boolean;
  healthStatus: string;
  healthText: string;
  capabilities: string[];
  status: Record<string, unknown>;
  endpoint: string;
  lastSeen: string;
  error?: string;
};

export type CurrentProfile = {
  id: string;
  name: string;
};

export type ProfileActivation = {
  success: boolean;
  profile?: string;
  profileId?: string;
};

export type AnnounceResult = {
  success: boolean;
  requiresConfirmation?: boolean;
  confirmationId?: string;
  error?: string;
};

export type AnnounceStatus = {
  lastRun: string;
  success: boolean;
  requiresConfirmation?: boolean;
  confirmationId?: string;
  error?: string;
};

export type EndStreamResult = {
  success: boolean;
  error?: string;
};

export type EndStreamStatus = {
  lastRun: string;
  success: boolean;
  error?: string;
};

export type TideReaderOverlaySnapshot = {
  available: boolean;
  nowPlaying: Record<string, unknown>;
  settings: Record<string, unknown>;
  overlayUrl: string;
  coverUrl: string;
  error?: string;
};

export type ModuleExecutableConfig = {
  id: string;
  name: string;
  executablePath: string;
  resolvedPath: string;
  pathSource: string;
  environmentKey: string;
  envLocked: boolean;
  valid: boolean;
  error?: string;
};

export function listModules(): Promise<ModuleInfo[]> {
  return GetModules();
}

export function refreshModules(): Promise<ModuleInfo[]> {
  return RefreshModules();
}

export function startModule(id: string): Promise<ModuleInfo[]> {
  return StartModule(id);
}

export function openModule(id: string): Promise<ModuleInfo[]> {
  return OpenModule(id);
}

export function getAutoStartManagedModules(): Promise<boolean> {
  return GetAutoStartManagedModules();
}

export function setAutoStartManagedModules(enabled: boolean): Promise<boolean> {
  return SetAutoStartManagedModules(enabled);
}

export function getModuleExecutableConfigs(): Promise<ModuleExecutableConfig[]> {
  return GetModuleExecutableConfigs();
}

export function setModuleExecutablePath(id: string, executablePath: string): Promise<ModuleExecutableConfig[]> {
  return SetModuleExecutablePath(id, executablePath);
}

export function clearModuleExecutablePath(id: string): Promise<ModuleExecutableConfig[]> {
  return ClearModuleExecutablePath(id);
}

export function pickModuleExecutablePath(id: string): Promise<string> {
  return PickModuleExecutablePath(id);
}

export async function getStreamSignalProfiles(): Promise<string[]> {
  const response = await GetStreamSignalProfiles();
  return response.profiles ?? [];
}

export function getStreamSignalCurrentProfile(): Promise<CurrentProfile> {
  return GetStreamSignalCurrentProfile();
}

export function activateStreamSignalProfile(profile: string): Promise<ProfileActivation> {
  return ActivateStreamSignalProfile(profile);
}

export async function getTideReaderProfiles(): Promise<string[]> {
  const response = await GetTideReaderProfiles();
  return response.profiles ?? [];
}

export function getTideReaderCurrentProfile(): Promise<CurrentProfile> {
  return GetTideReaderCurrentProfile();
}

export function getTideReaderOverlaySnapshot(): Promise<TideReaderOverlaySnapshot> {
  return GetTideReaderOverlaySnapshot();
}

export function activateTideReaderProfile(profile: string): Promise<ProfileActivation> {
  return ActivateTideReaderProfile(profile);
}

export function announceStreamSignal(): Promise<AnnounceResult> {
  return AnnounceStreamSignal();
}

export function confirmStreamSignalAnnouncement(confirmationId: string): Promise<AnnounceResult> {
  return ConfirmStreamSignalAnnouncement(confirmationId);
}

export function getStreamSignalAnnounceStatus(): Promise<AnnounceStatus> {
  return GetStreamSignalAnnounceStatus();
}

export function endStreamSignalStream(): Promise<EndStreamResult> {
  return EndStreamSignalStream();
}

export function getStreamSignalEndStreamStatus(): Promise<EndStreamStatus> {
  return GetStreamSignalEndStreamStatus();
}
