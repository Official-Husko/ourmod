import {useState} from 'preact/hooks';
import {TableSummary} from '../types';
import {CommandLine} from '../components/CommandLine';

export function LibraryView(props: {tables: TableSummary[]; onSelect: (t: TableSummary) => void}) {
  const [query, setQuery] = useState('');
  const filtered = props.tables.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()));

  if (props.tables.length === 0) {
    return (
      <div class="view-pad">
        <div class="view-header"><span>library &middot; 0 games</span></div>
        <div class="empty-panel">
          <div class="empty-panel-inner">
            <CommandLine command="ls tables/" right="0 MATCHES"/>
            <div class="empty-title">No tables found</div>
            <p>
              OurMod looked in <code>tables/</code> and found no <code>.yml</code> cheat table.
              Nothing is wrong with the install - it simply has nowhere to look yet. Add a
              table file to get started.
            </p>
            <div class="folder-list">
              <div class="folder-row"><span>tables/</span><span class="dim">0 found</span></div>
            </div>
            <div class="btn-row">
              <button class="btn btn-outline" disabled title="Multiple search folders: coming soon">ADD A FOLDER</button>
              <button class="btn btn-outline" disabled title="Nothing to rescan yet">RESCAN</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div class="view-pad">
      <div class="view-header">
        <span>library &middot; {props.tables.length} game{props.tables.length === 1 ? '' : 's'}</span>
      </div>

      <input
        class="search-input"
        placeholder="filter games..."
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      />

      <div class="chip-row">
        <span class="chip chip-selected">ALL &middot; {props.tables.length}</span>
        <span class="chip chip-disabled" title="No multi-source scan yet">TRAINER READY</span>
        <span class="chip chip-disabled" title="No play-history tracking yet">RECENTLY PLAYED</span>
        <span class="chip chip-disabled chip-warn" title="No build-verification tracking yet">UNTESTED BUILD</span>
      </div>

      <div class="card-grid">
        {filtered.map((t) => (
          <div key={t.path} class="game-card" onClick={() => props.onSelect(t)}>
            <div class="game-card-art">
              <span>{t.name.slice(0, 2).toUpperCase()}</span>
              <span class="game-card-source">LOCAL</span>
            </div>
            <div class="game-card-body">
              <div class="game-card-name">{t.name}</div>
              <div class="game-card-path">{t.path}</div>
              <div class="game-card-state">&#9656; TRAINER READY</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
