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
  SyncTables,
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
import {fetchOfficialTables, hasGoBridge, loadCachedRemoteTables, RemoteTable} from './remoteTables';

export function App() {
  const [view, setView] = useState<ViewId>('library');
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [current, setCurrent] = useState<TableSummary | null>(null);
  const [features, setFeatures] = useState<FeatureView[]>([]);
  const [attachInfo, setAttachInfo] = useState<AttachInfo | null>(null);
  const [status, setStatus] = useState('no game selected');
  const [toast, setToast] = useState<{message: string; tone: 'error' | 'accent'} | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

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

  const showToast = useCallback((message: string, tone: 'error' | 'accent') => {
    setToast({message, tone});
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  }, []);

  const showError = useCallback((err: unknown) => {
    showToast(err instanceof Error ? err.message : String(err), 'error');
  }, [showToast]);

  // Whether to check the shared table registry on GitHub for new/updated
  // tables every time the app starts, vs. only on the manual "sync now"
  // button in Settings. Off by default - a network call to an outside
  // service isn't something this local-first app should make without
  // explicit opt-in, even though the sync itself never sends anything
  // (a plain read of this project's own public repo).
  const [checkUpdatesOnLaunch, setCheckUpdatesOnLaunch] = useState(() => {
    try {
      return localStorage.getItem('ourmod:checkUpdatesOnLaunch') === '1';
    } catch {
      return false;
    }
  });
  const onToggleCheckUpdatesOnLaunch = (checked: boolean) => {
    setCheckUpdatesOnLaunch(checked);
    try {
      localStorage.setItem('ourmod:checkUpdatesOnLaunch', checked ? '1' : '0');
    } catch {
      // Best-effort - the toggle still works for this session either way.
    }
  };

  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  // Tables fetched via plain browser fetch() from this project's own
  // GitHub repo (see remoteTables.ts) - the fallback path for when there's
  // no Go bridge at all (opened via a bare `vite --host` dev server on
  // another device, not through Wails' own devserver proxy). Kept
  // separately from `tables` so selectGame can find a remote table's
  // already-fetched feature list without a LoadTable() call that would
  // just throw with no backend to serve it.
  const [remoteTables, setRemoteTables] = useState<RemoteTable[]>([]);
  const [fetchingOfficial, setFetchingOfficial] = useState(false);

  const onFetchOfficialTables = useCallback(async () => {
    setFetchingOfficial(true);
    try {
      const fetched = await fetchOfficialTables();
      setRemoteTables(fetched);
      setTables((prev) => {
        const existingNames = new Set(prev.map((p) => p.name));
        const newOnes = fetched.map((t) => t.summary).filter((s) => !existingNames.has(s.name));
        return [...prev, ...newOnes];
      });
      showToast(`Fetched ${fetched.length} table${fetched.length === 1 ? '' : 's'} from GitHub.`, 'accent');
    } catch (err) {
      showError(err);
    } finally {
      setFetchingOfficial(false);
    }
  }, [showToast, showError]);

  // Reconciles tables/ against this project's own GitHub repo (see
  // SyncTables in the Go backend): missing tables are added, and a local
  // table is only overwritten when the remote copy declares a strictly
  // higher metadata.version, so a table you're actively hand-editing is
  // never clobbered. `auto` (the on-launch path) stays quiet on success or
  // failure - a toast on every startup, or on every offline launch, would
  // be more annoying than useful; the manual "sync now" button in Settings
  // always reports back via lastSync/toast since the user just asked for it.
  const runSync = useCallback(async (auto: boolean) => {
    setSyncing(true);
    try {
      const result = await SyncTables();
      await ListTables().then(setTables);

      const parts: string[] = [];
      if (result.added && result.added.length > 0) parts.push(`${result.added.length} added (${result.added.join(', ')})`);
      if (result.updated && result.updated.length > 0) parts.push(`${result.updated.length} updated (${result.updated.join(', ')})`);
      const summary = parts.length > 0 ? `Tables synced: ${parts.join(', ')}` : 'Tables already up to date.';
      setLastSync(summary);

      if (result.failed && result.failed.length > 0) {
        if (!auto) showToast(`Table sync: ${result.failed.join('; ')}`, 'error');
      } else if (!auto) {
        showToast(summary, 'accent');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLastSync(`Sync failed: ${msg}`);
      if (!auto) showToast(msg, 'error');
    } finally {
      setSyncing(false);
    }
  }, [showToast]);

  // The Go backend's loaded table / attach session live independently of
  // this component and survive a webview reload untouched (dev tooling can
  // trigger one). Recover real state on every mount instead of assuming a
  // fresh mount means nothing is loaded or attached - otherwise a reload
  // makes a live session look detached in the UI even though it isn't.
  useEffect(() => {
    if (!hasGoBridge()) {
      // No Wails bridge at all (see hasGoBridge's doc comment) - every
      // Go-bound call below would just throw. Fall back to whatever
      // remote-fetched tables are already cached in this browser instead
      // of leaving the Library permanently empty.
      const cached = loadCachedRemoteTables();
      setRemoteTables(cached);
      setTables(cached.map((t) => t.summary));
      return;
    }

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
    if (checkUpdatesOnLaunch) {
      runSync(true);
    }
    // Intentionally mount-only: re-running this on every checkUpdatesOnLaunch
    // flip would sync every time the user toggles the Settings switch, not
    // just on an actual app launch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live reload: the Go backend watches tables/ and emits this event
  // whenever a .yml file changes on disk (exactly the hand-editing
  // workflow this project uses). Always refresh the Library list; if the
  // currently loaded table is what changed, reload its features too -
  // ReloadTable never detaches, so an active session is undisturbed. Skips
  // entirely with no Go bridge - EventsOn reaches into window.runtime
  // directly and would throw rather than just failing gracefully.
  useEffect(() => {
    if (!hasGoBridge()) return undefined;
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

    // A table fetched via fetchOfficialTables (path is a "remote:..."
    // marker, not a real local path) - its full feature list was already
    // parsed client-side at fetch time, so this skips LoadTable entirely
    // (a Go-bound call that would just throw with no bridge to serve it).
    const remote = remoteTables.find((r) => r.summary.path === t.path);
    if (remote) {
      setCurrent(t);
      setFeatures(remote.features);
      setStatus(`${t.name} - preview only (fetched from GitHub, no backend connection)`);
      setView('game');
      return;
    }

    try {
      const loaded = await LoadTable(t.path);
      setCurrent(t);
      setFeatures(loaded ?? []);
      setStatus(`${t.name} - not attached`);
      setView('game');
    } catch (err) {
      showError(err);
    }
  }, [showError, remoteTables]);

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
          <LibraryView
            tables={tables}
            onSelect={selectGame}
            favourites={favourites}
            onToggleFavourite={toggleFavourite}
            onFetchOfficialTables={onFetchOfficialTables}
            fetchingOfficial={fetchingOfficial}
          />
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
          <LibraryView
            tables={tables}
            onSelect={selectGame}
            favourites={favourites}
            onToggleFavourite={toggleFavourite}
            onFetchOfficialTables={onFetchOfficialTables}
            fetchingOfficial={fetchingOfficial}
          />
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
            checkUpdatesOnLaunch={checkUpdatesOnLaunch}
            onToggleCheckUpdatesOnLaunch={onToggleCheckUpdatesOnLaunch}
            syncing={syncing}
            lastSync={lastSync}
            onSyncTables={() => runSync(false)}
          />
        )}

        {view === 'about' && <AboutView/>}
      </div>

      <Toast message={toast?.message ?? null} tone={toast?.tone}/>
    </div>
  );
}
