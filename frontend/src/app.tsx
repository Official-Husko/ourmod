import {useCallback, useEffect, useRef, useState} from 'preact/hooks';
import {
  Attach,
  CurrentStatus,
  DetachAll,
  DisableFeature,
  EnableFeature,
  Features,
  ListTables,
  LoadTable,
  ReloadTable,
} from '../wailsjs/go/desktop/App';
import {EventsOn} from '../wailsjs/runtime/runtime';
import {NavRail} from './components/NavRail';
import {Toast} from './components/Toast';
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

  // Same idea, one level down: individual cheats within a table, keyed
  // "<tablePath>::<featureName>" (see GameView's favouriteKey). Also
  // session-only.
  const [favouriteCheats, setFavouriteCheats] = useState<Set<string>>(new Set());
  const toggleFavouriteCheat = (key: string) => {
    setFavouriteCheats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Whether to show a game's cover/hero artwork - a display preference,
  // not game state, so it's real and backed by localStorage (per-viewer,
  // survives a restart) rather than needing the settings-persistence layer
  // the rest of Settings' toggles are still honestly waiting on. Defaults
  // on if localStorage is unreadable (private window, blocked site data).
  const [showArtwork, setShowArtwork] = useState(() => {
    try {
      return localStorage.getItem('ourmod:showArtwork') !== '0';
    } catch {
      return true;
    }
  });
  const onToggleArtwork = (checked: boolean) => {
    setShowArtwork(checked);
    try {
      localStorage.setItem('ourmod:showArtwork', checked ? '1' : '0');
    } catch {
      // Best-effort - the toggle still works for this session either way.
    }
  };

  const showError = useCallback((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    setError(msg);
    window.clearTimeout(errorTimer.current);
    errorTimer.current = window.setTimeout(() => setError(null), 5000);
  }, []);

  // The Go backend's loaded table / attach session live independently of
  // this component and survive a webview reload untouched (dev tooling can
  // trigger one). Recover real state on every mount instead of assuming a
  // fresh mount means nothing is loaded or attached - otherwise a reload
  // makes a live session look detached in the UI even though it isn't.
  useEffect(() => {
    ListTables().then(setTables);
    CurrentStatus().then((s) => {
      if (s.table) {
        setCurrent(s.table);
        setFeatures(s.features ?? []);
        setView('game');
      }
      if (s.attach) {
        setAttachInfo(s.attach);
        setStatus(`attached: ${s.attach.gameName} (PID ${s.attach.pid}, ${s.attach.platform})`);
      } else if (s.table) {
        setStatus(`${s.table.name} - not attached`);
      }
    });
  }, []);

  // Live reload: the Go backend watches tables/ and emits this event
  // whenever a .yml file changes on disk (exactly the hand-editing
  // workflow this project uses). Always refresh the Library list; if the
  // currently loaded table is what changed, reload its features too -
  // ReloadTable never detaches, so an active session is undisturbed.
  useEffect(() => {
    return EventsOn('tables:changed', (path: string) => {
      ListTables().then(setTables);
      if (current && path === current.path) {
        ReloadTable().then((result) => {
          setCurrent(result.table);
          setFeatures(result.features ?? []);
          if (result.reverted && result.reverted.length > 0) {
            showError(`Reverted (definition changed): ${result.reverted.join(', ')}`);
          }
        }).catch(() => {
          // Likely a transient partial write mid-save; the next change
          // event (editors usually fire several per save) will succeed.
        });
      }
    });
  }, [current]);

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
      const result = await Attach();
      const info = result.info;
      setAttachInfo(info);
      setStatus(`attached: ${info.gameName} (PID ${info.pid}, ${info.platform})`);
      setFeatures((await Features()) ?? []);
      if (result.failed && result.failed.length > 0) {
        showError(`Save mods: couldn't reapply ${result.failed.join(', ')} - renamed, removed, or a broken signature.`);
      }
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

  // Turning Save mods on/off pre-attach can flip several checkboxes' Active
  // state at once (the whole saved list appears or disappears) - too much
  // for the single-item optimistic update onToggle does, so this just
  // refetches the real list instead.
  const refreshFeatures = useCallback(async () => {
    setFeatures((await Features()) ?? []);
  }, []);

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
          <LibraryView tables={tables} onSelect={selectGame} favourites={favourites} onToggleFavourite={toggleFavourite} showArtwork={showArtwork}/>
        )}

        {view === 'game' && current && (
          <GameView
            table={current}
            features={features}
            attachInfo={attachInfo}
            status={status}
            favourite={favourites.has(current.path)}
            onToggleFavourite={() => toggleFavourite(current.path)}
            favouriteCheats={favouriteCheats}
            onToggleFavouriteCheat={toggleFavouriteCheat}
            onFeaturesRefresh={refreshFeatures}
            showArtwork={showArtwork}
            onBack={() => setView('library')}
            onAttach={onAttach}
            onDetachAll={onDetachAll}
            onToggle={onToggle}
          />
        )}
        {view === 'game' && !current && (
          <LibraryView tables={tables} onSelect={selectGame} favourites={favourites} onToggleFavourite={toggleFavourite} showArtwork={showArtwork}/>
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
          <SettingsView
            attached={!!attachInfo}
            onDetachAll={onDetachAll}
            current={current}
            showArtwork={showArtwork}
            onToggleArtwork={onToggleArtwork}
          />
        )}

        {view === 'about' && <AboutView/>}
      </div>

      <Toast message={error}/>
    </div>
  );
}
