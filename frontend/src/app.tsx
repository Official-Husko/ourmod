import {useCallback, useEffect, useRef, useState} from 'preact/hooks';
import {
  Attach,
  DetachAll,
  DisableFeature,
  EnableFeature,
  Features,
  ListTables,
  LoadTable,
} from '../wailsjs/go/desktop/App';
import {NavRail} from './components/NavRail';
import {LibraryView} from './views/LibraryView';
import {GameView} from './views/GameView';
import {HotkeysView} from './views/HotkeysView';
import {SettingsView} from './views/SettingsView';
import {AboutView} from './views/AboutView';
import {AttachInfo, FeatureView, TableSummary, ViewId} from './types';

export function App() {
  const [view, setView] = useState<ViewId>('library');
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [current, setCurrent] = useState<TableSummary | null>(null);
  const [features, setFeatures] = useState<FeatureView[]>([]);
  const [attachInfo, setAttachInfo] = useState<AttachInfo | null>(null);
  const [status, setStatus] = useState('no game selected');
  const [error, setError] = useState<string | null>(null);
  const errorTimer = useRef<number | undefined>(undefined);

  // Session-only (not persisted - there's no settings-persistence layer
  // yet): which table paths are starred. Real interaction, honest about
  // not surviving a restart.
  const [favourites, setFavourites] = useState<Set<string>>(new Set());
  const toggleFavourite = (path: string) => {
    setFavourites((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const showError = useCallback((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    setError(msg);
    window.clearTimeout(errorTimer.current);
    errorTimer.current = window.setTimeout(() => setError(null), 5000);
  }, []);

  useEffect(() => {
    ListTables().then(setTables);
  }, []);

  const selectGame = useCallback(async (t: TableSummary) => {
    setAttachInfo(null);
    try {
      const loaded = await LoadTable(t.path);
      setCurrent(t);
      setFeatures(loaded ?? []);
      setStatus(`${t.name} - not attached`);
      setView('game');
    } catch (err) {
      showError(err);
    }
  }, [showError]);

  const onAttach = async () => {
    try {
      const info: AttachInfo = await Attach();
      setAttachInfo(info);
      setStatus(`attached: ${info.gameName} (PID ${info.pid}, ${info.platform})`);
      setFeatures((await Features()) ?? []);
    } catch (err) {
      showError(err);
    }
  };

  const onDetachAll = async () => {
    try {
      await DetachAll();
    } catch (err) {
      showError(err);
    } finally {
      setAttachInfo(null);
      setStatus(current ? `${current.name} - not attached` : 'no game selected');
      setFeatures((await Features()) ?? []);
    }
  };

  const onToggle = async (name: string, checked: boolean) => {
    setFeatures((prev) => prev.map((f) => (f.name === name ? {...f, active: checked} : f)));
    try {
      if (checked) {
        await EnableFeature(name);
      } else {
        await DisableFeature(name);
      }
    } catch (err) {
      showError(err);
      setFeatures((prev) => prev.map((f) => (f.name === name ? {...f, active: !checked} : f)));
    }
  };

  const navigate = (id: ViewId) => {
    if (id === 'library') {
      setView('library');
      return;
    }
    setView(id);
  };

  return (
    <div class="shell">
      <div class="scanlines"/>
      <NavRail active={view} onNavigate={navigate} tableCount={tables.length} hasCurrentGame={!!current}/>

      <div class="content">
        {view === 'library' && (
          <LibraryView tables={tables} onSelect={selectGame} favourites={favourites} onToggleFavourite={toggleFavourite}/>
        )}

        {view === 'game' && current && (
          <GameView
            table={current}
            features={features}
            attachInfo={attachInfo}
            status={status}
            favourite={favourites.has(current.path)}
            onToggleFavourite={() => toggleFavourite(current.path)}
            onBack={() => setView('library')}
            onAttach={onAttach}
            onDetachAll={onDetachAll}
            onToggle={onToggle}
          />
        )}
        {view === 'game' && !current && (
          <LibraryView tables={tables} onSelect={selectGame} favourites={favourites} onToggleFavourite={toggleFavourite}/>
        )}

        {view === 'hotkeys' && (
          <HotkeysView
            tableName={current?.name ?? null}
            tablePath={current?.path ?? null}
            features={features}
            attachInfo={attachInfo}
          />
        )}

        {view === 'settings' && (
          <SettingsView attached={!!attachInfo} onDetachAll={onDetachAll} current={current}/>
        )}

        {view === 'about' && <AboutView/>}
      </div>

      <div class={`toast${error ? '' : ' hidden'}`}>{error}</div>
    </div>
  );
}
