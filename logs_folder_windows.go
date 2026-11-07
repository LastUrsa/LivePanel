//go:build windows

package main

import "golang.org/x/sys/windows"

func openLogsDirectory(directory string) error {
	path, err := windows.UTF16PtrFromString(directory)
	if err != nil {
		return err
	}
	return windows.ShellExecute(0, nil, path, nil, nil, windows.SW_SHOWNORMAL)
}
