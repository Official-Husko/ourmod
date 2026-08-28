// These mirror the JSON shape of internal/app/ourmod/desktop.App's return
// types exactly - see app.go for the source of truth.

export interface TableSummary {
  path: string;
  name: string;
  version: string;
  checksum: string;
  featureCount: number;
  author: string;
}

// Matches the generated wailsjs FeatureView.control.kind, which comes
// through as plain string (Go's ControlView.Kind has no enum type) - kept
// as string here too, the same way `stability` already is, rather than
// narrowing to a union that the generated bindings can't satisfy.
export interface ControlView {
  kind: string;
  min?: number;
  max?: number;
  step?: number;
  default?: number;
  unit?: string;
  actions?: string[];
}

export interface FeatureView {
  name: string;
  category: string;
  hotkey: string;
  stability: string;
  note: string;
  available: boolean;
  active: boolean;
  control: ControlView;
}

export interface AttachInfo {
  attached: boolean;
  pid: number;
  platform: string;
  gameName: string;
}

export interface ReloadResult {
  features: FeatureView[];
  reverted: string[] | null;
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
