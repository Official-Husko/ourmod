import {ViewId} from '../types';

// Matches the mockup's current rail exactly: session (LIBRARY / ATTACH /
// HOTKEYS), system (SETTINGS / ABOUT). The mockup used to also have a
// "local" group with TRAINERS/SCRIPTS as separate rail destinations, but
// those moved into tabs (Library's TRAINERS tab, the game view's SCRIPT
// tab) - so there's no separate rail item for them anymore.
const SESSION_ITEMS: {id: ViewId; label: string}[] = [
  {id: 'library', label: 'LIBRARY'},
  {id: 'game', label: 'ATTACH'},
  {id: 'hotkeys', label: 'HOTKEYS'},
];

export function NavRail(props: {
  active: ViewId;
  onNavigate: (id: ViewId) => void;
  tableCount: number;
  hasCurrentGame: boolean;
}) {
  return (
    <nav class="rail">
      <div class="rail-brand">
        <span class="brand">OURMOD</span>
        <span class="rail-version">v0.1.0-dev</span>
      </div>
      <div class="rail-nav">
        <div class="rail-head">session</div>
        {SESSION_ITEMS.map((item) => {
          const disabled = item.id === 'game' && !props.hasCurrentGame;
          const isActive = props.active === item.id;
          return (
            <div
              key={item.id}
              class={`rail-item${isActive ? ' active' : ''}${disabled ? ' rail-item-disabled' : ''}`}
              title={disabled ? 'Select a game in Library first' : undefined}
              onClick={() => !disabled && props.onNavigate(item.id)}
            >
              <span>{item.label}</span>
              {item.id === 'library' && <span class="rail-meta">{props.tableCount}</span>}
            </div>
          );
        })}

        <div class="rail-head">system</div>
        <div
          class={`rail-item${props.active === 'settings' ? ' active' : ''}`}
          onClick={() => props.onNavigate('settings')}
        >
          <span>SETTINGS</span>
        </div>
        <div
          class={`rail-item${props.active === 'about' ? ' active' : ''}`}
          onClick={() => props.onNavigate('about')}
        >
          <span>ABOUT</span>
        </div>
      </div>
      <div class="rail-footer">
        <span>github.com/Official-Husko/ourmod</span>
        <span>local only &middot; no account</span>
      </div>
    </nav>
  );
}
