import {useEffect, useState} from 'preact/hooks';
import {BuildInfo, TableSummary} from '../types';
import {BuildInfo as FetchBuildInfo, TableSource} from '../../wailsjs/go/desktop/App';
import {hasGoBridge} from '../remoteTables';
import {CommandLine} from '../components/CommandLine';
import {ToggleRow} from '../components/ToggleRow';
import {YamlBlock} from '../components/YamlBlock';

// Most behaviour toggles below are real UI matching the mockup, but
// *inert*: there's no persisted settings file, no auto-attach polling
// loop, no overlay window, and no update-fetching code. "Show game
// artwork" is the exception - a display preference, not app config, so
// it's backed by localStorage instead of waiting on that infrastructure.
// Danger Zone (real Session.DisableAll via onDetachAll), Build info (real
// runtime.Version()/GOOS/GOARCH), and the table source panel (real file
// content) are also live. Showing the rest disabled and labeled "coming
// soon" is the honest version of this screen rather than pretending they
// do something.
export function SettingsView(props: {
  attached: boolean;
  onDetachAll: () => void;
  current: TableSummary | null;
  showArtwork: boolean;
  onToggleArtwork: (checked: boolean) => void;
  checkUpdatesOnLaunch: boolean;
  onToggleCheckUpdatesOnLaunch: (checked: boolean) => void;
  syncing: boolean;
  lastSync: string | null;
  onSyncTables: () => void;
}) {
  const [build, setBuild] = useState<BuildInfo | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [source, setSource] = useState('');

  useEffect(() => {
    // Both calls below reach straight into window.go.desktop.App - with no
    // Go bridge (opened via a bare `vite --host` dev server, see
    // remoteTables.ts) that throws synchronously rather than rejecting, so
    // skip them outright instead of relying on .then()/.catch() to guard it.
    if (!hasGoBridge()) return;
    FetchBuildInfo().then(setBuild);
  }, []);

  useEffect(() => {
    if (!hasGoBridge()) {
      setSource('');
    } else if (props.current) {
      TableSource(props.current.path).then(setSource).catch(() => setSource(''));
    } else {
      setSource('');
    }
  }, [props.current]);

  return (
    <div class="view-pad">
      <div class="view-header">
        <span>settings</span>
        <span class="spacer"/>
        <span class="dim mono-sm">~/.config/ourmod/config.yml &middot; edited by hand or here</span>
      </div>
      <CommandLine command="cat ~/.config/ourmod/config.yml" right="LOCAL ONLY · NO ACCOUNT"/>

      <div class="settings-columns">
        <div class="settings-main">
          <div class="section-label">BEHAVIOUR</div>
          <ToggleRow label="Attach automatically when a known game starts" />
          <ToggleRow label="Keep an overlay on top of the game" hint="Needs an always-on-top transparent window; not reliably possible on Wayland compositors." />
          <ToggleRow
            label="Check for table updates on launch"
            hint="Pulls tables/*.yml from this project's GitHub repo on startup - a table missing locally is added, one that's out of date (lower metadata.version) is updated. Your own edits are never overwritten unless you've bumped the version past what's published."
            checked={props.checkUpdatesOnLaunch}
            onChange={props.onToggleCheckUpdatesOnLaunch}
          />
          <ToggleRow label="Back up the save folder before a cheat marked BREAKS SAVES" />
          <ToggleRow
            label="Show Game Artwork in Background"
            hint="The hero image behind the game page's top bar and sidebar - from Steam if a table declares a steamAppId, or its own heroUrl otherwise. Cover and logo art always show."
            checked={props.showArtwork}
            onChange={props.onToggleArtwork}
          />

          <div class="section-label">GAME FOLDERS</div>
          <div class="kv-list">
            <div class="kv-row"><span class="dim">tables/</span><span>{'▸'} in use</span></div>
          </div>
          <div><button class="btn btn-outline btn-sm" disabled title="Multiple search folders: coming soon">ADD FOLDER</button></div>

          <div class="section-label">TABLE REGISTRY</div>
          <p class="hint">github.com/Official-Husko/ourmod/tables - the shared table pool this app itself ships.</p>
          <div class="btn-row">
            <button class="btn btn-outline btn-sm" disabled={props.syncing} onClick={props.onSyncTables}>
              {props.syncing ? 'SYNCING…' : 'SYNC NOW'}
            </button>
            {props.lastSync && <span class="dim mono-sm">{props.lastSync}</span>}
          </div>

          <div class="danger-zone">
            <div class="section-label warn">DANGER ZONE</div>
            <p>Detach and roll back every value OurMod has written in this session. The game keeps running.</p>
            <div class="danger-controls">
              <input
                class="danger-input"
                placeholder="type DETACH to confirm"
                value={confirmText}
                onInput={(e) => setConfirmText((e.target as HTMLInputElement).value)}
                disabled={!props.attached}
              />
              <button
                class="btn btn-danger"
                disabled={!props.attached || confirmText !== 'DETACH'}
                onClick={() => { props.onDetachAll(); setConfirmText(''); }}
              >
                DETACH NOW
              </button>
            </div>
          </div>
        </div>

        <div class="settings-side">
          <div class="section-label">BUILD</div>
          {build && (
            <div class="kv-list">
              <div class="kv-row"><span class="dim">go</span><span>{build.goVersion}</span></div>
              <div class="kv-row"><span class="dim">platform</span><span>{build.os}/{build.arch}</span></div>
            </div>
          )}

          {props.current && (
            <>
              <div class="section-label">TABLE SOURCE &middot; {props.current.name.toUpperCase()}</div>
              <YamlBlock source={source}/>
              <span class="hint">Open in Scripts to read the full file. Editing happens on disk.</span>
            </>
          )}

          <div class="section-label">SOURCE</div>
          <div class="kv-list">
            <div class="kv-row"><span class="dim">module</span><span>github.com/Official-Husko/ourmod</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
