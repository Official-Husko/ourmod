import {FeatureView} from '../types';

// A static in-app preview of the mockup's floating in-game HUD - not a
// real overlay window. An always-on-top, click-through, transparent window
// drawn over the game is exactly the kind of thing Wayland compositors
// restrict for security reasons, so this shows what it *would* look like
// rather than pretending one is running.
export function OverlayPreview(props: {gameName: string; features: FeatureView[]; onClose: () => void}) {
  const active = props.features.filter((f) => f.active);

  return (
    <div class="overlay-backdrop" onClick={props.onClose}>
      <div class="overlay-preview-frame" onClick={(e) => e.stopPropagation()}>
        <div class="overlay-preview-label">
          GAME FRAME &middot; {props.gameName.toUpperCase()} &middot; PREVIEW ONLY, NOT A LIVE WINDOW
        </div>
        <div class="overlay-hud">
          <div class="overlay-hud-head">
            <span class="brand" style="font-size:11px">OURMOD &middot; OVERLAY</span>
            <span class="dim">F12 HIDE</span>
          </div>
          <div class="overlay-hud-body">
            <div class="overlay-hud-summary">
              <span>active &middot; {active.length} of {props.features.length}</span>
              <span class="accent">{active.length > 0 ? '▸ WRITING' : 'IDLE'}</span>
            </div>
            {active.length === 0 ? (
              <div class="dim" style="padding:8px 0">No features active.</div>
            ) : (
              active.map((f) => (
                <div key={f.name} class="overlay-hud-row">
                  <span>{f.name}</span>
                  <span class="dim">{f.hotkey || 'unbound'}</span>
                </div>
              ))
            )}
          </div>
          <button class="btn btn-outline btn-sm" style="margin:0 12px 12px" onClick={props.onClose}>CLOSE PREVIEW</button>
        </div>
      </div>
    </div>
  );
}
