package desktop

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

// stateDir holds one JSON file per loaded table, recording which features
// were active and exactly where (site/cave addresses), so a fresh App
// process - after a crash, or a dev-tooling restart - can tell a still-live
// game process's already-injected bytes apart from a clean one instead of
// forgetting about them. It's runtime data, not part of a cheat table, so
// it lives outside tables/ and is gitignored.
const stateDir = ".ourmod-state"

// persistedFeature is one active feature's installed location. Site/Cave
// are absolute remote addresses; JSON doesn't have a uintptr type, so they
// round-trip as uint64.
type persistedFeature struct {
	Site uint64 `json:"site"`
	Cave uint64 `json:"cave"`
}

// persistedState is one table's on-disk state: which features were active
// against which game process. PID is the staleness check - if the game
// process isn't that exact PID anymore, everything it had injected is gone
// with it, and the recorded addresses mean nothing.
type persistedState struct {
	PID      int                         `json:"pid"`
	Features map[string]persistedFeature `json:"features"`
}

func stateFilePath(tablePath string) string {
	name := strings.ReplaceAll(tablePath, string(filepath.Separator), "_")
	return filepath.Join(stateDir, name+".json")
}

// loadPersistedState reads back what was persisted for tablePath. A missing
// or unreadable file just means "nothing to recover", not an error - this
// is a best-effort safety net, not a source of truth.
func loadPersistedState(tablePath string) (persistedState, bool) {
	data, err := os.ReadFile(stateFilePath(tablePath))
	if err != nil {
		return persistedState{}, false
	}

	var st persistedState
	if err := json.Unmarshal(data, &st); err != nil {
		return persistedState{}, false
	}
	return st, true
}

// savePersistedState writes st for tablePath, or removes the file entirely
// once nothing is active - there's nothing worth recovering, and it
// prevents a later attach from reading stale addresses. The write is
// tmp-file-plus-rename so a crash mid-write can't leave a half-written,
// unparseable file behind (exactly the moment this file matters most).
func savePersistedState(tablePath string, st persistedState) {
	path := stateFilePath(tablePath)

	if len(st.Features) == 0 {
		_ = os.Remove(path)
		return
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return
	}

	data, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return
	}

	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return
	}
	_ = os.Rename(tmp, path)
}

// savedMods is one table's "Save mods" preference: whether it's on, and
// which features it will reapply on the next attach. Unlike persistedState
// (crash recovery, keyed to one exact still-running game process and
// cleared on detach), this is a genuine user preference - it has no PID to
// go stale against, and survives detach, a game restart, and an ourmod
// restart alike, by design.
type savedMods struct {
	Enabled  bool     `json:"enabled"`
	Features []string `json:"features"`
}

func savedModsFilePath(tablePath string) string {
	name := strings.ReplaceAll(tablePath, string(filepath.Separator), "_")
	return filepath.Join(stateDir, name+".savedmods.json")
}

func loadSavedMods(tablePath string) (savedMods, bool) {
	data, err := os.ReadFile(savedModsFilePath(tablePath))
	if err != nil {
		return savedMods{}, false
	}

	var sm savedMods
	if err := json.Unmarshal(data, &sm); err != nil {
		return savedMods{}, false
	}
	return sm, true
}

func saveSavedMods(tablePath string, sm savedMods) {
	path := savedModsFilePath(tablePath)

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return
	}

	data, err := json.MarshalIndent(sm, "", "  ")
	if err != nil {
		return
	}

	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return
	}
	_ = os.Rename(tmp, path)
}
