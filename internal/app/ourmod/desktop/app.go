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
	"runtime"
	"strings"

	"github.com/Official-Husko/ourmod/internal/app/ourmod/engine"
	"github.com/Official-Husko/ourmod/pkg/cheats"
)

// TableSummary is a row in the table picker, and the source for the
// Library/Trainers tab's listing - Checksum and FeatureCount are real
// (sha256 of the file, actual parsed feature count), not placeholders.
type TableSummary struct {
	Path         string `json:"path"`
	Name         string `json:"name"`
	Checksum     string `json:"checksum"`
	FeatureCount int    `json:"featureCount"`
	Author       string `json:"author"`
}

// FeatureView is the JSON-friendly projection of a cheats.Feature the
// frontend actually needs - never the raw signature/patch/hook bytes.
type FeatureView struct {
	Name      string `json:"name"`
	Category  string `json:"category"`
	Hotkey    string `json:"hotkey"`
	Stability string `json:"stability"`
	Note      string `json:"note"`
	Available bool   `json:"available"` // has a target for the attached platform
	Active    bool   `json:"active"`
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
	ctx   context.Context
	table *cheats.CheatTable
	att   *attached
}

func NewApp() *App {
	return &App{}
}

// Startup is a Wails lifecycle hook (options.App.OnStartup).
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
}

// Shutdown is a Wails lifecycle hook (options.App.OnShutdown): restore
// every active feature before the app closes, the same guarantee
// cmd/ourmod-cli gives on Ctrl+C.
func (a *App) Shutdown(context.Context) {
	_ = a.DetachAll()
}

// ListTables returns every cheat table found under tables/.
func (a *App) ListTables() []TableSummary {
	matches, _ := filepath.Glob("tables/*.yml")

	out := make([]TableSummary, 0, len(matches))
	for _, path := range matches {
		summary := TableSummary{Path: path, Name: filepath.Base(path)}

		if t, err := cheats.LoadFile(path); err == nil {
			summary.Name = t.Metadata.Name
			summary.FeatureCount = len(t.Features)
			summary.Author = t.Metadata.Author
			if summary.Author == "" && len(t.Metadata.Authors) > 0 {
				summary.Author = strings.Join(t.Metadata.Authors, ", ")
			}
		}

		if data, err := os.ReadFile(path); err == nil {
			sum := sha256.Sum256(data)
			summary.Checksum = hex.EncodeToString(sum[:])
		}

		out = append(out, summary)
	}
	return out
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
	return a.Features(), nil
}

// Attach finds whichever platform the current table declares is actually
// running and attaches to it.
func (a *App) Attach() (AttachInfo, error) {
	if a.table == nil {
		return AttachInfo{}, fmt.Errorf("no table loaded")
	}

	plat, pid, err := engine.FindRunningPlatform(a.table.Metadata.Platforms)
	if err != nil {
		return AttachInfo{}, err
	}

	maps, err := engine.ReadMaps(pid)
	if err != nil {
		return AttachInfo{}, err
	}

	executable := a.table.Metadata.Platforms[plat].Executable
	base, err := engine.FindModuleBase(maps, executable)
	if err != nil {
		return AttachInfo{}, err
	}

	imageSize, err := engine.ReadPEImageSize(pid, base)
	if err != nil {
		return AttachInfo{}, err
	}

	a.att = &attached{
		session:   engine.NewSession(pid, maps),
		pid:       pid,
		plat:      plat,
		maps:      maps,
		base:      base,
		imageSize: imageSize,
	}

	return AttachInfo{Attached: true, PID: pid, Platform: string(plat), GameName: a.table.Metadata.Name}, nil
}

// DetachAll restores every active feature and clears attach state.
func (a *App) DetachAll() error {
	if a.att == nil {
		return nil
	}
	err := a.att.session.DisableAll()
	a.att = nil
	return err
}

// EnableFeature resolves and enables a feature by name.
func (a *App) EnableFeature(name string) error {
	if a.att == nil {
		return fmt.Errorf("not attached")
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

	return a.att.session.Enable(f, target, site)
}

// DisableFeature restores a single active feature by name.
func (a *App) DisableFeature(name string) error {
	if a.att == nil {
		return fmt.Errorf("not attached")
	}
	return a.att.session.Disable(name)
}

// Features returns the current table's features, annotated with whether
// each is available on the attached platform and currently active.
func (a *App) Features() []FeatureView {
	if a.table == nil {
		return nil
	}

	var active map[string]bool
	if a.att != nil {
		active = make(map[string]bool)
		for _, n := range a.att.session.ActiveFeatures() {
			active[strings.ToLower(n)] = true
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
		})
	}
	return out
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
