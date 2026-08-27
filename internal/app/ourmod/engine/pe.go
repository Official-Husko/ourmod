package engine

import (
	"encoding/binary"
	"errors"
	"fmt"
)

// ReadPEImageSize reads the remote module's DOS/PE headers at base and
// returns IMAGE_OPTIONAL_HEADER64.SizeOfImage, bounding how far a signature
// scan of this module needs to look.
func ReadPEImageSize(pid int, base uintptr) (uintptr, error) {
	hdr, err := ReadMemory(pid, base, 0x4000)
	if err != nil {
		return 0, err
	}

	if len(hdr) < 0x40 || string(hdr[:2]) != "MZ" {
		return 0, errors.New("remote module does not have MZ header")
	}

	peOff := binary.LittleEndian.Uint32(hdr[0x3c:0x40])
	if int(peOff)+0x100 > len(hdr) {
		return 0, errors.New("PE header outside local header buffer")
	}
	if string(hdr[peOff:peOff+4]) != "PE\x00\x00" {
		return 0, errors.New("invalid PE signature")
	}

	optional := int(peOff) + 24
	magic := binary.LittleEndian.Uint16(hdr[optional : optional+2])
	if magic != 0x20b {
		return 0, fmt.Errorf("expected PE32+, got magic %#x", magic)
	}

	size := binary.LittleEndian.Uint32(hdr[optional+0x38 : optional+0x3c])
	return uintptr(size), nil
}
