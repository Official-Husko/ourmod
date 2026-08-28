import {useEffect, useState} from 'preact/hooks';
import {AttachInfo, ControlView, FeatureView, TableSummary} from '../types';
import {GetSavedMods, SetSaveModsEnabled, TableSource} from '../../wailsjs/go/desktop/App';
import {formatChecksum} from '../format';
import {CommandLine} from '../components/CommandLine';
import {SignalBox} from '../components/SignalBox';
import {ToggleRow} from '../components/ToggleRow';
import {YamlBlock} from '../components/YamlBlock';
import {useTypewriter} from '../hooks/useTypewriter';

// The key a cheat's session-only favourite state is tracked under - scoped
// to the table it belongs to, since the same feature name could in theory
// exist in two different tables.
function favouriteKey(tablePath: string, featureName: string): string {
  return `${tablePath}::${featureName}`;
}

export function GameView(props: {
  table: TableSummary;
  features: FeatureView[];
  attachInfo: AttachInfo | null;
  status: string;
  favourite: boolean;
  onToggleFavourite: () => void;
  favouriteCheats: Set<string>;
  onToggleFavouriteCheat: (key: string) => void;
  onFeaturesRefresh: () => void;
  onBack: () => void;
  onAttach: () => void;
  onDetachAll: () => void;
  onToggle: (name: string, checked: boolean) => void;
}) {
  const {table, features, attachInfo, onBack} = props;
  const activeCount = features.filter((f) => f.active).length;

  return (
    <div class="game-view">
      <div class="view-header">
        <span class="breadcrumb" onClick={onBack}>&larr; library</span>
        <span> / {table.name}</span>
        <span class="spacer"/>
        <span class={`status-inline${attachInfo ? ' attached' : ''}`}>
          {attachInfo ? `▸ ATTACHED · PID ${attachInfo.pid}` : '· NOT ATTACHED'}
        </span>
        {attachInfo && <span class="status-meta">{activeCount} cheat{activeCount === 1 ? '' : 's'} active</span>}
      </div>

      <GamePanel {...props}/>
    </div>
  );
}

// The candidate-process/attach UI, and (once attached) a quiet confirmation
// - it's a tab within GamePanel rather than its own phase, so switching to
// CHEATS or SCRIPT to look at the table doesn't require attaching first.
function AttachTab(props: {
  table: TableSummary;
  attachInfo: AttachInfo | null;
  onAttach: () => void;
}) {
  const {table, attachInfo, onAttach} = props;

  if (attachInfo) {
    return (
      <div class="view-pad">
        <SignalBox tone="ok" title="ALREADY ATTACHED">
          PID {attachInfo.pid} &middot; {attachInfo.platform}. Switch to CHEATS to toggle features, or DETACH in the sidebar to let go.
        </SignalBox>
      </div>
    );
  }

  return (
    <div class="view-pad">
      <CommandLine command={`ourmod-cli -table ${table.path} -feature <name>`} right="1 CANDIDATE"/>

      <div class="log-stream">
        <div><span class="dim">00.00</span> enumerating processes by argv[0] basename&hellip;</div>
        <div><span class="dim">00.01</span> matching against platforms declared in {table.name}&hellip;</div>
        <div class="log-accent"><span class="dim">00.02</span> waiting for target selection</div>
      </div>

      <div class="section-label">CANDIDATE</div>
      <div class="candidate-table">
        <div class="candidate-row">
          <span>{table.name}</span>
          <span class="dim">not yet resolved</span>
          <button class="btn btn-primary" onClick={onAttach}>ATTACH</button>
        </div>
      </div>

      <p class="hint">
        Attaching needs the same privileges a debugger needs (run with elevated
        privileges / <code>sudo</code> if this fails). Values revert on detach.
      </p>
    </div>
  );
}

function GamePanel(props: {
  table: TableSummary;
  features: FeatureView[];
  attachInfo: AttachInfo | null;
  status: string;
  favourite: boolean;
  onToggleFavourite: () => void;
  favouriteCheats: Set<string>;
  onToggleFavouriteCheat: (key: string) => void;
  onFeaturesRefresh: () => void;
  onAttach: () => void;
  onDetachAll: () => void;
  onToggle: (name: string, checked: boolean) => void;
}) {
  const {
    table, features, attachInfo, favourite, onToggleFavourite,
    favouriteCheats, onToggleFavouriteCheat, onFeaturesRefresh, onAttach, onDetachAll, onToggle,
  } = props;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'risky'>('all');
  const [tab, setTab] = useState<'attach' | 'cheats' | 'script' | 'history'>(attachInfo ? 'cheats' : 'attach');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [saveModsOn, setSaveModsOn] = useState(false);

  // Refetch whenever the loaded table changes - it's a per-table
  // preference stored on disk, not something derived from `features`.
  useEffect(() => {
    GetSavedMods().then((sm) => setSaveModsOn(sm.enabled)).catch(() => setSaveModsOn(false));
  }, [table.path]);

  const onToggleSaveMods = async (checked: boolean) => {
    setSaveModsOn(checked);
    try {
      await SetSaveModsEnabled(checked);
      // Toggling this can flip several checkboxes' Active state at once
      // while not attached (the whole saved list appears/disappears), so
      // refetch rather than trying to patch local state piecemeal.
      if (!attachInfo) onFeaturesRefresh();
    } catch {
      setSaveModsOn(!checked);
    }
  };

  // Once attaching succeeds, move off the ATTACH tab so the result is
  // immediately visible - but only if that's where the user was sitting;
  // don't yank them away from SCRIPT/HISTORY mid-browse.
  useEffect(() => {
    if (attachInfo) setTab((t) => (t === 'attach' ? 'cheats' : t));
  }, [!!attachInfo]);

  const toggleCollapsed = (cat: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const activeCount = features.filter((f) => f.active).length;
  const riskyCount = features.filter((f) => f.stability === 'breaks-saves').length;
  const authors = table.author ? table.author.split(', ').filter(Boolean) : [];

  const filterPlaceholder = useTypewriter(
    features.length > 0 ? [...features.slice(0, 6).map((f) => f.name.toLowerCase()), 'active', 'risky'] : ['cheats'],
  );

  const visible = features
    .filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
    .filter((f) => (filter === 'active' ? f.active : filter === 'risky' ? f.stability === 'breaks-saves' : true));

  const favourited = visible.filter((f) => favouriteCheats.has(favouriteKey(table.path, f.name)));
  const rest = visible.filter((f) => !favouriteCheats.has(favouriteKey(table.path, f.name)));

  const byCategory = new Map<string, FeatureView[]>();
  for (const f of rest) {
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
          {attachInfo && <span class="tag">{attachInfo.platform}</span>}
          {table.version && <span class="tag">table v{table.version}</span>}
        </div>
        <div class="kv-list">
          <div class="kv-row"><span class="dim">table</span><span>{table.version ? `v${table.version}` : 'unversioned'}</span></div>
          <div class="kv-row"><span class="dim">checksum</span><span class="mono-sm accent">{formatChecksum(table.checksum)}</span></div>
          <div class="kv-row">
            <span class="dim">built for</span>
            <span>{table.compatibleVersions && table.compatibleVersions.length > 0 ? table.compatibleVersions.join(', ') : 'unspecified'}</span>
          </div>
          <div class="kv-row"><span class="dim">your build</span><span class="dim">not tracked yet</span></div>
          <div class="kv-row"><span class="dim">cheats</span><span>{features.length} &middot; {riskyCount} risky</span></div>
          <div class="kv-row"><span class="dim">source</span><span>{table.path}</span></div>
        </div>

        {authors.length > 0 && (
          <div>
            <div class="section-label">WRITTEN BY</div>
            <div class="tag-row" style="margin-top:8px">
              {authors.map((a) => <span key={a} class="author-chip">{a}</span>)}
            </div>
          </div>
        )}

        <div class="sidebar-spacer"/>
        <div class={`toggle-row-boxed${saveModsOn ? ' toggle-row-warn' : ''}`}>
          <ToggleRow
            label="Save mods"
            hint="Remembers which cheats are switched on now and reapplies them next time you attach."
            checked={saveModsOn}
            onChange={onToggleSaveMods}
            tone="warn"
          />
        </div>
        {attachInfo ? (
          <button class="btn btn-danger btn-full" onClick={onDetachAll}>DETACH &middot; RESTORE ALL</button>
        ) : (
          <button class="btn btn-primary btn-full" onClick={onAttach}>ATTACH</button>
        )}
        <p class="hint">Values revert on detach. Saves already written to disk do not.</p>
      </aside>

      <div class="game-main">
        <div class="tab-row">
          <span class={`tab${tab === 'attach' ? ' tab-active' : ''}`} onClick={() => setTab('attach')}>ATTACH</span>
          <span class={`tab${tab === 'cheats' ? ' tab-active' : ''}`} onClick={() => setTab('cheats')}>
            CHEATS <span class="tab-count">{features.length}</span>
          </span>
          <span class={`tab${tab === 'script' ? ' tab-active' : ''}`} onClick={() => setTab('script')}>SCRIPT</span>
          <span class={`tab${tab === 'history' ? ' tab-active' : ''}`} onClick={() => setTab('history')}>HISTORY</span>
        </div>

        {tab === 'attach' && <AttachTab table={table} attachInfo={attachInfo} onAttach={onAttach}/>}

        {tab === 'cheats' && (
          <>
            <div class="filter-row">
              <div class="search-input-wrap">
                <span class="search-prompt">&gt;</span>
                <input
                  class="search-input"
                  placeholder={`${filterPlaceholder}_`}
                  value={query}
                  onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
                />
              </div>
              <span class={`chip${filter === 'all' ? ' chip-selected' : ''}`} onClick={() => setFilter('all')}>ALL &middot; {features.length}</span>
              <span class={`chip${filter === 'active' ? ' chip-selected' : ''}`} onClick={() => setFilter('active')}>ACTIVE &middot; {activeCount}</span>
              <span class={`chip chip-warn${filter === 'risky' ? ' chip-selected' : ''}`} onClick={() => setFilter('risky')}>RISKY &middot; {riskyCount}</span>
            </div>

            <main class="feature-list">
              {visible.length === 0 ? (
                <div class="empty">No cheats match.</div>
              ) : (
                <>
                  {favourited.length > 0 && (
                    <div>
                      <div class="category-row favourites-row">
                        <span class="category-label">&#9733; favourites &middot; pinned</span>
                        <span class="category-meta">hotkey</span>
                      </div>
                      {favourited.map((f) => (
                        <FeatureRow
                          key={f.name}
                          feature={f}
                          attached={!!attachInfo}
                          saveModsEditable={saveModsOn}
                          favourite
                          onToggleFavourite={() => onToggleFavouriteCheat(favouriteKey(table.path, f.name))}
                          onToggle={onToggle}
                        />
                      ))}
                    </div>
                  )}

                  {categories.map((cat) => {
                    const rows = byCategory.get(cat)!;
                    const isCollapsed = collapsed.has(cat);
                    return (
                      <div key={cat}>
                        <div class="category-row">
                          <span class="category-label">{cat.toLowerCase()} &middot; {rows.length}</span>
                          <span class="category-collapse" onClick={() => toggleCollapsed(cat)}>
                            {isCollapsed ? 'expand ▸' : 'collapse ▾'}
                          </span>
                        </div>
                        {!isCollapsed && rows.map((f) => (
                          <FeatureRow
                            key={f.name}
                            feature={f}
                            attached={!!attachInfo}
                            saveModsEditable={saveModsOn}
                            favourite={false}
                            onToggleFavourite={() => onToggleFavouriteCheat(favouriteKey(table.path, f.name))}
                            onToggle={onToggle}
                          />
                        ))}
                      </div>
                    );
                  })}
                </>
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
          <div class="kv-row"><span class="dim">checksum</span><span class="mono-sm accent">{formatChecksum(props.table.checksum)}</span></div>
        </div>
        <p class="hint">Edit the file directly on disk - there's no in-app editor yet.</p>
      </div>
    </div>
  );
}

function FeatureRow(props: {
  feature: FeatureView;
  attached: boolean;
  // Whether Save mods is on for this table - while not attached, that's
  // what makes the checkbox interactive at all (editing the saved list
  // directly, via EnableFeature/DisableFeature's not-attached fallback)
  // instead of just a disabled preview.
  saveModsEditable: boolean;
  favourite: boolean;
  onToggleFavourite: () => void;
  onToggle: (name: string, checked: boolean) => void;
}) {
  const {feature: f, attached, saveModsEditable, favourite, onToggleFavourite, onToggle} = props;
  const broken = f.stability === 'broken';
  // f.available only means something once attached (it's "does this
  // feature have a target for the platform we're attached to"); before
  // that it's always false, since there's no attached platform yet, so it
  // plays no part in the not-attached branch below.
  const disabled = broken || (attached ? !f.available : !saveModsEditable);
  const kind = f.control?.kind ?? 'toggle';

  // Don't dim the whole row just because f.available is meaningless
  // pre-attach, or because Save mods happens to be off (that's a normal,
  // common state, not something wrong) - only a genuinely broken feature
  // gets the dimmed treatment outside of the attached case.
  const dimmed = attached ? disabled : broken;

  const rowClass = [
    'row',
    dimmed && 'unavailable',
    broken && 'broken',
    favourite && 'favourite',
  ].filter(Boolean).join(' ');

  return (
    <div class={rowClass}>
      {kind === 'value' ? (
        <button class="activate-box" disabled={disabled} title="Activate - not implemented yet">[&#9656;]</button>
      ) : kind === 'action' ? (
        <span/>
      ) : (
        <input
          type="checkbox"
          checked={f.active}
          disabled={disabled}
          title={!attached && !saveModsEditable && !broken ? 'Turn on Save mods to edit this before attaching' : undefined}
          onChange={(e) => onToggle(f.name, (e.target as HTMLInputElement).checked)}
        />
      )}
      <div class="name-cell">
        <span class="name">{f.name}</span>
        <span class={`stability ${f.stability}`}>{f.stability.replace(/-/g, ' ')}</span>
        <span
          class={`row-fav${favourite ? ' row-fav-on' : ''}`}
          onClick={onToggleFavourite}
          title={favourite ? 'Remove from favourites' : 'Add to favourites'}
        >
          {favourite ? '★' : '☆'}
        </span>
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
