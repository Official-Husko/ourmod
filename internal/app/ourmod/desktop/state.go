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

// savedModsFile is the single, all-games "Save mods" registry: one shared
// file, keyed by table path, so enabling or disabling it for one game can
// never touch another game's entry, and every game's saved set lives
// together "along other saved mods" rather than scattered across one file
// per table. A table's presence as a key IS "Save mods is on" - there's no
// separate enabled flag to fall out of sync with it; turning it off
// deletes the key outright (see SetSaveModsEnabled), so there's nothing
// stale left to accidentally resurrect later.
//
// Unlike persistedState (crash recovery, keyed to one exact still-running
// game process and cleared on detach), this is a genuine user preference -
// it has no PID to go stale against, and survives detach, a game restart,
// and an ourmod restart alike, by design.
type savedModsFile struct {
	Tables map[string][]string `json:"tables"`
}

func savedModsFilePath() string {
	return filepath.Join(stateDir, "savedmods.json")
}

// loadSavedModsFile reads the shared registry, always returning a non-nil
// Tables map. A missing or unreadable file just means "nothing saved yet
// for any game", not an error.
func loadSavedModsFile() savedModsFile {
	data, err := os.ReadFile(savedModsFilePath())
	if err != nil {
		return savedModsFile{Tables: map[string][]string{}}
	}

	var f savedModsFile
	if err := json.Unmarshal(data, &f); err != nil || f.Tables == nil {
		return savedModsFile{Tables: map[string][]string{}}
	}
	return f
}

func saveSavedModsFile(f savedModsFile) {
	path := savedModsFilePath()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return
	}

	data, err := json.MarshalIndent(f, "", "  ")
	if err != nil {
		return
	}

	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return
	}
	_ = os.Rename(tmp, path)
}
