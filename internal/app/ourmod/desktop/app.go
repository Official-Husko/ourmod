// Package desktop is the Wails-bound backend: every method on App is
// callable from the frontend JS as window.go.desktop.App.<Method>(...). It
// adds no engine logic of its own - every action here is a thin call into
// pkg/cheats and internal/app/ourmod/engine, the same code path
// cmd/ourmod-cli already exercises from the command line.
package desktop

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"time"

	"github.com/fsnotify/fsnotify"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/Official-Husko/ourmod/internal/app/ourmod/engine"
	"github.com/Official-Husko/ourmod/pkg/cheats"
)

// TablesChangedEvent is the Wails event name emitted whenever a .yml file
// under tables/ is created, written, or removed. The frontend listens for
// it to refresh the Library list and, if the changed file is the currently
// loaded table, call ReloadTable.
const TablesChangedEvent = "tables:changed"

// TableSummary is a row in the table picker, and the source for the
// Library/Trainers tab's listing - Checksum and FeatureCount are real
// (sha256 of the file, actual parsed feature count), not placeholders.
type TableSummary struct {
	Path               string   `json:"path"`
	Name               string   `json:"name"`
	Version            string   `json:"version"`
	Checksum           string   `json:"checksum"`
	FeatureCount       int      `json:"featureCount"`
	Author             string   `json:"author"`
	CompatibleVersions []string `json:"compatibleVersions"`
	GameSource         string   `json:"gameSource"`
	SteamAppID         string   `json:"steamAppId"`
	LogoURL            string   `json:"logoUrl"`
	HeroURL            string   `json:"heroUrl"`
	SourceURL          string   `json:"sourceUrl"`
}

// FeatureView is the JSON-friendly projection of a cheats.Feature the
// frontend actually needs - never the raw signature/patch/hook bytes.
type FeatureView struct {
	Name      string      `json:"name"`
	Category  string      `json:"category"`
	Hotkey    string      `json:"hotkey"`
	Stability string      `json:"stability"`
	Note      string      `json:"note"`
	Available bool        `json:"available"` // has a target for the attached platform
	Active    bool        `json:"active"`
	Control   ControlView `json:"control"`
}

// ControlView is the JSON-friendly projection of a cheats.ControlSpec.
// Kind is always populated ("toggle" when the table left it unset); the
// engine only ever applies a toggle today, so a non-toggle Kind's
// Activate/Apply/action is rendered but disabled in the UI until real
// signature data backs it - see EnableFeature/DisableFeature, which are
// the only mechanisms this app can currently drive.
type ControlView struct {
	Kind    string   `json:"kind"`
	Min     *float64 `json:"min,omitempty"`
	Max     *float64 `json:"max,omitempty"`
	Step    *float64 `json:"step,omitempty"`
	Default *float64 `json:"default,omitempty"`
	Unit    string   `json:"unit,omitempty"`
	Actions []string `json:"actions,omitempty"`
}

func newControlView(c cheats.ControlSpec) ControlView {
	kind := string(c.Kind)
	if kind == "" {
		kind = string(cheats.ControlToggle)
	}
	return ControlView{
		Kind:    kind,
		Min:     c.Min,
		Max:     c.Max,
		Step:    c.Step,
		Default: c.Default,
		Unit:    c.Unit,
		Actions: c.Actions,
	}
}

// AttachInfo describes the current attach state for the header/status bar.
type AttachInfo struct {
	Attached bool   `json:"attached"`
	PID      int    `json:"pid"`
	Platform string `json:"platform"`
	GameName string `json:"gameName"`
}

// attached holds everything resolved once at attach time and reused to
// enable each feature as it's toggled.
type attached struct {
	session   *engine.Session
	pid       int
	plat      cheats.Platform
	maps      []engine.MemoryMap
	base      uintptr
	imageSize uintptr
}

// App is the Wails-bound backend. All exported methods are callable from
// the frontend; only NewApp/Startup/Shutdown are meant for main.go.
type App struct {
	ctx       context.Context
	table     *cheats.CheatTable
	tablePath string
	att       *attached
	watcher   *fsnotify.Watcher
}

func NewApp() *App {
	return &App{}
}

// Startup is a Wails lifecycle hook (options.App.OnStartup). It starts a
// best-effort watcher on tables/ so hand-editing a .yml file (exactly the
// workflow this project uses) is picked up without restarting the app.
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return // live reload just won't be available; nothing else depends on it
	}
	if err := watcher.Add("tables"); err != nil {
		_ = watcher.Close()
		return
	}

	a.watcher = watcher
	go a.watchTables()
}

// watchTables debounces fsnotify's often-multiple events per save (editors
// commonly write+rename) into a single TablesChangedEvent per quiet period.
func (a *App) watchTables() {
	var debounce *time.Timer

	for {
		select {
		case event, ok := <-a.watcher.Events:
			if !ok {
				return
			}
			if filepath.Ext(event.Name) != ".yml" {
				continue
			}
			if debounce != nil {
				debounce.Stop()
			}
			path := event.Name
			debounce = time.AfterFunc(150*time.Millisecond, func() {
				wailsruntime.EventsEmit(a.ctx, TablesChangedEvent, path)
			})

		case _, ok := <-a.watcher.Errors:
			if !ok {
				return
			}
		}
	}
}

// Shutdown is a Wails lifecycle hook (options.App.OnShutdown): restore
// every active feature before the app closes, the same guarantee
// cmd/ourmod-cli gives on Ctrl+C.
func (a *App) Shutdown(context.Context) {
	_ = a.DetachAll()
	if a.watcher != nil {
		_ = a.watcher.Close()
	}
}

// ListTables returns every cheat table found under tables/.
func (a *App) ListTables() []TableSummary {
	matches, _ := filepath.Glob("tables/*.yml")

	out := make([]TableSummary, 0, len(matches))
	for _, path := range matches {
		out = append(out, summarizeTable(path))
	}
	return out
}

func summarizeTable(path string) TableSummary {
	summary := TableSummary{Path: path, Name: filepath.Base(path)}

	if t, err := cheats.LoadFile(path); err == nil {
		summary.Name = t.Metadata.Name
		summary.Version = t.Metadata.Version
		summary.FeatureCount = len(t.Features)
		summary.Author = t.Metadata.Author
		if summary.Author == "" && len(t.Metadata.Authors) > 0 {
			summary.Author = strings.Join(t.Metadata.Authors, ", ")
		}
		summary.CompatibleVersions = t.Metadata.CompatibleVersions
		summary.GameSource = t.Metadata.GameSource
		summary.SteamAppID = t.Metadata.SteamAppID
		summary.LogoURL = t.Metadata.LogoURL
		summary.HeroURL = t.Metadata.HeroURL
		summary.SourceURL = t.Metadata.SourceURL
	}

	if data, err := os.ReadFile(path); err == nil {
		sum := sha256.Sum256(data)
		summary.Checksum = hex.EncodeToString(sum[:])
	}

	return summary
}

// LoadTable loads path as the current table (detaching from any previously
// loaded table first) and returns its feature list.
func (a *App) LoadTable(path string) ([]FeatureView, error) {
	_ = a.DetachAll()

	table, err := cheats.LoadFile(path)
	if err != nil {
		return nil, err
	}

	a.table = table
	a.tablePath = path
	return a.Features(), nil
}

// ReloadResult is ReloadTable's return: a refreshed TableSummary (checksum,
// version, etc. all move when the file does - a caller holding onto the
// TableSummary from before the edit would otherwise show stale values),
// the refreshed feature list, and the names of any active feature that got
// reverted because its own definition changed out from under it.
type ReloadResult struct {
	Table    TableSummary  `json:"table"`
	Features []FeatureView `json:"features"`
	Reverted []string      `json:"reverted"`
}

// ReloadTable re-reads the currently loaded table's file from disk and
// returns the refreshed feature list, *without* detaching - unlike
// LoadTable, this is meant to be called in response to a live file edit
// while a session may already be attached, so it must not disturb it. If
// editing the file changed (or removed) the target for a feature that's
// currently active, that feature is reverted first - see
// revertChangedActiveFeatures for why.
func (a *App) ReloadTable() (ReloadResult, error) {
	if a.tablePath == "" {
		return ReloadResult{}, fmt.Errorf("no table loaded")
	}

	table, err := cheats.LoadFile(a.tablePath)
	if err != nil {
		return ReloadResult{}, err
	}

	var reverted []string
	if a.att != nil {
		reverted = a.revertChangedActiveFeatures(table)
	}

	a.table = table

	if a.att != nil {
		a.persistState()
	}

	return ReloadResult{Table: summarizeTable(a.tablePath), Features: a.Features(), Reverted: reverted}, nil
}

// revertChangedActiveFeatures disables any currently-active feature whose
// target for the attached platform is different (or gone) in newTable.
// Without this, editing an active feature's signature/patch/hook in the
// table file would leave the *old* bytes physically running in the game
// while the UI silently starts describing it as the *new* definition - the
// two would quietly disagree about what's actually installed. Restoring
// uses each feature's own captured undo closure (from Session.Enable /
// Recover), which never consults a.table, so this is safe even if the new
// definition in the file is broken or half-written.
func (a *App) revertChangedActiveFeatures(newTable *cheats.CheatTable) []string {
	var reverted []string

	for _, name := range a.att.session.ActiveFeatures() {
		oldFeature, ok := a.att.session.ActiveTarget(name)
		if !ok {
			continue
		}
		oldTarget := oldFeature.Targets[a.att.plat]

		changed := true
		if newFeature, err := newTable.Find(name); err == nil {
			if newTarget, ok := newFeature.Targets[a.att.plat]; ok {
				changed = !reflect.DeepEqual(oldTarget, newTarget)
			}
		}

		if !changed {
			continue
		}
		if err := a.att.session.Disable(name); err == nil {
			reverted = append(reverted, name)
		}
	}

	return reverted
}

// AppStatus is everything actually loaded/attached right now. The Go
// backend's state (a.table, a.att) lives independently of the frontend and
// survives a webview reload untouched; CurrentStatus lets the frontend
// recover the true state after one instead of assuming a fresh mount means
// nothing is loaded or attached.
type AppStatus struct {
	Table    *TableSummary `json:"table"`
	Attach   *AttachInfo   `json:"attach"`
	Features []FeatureView `json:"features"`
}

// CurrentStatus reports state only - it never loads, attaches, or changes
// anything - so it's always safe to call, including on every frontend
// mount.
func (a *App) CurrentStatus() AppStatus {
	var status AppStatus

	if a.table != nil {
		summary := summarizeTable(a.tablePath)
		status.Table = &summary
		status.Features = a.Features()
	}

	if a.att != nil {
		status.Attach = &AttachInfo{
			Attached: true,
			PID:      a.att.pid,
			Platform: string(a.att.plat),
			GameName: a.table.Metadata.Name,
		}
	}

	return status
}

// AttachResult is Attach's return: the usual attach info, plus the names
// of any Save-mods feature that could not be reapplied - see
// applySavedMods for why one might fail (renamed, removed, no target for
// this platform, or a broken signature). Empty/nil Failed means either
// Save mods is off for this table, or everything it remembered came back
// up fine.
type AttachResult struct {
	Info   AttachInfo `json:"info"`
	Failed []string   `json:"failed"`
}

// Attach finds whichever platform the current table declares is actually
// running and attaches to it. If already attached, it returns the existing
// session's info instead of creating a second session - a second Attach
// would orphan the first session's undo closures without ever restoring
// them, leaving features hooked in the game but untracked here.
func (a *App) Attach() (AttachResult, error) {
	if a.table == nil {
		return AttachResult{}, fmt.Errorf("no table loaded")
	}
	if a.att != nil {
		info := AttachInfo{Attached: true, PID: a.att.pid, Platform: string(a.att.plat), GameName: a.table.Metadata.Name}
		return AttachResult{Info: info}, nil
	}

	plat, pid, err := engine.FindRunningPlatform(a.table.Metadata.Platforms)
	if err != nil {
		return AttachResult{}, err
	}

	maps, err := engine.ReadMaps(pid)
	if err != nil {
		return AttachResult{}, err
	}

	executable := a.table.Metadata.Platforms[plat].Executable
	base, err := engine.FindModuleBase(maps, executable)
	if err != nil {
		return AttachResult{}, err
	}

	imageSize, err := engine.ReadPEImageSize(pid, base)
	if err != nil {
		return AttachResult{}, err
	}

	a.att = &attached{
		session:   engine.NewSession(pid, maps),
		pid:       pid,
		plat:      plat,
		maps:      maps,
		base:      base,
		imageSize: imageSize,
	}

	a.recoverPersistedState()
	failed := a.applySavedMods()

	info := AttachInfo{Attached: true, PID: pid, Platform: string(plat), GameName: a.table.Metadata.Name}
	return AttachResult{Info: info, Failed: failed}, nil
}

// recoverPersistedState re-identifies features that were active in a
// previous ourmod process against this same still-running game process
// (a crash, or a dev-tooling restart, kills only ourmod - the game process
// itself never stopped, so anything it had injected is still physically
// there, just untracked by this fresh Session). It's a no-op, not an
// error, whenever there's nothing to recover: no state file, the game
// process has since restarted under a new PID (nothing survives that - the
// recorded addresses are meaningless), or a recorded feature's bytes don't
// match what was recorded (stale record from before an edit). Recover only
// ever reads memory, so a false read here can't corrupt anything.
func (a *App) recoverPersistedState() {
	st, ok := loadPersistedState(a.tablePath)
	if !ok || st.PID != a.att.pid {
		return
	}

	for name, pf := range st.Features {
		f, err := a.table.Find(name)
		if err != nil {
			continue
		}
		target, ok := f.Targets[a.att.plat]
		if !ok {
			continue
		}
		_, _ = a.att.session.Recover(f, target, uintptr(pf.Site), uintptr(pf.Cave))
	}

	a.persistState()
}

// persistState writes the current session's active-feature locations to
// disk (or clears the file if nothing's active / nothing's attached), so a
// future process can recover them via recoverPersistedState. Called after
// every change to what's active.
func (a *App) persistState() {
	if a.att == nil {
		savePersistedState(a.tablePath, persistedState{})
		return
	}

	snap := a.att.session.Snapshot()
	features := make(map[string]persistedFeature, len(snap))
	for name, e := range snap {
		features[strings.ToLower(name)] = persistedFeature{Site: uint64(e.Site), Cave: uint64(e.Cave)}
	}
	savePersistedState(a.tablePath, persistedState{PID: a.att.pid, Features: features})
}

// DetachAll restores every active feature and clears attach state.
func (a *App) DetachAll() error {
	if a.att == nil {
		return nil
	}
	err := a.att.session.DisableAll()
	a.att = nil
	savePersistedState(a.tablePath, persistedState{})
	return err
}

// EnableFeature resolves and enables a feature by name. If nothing is
// attached, it falls back to editing this table's Save-mods list directly
// (see setSavedModFeature) instead of failing outright - that only works
// if Save mods is actually on for this table, since there's no saved list
// to edit otherwise.
func (a *App) EnableFeature(name string) error {
	if a.att == nil {
		return a.setSavedModFeature(name, true)
	}

	f, err := a.table.Find(name)
	if err != nil {
		return err
	}

	target, ok := f.Targets[a.att.plat]
	if !ok {
		return fmt.Errorf("feature %q has no %s target", f.Name, a.att.plat)
	}

	site, err := engine.Resolve(a.att.pid, a.att.maps, a.att.base, a.att.imageSize, target.Signature)
	if err != nil {
		return err
	}

	if err := a.att.session.Enable(f, target, site); err != nil {
		return err
	}
	a.persistState()
	a.syncSavedMods()
	return nil
}

// DisableFeature restores a single active feature by name. If nothing is
// attached, it falls back to editing this table's Save-mods list directly,
// same as EnableFeature.
func (a *App) DisableFeature(name string) error {
	if a.att == nil {
		return a.setSavedModFeature(name, false)
	}
	if err := a.att.session.Disable(name); err != nil {
		return err
	}
	a.persistState()
	a.syncSavedMods()
	return nil
}

// SetFeatureValue live-updates an already-active feature's cave-local
// value (see cheats.HookData) - a slider's current position, or a value
// control's typed number. It never reinstalls the hook: the cave's address
// is fixed for as long as the feature stays active, so this is a plain
// write. Requires being attached and the feature already being active -
// unlike EnableFeature/DisableFeature, there's no not-attached fallback:
// there's nothing meaningful to "save" for a value that only has an effect
// while live (the Default in the table is what a fresh Enable starts
// from).
func (a *App) SetFeatureValue(name string, value float64) error {
	if a.att == nil {
		return fmt.Errorf("not attached")
	}
	return a.att.session.SetDataValue(name, value)
}

// setSavedModFeature adds or removes name from the current table's
// Save-mods list without touching any live session - this is what lets the
// CHEATS tab be edited before ever attaching. It only makes sense while
// Save mods is actually on for this table (there's no saved list to edit
// otherwise, so this errors rather than silently doing nothing - a
// disabled checkbox in the UI should mean this is never reached).
func (a *App) setSavedModFeature(name string, enabled bool) error {
	if a.tablePath == "" {
		return fmt.Errorf("no table loaded")
	}

	feat, err := a.table.Find(name)
	if err != nil {
		return err
	}

	f := loadSavedModsFile()
	features, on := f.Tables[a.tablePath]
	if !on {
		return fmt.Errorf("not attached, and Save mods is off for %q", a.table.Metadata.Name)
	}

	idx := -1
	for i, n := range features {
		if strings.EqualFold(n, feat.Name) {
			idx = i
			break
		}
	}

	switch {
	case enabled && idx == -1:
		features = append(features, feat.Name)
	case !enabled && idx != -1:
		features = append(features[:idx], features[idx+1:]...)
	}

	f.Tables[a.tablePath] = features
	saveSavedModsFile(f)
	return nil
}

// Features returns the current table's features, annotated with whether
// each is available on the attached platform and currently active. While
// attached, Active reflects the real session. While not attached, Active
// instead reflects the Save-mods list (if it's on for this table) - what
// WILL be turned on the moment you attach - so the CHEATS tab is
// meaningfully editable (via EnableFeature/DisableFeature's not-attached
// fallback) before ever attaching, not just a read-only preview.
func (a *App) Features() []FeatureView {
	if a.table == nil {
		return nil
	}

	active := make(map[string]bool)
	if a.att != nil {
		for _, n := range a.att.session.ActiveFeatures() {
			active[strings.ToLower(n)] = true
		}
	} else if a.tablePath != "" {
		if saved, on := loadSavedModsFile().Tables[a.tablePath]; on {
			for _, n := range saved {
				active[strings.ToLower(n)] = true
			}
		}
	}

	out := make([]FeatureView, 0, len(a.table.Features))
	for _, f := range a.table.Features {
		available := false
		if a.att != nil {
			_, available = f.Targets[a.att.plat]
		}

		out = append(out, FeatureView{
			Name:      f.Name,
			Category:  f.Category,
			Hotkey:    f.Hotkey,
			Stability: string(f.Stability),
			Note:      f.Note,
			Available: available,
			Active:    active[strings.ToLower(f.Name)],
			Control:   newControlView(f.Control),
		})
	}
	return out
}

// SavedMods is the current "Save mods" preference for the currently loaded
// table: whether it's on, and which features it will reapply on the next
// attach.
type SavedMods struct {
	Enabled  bool     `json:"enabled"`
	Features []string `json:"features"`
}

// GetSavedMods reports the currently loaded table's Save mods preference,
// from the shared all-games registry. Read-only - safe to call any time,
// including with nothing loaded.
func (a *App) GetSavedMods() SavedMods {
	if a.tablePath == "" {
		return SavedMods{}
	}
	features, enabled := loadSavedModsFile().Tables[a.tablePath]
	return SavedMods{Enabled: enabled, Features: features}
}

// SetSaveModsEnabled turns Save mods on or off for the currently loaded
// table, in the shared registry - each table is its own key, so this never
// touches another game's entry. Turning it on immediately snapshots
// whatever's active right now (if attached) as the remembered set,
// matching the toggle's own label - "remembers the cheats switched on
// now", not some future state. Turning it off deletes this table's entry
// outright: there's nothing left to "remember" once it's off, so nothing
// is left on disk to accidentally resurrect later.
func (a *App) SetSaveModsEnabled(enabled bool) error {
	if a.tablePath == "" {
		return fmt.Errorf("no table loaded")
	}

	f := loadSavedModsFile()

	if !enabled {
		delete(f.Tables, a.tablePath)
		saveSavedModsFile(f)
		return nil
	}

	features := []string{}
	if a.att != nil {
		features = a.att.session.ActiveFeatures()
	}
	f.Tables[a.tablePath] = features
	saveSavedModsFile(f)
	return nil
}

// syncSavedMods updates the remembered feature list for the current table
// to match what's actually active, if Save mods is on for it - called
// after a deliberate EnableFeature/DisableFeature, so the remembered set
// always matches "the cheats switched on now". It's deliberately NOT
// called from DetachAll or revertChangedActiveFeatures: those turn
// features off without the user asking to stop remembering them, and the
// whole point of Save mods is that detaching (or a table edit forcing a
// revert) doesn't erase what to reapply next time.
func (a *App) syncSavedMods() {
	if a.att == nil {
		return
	}

	f := loadSavedModsFile()
	if _, enabled := f.Tables[a.tablePath]; !enabled {
		return
	}
	f.Tables[a.tablePath] = a.att.session.ActiveFeatures()
	saveSavedModsFile(f)
}

// applySavedMods re-enables whatever Save mods remembers for the current
// table, if it's on - called once, right after a fresh Attach. Returns the
// names of any remembered feature that could NOT be reapplied - renamed or
// removed from the table, no target for this platform, or its signature
// failed to resolve - so the caller can tell the user about it instead of
// silently dropping it. A feature already active (e.g. recovered from a
// crash) counts as success, not failure.
func (a *App) applySavedMods() []string {
	names, enabled := loadSavedModsFile().Tables[a.tablePath]
	if !enabled {
		return nil
	}

	var failed []string
	for _, name := range names {
		if _, active := a.att.session.ActiveTarget(name); active {
			continue
		}

		f, err := a.table.Find(name)
		if err != nil {
			failed = append(failed, name)
			continue
		}
		target, ok := f.Targets[a.att.plat]
		if !ok {
			failed = append(failed, name)
			continue
		}
		site, err := engine.Resolve(a.att.pid, a.att.maps, a.att.base, a.att.imageSize, target.Signature)
		if err != nil {
			failed = append(failed, name)
			continue
		}
		if err := a.att.session.Enable(f, target, site); err != nil {
			failed = append(failed, name)
			continue
		}
	}

	a.persistState()
	return failed
}

// TableSource returns the raw YAML text of a table file, for the read-only
// Scripts view - "read the source" is one of this project's own stated
// guarantees (see the About view), so this just reads the file back as-is,
// no parsing or reformatting.
func (a *App) TableSource(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// BuildInfo is real, unremarkable diagnostic info for the Settings view.
type BuildInfo struct {
	GoVersion string `json:"goVersion"`
	OS        string `json:"os"`
	Arch      string `json:"arch"`
}

func (a *App) BuildInfo() BuildInfo {
	return BuildInfo{
		GoVersion: runtime.Version(),
		OS:        runtime.GOOS,
		Arch:      runtime.GOARCH,
	}
}
