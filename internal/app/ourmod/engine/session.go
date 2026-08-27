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
	undo    func() error
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
	var err error

	switch target.Type {
	case cheats.FeatureTypeHook:
		undo, err = EnableHook(s.pid, s.maps, site, target.Hook)
	case cheats.FeatureTypePatch:
		undo, err = EnablePatch(s.pid, s.maps, site, target.Patch)
	default:
		err = fmt.Errorf("unsupported target type %q", target.Type)
	}
	if err != nil {
		return fmt.Errorf("engine: enable %q: %w", feature.Name, err)
	}

	s.active[key] = &activeFeature{feature: feature, undo: undo}
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
