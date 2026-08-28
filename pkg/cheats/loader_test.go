package cheats

import (
	"strings"
	"testing"
)

func TestLoadFile_SE5(t *testing.T) {
	table, err := LoadFile("../../tables/sniper-elite-5.yml")
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}

	t.Run("metadata basics", func(t *testing.T) {
		if table.Metadata.Name != "Sniper Elite 5" {
			t.Errorf("Name = %q", table.Metadata.Name)
		}

		win, ok := table.Metadata.Platforms[PlatformWindows]
		if !ok || win.Executable != "Sniper5_vulkan.exe" {
			t.Errorf("windows platform = %+v, ok=%v", win, ok)
		}
	})

	t.Run("Immortality is a working hook feature", func(t *testing.T) {
		f, err := table.Find("Immortality")
		if err != nil {
			t.Fatal(err)
		}
		if f.Stability != StabilityWorking {
			t.Errorf("stability = %q", f.Stability)
		}

		tgt, ok := f.Targets[PlatformWindows]
		if !ok || tgt.Hook == nil {
			t.Fatalf("windows target missing hook: %+v (ok=%v)", tgt, ok)
		}
		if tgt.Type != FeatureTypeHook {
			t.Errorf("type = %q, want %q", tgt.Type, FeatureTypeHook)
		}
		if tgt.Patch != nil {
			t.Error("hook target should not also have a patch")
		}

		h := tgt.Hook
		if h.Type != "abs64" {
			t.Errorf("hook.type = %q", h.Type)
		}
		if h.Overwrite != 15 {
			t.Errorf("hook.overwrite = %d", h.Overwrite)
		}
		if got := len(strings.Fields(h.Original)); got != h.Overwrite {
			t.Errorf("hook.original has %d bytes, want %d", got, h.Overwrite)
		}
		if len(strings.Fields(h.Body)) == 0 {
			t.Error("hook.body must not be empty")
		}
	})

	t.Run("No Reload is an untested hook feature", func(t *testing.T) {
		f, err := table.Find("no reload") // case-insensitive lookup
		if err != nil {
			t.Fatal(err)
		}
		if f.Stability != StabilityUntested {
			t.Errorf("stability = %q", f.Stability)
		}

		tgt, ok := f.Targets[PlatformWindows]
		if !ok || tgt.Hook == nil {
			t.Fatalf("windows target missing hook: %+v (ok=%v)", tgt, ok)
		}
		if tgt.Type != FeatureTypeHook {
			t.Errorf("type = %q, want %q", tgt.Type, FeatureTypeHook)
		}
		if tgt.Patch != nil {
			t.Error("hook target should not also have a patch")
		}

		if got := len(strings.Fields(tgt.Hook.Original)); got != tgt.Hook.Overwrite {
			t.Errorf("hook.original has %d bytes, want %d", got, tgt.Hook.Overwrite)
		}
	})

	t.Run("unknown feature errors", func(t *testing.T) {
		if _, err := table.Find("does not exist"); err == nil {
			t.Error("expected error for unknown feature")
		}
	})
}

func TestValidate_AllStabilityValues(t *testing.T) {
	baseMeta := Metadata{
		ID:      "test",
		Name:    "Test Game",
		Version: "1.0.0",
		Platforms: map[Platform]PlatformBinary{
			PlatformWindows: {Executable: "test.exe"},
		},
	}
	target := Target{
		Type:      FeatureTypePatch,
		Signature: Signature{Pattern: "AA BB", Offset: 0},
		Patch:     &Patch{Original: "AA", Enabled: "90"},
	}

	for _, s := range []Stability{StabilityWorking, StabilityUntested, StabilityBreaksSaves, StabilityBroken} {
		t.Run(string(s), func(t *testing.T) {
			table := CheatTable{
				Metadata: baseMeta,
				Features: []Feature{{
					Name:      "Test Feature",
					Stability: s,
					Targets:   map[Platform]Target{PlatformWindows: target},
				}},
			}
			if err := table.Validate(); err != nil {
				t.Errorf("Validate() = %v, want nil", err)
			}
		})
	}
}

func TestValidate_TypeConsistency(t *testing.T) {
	baseMeta := Metadata{
		ID:      "test",
		Name:    "Test Game",
		Version: "1.0.0",
		Platforms: map[Platform]PlatformBinary{
			PlatformWindows: {Executable: "test.exe"},
		},
	}

	sig := Signature{Pattern: "AA BB", Offset: 0}
	patch := &Patch{Original: "AA", Enabled: "90"}
	hook := &Hook{Type: "abs64", Overwrite: 14, Original: "AA BB CC DD EE FF 00 11 22 33 44 55 66 77", Body: "90"}

	tests := []struct {
		name      string
		target    Target
		wantError string
	}{
		{
			name:      "type omitted",
			target:    Target{Signature: sig, Patch: patch},
			wantError: "type is required",
		},
		{
			name:      "hook type with only patch set",
			target:    Target{Type: FeatureTypeHook, Signature: sig, Patch: patch},
			wantError: "hook is not set",
		},
		{
			name:      "patch type with both set",
			target:    Target{Type: FeatureTypePatch, Signature: sig, Patch: patch, Hook: hook},
			wantError: "hook is also set",
		},
		{
			name:      "freeze type reserved",
			target:    Target{Type: FeatureTypeFreeze, Signature: sig},
			wantError: "not implemented",
		},
		{
			name:      "pointer type reserved",
			target:    Target{Type: FeatureTypePointer, Signature: sig},
			wantError: "not implemented",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			table := CheatTable{
				Metadata: baseMeta,
				Features: []Feature{{
					Name:      "Test Feature",
					Stability: StabilityWorking,
					Targets:   map[Platform]Target{PlatformWindows: tc.target},
				}},
			}

			err := table.Validate()
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tc.wantError)
			}
			if !strings.Contains(err.Error(), tc.wantError) {
				t.Errorf("error = %q, want it to contain %q", err.Error(), tc.wantError)
			}
		})
	}
}
