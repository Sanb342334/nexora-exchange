package notifier

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type subscriber struct {
	ChatID    int64     `json:"chat_id"`
	Username  string    `json:"username,omitempty"`
	FirstName string    `json:"first_name,omitempty"`
	JoinedAt  time.Time `json:"joined_at"`
}

type SubscriberStore struct {
	mu       sync.RWMutex
	path     string
	chatIDs  map[int64]subscriber
}

func NewSubscriberStore(logDir string) *SubscriberStore {
	s := &SubscriberStore{
		path:    filepath.Join(logDir, "subscribers.json"),
		chatIDs: make(map[int64]subscriber),
	}
	_ = s.load()
	return s
}

func (s *SubscriberStore) load() error {
	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	var list []subscriber
	if err := json.Unmarshal(data, &list); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, sub := range list {
		s.chatIDs[sub.ChatID] = sub
	}
	return nil
}

func (s *SubscriberStore) save() error {
	s.mu.RLock()
	list := make([]subscriber, 0, len(s.chatIDs))
	for _, sub := range s.chatIDs {
		list = append(list, sub)
	}
	s.mu.RUnlock()

	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0o644)
}

func (s *SubscriberStore) Subscribe(chatID int64, username, firstName string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.chatIDs[chatID]; exists {
		return false
	}
	s.chatIDs[chatID] = subscriber{
		ChatID: chatID, Username: username, FirstName: firstName,
		JoinedAt: time.Now().UTC(),
	}
	return true
}

func (s *SubscriberStore) Unsubscribe(chatID int64) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.chatIDs[chatID]; !ok {
		return false
	}
	delete(s.chatIDs, chatID)
	return true
}

func (s *SubscriberStore) IsSubscribed(chatID int64) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.chatIDs[chatID]
	return ok
}

func (s *SubscriberStore) All() []int64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]int64, 0, len(s.chatIDs))
	for id := range s.chatIDs {
		out = append(out, id)
	}
	return out
}

func (s *SubscriberStore) Count() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.chatIDs)
}

func (s *SubscriberStore) SubscribeAndSave(chatID int64, username, firstName string) (added bool, err error) {
	added = s.Subscribe(chatID, username, firstName)
	if added || s.IsSubscribed(chatID) {
		err = s.save()
	}
	return added, err
}

func (s *SubscriberStore) UnsubscribeAndSave(chatID int64) (removed bool, err error) {
	removed = s.Unsubscribe(chatID)
	if removed {
		err = s.save()
	}
	return removed, err
}

func (s *SubscriberStore) EnsureAdmin(chatID int64) error {
	if chatID == 0 {
		return nil
	}
	if !s.IsSubscribed(chatID) {
		_, err := s.SubscribeAndSave(chatID, "admin", "Admin")
		return err
	}
	return nil
}
