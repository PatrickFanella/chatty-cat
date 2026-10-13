//go:build linux || darwin

package devicesync

import (
	"os"
	"syscall"
)

func lock(file *os.File) error { return syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB) }
