# TODO

## Windows host support

OurMod is meant to ship for both Linux and Windows hosts, but only the Linux
backend exists today. `internal/app/ourmod/engine` is already split so this
is additive, not a rewrite: portable files (`types.go`, `scanner.go`, `pe.go`,
`apply.go`, `session.go`) contain all the orchestration logic and compile on
any `GOOS`; only `process_linux.go`, `memory_linux.go`, and `remote_linux.go`
(all tagged `//go:build linux && amd64`) talk to the OS directly.

Adding Windows support means writing `process_windows.go`, `memory_windows.go`,
and `remote_windows.go` (tagged `//go:build windows`) that implement the same
free-function contract, documented at the top of `types.go`:

```
FindProcess(exe string) (pid int, err error)
ReadMaps(pid int) ([]MemoryMap, error)
FindModuleBase(maps []MemoryMap, exe string) (uintptr, error)
ReadMemory(pid int, addr uintptr, size int) ([]byte, error)
WriteMemory(pid int, addr uintptr, data []byte) error
allocExecMemory(pid int, size uintptr) (uintptr, error)
freeMemory(pid int, addr, size uintptr) error
protectMemory(pid int, addr, size uintptr, prot MemProt) error
```

On Windows these map to native process/memory APIs instead of Linux's
ptrace + process_vm_readv/writev + mmap/mprotect:

- `FindProcess`/`ReadMaps` → `CreateToolhelp32Snapshot`/`Process32Next` for
  process enumeration, `VirtualQueryEx` walking `MEMORY_BASIC_INFORMATION`
  regions in place of `/proc/<pid>/maps`.
- `ReadMemory`/`WriteMemory` → `ReadProcessMemory`/`WriteProcessMemory`.
- `allocExecMemory`/`freeMemory`/`protectMemory` → `VirtualAllocEx` /
  `VirtualFreeEx` / `VirtualProtectEx`, called directly against the process
  handle from `OpenProcess` - no ptrace-style thread-borrowing dance needed,
  since Windows' remote-memory APIs don't require it the way Linux's do.
- `golang.org/x/sys/windows` is the natural dependency for these (same
  family as `golang.org/x/sys/unix`, already used on the Linux side).

This hasn't been written yet because it can't be tested here - there's no
Windows machine available in this environment, and remote-memory/code-
injection code that hasn't been verified against a real process is too easy
to get subtly wrong (wrong struct layout, wrong calling convention, a
region walked incorrectly) to ship on faith. Do this on an actual Windows
machine (or a Windows CI runner) that can run `go test`/a live game against
it before merging, the same way the Linux backend was only trusted once it
worked against the real, running Sniper Elite 5 process.

Once it exists, nothing above the backend layer needs to change - `cmd/ourmod`,
`Session`, `EnablePatch`/`EnableHook`, and `pkg/cheats` are all already
platform-agnostic.
