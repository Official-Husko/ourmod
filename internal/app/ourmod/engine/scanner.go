package engine

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/Official-Husko/ourmod/pkg/cheats"
)

// Pattern is a parsed AOB signature: Bytes holds the literal byte at each
// position, and Known marks which positions are not wildcards ("??").
type Pattern struct {
	Bytes []byte
	Known []bool
}

// ParsePattern parses a cheats.Signature.Pattern string (space-separated hex
// bytes, "??"/"?" as a wildcard).
func ParsePattern(s string) (Pattern, error) {
	fields := strings.Fields(s)

	p := Pattern{
		Bytes: make([]byte, len(fields)),
		Known: make([]bool, len(fields)),
	}

	for i, f := range fields {
		if f == "??" || f == "?" {
			continue
		}

		v, err := strconv.ParseUint(f, 16, 8)
		if err != nil {
			return Pattern{}, fmt.Errorf("invalid pattern byte %q: %w", f, err)
		}

		p.Bytes[i] = byte(v)
		p.Known[i] = true
	}

	return p, nil
}

// ParseHexBytes parses a cheats.Patch/Hook hex byte string (space-separated,
// no wildcards) into raw bytes.
func ParseHexBytes(s string) ([]byte, error) {
	fields := strings.Fields(s)
	out := make([]byte, len(fields))

	for i, f := range fields {
		v, err := strconv.ParseUint(f, 16, 8)
		if err != nil {
			return nil, fmt.Errorf("invalid hex byte %q: %w", f, err)
		}

		out[i] = byte(v)
	}

	return out, nil
}

// ScanModule searches the readable mappings of [base, base+size) for a
// single occurrence of p, returning an error if there are zero or more than
// one match.
func ScanModule(pid int, maps []MemoryMap, base, size uintptr, p Pattern) (uintptr, error) {
	imageEnd := base + size

	var matches []uintptr

	for _, m := range maps {
		if m.Prot&ProtRead == 0 {
			continue
		}

		start := maxPtr(m.Start, base)
		end := minPtr(m.End, imageEnd)
		if start >= end {
			continue
		}

		const chunkSize = uintptr(4 * 1024 * 1024)

		var tail []byte

		for pos := start; pos < end; {
			length := minPtr(chunkSize, end-pos)

			buf, err := ReadMemory(pid, pos, int(length))
			if err != nil {
				return 0, fmt.Errorf("read %#x-%#x: %w", pos, pos+length, err)
			}

			combined := append(append([]byte{}, tail...), buf...)
			combinedBase := pos - uintptr(len(tail))

			for i := 0; i+len(p.Bytes) <= len(combined); i++ {
				if patternMatches(combined[i:i+len(p.Bytes)], p) {
					addr := combinedBase + uintptr(i)
					if len(matches) == 0 || matches[len(matches)-1] != addr {
						matches = append(matches, addr)
					}
				}
			}

			keep := len(p.Bytes) - 1
			if keep > len(combined) {
				keep = len(combined)
			}
			tail = append([]byte{}, combined[len(combined)-keep:]...)

			pos += length
		}
	}

	switch len(matches) {
	case 0:
		return 0, errors.New("signature not found")
	case 1:
		return matches[0], nil
	default:
		return 0, fmt.Errorf("signature is not unique: %d matches", len(matches))
	}
}

func patternMatches(buf []byte, p Pattern) bool {
	for i := range p.Bytes {
		if p.Known[i] && buf[i] != p.Bytes[i] {
			return false
		}
	}

	return true
}

// Resolve parses sig.Pattern, scans it against the module bounded by
// [base, base+imageSize), and adds sig.Offset to the unique match - the
// address-resolution step shared by both patch and hook targets.
func Resolve(pid int, maps []MemoryMap, base, imageSize uintptr, sig cheats.Signature) (uintptr, error) {
	pattern, err := ParsePattern(sig.Pattern)
	if err != nil {
		return 0, err
	}

	match, err := ScanModule(pid, maps, base, imageSize, pattern)
	if err != nil {
		return 0, err
	}

	return uintptr(int64(match) + sig.Offset), nil
}

func minPtr(a, b uintptr) uintptr {
	if a < b {
		return a
	}
	return b
}

func maxPtr(a, b uintptr) uintptr {
	if a > b {
		return a
	}
	return b
}
