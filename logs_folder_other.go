//go:build !windows

package main

import (
	"os/exec"
	"runtime"
)

func openLogsDirectory(directory string) error {
	command := "xdg-open"
	if runtime.GOOS == "darwin" {
		command = "open"
	}
	// Pass the application-owned absolute directory as one argument, never via a shell.
	return exec.Command(command, directory).Run()
}
