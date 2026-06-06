//go:build windows

package modules

import (
	"os"
	"unsafe"

	"golang.org/x/sys/windows"
)

type windowsJobOwner struct {
	handle windows.Handle
}

func newProcessGroupOwner() (processGroupOwner, error) {
	handle, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		return nil, err
	}

	var info windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION
	info.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
	if _, err := windows.SetInformationJobObject(
		handle,
		windows.JobObjectExtendedLimitInformation,
		uintptr(unsafe.Pointer(&info)),
		uint32(unsafe.Sizeof(info)),
	); err != nil {
		_ = windows.CloseHandle(handle)
		return nil, err
	}

	return &windowsJobOwner{handle: handle}, nil
}

func (o *windowsJobOwner) Attach(process *os.Process) error {
	handle, err := windows.OpenProcess(windows.PROCESS_SET_QUOTA|windows.PROCESS_TERMINATE, false, uint32(process.Pid))
	if err != nil {
		return err
	}
	defer windows.CloseHandle(handle)
	return windows.AssignProcessToJobObject(o.handle, handle)
}

func (o *windowsJobOwner) Close() error {
	if o.handle == 0 {
		return nil
	}
	err := windows.CloseHandle(o.handle)
	o.handle = 0
	return err
}
