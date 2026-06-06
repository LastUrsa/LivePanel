import {
  ActivateStreamSignalProfile,
  AnnounceStreamSignal,
  ConfirmStreamSignalAnnouncement,
  EndStreamSignalStream,
  GetAutoStartManagedModules,
  GetModules,
  GetStreamSignalAnnounceStatus,
  GetStreamSignalCurrentProfile,
  GetStreamSignalEndStreamStatus,
  GetStreamSignalProfiles,
  OpenModule,
  RefreshModules,
  SetAutoStartManagedModules,
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
