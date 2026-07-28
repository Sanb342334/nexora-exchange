package execution

import (
	"context"
	"sync"
)

// Queue keeps exchange I/O out of the market-data path. Submit is deliberately
// non-blocking: a saturated queue rejects an intent instead of delaying all WS
// event handling.
type Queue struct {
	jobs    chan func()
	workers int
	wg      sync.WaitGroup
}

func NewQueue(workers, capacity int) *Queue {
	if workers < 1 {
		workers = 1
	}
	if capacity < workers {
		capacity = workers
	}
	return &Queue{jobs: make(chan func(), capacity), workers: workers}
}

func (q *Queue) Start(ctx context.Context) {
	for i := 0; i < q.workers; i++ {
		q.wg.Add(1)
		go func() {
			defer q.wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				case job, ok := <-q.jobs:
					if !ok {
						return
					}
					job()
				}
			}
		}()
	}
}

func (q *Queue) Submit(job func()) bool {
	select {
	case q.jobs <- job:
		return true
	default:
		return false
	}
}

func (q *Queue) Stop() {
	close(q.jobs)
	q.wg.Wait()
}
