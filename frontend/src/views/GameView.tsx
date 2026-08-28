import {useEffect, useState} from 'preact/hooks';
import {AttachInfo, ControlView, FeatureView, TableSummary} from '../types';
import {TableSource} from '../../wailsjs/go/desktop/App';
import {CommandLine} from '../components/CommandLine';
import {OverlayPreview} from '../components/OverlayPreview';
import {YamlBlock} from '../components/YamlBlock';

export function GameView(props: {
  table: TableSummary;
  features: FeatureView[];
  attachInfo: AttachInfo | null;
  status: string;
  favourite: boolean;
  onToggleFavourite: () => void;
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
      <CommandLine command={`ourmod-cli -table ${props.table.path} -feature <name>`} right="1 CANDIDATE"/>

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
  favourite: boolean;
  onToggleFavourite: () => void;
  onDetachAll: () => void;
  onToggle: (name: string, checked: boolean) => void;
}) {
  const {table, features, attachInfo, favourite, onToggleFavourite, onDetachAll, onToggle} = props;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'risky'>('all');
  const [tab, setTab] = useState<'cheats' | 'script' | 'history'>('cheats');
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
        <div class="game-title-row">
          <div class="game-title">{table.name}</div>
          <span
            class={`fav-badge${favourite ? ' fav-badge-on' : ''}`}
            onClick={onToggleFavourite}
            title={favourite ? 'Remove from favourites' : 'Add to favourites'}
          >
            {favourite ? '★' : '☆'}
          </span>
        </div>
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
        <div class="toggle-row toggle-row-boxed">
          <div class="toggle-fake" aria-disabled="true"/>
          <div class="toggle-label">Save mods</div>
          <span class="coming-soon">coming soon</span>
        </div>
        <button class="btn btn-outline btn-full" onClick={() => setShowOverlay(true)}>PREVIEW OVERLAY</button>
        <button class="btn btn-outline btn-full" onClick={onDetachAll}>DETACH &middot; RESTORE ALL</button>
        <p class="hint">Values revert on detach. Saves already written to disk do not.</p>
      </aside>

      <div class="game-main">
        <div class="tab-row">
          <span class={`tab${tab === 'cheats' ? ' tab-active' : ''}`} onClick={() => setTab('cheats')}>
            CHEATS <span class="tab-count">{features.length}</span>
          </span>
          <span class={`tab${tab === 'script' ? ' tab-active' : ''}`} onClick={() => setTab('script')}>SCRIPT</span>
          <span class={`tab${tab === 'history' ? ' tab-active' : ''}`} onClick={() => setTab('history')}>HISTORY</span>
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

        {tab === 'script' && <ScriptTab table={table}/>}

        {tab === 'history' && (
          <div class="empty-big">
            <div class="empty-title">COMING SOON</div>
            <p>The HISTORY tab isn't wired up yet - it would need session/save-history tracking this build doesn't do.</p>
          </div>
        )}
      </div>

      {showOverlay && (
        <OverlayPreview gameName={table.name} features={features} onClose={() => setShowOverlay(false)}/>
      )}
    </div>
  );
}

function ScriptTab(props: {table: TableSummary}) {
  const [source, setSource] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    TableSource(props.table.path).then(setSource).catch((err) => setError(String(err)));
  }, [props.table.path]);

  return (
    <div class="script-tab">
      <div class="script-tab-main">
        <div class="filter-row">
          <span class="section-label" style="margin:0">{props.table.name.toUpperCase().replace(/\s+/g, '-')}.YML</span>
          <span class="spacer"/>
          <span class="dim mono-sm">{source ? source.split('\n').length : 0} lines &middot; read only</span>
        </div>
        <div class="view-pad" style="padding-top:14px">
          {error ? (
            <div class="empty-big"><div class="empty-title">COULD NOT READ FILE</div><p>{error}</p></div>
          ) : (
            <YamlBlock source={source}/>
          )}
        </div>
      </div>
      <div class="script-tab-side">
        <div class="section-label">FILE</div>
        <div class="kv-list">
          <div class="kv-row"><span class="dim">path</span><span>{props.table.path}</span></div>
          <div class="kv-row"><span class="dim">cheats</span><span>{props.table.featureCount}</span></div>
          <div class="kv-row"><span class="dim">checksum</span><span class="mono-sm">{props.table.checksum.slice(0, 12)}&hellip;</span></div>
        </div>
        <p class="hint">Edit the file directly on disk - there's no in-app editor yet.</p>
      </div>
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
  const kind = f.control?.kind ?? 'toggle';

  return (
    <div class={`row${disabled ? ' unavailable' : ''}`}>
      {kind === 'value' ? (
        <button class="activate-box" disabled={disabled} title="Activate - not implemented yet">&#9656;</button>
      ) : kind === 'action' ? (
        <span/>
      ) : (
        <input
          type="checkbox"
          checked={f.active}
          disabled={disabled}
          onChange={(e) => onToggle(f.name, (e.target as HTMLInputElement).checked)}
        />
      )}
      <div class="name-cell">
        <span class="name">{f.name}</span>
        <span class={`stability ${f.stability}`}>{f.stability.replace(/-/g, ' ')}</span>
      </div>
      <FeatureControl control={f.control}/>
      <span class={`hotkey${f.hotkey ? '' : ' unbound'}`}>{f.hotkey || 'unbound'}</span>
      {(f.note || kind !== 'toggle') && (
        <div class="note">
          {f.note}
          {kind !== 'toggle' && <span class="coming-soon"> &middot; not implemented yet</span>}
        </div>
      )}
    </div>
  );
}

// FeatureControl renders the non-toggle interaction a feature's control
// calls for. None of these write anything real yet - the engine only knows
// how to apply fixed patch/hook bytes, not a player-typed value or a saved
// position - so every control here is inert (disabled) until real
// signature data backs it. The shape is real so the UI matches the
// intended design; only the wiring is deferred.
function FeatureControl(props: {control: ControlView}) {
  const {control} = props;

  switch (control.kind) {
    case 'slider': {
      const min = control.min ?? 0;
      const max = control.max ?? 100;
      const step = control.step ?? 1;
      const value = control.default ?? min;
      return (
        <div class="control control-slider" title="Not implemented yet">
          <input type="range" min={min} max={max} step={step} value={value} disabled/>
          <span class="control-readout">{value}{control.unit ?? ''}</span>
        </div>
      );
    }
    case 'value':
      return (
        <div class="control control-value" title="Not implemented yet">
          <input type="number" placeholder="0" disabled/>
        </div>
      );
    case 'action':
      return (
        <div class="control control-action" title="Not implemented yet">
          {(control.actions ?? []).map((a) => (
            <button key={a} class="btn-mini" disabled>{a.toUpperCase()}</button>
          ))}
        </div>
      );
    default:
      return <span/>;
  }
}
