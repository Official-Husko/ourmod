package engine

import (
	"fmt"

	"github.com/Official-Husko/ourmod/pkg/cheats"
)

// FindRunningPlatform tries every platform a table declares and returns the
// first with a process actually found running, along with its PID. A table
// with only "linux", only "windows", or both, all work unmodified - nothing
// here assumes a specific platform.
func FindRunningPlatform(platforms map[cheats.Platform]cheats.PlatformBinary) (cheats.Platform, int, error) {
	for plat, bin := range platforms {
		if pid, err := FindProcess(bin.Executable); err == nil {
			return plat, pid, nil
		}
	}
	return "", 0, fmt.Errorf("no running process found for any platform this table declares")
}
