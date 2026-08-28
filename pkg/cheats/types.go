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
	// StabilityBroken means someone actually tried this feature and it did
	// not work - distinct from StabilityUntested (never tried) and
	// StabilityBreaksSaves (works, but corrupts saves).
	StabilityBroken Stability = "broken"
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

// ControlKind is how the player interacts with a feature in the UI -
// orthogonal to Type (which describes how the underlying bytes are
// applied: patch vs hook). Defaults to ControlToggle when Control is
// omitted, matching every feature's behavior before this field existed.
type ControlKind string

const (
	ControlToggle ControlKind = "toggle" // on/off checkbox (the default)
	ControlValue  ControlKind = "value"  // a number field + an "Activate" button (one-shot set)
	ControlSlider ControlKind = "slider" // a continuously adjustable number, dragged or typed
	ControlAction ControlKind = "action" // one or more named one-shot buttons (e.g. Save/Load)
)

// ControlSpec configures a non-toggle Control. Which fields are meaningful
// depends on Kind: Min/Max/Step/Default/Unit for ControlSlider (and
// optionally ControlValue), Actions for ControlAction. Unused fields are
// left zero.
type ControlSpec struct {
	Kind    ControlKind `yaml:"kind,omitempty"`
	Min     *float64    `yaml:"min,omitempty"`
	Max     *float64    `yaml:"max,omitempty"`
	Step    *float64    `yaml:"step,omitempty"`
	Default *float64    `yaml:"default,omitempty"`
	Unit    string      `yaml:"unit,omitempty"`    // cosmetic suffix, e.g. "%" or "x"
	Actions []string    `yaml:"actions,omitempty"` // e.g. ["Save", "Load"], only for ControlAction
}

// CheatTable is the top-level shape of a cheat table YAML file.
type CheatTable struct {
	Metadata Metadata  `yaml:"metadata"`
	Features []Feature `yaml:"features"`
}

// Metadata describes the game and cheat table itself.
type Metadata struct {
	// ID is optional in the YAML: LoadFile fills it in with a UUIDv5
	// derived from Name (see deriveTableID) whenever it's left unset, so a
	// table author never has to hand-generate one. Set it explicitly only
	// to pin a stable id across a future rename of Name.
	ID                 string                      `yaml:"id,omitempty"`
	Name               string                      `yaml:"name"`
	Version            string                      `yaml:"version"`
	Author             string                      `yaml:"author,omitempty"`
	Authors            []string                    `yaml:"authors,omitempty"`
	Description        string                      `yaml:"description,omitempty"`
	Platforms          map[Platform]PlatformBinary `yaml:"platforms"`
	CompatibleVersions []string                    `yaml:"compatibleVersions,omitempty"`

	// GameSource is purely informational - which storefront/launcher this
	// game is from ("steam", "gog", "epic", "manual", ...), shown as a
	// badge. It's free text, not a closed enum: a new storefront needs no
	// schema change, just a UI fallback for whatever it doesn't recognise.
	GameSource string `yaml:"gameSource,omitempty"`

	// SteamAppID, when set, is enough on its own to derive real Steam CDN
	// cover/hero art client-side (predictable URL shape keyed on app ID) -
	// no other field is required alongside it.
	SteamAppID string `yaml:"steamAppId,omitempty"`

	// LogoURL/HeroURL are direct image URLs, used when there's no
	// SteamAppID to derive art from (a non-Steam game) or to override what
	// it would derive.
	LogoURL string `yaml:"logoUrl,omitempty"`
	HeroURL string `yaml:"heroUrl,omitempty"`

	// SourceURL is where a hand-authored/custom table can be checked for
	// updates - e.g. a raw GitHub URL to this same file. Not wired to
	// anything yet (see SettingsView's "Check for table updates" toggle,
	// still honestly marked "coming soon" - no update-fetching code exists
	// yet either), but a table needs somewhere to declare this before that
	// feature can be built at all.
	SourceURL string `yaml:"sourceUrl,omitempty"`
}

// PlatformBinary names the on-disk executable for one binary/module format.
type PlatformBinary struct {
	Executable string `yaml:"executable"`
}

// Feature is a single toggleable cheat.
type Feature struct {
	Name      string    `yaml:"name"`
	Hotkey    string    `yaml:"hotkey,omitempty"`
	Category  string    `yaml:"category,omitempty"`
	Stability Stability `yaml:"stability"`
	// Note is player-facing: a short description of what the feature does,
	// or a quirk to be aware of (e.g. "disables achievements", "only works
	// in campaign"). It is shown directly in the UI - not the place for
	// reverse-engineering/provenance detail about the signature or hook.
	Note    string              `yaml:"note,omitempty"`
	Control ControlSpec         `yaml:"control,omitempty"`
	Targets map[Platform]Target `yaml:"targets"`
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

	// Data declares a mutable value living inside this hook's own code
	// cave - e.g. a FLiNG/Async-style hook body that lazily initializes a
	// cave-local speed multiplier the first time it runs, read back via a
	// RIP-relative reference within Body. Optional: most hooks have none.
	Data *HookData `yaml:"data,omitempty"`
}

// HookDataType is the on-the-wire encoding of a Hook.Data value.
type HookDataType string

const (
	HookDataFloat32 HookDataType = "float32"
	HookDataUint32  HookDataType = "uint32"
)

// HookDataSource is where a Hook.Data value's live content comes from.
// "control" is the only one implemented: the feature's own Control value
// (a slider's current position, or a value control's typed number).
type HookDataSource string

const (
	HookDataSourceControl HookDataSource = "control"
)

// HookData is one mutable value inside a hook's cave. Offset is relative
// to the cave's own base address (byte 0, same as Body) - not to Body's
// end or to Overwrite - matching how a disassembler reports a RIP-relative
// reference back into the cave. The engine writes this value once when the
// feature is enabled (using the feature's Control.Default) and again
// whenever the control's live value changes while the feature stays
// active - it never reinstalls the hook to do so, since the value's
// address is fixed for the lifetime of the cave.
type HookData struct {
	Offset uint32         `yaml:"offset"`
	Type   HookDataType   `yaml:"type"`
	Source HookDataSource `yaml:"source"`
}
