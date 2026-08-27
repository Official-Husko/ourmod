// Package ui is the Fyne desktop UI: pick a cheat table, attach to whichever
// platform it declares is actually running, and toggle features by
// checkbox. It adds no engine logic of its own - every action here is a
// thin call into pkg/cheats and internal/app/ourmod/engine, the same code
// path cmd/ourmod-cli already exercises from the command line.
package ui

import (
	"image/color"
	"os"
	"os/signal"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"syscall"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"

	"github.com/Official-Husko/ourmod/internal/app/ourmod/engine"
	"github.com/Official-Husko/ourmod/pkg/cheats"
)

// attached holds everything resolved once at attach time and reused to
// enable each feature as its checkbox is toggled.
type attached struct {
	session   *engine.Session
	pid       int
	plat      cheats.Platform
	maps      []engine.MemoryMap
	base      uintptr
	imageSize uintptr
}

type appState struct {
	win      fyne.Window
	table    *cheats.CheatTable
	att      *attached
	status   *widget.Label
	features *fyne.Container // rebuilt each time a table loads
}

// Run builds and shows the main window, blocking until it's closed.
func Run() {
	a := app.New()
	a.Settings().SetTheme(&ourmodTheme{})
	w := a.NewWindow("OurMod")
	w.Resize(fyne.NewSize(760, 560))

	st := &appState{win: w, status: widget.NewLabel("not attached")}

	tableSelect := widget.NewSelect(nil, nil)
	attachBtn := widget.NewButton("Attach", nil)
	detachBtn := widget.NewButton("Detach / Restore All", nil)
	detachBtn.Disable()

	st.features = container.NewVBox()
	featureScroll := container.NewVScroll(st.features)

	tablePaths := discoverTables()
	tableNames := make([]string, len(tablePaths))
	for i, p := range tablePaths {
		tableNames[i] = filepath.Base(p)
	}
	tableSelect.Options = tableNames

	loadTable := func(path string) {
		detachAll(st)
		attachBtn.Disable()

		table, err := cheats.LoadFile(path)
		if err != nil {
			dialog.ShowError(err, w)
			st.table = nil
			st.features.Objects = nil
			st.features.Refresh()
			return
		}

		st.table = table
		st.status.SetText("loaded " + table.Metadata.Name + " - not attached")
		rebuildFeatureList(st)
		attachBtn.Enable()
	}

	tableSelect.OnChanged = func(name string) {
		for i, n := range tableNames {
			if n == name {
				loadTable(tablePaths[i])
				return
			}
		}
	}

	attachBtn.OnTapped = func() {
		if st.table == nil {
			return
		}

		plat, pid, err := engine.FindRunningPlatform(st.table.Metadata.Platforms)
		if err != nil {
			dialog.ShowError(err, w)
			return
		}

		maps, err := engine.ReadMaps(pid)
		if err != nil {
			dialog.ShowError(err, w)
			return
		}

		executable := st.table.Metadata.Platforms[plat].Executable
		base, err := engine.FindModuleBase(maps, executable)
		if err != nil {
			dialog.ShowError(err, w)
			return
		}

		imageSize, err := engine.ReadPEImageSize(pid, base)
		if err != nil {
			dialog.ShowError(err, w)
			return
		}

		st.att = &attached{
			session:   engine.NewSession(pid, maps),
			pid:       pid,
			plat:      plat,
			maps:      maps,
			base:      base,
			imageSize: imageSize,
		}

		st.status.SetText("attached: " + st.table.Metadata.Name + " (PID " + strconv.Itoa(pid) + ", " + string(plat) + ")")
		detachBtn.Enable()
		rebuildFeatureList(st)
	}

	detachBtn.OnTapped = func() { detachAll(st); detachBtn.Disable() }

	top := container.NewBorder(nil, nil, widget.NewLabel("Table:"), attachBtn, tableSelect)
	bottom := container.NewVBox(detachBtn, st.status)

	w.SetContent(container.NewBorder(top, bottom, nil, nil, featureScroll))

	// Restore every active feature on window close or SIGINT/SIGTERM, the
	// same guarantee cmd/ourmod-cli already gives on Ctrl+C.
	cleanup := func() { detachAll(st) }
	w.SetCloseIntercept(func() { cleanup(); w.Close() })

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		cleanup()
		a.Quit()
	}()

	if len(tablePaths) > 0 {
		tableSelect.SetSelected(tableNames[0])
	}

	w.ShowAndRun()
}

func detachAll(st *appState) {
	if st.att == nil {
		return
	}
	if err := st.att.session.DisableAll(); err != nil {
		dialog.ShowError(err, st.win)
	}
	st.att = nil
	st.status.SetText("not attached")
	if st.table != nil {
		rebuildFeatureList(st)
	}
}

// rebuildFeatureList redraws the feature checklist, grouped by category, for
// the currently loaded table.
func rebuildFeatureList(st *appState) {
	st.features.Objects = nil

	if st.table == nil {
		st.features.Refresh()
		return
	}

	byCategory := map[string][]*cheats.Feature{}
	for i := range st.table.Features {
		f := &st.table.Features[i]
		byCategory[f.Category] = append(byCategory[f.Category], f)
	}
	categories := make([]string, 0, len(byCategory))
	for c := range byCategory {
		categories = append(categories, c)
	}
	sort.Strings(categories)

	for _, cat := range categories {
		st.features.Add(categoryHeader(cat))
		for _, f := range byCategory[cat] {
			st.features.Add(featureRow(st, f))
		}
	}

	st.features.Refresh()
}

func categoryHeader(cat string) fyne.CanvasObject {
	label := widget.NewLabelWithStyle(strings.ToUpper(cat), fyne.TextAlignLeading, fyne.TextStyle{Bold: true, Monospace: true})
	label.Importance = widget.SuccessImportance
	return container.NewPadded(label)
}

func featureRow(st *appState, f *cheats.Feature) fyne.CanvasObject {
	check := widget.NewCheck(f.Name, nil)
	stability := stabilityLabel(f.Stability)
	hotkey := hotkeyBadge(f.Hotkey)

	attachedNow := st.att != nil
	if !attachedNow {
		check.Disable()
	} else if _, ok := f.Targets[st.att.plat]; !ok {
		check.Disable()
	} else {
		check.SetChecked(st.att.session != nil && isActive(st.att.session, f.Name))
	}

	suppress := false
	check.OnChanged = func(checked bool) {
		if suppress || st.att == nil {
			return
		}

		if checked {
			if err := enableFeature(st, f); err != nil {
				dialog.ShowError(err, st.win)
				suppress = true
				check.SetChecked(false)
				suppress = false
			}
		} else {
			if err := st.att.session.Disable(f.Name); err != nil {
				dialog.ShowError(err, st.win)
			}
		}
	}

	row := container.NewBorder(nil, nil, nil, container.NewHBox(stability, hotkey), check)

	border := canvas.NewRectangle(color.Transparent)
	border.StrokeColor = colorBorder
	border.StrokeWidth = 1
	return container.NewStack(border, container.NewPadded(row))
}

// hotkeyBadge renders a hotkey (or "unbound") inside a thin bordered box,
// echoing the mockup's bordered "F1"-style hotkey tags.
func hotkeyBadge(hotkey string) fyne.CanvasObject {
	text := hotkey
	if text == "" {
		text = "unbound"
	}

	label := widget.NewLabel(text)

	badge := canvas.NewRectangle(color.Transparent)
	badge.StrokeColor = colorAccent
	badge.StrokeWidth = 1
	return container.NewStack(badge, container.NewPadded(label))
}

func enableFeature(st *appState, f *cheats.Feature) error {
	target := f.Targets[st.att.plat]

	site, err := engine.Resolve(st.att.pid, st.att.maps, st.att.base, st.att.imageSize, target.Signature)
	if err != nil {
		return err
	}

	return st.att.session.Enable(f, target, site)
}

func isActive(s *engine.Session, name string) bool {
	for _, n := range s.ActiveFeatures() {
		if n == name {
			return true
		}
	}
	return false
}

func stabilityLabel(s cheats.Stability) *widget.Label {
	l := widget.NewLabel(string(s))
	switch s {
	case cheats.StabilityWorking:
		l.Importance = widget.SuccessImportance
	case cheats.StabilityUntested:
		l.Importance = widget.WarningImportance
	case cheats.StabilityBreaksSaves:
		l.Importance = widget.DangerImportance
	}
	return l
}

func discoverTables() []string {
	matches, _ := filepath.Glob("tables/*.yml")
	return matches
}
