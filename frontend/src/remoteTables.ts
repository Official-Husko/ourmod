import {load as parseYaml} from 'js-yaml';
import {FeatureView, TableSummary} from './types';

// The same repo/branch/path SyncTables (the Go-backed version of this
// feature) pulls from - see internal/app/ourmod/desktop/remote_tables.go.
// This module exists for the case that backend can't help with at all:
// opening the frontend directly in a browser with no Wails bridge (see
// hasGoBridge), where no Go-bound call - including SyncTables - can run.
const REMOTE_OWNER = 'Official-Husko';
const REMOTE_REPO = 'ourmod';
const REMOTE_BRANCH = 'main';
const REMOTE_PATH = 'tables';
const STORAGE_KEY = 'ourmod:remoteTables';

export interface RemoteTable {
  summary: TableSummary;
  features: FeatureView[];
}

interface GithubEntry {
  name: string;
  type: string;
  download_url: string;
}

// Only the metadata/feature fields FeatureView/TableSummary actually
// surface - signature/patch/hook bytes are engine-only and never reach the
// frontend even when the real Go backend parses the exact same file.
//
// Fields that are meant to be strings are typed `unknown` here, not
// `string` - YAML infers scalar types from how a value is written, not
// from this schema, so an unquoted "steamAppId: 0" or a two-part
// "version: 1.0" parses as a JS *number*, not a string (verified live:
// js-yaml's load() on "steamAppId: 0" gives typeof 0 === 'number'). Go's
// yaml.v3 coerces these into its typed Metadata.SteamAppID/Version string
// fields; js-yaml has no schema to coerce against, so toFeatureView/
// toRemoteTable below do that coercion explicitly via str().
interface RawControl {
  kind?: unknown;
  min?: number;
  max?: number;
  step?: number;
  default?: number;
  unit?: unknown;
  actions?: unknown[];
}

interface RawFeature {
  name: unknown;
  hotkey?: unknown;
  category?: unknown;
  stability?: unknown;
  note?: unknown;
  control?: RawControl;
}

interface RawMetadata {
  name: unknown;
  version?: unknown;
  author?: unknown;
  authors?: unknown[];
  compatibleVersions?: unknown[];
  gameSource?: unknown;
  steamAppId?: unknown;
  headerUrl?: unknown;
  logoUrl?: unknown;
  heroUrl?: unknown;
  sourceUrl?: unknown;
}

interface RawTable {
  metadata: RawMetadata;
  features?: RawFeature[];
}

// Coerces a YAML-inferred scalar (string, number, bool, null/undefined -
// never an object/array for the fields this is used on) to the string
// TableSummary/FeatureView actually declare. See the RawX interfaces above
// for why this is needed at all.
function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v);
}

// True exactly when the Wails Go bridge is present. window.go/window.runtime
// are injected either by the native webview, or by Wails' own devserver
// proxy (default :34115) when it serves the page - not by a plain `vite
// --host` dev server opened directly in a browser on another device. Every
// Go-bound call (ListTables, Attach, SyncTables, ...) throws when this is
// false; that's the signal to fall back to a client-only fetch instead.
export function hasGoBridge(): boolean {
  return typeof (window as unknown as {go?: unknown}).go !== 'undefined';
}

export function loadCachedRemoteTables(): RemoteTable[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RemoteTable[]) : [];
  } catch {
    return [];
  }
}

function cacheRemoteTables(tables: RemoteTable[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tables));
  } catch {
    // Best-effort - the fetched tables still work for this page load either way.
  }
}

// crypto.subtle is only available in a secure context (HTTPS, or
// localhost/127.0.0.1) - a LAN IP opened over plain HTTP, exactly the case
// this module exists for, does NOT qualify, so this has to degrade to an
// empty checksum rather than throw.
async function sha256Hex(text: string): Promise<string> {
  if (!crypto?.subtle) return '';
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return '';
  }
}

function toFeatureView(f: RawFeature): FeatureView {
  return {
    name: str(f.name),
    category: str(f.category),
    hotkey: str(f.hotkey),
    stability: f.stability ? str(f.stability) : 'untested',
    note: str(f.note),
    // Never attached (there's no backend to attach with in this mode) -
    // matches what the real Features() also reports pre-attach.
    available: false,
    active: false,
    control: {
      kind: f.control?.kind ? str(f.control.kind) : 'toggle',
      min: f.control?.min,
      max: f.control?.max,
      step: f.control?.step,
      default: f.control?.default,
      unit: f.control?.unit === undefined ? undefined : str(f.control.unit),
      actions: f.control?.actions?.map(str),
    },
  };
}

async function toRemoteTable(name: string, text: string, raw: RawTable): Promise<RemoteTable> {
  const m = raw.metadata;
  const author = m.author !== undefined ? str(m.author) : (m.authors ? m.authors.map(str).join(', ') : '');
  const features = (raw.features ?? []).map(toFeatureView);
  return {
    summary: {
      path: `remote:${name}`,
      name: str(m.name),
      version: str(m.version),
      checksum: await sha256Hex(text),
      featureCount: features.length,
      author,
      compatibleVersions: m.compatibleVersions ? m.compatibleVersions.map(str) : null,
      gameSource: str(m.gameSource),
      steamAppId: str(m.steamAppId),
      headerUrl: str(m.headerUrl),
      logoUrl: str(m.logoUrl),
      heroUrl: str(m.heroUrl),
      sourceUrl: str(m.sourceUrl),
    },
    features,
  };
}

// Fetches every table under tables/ directly from this project's own
// GitHub repo using plain browser fetch() - no Go bindings involved, so
// this works with zero backend connection (see hasGoBridge). Read-only:
// attaching to a real game still needs the actual desktop app running
// locally (ptrace only ever works against a process on the same machine),
// this is purely for browsing the library from a second device. Results
// are cached to localStorage so a reload in that browser keeps them.
export async function fetchOfficialTables(): Promise<RemoteTable[]> {
  const listUrl = `https://api.github.com/repos/${REMOTE_OWNER}/${REMOTE_REPO}/contents/${REMOTE_PATH}?ref=${REMOTE_BRANCH}`;
  const listResp = await fetch(listUrl, {headers: {Accept: 'application/vnd.github+json'}});
  if (!listResp.ok) {
    throw new Error(`GitHub: HTTP ${listResp.status} listing tables/`);
  }
  const entries = (await listResp.json()) as GithubEntry[];

  const tables: RemoteTable[] = [];
  for (const entry of entries) {
    if (entry.type !== 'file' || !entry.name.endsWith('.yml')) continue;

    const rawResp = await fetch(entry.download_url);
    if (!rawResp.ok) continue; // one bad file shouldn't sink the whole fetch

    const text = await rawResp.text();
    try {
      const parsed = parseYaml(text) as RawTable;
      if (parsed?.metadata?.name) {
        tables.push(await toRemoteTable(entry.name, text, parsed));
      }
    } catch {
      // Skip a file that doesn't parse rather than failing the whole fetch.
    }
  }

  cacheRemoteTables(tables);
  return tables;
}
