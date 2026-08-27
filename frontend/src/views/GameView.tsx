import {useState} from 'preact/hooks';
import {AttachInfo, FeatureView, TableSummary} from '../types';
import {CommandLine} from '../components/CommandLine';
import {OverlayPreview} from '../components/OverlayPreview';

export function GameView(props: {
  table: TableSummary;
  features: FeatureView[];
  attachInfo: AttachInfo | null;
  status: string;
  onBack: () => void;
  onAttach: () => void;
  onDetachAll: () => void;
  onToggle: (name: string, checked: boolean) => void;
}) {
  const {table, features, attachInfo, onBack} = props;

  return (
    <div class="game-view">
      <div class="view-header">
        <span class="breadcrumb" onClick={onBack}>&larr; library</span>
        <span> / {table.name}</span>
        <span class="spacer"/>
        <span class={`status-inline${attachInfo ? ' attached' : ''}`}>
          {attachInfo ? `▸ ATTACHED · PID ${attachInfo.pid}` : '· NOT ATTACHED'}
        </span>
      </div>

      {attachInfo ? (
        <AttachedPhase {...props} attachInfo={attachInfo}/>
      ) : (
        <AttachPhase {...props}/>
      )}
    </div>
  );
}

function AttachPhase(props: {
  table: TableSummary;
  status: string;
  onAttach: () => void;
}) {
  return (
    <div class="view-pad">
      <CommandLine command={`ourmod-cli -table ${props.table.path} -feature ...`} right="1 CANDIDATE"/>

      <div class="log-stream">
        <div><span class="dim">00.00</span> enumerating processes by argv[0] basename&hellip;</div>
        <div><span class="dim">00.01</span> matching against platforms declared in {props.table.name}&hellip;</div>
        <div class="log-accent"><span class="dim">00.02</span> waiting for target selection</div>
      </div>

      <div class="section-label">CANDIDATE</div>
      <div class="candidate-table">
        <div class="candidate-row">
          <span>{props.table.name}</span>
          <span class="dim">not yet resolved</span>
          <button class="btn btn-primary" onClick={props.onAttach}>ATTACH</button>
        </div>
      </div>

      <p class="hint">
        Attaching needs the same privileges a debugger needs (run with elevated
        privileges / <code>sudo</code> if this fails). Values revert on detach.
      </p>
    </div>
  );
}

function AttachedPhase(props: {
  table: TableSummary;
  features: FeatureView[];
  attachInfo: AttachInfo;
  status: string;
  onDetachAll: () => void;
  onToggle: (name: string, checked: boolean) => void;
}) {
  const {table, features, attachInfo, onDetachAll, onToggle} = props;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'risky'>('all');
  const [tab, setTab] = useState<'cheats' | 'script' | 'history' | 'notes'>('cheats');
  const [showOverlay, setShowOverlay] = useState(false);

  const activeCount = features.filter((f) => f.active).length;
  const riskyCount = features.filter((f) => f.stability === 'breaks-saves').length;

  const visible = features
    .filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
    .filter((f) => (filter === 'active' ? f.active : filter === 'risky' ? f.stability === 'breaks-saves' : true));

  const byCategory = new Map<string, FeatureView[]>();
  for (const f of visible) {
    const cat = f.category || 'uncategorized';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(f);
  }
  const categories = [...byCategory.keys()].sort();

  return (
    <div class="attached-layout">
      <aside class="game-sidebar">
        <div class="game-cover">
          <span>{table.name.slice(0, 2).toUpperCase()}</span>
        </div>
        <div class="game-title">{table.name}</div>
        <div class="tag-row">
          <span class="tag">Singleplayer</span>
          <span class="tag">{attachInfo.platform}</span>
        </div>
        <div class="kv-list">
          <div class="kv-row"><span class="dim">pid</span><span>{attachInfo.pid}</span></div>
          <div class="kv-row"><span class="dim">cheats</span><span>{features.length} &middot; {riskyCount} risky</span></div>
          <div class="kv-row"><span class="dim">source</span><span>{table.path}</span></div>
        </div>
        <div class="sidebar-spacer"/>
        <button class="btn btn-outline btn-full" onClick={() => setShowOverlay(true)}>PREVIEW OVERLAY</button>
        <button class="btn btn-outline btn-full" onClick={onDetachAll}>DETACH &middot; RESTORE ALL</button>
        <p class="hint">Values revert on detach. Saves already written to disk do not.</p>
      </aside>

      <div class="game-main">
        <div class="tab-row">
          <span class={`tab${tab === 'cheats' ? ' tab-active' : ''}`} onClick={() => setTab('cheats')}>
            CHEATS <span class="tab-count">{features.length}</span>
          </span>
          <span class="tab tab-disabled" title="Coming soon">SCRIPT</span>
          <span class="tab tab-disabled" title="Coming soon">HISTORY</span>
          <span class="tab tab-disabled" title="Coming soon">NOTES</span>
        </div>

        {tab === 'cheats' && (
          <>
            <div class="filter-row">
              <input
                class="search-input"
                placeholder={`filter ${features.length} cheats...`}
                value={query}
                onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
              />
              <span class={`chip${filter === 'all' ? ' chip-selected' : ''}`} onClick={() => setFilter('all')}>ALL &middot; {features.length}</span>
              <span class={`chip${filter === 'active' ? ' chip-selected' : ''}`} onClick={() => setFilter('active')}>ACTIVE &middot; {activeCount}</span>
              <span class={`chip chip-warn${filter === 'risky' ? ' chip-selected' : ''}`} onClick={() => setFilter('risky')}>RISKY &middot; {riskyCount}</span>
            </div>

            <main class="feature-list">
              {visible.length === 0 ? (
                <div class="empty">No cheats match.</div>
              ) : (
                categories.map((cat) => (
                  <div key={cat}>
                    <div class="category">{cat}</div>
                    {byCategory.get(cat)!.map((f) => (
                      <FeatureRow key={f.name} feature={f} attached onToggle={onToggle}/>
                    ))}
                  </div>
                ))
              )}
            </main>
          </>
        )}

        {tab !== 'cheats' && (
          <div class="empty-big">
            <div class="empty-title">COMING SOON</div>
            <p>The {tab.toUpperCase()} tab isn't wired up yet.</p>
          </div>
        )}
      </div>

      {showOverlay && (
        <OverlayPreview gameName={table.name} features={features} onClose={() => setShowOverlay(false)}/>
      )}
    </div>
  );
}

function FeatureRow(props: {
  feature: FeatureView;
  attached: boolean;
  onToggle: (name: string, checked: boolean) => void;
}) {
  const {feature: f, attached, onToggle} = props;
  const disabled = !attached || !f.available;

  return (
    <div class={`row${disabled ? ' unavailable' : ''}`}>
      <input
        type="checkbox"
        checked={f.active}
        disabled={disabled}
        onChange={(e) => onToggle(f.name, (e.target as HTMLInputElement).checked)}
      />
      <div class="name-cell">
        <span class="name">{f.name}</span>
        <span class={`stability ${f.stability}`}>{f.stability.replace(/-/g, ' ')}</span>
      </div>
      <span/>
      <span class={`hotkey${f.hotkey ? '' : ' unbound'}`}>{f.hotkey || 'unbound'}</span>
      {f.note && <div class="note">{f.note}</div>}
    </div>
  );
}
