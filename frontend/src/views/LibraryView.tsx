import {TableSummary} from '../types';

export function LibraryView(props: {tables: TableSummary[]; onSelect: (t: TableSummary) => void}) {
  if (props.tables.length === 0) {
    return (
      <div class="view-pad">
        <div class="view-header"><span>library &middot; 0 tables</span></div>
        <div class="empty-big">
          <div class="empty-title">NO TABLES FOUND</div>
          <p>
            Add a cheat table YAML file under <code>tables/</code> to get started - each
            file becomes a game here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div class="view-pad">
      <div class="view-header">
        <span>library &middot; {props.tables.length} table{props.tables.length === 1 ? '' : 's'}</span>
      </div>
      <div class="card-grid">
        {props.tables.map((t) => (
          <div key={t.path} class="game-card" onClick={() => props.onSelect(t)}>
            <div class="game-card-art">
              <span>{t.name.slice(0, 2).toUpperCase()}</span>
            </div>
            <div class="game-card-body">
              <div class="game-card-name">{t.name}</div>
              <div class="game-card-path">{t.path}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
