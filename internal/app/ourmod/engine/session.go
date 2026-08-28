package engine

import (
	"errors"
	"fmt"
	"strings"
	"sync"

	"github.com/Official-Husko/ourmod/pkg/cheats"
)

// Session tracks which features are currently applied against one attached
// process. It is a thin dispatcher over EnablePatch/EnableHook - it owns no
// ptrace/mmap logic of its own.
type Session struct {
	mu sync.Mutex

	pid  int
	maps []MemoryMap

	active map[string]*activeFeature // key: strings.ToLower(feature.Name)
}

type activeFeature struct {
	feature *cheats.Feature
	site    uintptr
	cave    uintptr // 0 for patch-type features - only a hook allocates one
	// hookData is target.Hook.Data if the active hook has a live-adjustable
	// cave value (e.g. a slider), nil otherwise - checked by SetDataValue.
	hookData *cheats.HookData
	undo     func() error
}

// SessionEntry is one active feature's installed location, exported via
// Snapshot for persisting to disk so a future process can re-identify it
// with Recover.
type SessionEntry struct {
	Site uintptr
	Cave uintptr
}

// NewSession creates a Session bound to one already-attached process.
func NewSession(pid int, maps []MemoryMap) *Session {
	return &Session{
		pid:    pid,
		maps:   maps,
		active: make(map[string]*activeFeature),
	}
}

// Enable applies target - already resolved to a live address (site) via
// Resolve - dispatching on target.Type. Fails if feature is already active:
// that's what stops a second call from allocating a second code cave.
func (s *Session) Enable(feature *cheats.Feature, target cheats.Target, site uintptr) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := strings.ToLower(feature.Name)
	if _, exists := s.active[key]; exists {
		return fmt.Errorf("engine: feature %q is already enabled", feature.Name)
	}

	var undo func() error
	var cave uintptr
	var err error
	var hookData *cheats.HookData

	switch target.Type {
	case cheats.FeatureTypeHook:
		hookData = target.Hook.Data
		dataValue := 0.0
		if hookData != nil && feature.Control.Default != nil {
			dataValue = *feature.Control.Default
		}
		undo, cave, err = EnableHook(s.pid, s.maps, site, target.Hook, dataValue)
	case cheats.FeatureTypePatch:
		undo, err = EnablePatch(s.pid, s.maps, site, target.Patch)
	default:
		err = fmt.Errorf("unsupported target type %q", target.Type)
	}
	if err != nil {
		return fmt.Errorf("engine: enable %q: %w", feature.Name, err)
	}

	s.active[key] = &activeFeature{feature: feature, site: site, cave: cave, hookData: hookData, undo: undo}
	return nil
}

// Recover checks whether feature's target is already installed at site
// (and cave, for a hook-type target) - true if an earlier process (this
// one restarted, or crashed) already applied it and nothing has touched it
// since. On confirmation it's registered as active exactly as Enable would
// have, without writing any memory - a false result just means "not
// active", not an error, and is safe to ignore. Like Enable, it refuses to
// clobber an already-active entry for the same feature.
func (s *Session) Recover(feature *cheats.Feature, target cheats.Target, site, cave uintptr) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := strings.ToLower(feature.Name)
	if _, exists := s.active[key]; exists {
		return false, nil
	}

	var undo func() error
	var confirmed bool
	var err error
	var hookData *cheats.HookData

	switch target.Type {
	case cheats.FeatureTypeHook:
		hookData = target.Hook.Data
		undo, confirmed, err = RecoverHook(s.pid, s.maps, site, target.Hook, cave)
	case cheats.FeatureTypePatch:
		undo, confirmed, err = RecoverPatch(s.pid, s.maps, site, target.Patch)
	default:
		return false, fmt.Errorf("unsupported target type %q", target.Type)
	}
	if err != nil || !confirmed {
		return false, err
	}

	s.active[key] = &activeFeature{feature: feature, site: site, cave: cave, hookData: hookData, undo: undo}
	return true, nil
}

// ActiveTarget returns the feature object captured when name was last
// enabled or recovered, if it's currently active - independent of whatever
// a table reload has since put in its place. Used to detect when a
// live-reloaded table's definition for an active feature no longer matches
// what's actually installed.
func (s *Session) ActiveTarget(name string) (*cheats.Feature, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	af, ok := s.active[strings.ToLower(name)]
	if !ok {
		return nil, false
	}
	return af.feature, true
}

// Snapshot returns the installed site/cave of every active feature, keyed
// by feature name, for persisting to disk so a future process can
// re-identify them with Recover.
func (s *Session) Snapshot() map[string]SessionEntry {
	s.mu.Lock()
	defer s.mu.Unlock()

	out := make(map[string]SessionEntry, len(s.active))
	for _, af := range s.active {
		out[af.feature.Name] = SessionEntry{Site: af.site, Cave: af.cave}
	}
	return out
}

// SetDataValue writes value into an active hook feature's cave-local data
// (see cheats.HookData), without reinstalling anything - the cave's
// address and layout are fixed for as long as the feature stays active, so
// this is just a plain write. Returns an error if the feature isn't
// active, or is active but has no such value (a toggle, a patch, or a hook
// with no Data).
func (s *Session) SetDataValue(name string, value float64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	af, ok := s.active[strings.ToLower(name)]
	if !ok {
		return fmt.Errorf("engine: feature %q is not active", name)
	}
	if af.hookData == nil {
		return fmt.Errorf("engine: feature %q has no live-adjustable value", name)
	}

	if err := WriteHookData(s.pid, af.cave, af.hookData, value); err != nil {
		return fmt.Errorf("engine: set %q: %w", name, err)
	}
	return nil
}

// Disable restores one active feature and removes it from the active set.
func (s *Session) Disable(name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := strings.ToLower(name)
	af, ok := s.active[key]
	if !ok {
		return fmt.Errorf("engine: feature %q is not active", name)
	}
	if err := af.undo(); err != nil {
		return fmt.Errorf("engine: restore %q: %w", name, err)
	}
	delete(s.active, key)
	return nil
}

// ActiveFeatures returns the names of all currently-enabled features, for
// diagnostics or a future UI's status list.
func (s *Session) ActiveFeatures() []string {
	s.mu.Lock()
	defer s.mu.Unlock()

	names := make([]string, 0, len(s.active))
	for _, af := range s.active {
		names = append(names, af.feature.Name)
	}
	return names
}

// DisableAll restores every active feature, best-effort: one failure doesn't
// stop it from attempting the rest. This is the path a signal handler calls.
func (s *Session) DisableAll() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	var errs []error
	for key, af := range s.active {
		if err := af.undo(); err != nil {
			errs = append(errs, fmt.Errorf("restore %q: %w", af.feature.Name, err))
			continue
		}
		delete(s.active, key)
	}
	return errors.Join(errs...)
}
