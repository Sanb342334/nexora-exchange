package carry

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

type Journal struct {
	mu   sync.Mutex
	path string
}

func NewJournal(logDir string) *Journal {
	dir := filepath.Join(logDir, "carry")
	_ = os.MkdirAll(dir, 0o755)
	return &Journal{path: filepath.Join(dir, "opportunities.jsonl")}
}

func (j *Journal) Record(op Opportunity) error {
	data, err := json.Marshal(op)
	if err != nil {
		return err
	}
	j.mu.Lock()
	defer j.mu.Unlock()
	f, err := os.OpenFile(j.path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = f.Write(append(data, '\n'))
	return err
}
