package processlock

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestAcquirePersistsMetadataAndRejectsDuplicate(t *testing.T) {
	dir := t.TempDir()
	lock, err := Acquire(dir)
	if err != nil {
		t.Fatalf("Acquire() error = %v", err)
	}
	defer lock.Release()

	if lock.InstanceID == "" {
		t.Fatal("Acquire() returned an empty instance ID")
	}
	if lock.PID != os.Getpid() {
		t.Fatalf("PID = %d, want %d", lock.PID, os.Getpid())
	}
	if lock.StartedAt.IsZero() {
		t.Fatal("Acquire() returned a zero start time")
	}

	var persisted Metadata
	data, err := os.ReadFile(filepath.Join(dir, lockFilename))
	if err != nil {
		t.Fatalf("read lock metadata: %v", err)
	}
	if err := json.Unmarshal(data, &persisted); err != nil {
		t.Fatalf("unmarshal lock metadata: %v", err)
	}
	if persisted != lock.Metadata {
		t.Fatalf("persisted metadata = %+v, want %+v", persisted, lock.Metadata)
	}

	_, err = Acquire(dir)
	var occupied *OccupiedError
	if !errors.As(err, &occupied) {
		t.Fatalf("duplicate Acquire() error = %v, want OccupiedError", err)
	}
	if occupied.Owner.InstanceID != lock.InstanceID {
		t.Fatalf("duplicate owner ID = %q, want %q", occupied.Owner.InstanceID, lock.InstanceID)
	}
}

func TestReleaseDoesNotDeleteNewOwnerLock(t *testing.T) {
	dir := t.TempDir()
	lock, err := Acquire(dir)
	if err != nil {
		t.Fatalf("Acquire() error = %v", err)
	}

	replacement := Metadata{InstanceID: "replacement", PID: os.Getpid(), StartedAt: time.Now().UTC()}
	data, err := json.Marshal(replacement)
	if err != nil {
		t.Fatalf("marshal replacement: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, lockFilename), data, 0o644); err != nil {
		t.Fatalf("replace lock metadata: %v", err)
	}
	lock.Release()

	if _, err := os.Stat(filepath.Join(dir, lockFilename)); err != nil {
		t.Fatalf("Release() removed another owner's lock: %v", err)
	}
}
