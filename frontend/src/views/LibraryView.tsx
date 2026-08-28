import {useState} from 'preact/hooks';
import {TableSummary} from '../types';
import {CommandLine} from '../components/CommandLine';
import {formatChecksum} from '../format';
import {useTypewriter} from '../hooks/useTypewriter';

type LibTab = 'games' | 'favourites' | 'trainers';

export function LibraryView(props: {
  tables: TableSummary[];
  onSelect: (t: TableSummary) => void;
  favourites: Set<string>;
  onToggleFavourite: (path: string) => void;
}) {
  const {tables, favourites, onToggleFavourite} = props;
  const [tab, setTab] = useState<LibTab>('games');
  const [query, setQuery] = useState('');

  const typedExample = useTypewriter(
    tables.length > 0 ? [...tables.map((t) => t.name.toLowerCase()), 'tables/*.yml'] : ['tables/*.yml'],
  );

  if (tables.length === 0) {
    return (
      <div class="view-pad">
        <div class="view-header"><span>library &middot; 0 games</span></div>
        <div class="empty-panel">
          <div class="empty-panel-inner">
            <CommandLine command="ls tables/" right="EXIT 0 · 0 MATCHES"/>
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

  const favCount = tables.filter((t) => favourites.has(t.path)).length;

  return (
    <div class="view-pad">
      <div class="view-header">
        <span>library &middot; {tables.length} game{tables.length === 1 ? '' : 's'}</span>
      </div>

      <div class="lib-tab-row">
        <span class={`lib-tab${tab === 'games' ? ' lib-tab-active' : ''}`} onClick={() => setTab('games')}>
          GAMES <span class="tab-count">{tables.length}</span>
        </span>
        <span class={`lib-tab${tab === 'favourites' ? ' lib-tab-active' : ''}`} onClick={() => setTab('favourites')}>
          FAVOURITES <span class="tab-count">{favCount}</span>
        </span>
        <span class={`lib-tab${tab === 'trainers' ? ' lib-tab-active' : ''}`} onClick={() => setTab('trainers')}>
          TRAINERS <span class="tab-count">{tables.length}</span>
        </span>
      </div>

      {tab === 'trainers' ? (
        <TrainersTable tables={tables}/>
      ) : (
        <GameGrid
          tables={tab === 'favourites' ? tables.filter((t) => favourites.has(t.path)) : tables}
          query={query}
          onQueryChange={setQuery}
          typedExample={typedExample}
          favourites={favourites}
          onToggleFavourite={onToggleFavourite}
          onSelect={props.onSelect}
          emptyHint={tab === 'favourites' ? 'No favourites yet - star a game from its card.' : undefined}
        />
      )}
    </div>
  );
}

function GameGrid(props: {
  tables: TableSummary[];
  query: string;
  onQueryChange: (q: string) => void;
  typedExample: string;
  favourites: Set<string>;
  onToggleFavourite: (path: string) => void;
  onSelect: (t: TableSummary) => void;
  emptyHint?: string;
}) {
  const filtered = props.tables.filter((t) => t.name.toLowerCase().includes(props.query.toLowerCase()));

  return (
    <>
      <div class="search-input-wrap hero">
        <span class="search-prompt">&gt;</span>
        <input
          class="search-input"
          placeholder={`${props.typedExample}_`}
          value={props.query}
          onInput={(e) => props.onQueryChange((e.target as HTMLInputElement).value)}
        />
      </div>

      <div class="chip-row">
        <span class="chip chip-selected">ALL &middot; {props.tables.length}</span>
        <span class="chip chip-disabled" title="No multi-source scan yet">TRAINER READY</span>
        <span class="chip chip-disabled" title="No play-history tracking yet">RECENTLY PLAYED</span>
        <span class="chip chip-disabled chip-warn" title="No build-verification tracking yet">UNTESTED BUILD</span>
      </div>

      {filtered.length === 0 ? (
        <div class="empty">{props.emptyHint ?? 'No games match.'}</div>
      ) : (
        <div class="card-grid">
          {filtered.map((t) => {
            const fav = props.favourites.has(t.path);
            return (
              <div key={t.path} class="game-card" onClick={() => props.onSelect(t)}>
                <div class="game-card-art">
                  <span>{t.name.slice(0, 2).toUpperCase()}</span>
                  <span class="game-card-source">LOCAL</span>
                  <span
                    class={`game-card-star${fav ? ' game-card-star-on' : ''}`}
                    onClick={(e) => { e.stopPropagation(); props.onToggleFavourite(t.path); }}
                  >
                    {fav ? '★' : '☆'}
                  </span>
                </div>
                <div class="game-card-body">
                  <div class="game-card-name">{t.name}</div>
                  <div class="game-card-path">{t.path}</div>
                  <div class="game-card-state">&#9656; TRAINER READY</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function TrainersTable(props: {tables: TableSummary[]}) {
  return (
    <div class="trainers-table">
      <div class="trainers-table-head">
        <span>GAME</span><span>CHEATS</span><span>CHECKSUM</span><span>PATH</span>
      </div>
      {props.tables.map((t) => (
        <div key={t.path} class="trainers-table-row">
          <span class="name">{t.name}</span>
          <span class="dim">{t.featureCount}</span>
          <span class="dim mono-sm">{formatChecksum(t.checksum)}</span>
          <span class="dim">{t.path}</span>
        </div>
      ))}
    </div>
  );
}
