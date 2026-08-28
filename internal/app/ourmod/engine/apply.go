package engine

import (
	"bytes"
	"errors"
	"fmt"
	"os"

	"github.com/Official-Husko/ourmod/pkg/cheats"
)

// EnablePatch verifies the original bytes at target, writes p.Enabled over
// them, and returns a function that restores p.Original.
func EnablePatch(pid int, maps []MemoryMap, target uintptr, p *cheats.Patch) (func() error, error) {
	original, err := ParseHexBytes(p.Original)
	if err != nil {
		return nil, err
	}

	enabled, err := ParseHexBytes(p.Enabled)
	if err != nil {
		return nil, err
	}

	current, err := ReadMemory(pid, target, len(original))
	if err != nil {
		return nil, err
	}
	if !bytes.Equal(current, original) {
		return nil, fmt.Errorf("original-byte verification failed at %#x\nexpected % X\nactual   % X", target, original, current)
	}

	if err := writeWithProtection(pid, maps, target, enabled); err != nil {
		return nil, err
	}

	return func() error {
		return writeWithProtection(pid, maps, target, original)
	}, nil
}

// RecoverPatch checks whether target currently holds exactly p.Enabled,
// without writing anything - true if some earlier process (this one
// restarted, or crashed) already applied this patch and nothing has
// touched it since. On confirmation it returns the same restore closure
// EnablePatch would have produced; a false result just means "not this",
// not an error - a stale/edited record from before the table changed.
func RecoverPatch(pid int, maps []MemoryMap, target uintptr, p *cheats.Patch) (func() error, bool, error) {
	original, err := ParseHexBytes(p.Original)
	if err != nil {
		return nil, false, err
	}

	enabled, err := ParseHexBytes(p.Enabled)
	if err != nil {
		return nil, false, err
	}

	current, err := ReadMemory(pid, target, len(enabled))
	if err != nil {
		return nil, false, err
	}
	if !bytes.Equal(current, enabled) {
		return nil, false, nil
	}

	return func() error {
		return writeWithProtection(pid, maps, target, original)
	}, true, nil
}

// EnableHook verifies the original bytes at target, builds a code cave
// containing h.Body plus a generated jump back to target+h.Overwrite,
// overwrites target with a jump into that cave, and returns the cave
// address (so a caller can persist it - it's otherwise unrecoverable, being
// freshly allocated each call) plus a function that restores the original
// bytes and frees the cave.
func EnableHook(pid int, maps []MemoryMap, target uintptr, h *cheats.Hook) (undo func() error, cave uintptr, err error) {
	if h.Type != "abs64" {
		return nil, 0, fmt.Errorf("unsupported hook type %q", h.Type)
	}
	if h.Overwrite < 14 {
		return nil, 0, errors.New("abs64 hook requires at least 14 bytes")
	}

	original, err := ParseHexBytes(h.Original)
	if err != nil {
		return nil, 0, err
	}
	if len(original) != h.Overwrite {
		return nil, 0, fmt.Errorf("original length %d != overwrite %d", len(original), h.Overwrite)
	}

	body, err := ParseHexBytes(h.Body)
	if err != nil {
		return nil, 0, err
	}

	current, err := ReadMemory(pid, target, h.Overwrite)
	if err != nil {
		return nil, 0, err
	}
	if !bytes.Equal(current, original) {
		return nil, 0, fmt.Errorf("hook verification failed at %#x\nexpected % X\nactual   % X", target, original, current)
	}

	cave, err = allocExecMemory(pid, 4096)
	if err != nil {
		return nil, 0, fmt.Errorf("alloc exec memory: %w", err)
	}

	caveCode := append([]byte{}, body...)
	caveCode = append(caveCode, absoluteJump64(target+uintptr(h.Overwrite))...)

	if len(caveCode) > 4096 {
		_ = freeMemory(pid, cave, 4096)
		return nil, 0, errors.New("code cave exceeds one page")
	}

	if err := WriteMemory(pid, cave, caveCode); err != nil {
		_ = freeMemory(pid, cave, 4096)
		return nil, 0, fmt.Errorf("write cave: %w", err)
	}

	if err := protectMemory(pid, cave, 4096, ProtRead|ProtExec); err != nil {
		_ = freeMemory(pid, cave, 4096)
		return nil, 0, err
	}

	if err := writeWithProtection(pid, maps, target, hookJumpBytes(cave, h.Overwrite)); err != nil {
		_ = freeMemory(pid, cave, 4096)
		return nil, 0, err
	}

	return func() error {
		if err := writeWithProtection(pid, maps, target, original); err != nil {
			return err
		}
		return freeMemory(pid, cave, 4096)
	}, cave, nil
}

// RecoverHook checks whether target currently holds exactly the abs64 jump
// EnableHook would have written for this cave/h.Overwrite, without writing
// anything - true if some earlier process (this one restarted, or crashed)
// already installed this hook and nothing has touched it since. On
// confirmation it returns the same restore closure EnableHook would have
// produced; a false result just means "not this", not an error - a
// stale/edited record, or a cave that's since been freed and possibly
// reused for something else.
func RecoverHook(pid int, maps []MemoryMap, target uintptr, h *cheats.Hook, cave uintptr) (func() error, bool, error) {
	if h.Type != "abs64" {
		return nil, false, nil
	}

	original, err := ParseHexBytes(h.Original)
	if err != nil {
		return nil, false, err
	}
	if len(original) != h.Overwrite {
		return nil, false, nil
	}

	current, err := ReadMemory(pid, target, h.Overwrite)
	if err != nil {
		return nil, false, err
	}
	if !bytes.Equal(current, hookJumpBytes(cave, h.Overwrite)) {
		return nil, false, nil
	}

	return func() error {
		if err := writeWithProtection(pid, maps, target, original); err != nil {
			return err
		}
		return freeMemory(pid, cave, 4096)
	}, true, nil
}

// hookJumpBytes builds the h.Overwrite-byte sequence written at a hook's
// target: an abs64 jump to cave, NOP-padded to fill any bytes beyond the
// 14-byte jump encoding.
func hookJumpBytes(cave uintptr, overwrite int) []byte {
	patch := absoluteJump64(cave)
	for len(patch) < overwrite {
		patch = append(patch, 0x90)
	}
	return patch
}

func writeWithProtection(pid int, maps []MemoryMap, addr uintptr, data []byte) error {
	m, err := mapContaining(maps, addr)
	if err != nil {
		return err
	}
	if addr+uintptr(len(data)) > m.End {
		return errors.New("patch crosses map boundary")
	}

	pageSize := uintptr(os.Getpagesize())
	start := addr & ^(pageSize - 1)
	end := (addr + uintptr(len(data)) + pageSize - 1) & ^(pageSize - 1)

	oldProt := m.Prot
	newProt := oldProt | ProtWrite

	if err := protectMemory(pid, start, end-start, newProt); err != nil {
		return fmt.Errorf("mprotect writable: %w", err)
	}

	writeErr := WriteMemory(pid, addr, data)
	restoreErr := protectMemory(pid, start, end-start, oldProt)

	if writeErr != nil {
		return writeErr
	}
	return restoreErr
}

func mapContaining(maps []MemoryMap, addr uintptr) (MemoryMap, error) {
	for _, m := range maps {
		if addr >= m.Start && addr < m.End {
			return m, nil
		}
	}
	return MemoryMap{}, fmt.Errorf("no map contains %#x", addr)
}
