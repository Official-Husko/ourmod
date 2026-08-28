package cheats

import (
	"errors"
	"fmt"
	"os"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"gopkg.in/yaml.v3"
)

var (
	patternToken = regexp.MustCompile(`^([0-9A-Fa-f]{2}|\?\?)$`)
	byteToken    = regexp.MustCompile(`^[0-9A-Fa-f]{2}$`)
)

const minAbs64Overwrite = 14

// namespaceTableID is a fixed, arbitrary namespace UUID used to derive a
// table's id from its game name when metadata.id is left unset (see
// deriveTableID). Fixed so the same name always derives the same id, on
// any machine, forever - that's the entire point of a namespaced UUID
// (RFC 4122 §4.3): not a secret, just a constant.
var namespaceTableID = uuid.MustParse("13a1a7f1-5706-4666-b648-21229ce763ef")

// deriveTableID computes a deterministic UUIDv5 from a game name, used to
// fill in metadata.id when a table author leaves it unset - one less
// field to hand-generate, and it's automatically stable across edits to
// everything else in the file (renaming the game itself would still
// change it, same as manually regenerating one would).
func deriveTableID(gameName string) string {
	return uuid.NewSHA1(namespaceTableID, []byte(gameName)).String()
}

// LoadFile reads and validates a cheat table YAML file.
func LoadFile(path string) (*CheatTable, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("cheats: read %s: %w", path, err)
	}
	return Parse(data, path)
}

// Parse validates and returns a cheat table from raw YAML bytes - the core
// LoadFile builds on, also usable directly on data that didn't come from a
// local file (e.g. one just downloaded from a remote table registry).
// source is used only to label error messages (a path or a URL).
func Parse(data []byte, source string) (*CheatTable, error) {
	var t CheatTable
	if err := yaml.Unmarshal(data, &t); err != nil {
		return nil, fmt.Errorf("cheats: parse %s: %w", source, err)
	}

	if t.Metadata.ID == "" && t.Metadata.Name != "" {
		t.Metadata.ID = deriveTableID(t.Metadata.Name)
	}

	if err := t.Validate(); err != nil {
		return nil, fmt.Errorf("cheats: validate %s: %w", source, err)
	}

	return &t, nil
}

// Find looks up a feature by name, case-insensitively.
func (t *CheatTable) Find(name string) (*Feature, error) {
	for i := range t.Features {
		if strings.EqualFold(t.Features[i].Name, name) {
			return &t.Features[i], nil
		}
	}

	return nil, fmt.Errorf("cheats: feature %q not found", name)
}

// Validate checks structural/content rules that yaml.Unmarshal alone can't enforce.
func (t *CheatTable) Validate() error {
	var errs []error

	if t.Metadata.ID == "" {
		errs = append(errs, errors.New("metadata.id is required"))
	}
	if t.Metadata.Name == "" {
		errs = append(errs, errors.New("metadata.name is required"))
	}
	if t.Metadata.Version == "" {
		errs = append(errs, errors.New("metadata.version is required"))
	}
	if len(t.Metadata.Platforms) == 0 {
		errs = append(errs, errors.New("metadata.platforms: at least one platform is required"))
	}
	for key, p := range t.Metadata.Platforms {
		if p.Executable == "" {
			errs = append(errs, fmt.Errorf("metadata.platforms[%s].executable is required", key))
		}
	}

	if len(t.Features) == 0 {
		errs = append(errs, errors.New("features: at least one feature is required"))
	}
	for i, f := range t.Features {
		errs = append(errs, validateFeature(i, f)...)
	}

	return errors.Join(errs...)
}

func validateFeature(i int, f Feature) []error {
	var errs []error

	if f.Name == "" {
		errs = append(errs, fmt.Errorf("features[%d].name is required", i))
	}

	switch f.Stability {
	case StabilityWorking, StabilityUntested, StabilityBreaksSaves, StabilityBroken, StabilityExperimental:
	default:
		errs = append(errs, fmt.Errorf("features[%d] (%s): invalid stability %q", i, f.Name, f.Stability))
	}

	errs = append(errs, validateControl(f.Name, f.Control)...)

	if len(f.Targets) == 0 {
		errs = append(errs, fmt.Errorf("features[%d] (%s): at least one platform target is required", i, f.Name))
	}
	for plat, tgt := range f.Targets {
		errs = append(errs, validateTarget(f.Name, plat, tgt, f.Control)...)
	}

	return errs
}

func validateControl(feature string, c ControlSpec) []error {
	var errs []error

	switch c.Kind {
	case "", ControlToggle, ControlValue:
	case ControlSlider:
		if c.Min == nil || c.Max == nil {
			errs = append(errs, fmt.Errorf("%s: control.kind \"slider\" requires min and max", feature))
		} else if *c.Max <= *c.Min {
			errs = append(errs, fmt.Errorf("%s: control.max (%v) must be greater than control.min (%v)", feature, *c.Max, *c.Min))
		}
	case ControlAction:
		if len(c.Actions) == 0 {
			errs = append(errs, fmt.Errorf("%s: control.kind \"action\" requires at least one entry in control.actions", feature))
		}
	default:
		errs = append(errs, fmt.Errorf("%s: control.kind: unknown %q", feature, c.Kind))
	}

	return errs
}

func validateTarget(feature string, plat Platform, tgt Target, control ControlSpec) []error {
	var errs []error

	if _, err := validatePatternTokens(tgt.Signature.Pattern); err != nil {
		errs = append(errs, fmt.Errorf("%s/%s: signature.pattern: %w", feature, plat, err))
	}

	switch tgt.Type {
	case FeatureTypePatch:
		if tgt.Patch == nil {
			errs = append(errs, fmt.Errorf("%s/%s: type is \"patch\" but patch is not set", feature, plat))
		}
		if tgt.Hook != nil {
			errs = append(errs, fmt.Errorf("%s/%s: type is \"patch\" but hook is also set", feature, plat))
		}
		if tgt.Patch != nil {
			errs = append(errs, validatePatch(feature, plat, tgt.Patch)...)
		}
	case FeatureTypeHook:
		if tgt.Hook == nil {
			errs = append(errs, fmt.Errorf("%s/%s: type is \"hook\" but hook is not set", feature, plat))
		}
		if tgt.Patch != nil {
			errs = append(errs, fmt.Errorf("%s/%s: type is \"hook\" but patch is also set", feature, plat))
		}
		if tgt.Hook != nil {
			errs = append(errs, validateHook(feature, plat, tgt.Hook, control)...)
		}
	case FeatureTypeFreeze, FeatureTypePointer:
		errs = append(errs, fmt.Errorf("%s/%s: type %q is reserved but not implemented yet", feature, plat, tgt.Type))
	case "":
		errs = append(errs, fmt.Errorf("%s/%s: type is required", feature, plat))
	default:
		errs = append(errs, fmt.Errorf("%s/%s: unknown type %q", feature, plat, tgt.Type))
	}

	return errs
}

func validatePatch(feature string, plat Platform, p *Patch) []error {
	var errs []error

	orig, err := validateByteTokens(p.Original)
	if err != nil {
		errs = append(errs, fmt.Errorf("%s/%s: patch.original: %w", feature, plat, err))
	}

	enabled, err := validateByteTokens(p.Enabled)
	if err != nil {
		errs = append(errs, fmt.Errorf("%s/%s: patch.enabled: %w", feature, plat, err))
	}

	if len(orig) != len(enabled) {
		errs = append(errs, fmt.Errorf(
			"%s/%s: patch.original and patch.enabled must be the same byte length (%d != %d)",
			feature, plat, len(orig), len(enabled)))
	}

	return errs
}

func validateHook(feature string, plat Platform, h *Hook, control ControlSpec) []error {
	var errs []error

	if h.Type != "abs64" {
		errs = append(errs, fmt.Errorf("%s/%s: hook.type: unsupported %q (only \"abs64\" is supported)", feature, plat, h.Type))
	}

	if h.Overwrite < minAbs64Overwrite {
		errs = append(errs, fmt.Errorf("%s/%s: hook.overwrite must be at least %d, got %d", feature, plat, minAbs64Overwrite, h.Overwrite))
	}

	orig, err := validateByteTokens(h.Original)
	if err != nil {
		errs = append(errs, fmt.Errorf("%s/%s: hook.original: %w", feature, plat, err))
	} else if len(orig) != h.Overwrite {
		errs = append(errs, fmt.Errorf("%s/%s: hook.original length %d != hook.overwrite %d", feature, plat, len(orig), h.Overwrite))
	}

	if _, err := validateByteTokens(h.Body); err != nil {
		errs = append(errs, fmt.Errorf("%s/%s: hook.body: %w", feature, plat, err))
	}

	if h.Data != nil {
		switch h.Data.Type {
		case HookDataFloat32, HookDataUint32:
		default:
			errs = append(errs, fmt.Errorf("%s/%s: hook.data.type: unsupported %q (want \"float32\" or \"uint32\")", feature, plat, h.Data.Type))
		}

		switch h.Data.Source {
		case HookDataSourceControl:
			if control.Kind != ControlValue && control.Kind != ControlSlider {
				errs = append(errs, fmt.Errorf("%s/%s: hook.data.source is \"control\" but control.kind is %q (want \"value\" or \"slider\")", feature, plat, control.Kind))
			}
		default:
			errs = append(errs, fmt.Errorf("%s/%s: hook.data.source: unsupported %q (only \"control\" is supported)", feature, plat, h.Data.Source))
		}
	}

	for i, d := range h.DataBlocks {
		if _, err := validateByteTokens(d.Bytes); err != nil {
			errs = append(errs, fmt.Errorf("%s/%s: hook.dataBlocks[%d].bytes: %w", feature, plat, i, err))
		}
	}

	return errs
}

func validatePatternTokens(pattern string) ([]string, error) {
	toks := strings.Fields(pattern)
	if len(toks) == 0 {
		return nil, errors.New("must not be empty")
	}

	for _, tok := range toks {
		if !patternToken.MatchString(tok) {
			return nil, fmt.Errorf("invalid token %q (want two hex digits or ??)", tok)
		}
	}

	return toks, nil
}

func validateByteTokens(hexBytes string) ([]string, error) {
	toks := strings.Fields(hexBytes)
	if len(toks) == 0 {
		return nil, errors.New("must not be empty")
	}

	for _, tok := range toks {
		if !byteToken.MatchString(tok) {
			return nil, fmt.Errorf("invalid byte %q (want two hex digits, no wildcards)", tok)
		}
	}

	return toks, nil
}
