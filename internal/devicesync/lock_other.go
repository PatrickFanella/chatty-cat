//go:build !linux && !darwin

package devicesync

import (
	"errors"
	"os"
)

func lock(*os.File) error {
	return errors.New("configured device sync storage is supported on Linux and macOS")
}
