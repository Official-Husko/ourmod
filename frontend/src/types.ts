// These mirror the JSON shape of internal/app/ourmod/desktop.App's return
// types exactly - see app.go for the source of truth.

export interface TableSummary {
  path: string;
  name: string;
}

export interface FeatureView {
  name: string;
  category: string;
  hotkey: string;
  stability: string;
  note: string;
  available: boolean;
  active: boolean;
}

export interface AttachInfo {
  attached: boolean;
  pid: number;
  platform: string;
  gameName: string;
}

export interface BuildInfo {
  goVersion: string;
  os: string;
  arch: string;
}

export type ViewId = 'library' | 'game' | 'hotkeys' | 'scripts' | 'settings' | 'about';
