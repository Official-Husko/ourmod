import {AttachInfo, FeatureView} from '../types';

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

  return (
    <div class="view-pad">
      <div class="view-header">
        <span>hotkeys &middot; {tableName}</span>
        <span class="spacer"/>
        {attachInfo && <span class="status-inline attached">&#9656; ATTACHED &middot; PID {attachInfo.pid}</span>}
      </div>

      <div class="hint-banner">
        Rebinding isn't wired up yet - it needs saved settings and a global hotkey
        listener that works even while the game has focus, neither of which exist
        yet. These are the hotkeys as written in the table.
      </div>

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
    </div>
  );
}
