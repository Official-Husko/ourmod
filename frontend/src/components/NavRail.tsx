import {ViewId} from '../types';

interface NavItem {
  id: ViewId;
  label: string;
}

interface NavGroup {
  head: string;
  items: NavItem[];
}

// Trimmed from the mockup's rail (LIBRARY / ATTACH / HOTKEYS / TRAINERS /
// SCRIPTS / SETTINGS / ABOUT) to what maps to something real here: ATTACH
// isn't its own destination since it's meaningless without a game already
// loaded (folded into the game view), and TRAINERS is redundant with
// LIBRARY since we don't distinguish "installed" from "downloaded" tables.
const GROUPS: NavGroup[] = [
  {head: 'session', items: [{id: 'library', label: 'LIBRARY'}, {id: 'hotkeys', label: 'HOTKEYS'}]},
  {head: 'local', items: [{id: 'scripts', label: 'SCRIPTS'}]},
  {head: 'system', items: [{id: 'settings', label: 'SETTINGS'}, {id: 'about', label: 'ABOUT'}]},
];

export function NavRail(props: {active: ViewId; onNavigate: (id: ViewId) => void; tableCount: number}) {
  return (
    <nav class="rail">
      <div class="rail-brand">
        <span class="brand">OURMOD</span>
      </div>
      <div class="rail-nav">
        {GROUPS.map((g) => (
          <div key={g.head}>
            <div class="rail-head">{g.head}</div>
            {g.items.map((item) => {
              const isActive = props.active === item.id || (item.id === 'library' && props.active === 'game');
              return (
                <div
                  key={item.id}
                  class={`rail-item${isActive ? ' active' : ''}`}
                  onClick={() => props.onNavigate(item.id)}
                >
                  <span>{item.label}</span>
                  {item.id === 'library' && <span class="rail-meta">{props.tableCount}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div class="rail-footer">
        <span>github.com/Official-Husko/ourmod</span>
        <span>local only &middot; no account</span>
      </div>
    </nav>
  );
}
