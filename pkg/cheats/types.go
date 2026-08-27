// Package cheats defines the data-driven cheat table format: the YAML schema
// consumed to describe a game's features, how to locate them in memory, and
// how to apply them (a code patch or a code-cave hook).
package cheats

// Stability describes how reliable a feature's signature/patch/hook data is
// believed to be.
type Stability string

const (
	StabilityWorking     Stability = "working"
	StabilityUntested    Stability = "untested"
	StabilityBreaksSaves Stability = "breaks-saves"
)

// Platform is the binary/module format axis: "windows" (PE - native or under
// Wine/Proton, byte-identical either way) and "linux" (ELF - a genuinely
// separate native build with its own compiler output). There is no "wine"
// key: Wine loads the real unmodified Windows PE binary, so "windows" covers
// both. Platforms/Targets are maps so a future key (e.g. "macos") needs no
// struct change.
type Platform string

const (
	PlatformWindows Platform = "windows"
	PlatformLinux   Platform = "linux"
)

// FeatureType is the explicit discriminator for how a Target's resolved
// site is applied. It must agree with which of Patch/Hook is set (checked
// by Validate) - Patch/Hook remain the source of truth for *how* to apply
// the target; Type exists so a table author's intent is explicit and
// machine-checkable, and so an unimplemented mechanism fails with a clear
// message instead of a confusing schema error or silent misparse.
//
// Do not confuse this with Hook.Type ("abs64"), which names the hook's
// byte-encoding scheme, not the feature mechanism.
type FeatureType string

const (
	FeatureTypePatch FeatureType = "patch"
	FeatureTypeHook  FeatureType = "hook"

	// FeatureTypeFreeze and FeatureTypePointer are reserved for future
	// mechanisms (continuously re-writing a value every tick; walking a
	// pointer chain for ASLR'd/heap-relative addresses) with zero
	// reverse-engineered example and zero engine support today. They parse
	// so "type: freeze" gets a clear Validate error ("reserved but not
	// implemented yet") instead of an unhelpful type error. No Freeze/
	// Pointer Go structs or engine code exist yet.
	FeatureTypeFreeze  FeatureType = "freeze"
	FeatureTypePointer FeatureType = "pointer"
)

// CheatTable is the top-level shape of a cheat table YAML file.
type CheatTable struct {
	Metadata Metadata  `yaml:"metadata"`
	Features []Feature `yaml:"features"`
}

// Metadata describes the game and cheat table itself.
type Metadata struct {
	ID                 string                      `yaml:"id"`
	Name               string                      `yaml:"name"`
	Version            string                      `yaml:"version"`
	Author             string                      `yaml:"author,omitempty"`
	Authors            []string                    `yaml:"authors,omitempty"`
	Description        string                      `yaml:"description,omitempty"`
	Platforms          map[Platform]PlatformBinary `yaml:"platforms"`
	CompatibleVersions []string                    `yaml:"compatibleVersions,omitempty"`
}

// PlatformBinary names the on-disk executable for one binary/module format.
type PlatformBinary struct {
	Executable string `yaml:"executable"`
}

// Feature is a single toggleable cheat.
type Feature struct {
	Name      string              `yaml:"name"`
	Hotkey    string              `yaml:"hotkey,omitempty"`
	Category  string              `yaml:"category,omitempty"`
	Stability Stability           `yaml:"stability"`
	Note      string              `yaml:"note,omitempty"`
	Targets   map[Platform]Target `yaml:"targets"`
}

// Target is one platform's resolution+action pair. Type declares which
// mechanism applies the feature; exactly one of Patch or Hook must be set
// to match it (enforced by Validate, not the type system): Patch is a
// simple byte-swap toggle (e.g. NOP-ing an instruction), Hook redirects
// execution into an injected code cave. Both resolve their site the same
// way, via Signature.
type Target struct {
	Type      FeatureType `yaml:"type"`
	Signature Signature   `yaml:"signature"`
	Patch     *Patch      `yaml:"patch,omitempty"`
	Hook      *Hook       `yaml:"hook,omitempty"`
}

// Signature locates a site via an AOB (array-of-bytes) scan: find Pattern
// (space-separated hex byte tokens, "??" as a wildcard byte) in the target
// module, then add Offset to the match address.
type Signature struct {
	Pattern string `yaml:"pattern"`
	Offset  int64  `yaml:"offset"`
}

// Patch swaps Original bytes (verified present before writing) for Enabled
// bytes (same length) to toggle the feature on; reversed to disable it.
type Patch struct {
	Original string `yaml:"original"`
	Enabled  string `yaml:"enabled"`
}

// Hook overwrites Overwrite bytes at the target (which must match Original)
// with a jump into a generated code cave containing Body followed by a jump
// back. Only Type "abs64" is currently supported - matches what the engine
// implements; adding another hook type means updating the validator and the
// engine together.
type Hook struct {
	Type      string `yaml:"type"`
	Overwrite int    `yaml:"overwrite"`
	Original  string `yaml:"original"`
	Body      string `yaml:"body"`
}
