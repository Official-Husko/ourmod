// Package engine attaches to a running game process and applies
// cheats.CheatTable features to it: an AOB signature scan locates a site
// (process.go/scanner.go), then either a byte patch or a code-cave hook is
// installed there (apply.go), with Session (session.go) tracking what's
// currently active.
//
// Every GOOS-specific file set (process_linux.go + memory_linux.go +
// remote_linux.go today; a future process_windows.go + memory_windows.go +
// remote_windows.go) must provide these free functions in package engine:
//
//	FindProcess(exe string) (pid int, err error)
//	ReadMaps(pid int) ([]MemoryMap, error)
//	FindModuleBase(maps []MemoryMap, exe string) (uintptr, error)
//	ReadMemory(pid int, addr uintptr, size int) ([]byte, error)
//	WriteMemory(pid int, addr uintptr, data []byte) error
//	allocExecMemory(pid int, size uintptr) (uintptr, error)
//	freeMemory(pid int, addr, size uintptr) error
//	protectMemory(pid int, addr, size uintptr, prot MemProt) error
//
// Everything else in this package (scanner.go, pe.go, apply.go, session.go)
// is portable: it calls only these eight functions plus MemoryMap/MemProt,
// never a syscall directly.
package engine

// MemProt is a portable memory-protection flag set. Each OS-specific
// backend translates it to and from its own native constants (Linux:
// unix.PROT_*; a future Windows backend: PAGE_* via VirtualQueryEx's
// MEMORY_BASIC_INFORMATION.Protect).
type MemProt int

const (
	ProtRead MemProt = 1 << iota
	ProtWrite
	ProtExec
)

// MemoryMap is one mapped memory region of a target process, populated by
// the OS-specific ReadMaps.
type MemoryMap struct {
	Start uintptr
	End   uintptr
	Prot  MemProt
	Off   uint64
	Path  string
}
