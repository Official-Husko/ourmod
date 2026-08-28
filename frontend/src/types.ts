// These mirror the JSON shape of internal/app/ourmod/desktop.App's return
// types exactly - see app.go for the source of truth.

export interface TableSummary {
  path: string;
  name: string;
  checksum: string;
  featureCount: number;
  author: string;
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

export interface AppStatus {
  table: TableSummary | null;
  attach: AttachInfo | null;
  features: FeatureView[] | null;
}

export interface BuildInfo {
  goVersion: string;
  os: string;
  arch: string;
}

export type ViewId = 'library' | 'game' | 'hotkeys' | 'settings' | 'about';
