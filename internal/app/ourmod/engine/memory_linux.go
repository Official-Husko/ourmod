//go:build linux && amd64

package engine

import "golang.org/x/sys/unix"

// ReadMemory reads size bytes from the remote process at addr via
// process_vm_readv.
func ReadMemory(pid int, addr uintptr, size int) ([]byte, error) {
	if size == 0 {
		return []byte{}, nil
	}

	out := make([]byte, size)
	done := 0

	for done < size {
		local := []unix.Iovec{{
			Base: &out[done],
			Len:  uint64(size - done),
		}}

		remote := []unix.RemoteIovec{{
			Base: addr + uintptr(done),
			Len:  size - done,
		}}

		n, err := unix.ProcessVMReadv(pid, local, remote, 0)
		if err != nil {
			return nil, err
		}
		if n <= 0 {
			return nil, errShortTransfer("process_vm_readv")
		}

		done += n
	}

	return out, nil
}

// WriteMemory writes data into the remote process at addr via
// process_vm_writev.
func WriteMemory(pid int, addr uintptr, data []byte) error {
	if len(data) == 0 {
		return nil
	}

	done := 0

	for done < len(data) {
		local := []unix.Iovec{{
			Base: &data[done],
			Len:  uint64(len(data) - done),
		}}

		remote := []unix.RemoteIovec{{
			Base: addr + uintptr(done),
			Len:  len(data) - done,
		}}

		n, err := unix.ProcessVMWritev(pid, local, remote, 0)
		if err != nil {
			return err
		}
		if n <= 0 {
			return errShortTransfer("process_vm_writev")
		}

		done += n
	}

	return nil
}

type shortTransferError string

func (e shortTransferError) Error() string { return "short " + string(e) }

func errShortTransfer(call string) error { return shortTransferError(call) }
