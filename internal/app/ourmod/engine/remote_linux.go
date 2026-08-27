//go:build linux && amd64

package engine

import (
	"bytes"
	"encoding/binary"
	"errors"

	"golang.org/x/sys/unix"
)

// allocExecMemory allocates an anonymous RW page in the remote process (the
// caller writes the cave body, then protectMemory switches it to RX). This
// is the native-Linux equivalent of FLiNG's VirtualAllocEx: because
// Proton/Wine executes the Windows x86-64 game code natively in the Linux
// process, a plain executable anonymous Linux mapping works as a code cave.
func allocExecMemory(pid int, size uintptr) (uintptr, error) {
	return remoteSyscall(pid, unix.SYS_MMAP, [6]uintptr{
		0,
		size,
		unix.PROT_READ | unix.PROT_WRITE,
		unix.MAP_PRIVATE | unix.MAP_ANONYMOUS,
		^uintptr(0),
		0,
	})
}

func freeMemory(pid int, addr, size uintptr) error {
	_, err := remoteSyscall(pid, unix.SYS_MUNMAP, [6]uintptr{addr, size})
	return err
}

func protectMemory(pid int, addr, size uintptr, prot MemProt) error {
	_, err := remoteSyscall(pid, unix.SYS_MPROTECT, [6]uintptr{addr, size, uintptr(toUnixProt(prot))})
	return err
}

func toUnixProt(prot MemProt) int {
	var p int
	if prot&ProtRead != 0 {
		p |= unix.PROT_READ
	}
	if prot&ProtWrite != 0 {
		p |= unix.PROT_WRITE
	}
	if prot&ProtExec != 0 {
		p |= unix.PROT_EXEC
	}
	return p
}

// remoteSyscall borrows the remote process's main thread via ptrace to
// execute exactly one syscall instruction (found in its own vDSO), then
// restores the thread to exactly where it was.
func remoteSyscall(pid int, number uintptr, args [6]uintptr) (uintptr, error) {
	gadget, err := findSyscallInstruction(pid)
	if err != nil {
		return 0, err
	}

	if err := unix.PtraceAttach(pid); err != nil {
		return 0, err
	}

	attached := true
	defer func() {
		if attached {
			_ = unix.PtraceDetach(pid)
		}
	}()

	var status unix.WaitStatus
	if _, err := unix.Wait4(pid, &status, 0, nil); err != nil {
		return 0, err
	}

	var original unix.PtraceRegs
	if err := unix.PtraceGetRegs(pid, &original); err != nil {
		return 0, err
	}

	regs := original
	regs.Rip = uint64(gadget)
	regs.Rax = uint64(number)
	regs.Rdi = uint64(args[0])
	regs.Rsi = uint64(args[1])
	regs.Rdx = uint64(args[2])
	regs.R10 = uint64(args[3])
	regs.R8 = uint64(args[4])
	regs.R9 = uint64(args[5])

	if err := unix.PtraceSetRegs(pid, &regs); err != nil {
		return 0, err
	}

	if err := unix.PtraceSingleStep(pid); err != nil {
		return 0, err
	}
	if _, err := unix.Wait4(pid, &status, 0, nil); err != nil {
		return 0, err
	}

	if err := unix.PtraceGetRegs(pid, &regs); err != nil {
		return 0, err
	}
	result := int64(regs.Rax)

	// Put the Wine thread exactly where it was before we borrowed it.
	if err := unix.PtraceSetRegs(pid, &original); err != nil {
		return 0, err
	}
	if err := unix.PtraceDetach(pid); err != nil {
		return 0, err
	}
	attached = false

	// Linux syscalls return -errno in RAX.
	if result < 0 && result >= -4095 {
		return 0, unix.Errno(-result)
	}

	return uintptr(regs.Rax), nil
}

func findSyscallInstruction(pid int) (uintptr, error) {
	maps, err := ReadMaps(pid)
	if err != nil {
		return 0, err
	}

	for _, m := range maps {
		if m.Path != "[vdso]" {
			continue
		}
		if m.Prot&(ProtRead|ProtExec) != (ProtRead | ProtExec) {
			continue
		}

		buf, err := ReadMemory(pid, m.Start, int(m.End-m.Start))
		if err != nil {
			return 0, err
		}

		if i := bytes.Index(buf, []byte{0x0f, 0x05}); i >= 0 { // syscall
			return m.Start + uintptr(i), nil
		}
	}

	return 0, errors.New("could not find syscall instruction in vDSO")
}

// absoluteJump64 encodes `jmp qword [rip+0]; dst` (FF 25 00 00 00 00 <8-byte dst>).
func absoluteJump64(dst uintptr) []byte {
	out := make([]byte, 14)
	copy(out, []byte{0xff, 0x25, 0x00, 0x00, 0x00, 0x00})
	binary.LittleEndian.PutUint64(out[6:14], uint64(dst))
	return out
}
