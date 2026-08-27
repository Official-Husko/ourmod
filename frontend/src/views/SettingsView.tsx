import {useEffect, useState} from 'preact/hooks';
import {BuildInfo} from '../types';
import {BuildInfo as FetchBuildInfo} from '../../wailsjs/go/desktop/App';

// Behavior toggles below are real UI matching the mockup, but *inert*: none
// of them are backed by anything yet - there's no persisted settings file,
// no auto-attach polling loop, no overlay window, and no update-fetching
// code. Only Danger Zone (ties to the real Session.DisableAll via
// onDetachAll) and Build info (real runtime.Version()/GOOS/GOARCH) are
// live. Showing these disabled, labeled "coming soon", is the honest
// version of this screen rather than pretending they do something.
export function SettingsView(props: {attached: boolean; onDetachAll: () => void}) {
  const [build, setBuild] = useState<BuildInfo | null>(null);
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    FetchBuildInfo().then(setBuild);
  }, []);

  return (
    <div class="view-pad">
      <div class="view-header"><span>settings</span></div>

      <div class="settings-columns">
        <div class="settings-main">
          <div class="section-label">BEHAVIOUR</div>
          <ToggleRow label="Attach automatically when a known game starts" />
          <ToggleRow label="Keep an overlay on top of the game" hint="Needs an always-on-top transparent window; not reliably possible on Wayland compositors." />
          <ToggleRow label="Check for table updates on launch" hint="No update server exists yet." />
          <ToggleRow label="Back up the save folder before a cheat marked BREAKS SAVES" />

          <div class="section-label">GAME FOLDERS</div>
          <div class="kv-list">
            <div class="kv-row"><span class="dim">tables/</span><span>{'▸'} in use</span></div>
          </div>
          <div><button class="btn btn-outline btn-sm" disabled title="Multiple search folders: coming soon">ADD FOLDER</button></div>

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

          <div class="section-label">SOURCE</div>
          <div class="kv-list">
            <div class="kv-row"><span class="dim">module</span><span>github.com/Official-Husko/ourmod</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleRow(props: {label: string; hint?: string}) {
  return (
    <div class="toggle-row">
      <div class="toggle-fake" aria-disabled="true"/>
      <div>
        <div class="toggle-label">{props.label}</div>
        {props.hint && <div class="toggle-hint">{props.hint}</div>}
      </div>
      <span class="coming-soon">coming soon</span>
    </div>
  );
}
