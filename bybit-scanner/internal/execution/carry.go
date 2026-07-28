package execution

import (
	"context"
	"fmt"
	"time"
)

type MarketCategory string

const (
	CategorySpot   MarketCategory = "spot"
	CategoryLinear MarketCategory = "linear"
)

type LegOrder struct {
	Category MarketCategory
	Symbol   string
	Side     string
	Qty      string
	LinkID   string
}

type LegResult struct {
	OrderID string
	Filled  bool
}

// LegExecutor intentionally hides exchange details so carry coordination can
// be unit-tested and later use distinct demo/live implementations.
type LegExecutor interface {
	OpenLeg(context.Context, LegOrder) (LegResult, error)
	CloseLeg(context.Context, LegOrder) error
}

type CarryIntent struct {
	ID       string
	Spot     LegOrder
	Perp     LegOrder
	OpenedAt time.Time
}

type CarryCoordinator struct {
	executor LegExecutor
	journal  *EventJournal
}

func NewCarryCoordinator(executor LegExecutor, journal *EventJournal) *CarryCoordinator {
	return &CarryCoordinator{executor: executor, journal: journal}
}

// Open creates a spot BUY and a matching linear SELL. If either leg cannot be
// confirmed, every known filled leg is closed before returning an error.
func (c *CarryCoordinator) Open(ctx context.Context, intent CarryIntent) (spot, perp LegResult, err error) {
	if c.executor == nil {
		return spot, perp, fmt.Errorf("carry executor is not configured")
	}
	if intent.ID == "" || intent.Spot.Category != CategorySpot || intent.Perp.Category != CategoryLinear {
		return spot, perp, fmt.Errorf("invalid carry intent")
	}
	c.record(intent.ID, intent.Spot.Symbol, IntentPending, "", "")
	spot, err = c.executor.OpenLeg(ctx, intent.Spot)
	if err != nil || !spot.Filled {
		c.record(intent.ID, intent.Spot.Symbol, IntentFailed, spot.OrderID, reason(err, "spot leg was not filled"))
		return spot, perp, legError("spot", err, "was not filled")
	}
	perp, err = c.executor.OpenLeg(ctx, intent.Perp)
	if err == nil && perp.Filled {
		c.record(intent.ID, intent.Spot.Symbol, IntentProtected, perp.OrderID, "")
		return spot, perp, nil
	}
	rollbackCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	rollbackErr := c.executor.CloseLeg(rollbackCtx, reverseLeg(intent.Spot))
	c.record(intent.ID, intent.Spot.Symbol, IntentRolledBack, spot.OrderID, reason(err, "perp leg was not filled"))
	if rollbackErr != nil {
		return spot, perp, fmt.Errorf("perp leg: %v; spot rollback: %w", err, rollbackErr)
	}
	return spot, perp, legError("perp", err, "was not filled")
}

func (c *CarryCoordinator) record(id, symbol string, state IntentState, orderID, why string) {
	if c.journal != nil {
		_ = c.journal.Append(IntentEvent{IntentID: id, StrategyID: "carry", Symbol: symbol, State: state, OrderID: orderID, Reason: why})
	}
}

func reverseLeg(leg LegOrder) LegOrder {
	if leg.Side == "Buy" {
		leg.Side = "Sell"
	} else {
		leg.Side = "Buy"
	}
	return leg
}

func reason(err error, fallback string) string {
	if err != nil {
		return err.Error()
	}
	return fallback
}

func legError(name string, err error, fallback string) error {
	if err != nil {
		return fmt.Errorf("%s leg: %w", name, err)
	}
	return fmt.Errorf("%s leg %s", name, fallback)
}
