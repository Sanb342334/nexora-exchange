package processlock

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const lockFilename = "scanner.lock"

// Metadata is persisted while the scanner owns the local singleton lock.
// It is intentionally self-contained so operators can inspect scanner.lock
// without needing the running process.
type Metadata struct {
	InstanceID string    `json:"instance_id"`
	PID        int       `json:"pid"`
	Hostname   string    `json:"hostname,omitempty"`
	StartedAt  time.Time `json:"started_at"`
}

// Lock owns a scanner singleton lock until Release is called.
type Lock struct {
	Metadata
	path    string
	release sync.Once
}

// OccupiedError identifies the process that currently owns the singleton lock.
type OccupiedError struct {
	Owner Metadata
}

func (e *OccupiedError) Error() string {
	if e.Owner.PID <= 0 {
		return "scanner already running — stop the other instance first"
	}
	if e.Owner.InstanceID == "" {
		return fmt.Sprintf("scanner already running (pid %d) — stop the other instance first", e.Owner.PID)
	}
	return fmt.Sprintf("scanner already running (pid %d, instance %s, started %s) — stop the other instance first",
		e.Owner.PID, e.Owner.InstanceID, e.Owner.StartedAt.UTC().Format(time.RFC3339))
}

// Acquire prevents two local scanner instances from running simultaneously.
// A duplicate fails before it can start the Telegram polling loop.
func Acquire(logDir string) (*Lock, error) {
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		return nil, err
	}
	lockPath := filepath.Join(logDir, lockFilename)
	hostname, _ := os.Hostname()
	metadata := Metadata{
		InstanceID: newInstanceID(),
		PID:        os.Getpid(),
		Hostname:   hostname,
		StartedAt:  time.Now().UTC(),
	}

	if err := tryLock(lockPath, metadata); err != nil {
		owner := readMetadata(lockPath)
		if owner.PID > 0 && processAlive(owner.PID) {
			return nil, &OccupiedError{Owner: owner}
		}
		_ = os.Remove(lockPath)
		if err2 := tryLock(lockPath, metadata); err2 != nil {
			return nil, err2
		}
	}

	return &Lock{Metadata: metadata, path: lockPath}, nil
}

// Release removes the lock only if this process still owns it.
func (l *Lock) Release() {
	if l == nil {
		return
	}
	l.release.Do(func() {
		owner := readMetadata(l.path)
		if owner.InstanceID == l.InstanceID {
			_ = os.Remove(l.path)
		}
	})
}

// LocalInstanceCount reports whether a live scanner lock is present locally.
// The singleton guard means this value is either zero or one.
func LocalInstanceCount(logDir string) int {
	owner := readMetadata(filepath.Join(logDir, lockFilename))
	if owner.PID > 0 && processAlive(owner.PID) {
		return 1
	}
	return 0
}

func tryLock(lockPath string, metadata Metadata) error {
	f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	return json.NewEncoder(f).Encode(metadata)
}

func readMetadata(lockPath string) Metadata {
	b, err := os.ReadFile(lockPath)
	if err != nil {
		return Metadata{}
	}
	var metadata Metadata
	if json.Unmarshal(b, &metadata) == nil && metadata.PID > 0 {
		return metadata
	}
	// Accept old PID-only locks so upgrades do not create a duplicate scanner.
	pid, _ := strconv.Atoi(strings.TrimSpace(string(b)))
	return Metadata{PID: pid}
}

func processAlive(pid int) bool {
	out, err := exec.Command("tasklist", "/FI", fmt.Sprintf("PID eq %d", pid), "/NH").Output()
	if err != nil {
		return false
	}
	s := string(out)
	return strings.Contains(s, strconv.Itoa(pid)) && !strings.Contains(strings.ToLower(s), "no tasks")
}

func newInstanceID() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err == nil {
		return hex.EncodeToString(b[:])
	}
	// crypto/rand failures are exceptional; retain uniqueness for diagnostics
	// without allowing a scanner startup to fail solely for observability.
	return fmt.Sprintf("%x", time.Now().UnixNano())
}

func IsOccupied(err error) (*OccupiedError, bool) {
	var occupied *OccupiedError
	return occupied, errors.As(err, &occupied)
}
