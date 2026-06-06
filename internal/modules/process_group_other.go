//go:build !windows

package modules

func newProcessGroupOwner() (processGroupOwner, error) {
	return nil, nil
}
