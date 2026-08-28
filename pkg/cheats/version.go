package cheats

import (
	"strconv"
	"strings"
)

// CompareVersions compares two dotted-numeric version strings ("1.2.10" vs
// "1.2.9") component by component as integers, not as plain strings - a
// plain string compare would wrongly rank "1.2.10" below "1.2.9". Missing
// trailing components count as 0 ("1.2" == "1.2.0"). A component that
// isn't a plain integer (a pre-release suffix like "1.0.0-beta") falls
// back to a string compare for that component only, so versions using one
// still order somewhat sensibly instead of erroring.
//
// Returns -1 if a < b, 0 if equal, 1 if a > b.
func CompareVersions(a, b string) int {
	as := strings.Split(a, ".")
	bs := strings.Split(b, ".")

	n := len(as)
	if len(bs) > n {
		n = len(bs)
	}

	for i := 0; i < n; i++ {
		var av, bv string
		if i < len(as) {
			av = as[i]
		}
		if i < len(bs) {
			bv = bs[i]
		}

		ai, aErr := strconv.Atoi(av)
		bi, bErr := strconv.Atoi(bv)
		if aErr == nil && bErr == nil {
			if ai != bi {
				if ai < bi {
					return -1
				}
				return 1
			}
			continue
		}

		if av != bv {
			if av < bv {
				return -1
			}
			return 1
		}
	}

	return 0
}
