package processlock

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

// Acquire prevents two local scanner.exe instances (duplicate Telegram replies).
func Acquire(logDir string) (func(), error) {
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		return nil, err
	}
	lockPath := filepath.Join(logDir, "scanner.lock")

	if err := tryLock(lockPath); err != nil {
		if pid := readPID(lockPath); pid > 0 && processAlive(pid) {
			return nil, fmt.Errorf("scanner already running (pid %d) — stop the other instance first", pid)
		}
		_ = os.Remove(lockPath)
		if err2 := tryLock(lockPath); err2 != nil {
			return nil, err2
		}
	}

	release := func() {
		_ = os.Remove(lockPath)
	}
	return release, nil
}

func tryLock(lockPath string) error {
	f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	_, _ = fmt.Fprintf(f, "%d\n", os.Getpid())
	_ = f.Close()
	return nil
}

func readPID(lockPath string) int {
	b, err := os.ReadFile(lockPath)
	if err != nil {
		return 0
	}
	pid, _ := strconv.Atoi(strings.TrimSpace(string(b)))
	return pid
}

func processAlive(pid int) bool {
	out, err := exec.Command("tasklist", "/FI", fmt.Sprintf("PID eq %d", pid), "/NH").Output()
	if err != nil {
		return false
	}
	s := string(out)
	return strings.Contains(s, strconv.Itoa(pid)) && !strings.Contains(strings.ToLower(s), "no tasks")
}
