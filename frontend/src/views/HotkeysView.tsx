import {AttachInfo, FeatureView} from '../types';
import {CommandLine} from '../components/CommandLine';
import {SignalBox} from '../components/SignalBox';

// Shows each feature's hotkey exactly as written in the table (real data).
// Rebinding is visibly present but disabled: actually changing a binding
// would need a settings-persistence layer and a global hotkey listener
// that works even while the game has focus, and neither exists yet. On
// Wayland the latter specifically needs the XDG GlobalShortcuts portal,
// which isn't universally supported - showing a working-looking rebind
// control here would be a real feature we don't have, not a stub for one
// we're about to add.
export function HotkeysView(props: {tableName: string | null; features: FeatureView[]; attachInfo: AttachInfo | null}) {
  const {tableName, features, attachInfo} = props;

  if (!tableName) {
    return (
      <div class="view-pad">
        <div class="view-header"><span>hotkeys</span></div>
        <div class="empty-big">
          <div class="empty-title">NO GAME SELECTED</div>
          <p>Pick a game in Library to see its hotkeys.</p>
        </div>
      </div>
    );
  }

  const bound = features.filter((f) => f.hotkey).length;

  return (
    <div class="settings-columns view-pad">
      <div class="settings-main">
        <div class="view-header" style="margin:0 0 4px;padding:0;height:auto">
          <span>hotkeys &middot; {tableName}</span>
          <span class="spacer"/>
          {attachInfo && <span class="status-inline attached">&#9656; ATTACHED &middot; PID {attachInfo.pid}</span>}
        </div>

        <CommandLine command={`ourmod-cli -table ... -feature ...`} right={`${bound} OF ${features.length} BOUND`}/>

        <div class="hotkey-table">
          <div class="hotkey-table-head">
            <span>CHEAT</span><span>KEY</span><span>CATEGORY</span><span/>
          </div>
          {features.map((f) => (
            <div key={f.name} class="hotkey-table-row">
              <span class="name">{f.name}</span>
              <span class={`hotkey${f.hotkey ? '' : ' unbound'}`}>{f.hotkey || 'unbound'}</span>
              <span class="dim">{f.category}</span>
              <button class="btn btn-outline btn-sm" disabled title="Rebinding: coming soon">
                REBIND
              </button>
            </div>
          ))}
        </div>

        <div class="btn-row">
          <button class="btn btn-primary" disabled title="No settings-persistence layer yet">SAVE BINDINGS</button>
          <button class="btn btn-outline" disabled title="Nothing to reset yet">RESET TO TABLE DEFAULTS</button>
        </div>
      </div>

      <div class="settings-side">
        <SignalBox tone="warn" title="Rebinding isn't wired up yet">
          It needs saved settings and a global hotkey listener that works even while the
          game has focus - on Wayland that specifically means the GlobalShortcuts portal,
          which isn't universally supported. These are the hotkeys as written in the table.
        </SignalBox>

        <div class="section-label">CAPTURE RULES</div>
        <p class="hint" style="line-height:1.8">
          Once implemented: press any key to bind, Esc cancels, Delete unbinds. Modifiers
          combine - Ctrl+Shift+3 would be one binding, not three.
        </p>

        <div class="section-label">SCOPE</div>
        <div class="kv-list">
          <div class="kv-row"><span class="dim">in game</span><span>fires only while attached</span></div>
          <div class="kv-row"><span class="dim">global</span><span>fires anywhere</span></div>
        </div>

        <div class="toggle-row">
          <div class="toggle-fake" aria-disabled="true"/>
          <div class="toggle-label">Play a short click when a cheat fires</div>
          <span class="coming-soon">coming soon</span>
        </div>
      </div>
    </div>
  );
}
