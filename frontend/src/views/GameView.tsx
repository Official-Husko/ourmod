import {AttachInfo, FeatureView} from '../types';

export function GameView(props: {
  tableName: string;
  features: FeatureView[];
  attachInfo: AttachInfo | null;
  status: string;
  onBack: () => void;
  onAttach: () => void;
  onDetachAll: () => void;
  onToggle: (name: string, checked: boolean) => void;
}) {
  const {tableName, features, attachInfo, status, onBack, onAttach, onDetachAll, onToggle} = props;

  const byCategory = new Map<string, FeatureView[]>();
  for (const f of features) {
    const cat = f.category || 'uncategorized';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(f);
  }
  const categories = [...byCategory.keys()].sort();

  return (
    <div class="game-view">
      <div class="view-header">
        <span class="breadcrumb" onClick={onBack}>&larr; library</span>
        <span> / {tableName}</span>
        <span class="spacer"/>
        {!attachInfo && (
          <button class="btn btn-primary" onClick={onAttach}>ATTACH</button>
        )}
      </div>

      <div class={`status${attachInfo ? ' attached' : ''}`}>{status}</div>

      <main class="feature-list">
        {features.length === 0 ? (
          <div class="empty">This table has no features yet.</div>
        ) : (
          categories.map((cat) => (
            <div key={cat}>
              <div class="category">{cat}</div>
              {byCategory.get(cat)!.map((f) => (
                <FeatureRow key={f.name} feature={f} attached={!!attachInfo} onToggle={onToggle}/>
              ))}
            </div>
          ))
        )}
      </main>

      <footer>
        <button class="btn btn-outline" disabled={!attachInfo} onClick={onDetachAll}>
          DETACH &middot; RESTORE ALL
        </button>
        <span class="hint">Values revert on detach.</span>
      </footer>
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
