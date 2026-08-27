//go:build linux && amd64

package engine

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// FindProcess returns the PID of the running process whose argv[0]
// basename is exe. Matching argv[0]'s basename (rather than searching the
// whole command line for exe as a substring) matters under Steam/Proton: a
// game's launch chain runs through reaper, pressure-vessel's srt-bwrap and
// pv-adverb, a Python proton launcher, and a Wine-side "steam.exe" stub -
// every one of which passes the target .exe's path as an argument, so a
// substring search matches the wrong (wrapper) process before it ever
// reaches the real Wine-hosted game process. That real process's argv[0] is
// the game's own path, which Wine reports Windows-style (backslashes,
// possibly a drive letter like "Z:\...\Sniper5_vulkan.exe"), so the
// basename split handles both separators.
func FindProcess(exe string) (int, error) {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return 0, err
	}

	exe = strings.ToLower(exe)

	for _, entry := range entries {
		pid, err := strconv.Atoi(entry.Name())
		if err != nil {
			continue
		}

		cmdline, err := os.ReadFile(filepath.Join("/proc", entry.Name(), "cmdline"))
		if err != nil {
			continue
		}

		args := strings.Split(strings.TrimRight(string(cmdline), "\x00"), "\x00")
		if len(args) == 0 || args[0] == "" {
			continue
		}

		if strings.ToLower(cmdBasename(args[0])) == exe {
			return pid, nil
		}
	}

	return 0, fmt.Errorf("could not find %q", exe)
}

// cmdBasename returns the final path component of a cmdline argv[0], which
// may be a Unix path (/) or, for a process running inside Wine, a Windows
// path (\, optionally with a drive letter).
func cmdBasename(path string) string {
	return filepath.Base(strings.ReplaceAll(path, `\`, "/"))
}

// ReadMaps parses /proc/<pid>/maps.
func ReadMaps(pid int) ([]MemoryMap, error) {
	data, err := os.ReadFile(fmt.Sprintf("/proc/%d/maps", pid))
	if err != nil {
		return nil, err
	}

	var out []MemoryMap

	for _, line := range strings.Split(string(data), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 5 {
			continue
		}

		rangeParts := strings.Split(fields[0], "-")
		if len(rangeParts) != 2 {
			continue
		}

		start, err1 := strconv.ParseUint(rangeParts[0], 16, 64)
		end, err2 := strconv.ParseUint(rangeParts[1], 16, 64)
		off, err3 := strconv.ParseUint(fields[2], 16, 64)

		if err1 != nil || err2 != nil || err3 != nil {
			continue
		}

		path := ""
		if len(fields) >= 6 {
			path = strings.Join(fields[5:], " ")
		}

		out = append(out, MemoryMap{
			Start: uintptr(start),
			End:   uintptr(end),
			Prot:  parsePerms(fields[1]),
			Off:   off,
			Path:  path,
		})
	}

	return out, nil
}

// parsePerms translates /proc/<pid>/maps' "rwxp"-style permission column
// into a portable MemProt bitmask.
func parsePerms(perms string) MemProt {
	var prot MemProt
	if strings.Contains(perms, "r") {
		prot |= ProtRead
	}
	if strings.Contains(perms, "w") {
		prot |= ProtWrite
	}
	if strings.Contains(perms, "x") {
		prot |= ProtExec
	}
	return prot
}

// FindModuleBase returns the load base of the first mapping (offset 0) whose
// path contains exe.
func FindModuleBase(maps []MemoryMap, exe string) (uintptr, error) {
	exe = strings.ToLower(exe)

	for _, m := range maps {
		if m.Off != 0 {
			continue
		}

		if strings.Contains(strings.ToLower(m.Path), exe) {
			return m.Start, nil
		}
	}

	return 0, fmt.Errorf("module %q not found", exe)
}
