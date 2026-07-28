package signals

import (
	"context"
	"time"
)

// OutcomeWorker periodically finalizes horizons for which no trustworthy mark
// arrived. Marks themselves are supplied by the scanner ticker path.
type OutcomeWorker struct {
	repo  *Repository
	grace time.Duration
}

func NewOutcomeWorker(repo *Repository, grace time.Duration) *OutcomeWorker {
	if grace <= 0 {
		grace = 2 * time.Minute
	}
	return &OutcomeWorker{repo: repo, grace: grace}
}

func (w *OutcomeWorker) Start(ctx context.Context) {
	if w == nil || w.repo == nil {
		return
	}
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case now := <-ticker.C:
				_ = w.repo.MarkMissing(ctx, now, w.grace)
			}
		}
	}()
}
