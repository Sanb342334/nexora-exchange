package signals

import (
	"context"
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

// Repository serializes writers over one SQLite connection. SQLite WAL keeps
// the scanner's audit writes durable without blocking readers used by research.
type Repository struct {
	db *sql.DB
	mu sync.Mutex
}

func Open(path string) (*Repository, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("create signal ledger directory: %w", err)
	}
	db, err := sql.Open("sqlite", "file:"+filepath.ToSlash(path)+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(ON)")
	if err != nil {
		return nil, fmt.Errorf("open signal ledger: %w", err)
	}
	db.SetMaxOpenConns(1)
	r := &Repository{db: db}
	if err := r.migrate(context.Background()); err != nil {
		_ = db.Close()
		return nil, err
	}
	return r, nil
}

// OpenReadOnly opens an existing ledger without migrations or write access.
// Dataset export must not alter scanner history, including schema metadata.
func OpenReadOnly(path string) (*Repository, error) {
	db, err := sql.Open("sqlite", "file:"+filepath.ToSlash(path)+"?mode=ro&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, fmt.Errorf("open read-only signal ledger: %w", err)
	}
	db.SetMaxOpenConns(1)
	return &Repository{db: db}, nil
}

func (r *Repository) Close() error { return r.db.Close() }

func (r *Repository) migrate(ctx context.Context) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	statements := []string{
		`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at_ns INTEGER NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS signals (
			signal_id TEXT PRIMARY KEY,
			parent_signal_id TEXT,
			occurred_at_ns INTEGER NOT NULL,
			symbol TEXT NOT NULL,
			direction TEXT NOT NULL,
			phase TEXT NOT NULL,
			detector TEXT NOT NULL,
			entry_price REAL NOT NULL,
			feature_version TEXT NOT NULL DEFAULT 'legacy/v1',
			label_version TEXT NOT NULL DEFAULT 'outcome/v1',
			label_cost_version TEXT NOT NULL DEFAULT '',
			label_cost_bps REAL NOT NULL DEFAULT 0,
			features_json BLOB NOT NULL,
			explanation_json BLOB NOT NULL,
			created_at_ns INTEGER NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS signals_parent_idx ON signals(parent_signal_id)`,
		`CREATE TABLE IF NOT EXISTS signal_decisions (
			signal_id TEXT NOT NULL REFERENCES signals(signal_id),
			stage TEXT NOT NULL,
			result TEXT NOT NULL,
			details_json BLOB NOT NULL,
			decided_at_ns INTEGER NOT NULL,
			PRIMARY KEY (signal_id, stage)
		)`,
		`CREATE TABLE IF NOT EXISTS signal_outcomes (
			signal_id TEXT NOT NULL REFERENCES signals(signal_id),
			horizon_seconds INTEGER NOT NULL,
			status TEXT NOT NULL,
			entry_price REAL NOT NULL,
			mark_price REAL,
			return_bps REAL,
			direction_bps REAL,
			source TEXT,
			source_at_ns INTEGER,
			observed_at_ns INTEGER,
			label TEXT,
			profit_percent REAL,
			label_version TEXT,
			PRIMARY KEY (signal_id, horizon_seconds)
		)`,
		`CREATE INDEX IF NOT EXISTS signal_outcomes_pending_idx ON signal_outcomes(status, horizon_seconds)`,
		`CREATE TABLE IF NOT EXISTS performance_gate_decisions (
			decision_id TEXT PRIMARY KEY,
			setup_key TEXT NOT NULL,
			action TEXT NOT NULL,
			eligible INTEGER NOT NULL,
			reasons_json BLOB NOT NULL,
			decided_by TEXT NOT NULL,
			decided_at_ns INTEGER NOT NULL
		)`,
	}
	for _, stmt := range statements {
		if _, err := tx.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("apply signal ledger migration: %w", err)
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO schema_migrations(version, applied_at_ns) VALUES(1, ?)`, time.Now().UTC().UnixNano()); err != nil {
		return err
	}
	var v2 int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations WHERE version=2`).Scan(&v2); err != nil {
		return err
	}
	if v2 == 0 {
		for _, stmt := range []string{
			`ALTER TABLE signals ADD COLUMN feature_version TEXT NOT NULL DEFAULT 'legacy/v1'`,
			`ALTER TABLE signals ADD COLUMN label_version TEXT NOT NULL DEFAULT 'outcome/v1'`,
			`ALTER TABLE signals ADD COLUMN label_cost_bps REAL NOT NULL DEFAULT 0`,
			`ALTER TABLE signal_outcomes ADD COLUMN label TEXT`,
			`ALTER TABLE signal_outcomes ADD COLUMN profit_percent REAL`,
			`ALTER TABLE signal_outcomes ADD COLUMN label_version TEXT`,
		} {
			if _, err := tx.ExecContext(ctx, stmt); err != nil && !containsDuplicateColumn(err) {
				return fmt.Errorf("apply training ledger migration: %w", err)
			}
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations(version, applied_at_ns) VALUES(2, ?)`, time.Now().UTC().UnixNano()); err != nil {
			return err
		}
	}
	var v3 int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations WHERE version=3`).Scan(&v3); err != nil {
		return err
	}
	if v3 == 0 {
		if _, err := tx.ExecContext(ctx, `ALTER TABLE signals ADD COLUMN label_cost_version TEXT NOT NULL DEFAULT ''`); err != nil && !containsDuplicateColumn(err) {
			return fmt.Errorf("apply cost-version ledger migration: %w", err)
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations(version, applied_at_ns) VALUES(3, ?)`, time.Now().UTC().UnixNano()); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func containsDuplicateColumn(err error) bool {
	return strings.Contains(strings.ToLower(err.Error()), "duplicate column name")
}

// RecordSignal is idempotent. A duplicate ID must describe the same immutable
// signal; conflicting data is rejected instead of silently changing history.
func (r *Repository) RecordSignal(ctx context.Context, record SignalRecord) error {
	if record.ID == "" || record.Symbol == "" || record.OccurredAt.IsZero() || record.Price <= 0 {
		return errors.New("signal record requires id, symbol, time, and positive price")
	}
	if record.FeatureVersion == "" {
		record.FeatureVersion = "legacy/v1"
	}
	if record.LabelVersion == "" {
		record.LabelVersion = "outcome/v1"
	}
	features, err := marshalSnapshot(record.Features)
	if err != nil {
		return fmt.Errorf("marshal signal features: %w", err)
	}
	explanation, err := marshalSnapshot(record.Explanation)
	if err != nil {
		return fmt.Errorf("marshal signal explanation: %w", err)
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO signals
		(signal_id,parent_signal_id,occurred_at_ns,symbol,direction,phase,detector,entry_price,feature_version,label_version,label_cost_version,label_cost_bps,features_json,explanation_json,created_at_ns)
		VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		record.ID, nullable(record.ParentID), record.OccurredAt.UTC().UnixNano(), record.Symbol, record.Direction, record.Phase, record.Detector,
		record.Price, record.FeatureVersion, record.LabelVersion, record.LabelCostVersion, record.LabelCostBps, features, explanation, time.Now().UTC().UnixNano())
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		var symbol, direction, phase, detector, featureVersion, labelVersion, labelCostVersion string
		var occurred, price int64
		var parent sql.NullString
		var labelCost float64
		var storedFeatures, storedExplanation []byte
		if err := tx.QueryRowContext(ctx, `SELECT parent_signal_id,symbol,occurred_at_ns,direction,phase,detector,
			CAST(entry_price * 100000000 AS INTEGER),feature_version,label_version,label_cost_version,label_cost_bps,features_json,explanation_json
			FROM signals WHERE signal_id=?`, record.ID).Scan(&parent, &symbol, &occurred, &direction, &phase, &detector, &price,
			&featureVersion, &labelVersion, &labelCostVersion, &labelCost, &storedFeatures, &storedExplanation); err != nil {
			return err
		}
		if parent.String != record.ParentID || symbol != record.Symbol || occurred != record.OccurredAt.UTC().UnixNano() ||
			direction != record.Direction || phase != record.Phase || detector != record.Detector || price != int64(record.Price*100000000) ||
			featureVersion != record.FeatureVersion || labelVersion != record.LabelVersion || labelCostVersion != record.LabelCostVersion || labelCost != record.LabelCostBps ||
			string(storedFeatures) != string(features) || string(storedExplanation) != string(explanation) {
			return fmt.Errorf("signal id %q already belongs to a different record", record.ID)
		}
		return tx.Commit()
	}
	for _, horizon := range Horizons {
		if _, err := tx.ExecContext(ctx, `INSERT INTO signal_outcomes(signal_id,horizon_seconds,status,entry_price) VALUES(?,?,?,?)`,
			record.ID, int64(horizon.Seconds()), OutcomePending, record.Price); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// RecordDecision writes exactly one durable decision per signal stage. Replays
// of the same result are harmless; contradictory decisions are surfaced.
func (r *Repository) RecordDecision(ctx context.Context, decision DecisionRecord) error {
	if decision.SignalID == "" || decision.Stage == "" || decision.Result == "" {
		return errors.New("decision requires signal id, stage, and result")
	}
	if decision.At.IsZero() {
		decision.At = time.Now().UTC()
	}
	details, err := marshalSnapshot(decision.Details)
	if err != nil {
		return fmt.Errorf("marshal decision details: %w", err)
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	res, err := r.db.ExecContext(ctx, `INSERT OR IGNORE INTO signal_decisions(signal_id,stage,result,details_json,decided_at_ns) VALUES(?,?,?,?,?)`,
		decision.SignalID, decision.Stage, decision.Result, details, decision.At.UTC().UnixNano())
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n != 0 {
		return nil
	}
	var existing string
	if err := r.db.QueryRowContext(ctx, `SELECT result FROM signal_decisions WHERE signal_id=? AND stage=?`, decision.SignalID, decision.Stage).Scan(&existing); err != nil {
		return err
	}
	if existing != decision.Result {
		return fmt.Errorf("signal %q already has %s decision %q", decision.SignalID, decision.Stage, existing)
	}
	return nil
}

// PerformanceGateDecision is an append-only record of an operator's review.
// Recording it is intentionally separate from execution configuration: no
// decision here can enable AUTO_TRADE_DEMO or live trading.
type PerformanceGateDecision struct {
	ID        string
	SetupKey  string
	Action    string
	Eligible  bool
	Reasons   []string
	DecidedBy string
	At        time.Time
}

func (r *Repository) RecordPerformanceGateDecision(ctx context.Context, decision PerformanceGateDecision) error {
	if decision.ID == "" || decision.SetupKey == "" || decision.Action == "" || decision.DecidedBy == "" {
		return errors.New("performance gate decision requires id, setup key, action, and operator")
	}
	if decision.At.IsZero() {
		decision.At = time.Now().UTC()
	}
	reasons, err := marshalSnapshot(decision.Reasons)
	if err != nil {
		return fmt.Errorf("marshal performance gate reasons: %w", err)
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	res, err := r.db.ExecContext(ctx, `INSERT OR IGNORE INTO performance_gate_decisions
		(decision_id,setup_key,action,eligible,reasons_json,decided_by,decided_at_ns) VALUES(?,?,?,?,?,?,?)`,
		decision.ID, decision.SetupKey, decision.Action, decision.Eligible, reasons, decision.DecidedBy, decision.At.UTC().UnixNano())
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n != 0 {
		return nil
	}
	var setupKey, action, operator string
	var eligible bool
	if err := r.db.QueryRowContext(ctx, `SELECT setup_key,action,eligible,decided_by FROM performance_gate_decisions WHERE decision_id=?`, decision.ID).
		Scan(&setupKey, &action, &eligible, &operator); err != nil {
		return err
	}
	if setupKey != decision.SetupKey || action != decision.Action || eligible != decision.Eligible || operator != decision.DecidedBy {
		return fmt.Errorf("performance gate decision %q already belongs to different data", decision.ID)
	}
	return nil
}

// ObserveMark attaches a source-timestamped mark only after each horizon has
// elapsed. DirectionBps is positive when the signal's direction was correct.
func (r *Repository) ObserveMark(ctx context.Context, symbol string, mark float64, source string, sourceAt time.Time) error {
	if symbol == "" || mark <= 0 || source == "" || sourceAt.IsZero() {
		return errors.New("mark requires symbol, positive price, source, and source timestamp")
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	rows, err := r.db.QueryContext(ctx, `SELECT o.signal_id,o.horizon_seconds,o.entry_price,s.direction,s.label_cost_bps,s.label_version
		FROM signal_outcomes o JOIN signals s ON s.signal_id=o.signal_id
		WHERE s.symbol=? AND o.status=? AND s.occurred_at_ns + o.horizon_seconds * 1000000000 <= ?`,
		symbol, OutcomePending, sourceAt.UTC().UnixNano())
	if err != nil {
		return err
	}
	defer rows.Close()
	type pending struct {
		id, direction  string
		horizon        int64
		entry, costBps float64
		labelVersion   string
	}
	var pendingOutcomes []pending
	for rows.Next() {
		var p pending
		if err := rows.Scan(&p.id, &p.horizon, &p.entry, &p.direction, &p.costBps, &p.labelVersion); err != nil {
			return err
		}
		pendingOutcomes = append(pendingOutcomes, p)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, p := range pendingOutcomes {
		returnBps := (mark - p.entry) / p.entry * 10_000
		directionBps := returnBps
		if p.direction == "SHORT" || p.direction == "DUMP" {
			directionBps = -returnBps
		}
		profitPercent := (directionBps - float64(p.costBps)) / 100
		label := "LOSS"
		if profitPercent > 0 {
			label = "WIN"
		}
		if _, err := r.db.ExecContext(ctx, `UPDATE signal_outcomes SET status=?,mark_price=?,return_bps=?,direction_bps=?,source=?,source_at_ns=?,observed_at_ns=?,label=?,profit_percent=?,label_version=?
			WHERE signal_id=? AND horizon_seconds=? AND status=?`,
			OutcomeObserved, mark, returnBps, directionBps, source, sourceAt.UTC().UnixNano(), time.Now().UTC().UnixNano(), label, profitPercent, p.labelVersion,
			p.id, p.horizon, OutcomePending); err != nil {
			return err
		}
	}
	return nil
}

// MarkMissing finalizes stale pending horizons without inventing an outcome.
func (r *Repository) MarkMissing(ctx context.Context, now time.Time, grace time.Duration) error {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	if grace < 0 {
		grace = 0
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	_, err := r.db.ExecContext(ctx, `UPDATE signal_outcomes SET status=?,observed_at_ns=?
		WHERE status=? AND (SELECT occurred_at_ns FROM signals WHERE signal_id=signal_outcomes.signal_id) + (horizon_seconds + ?) * 1000000000 <= ?`,
		OutcomeMissing, now.UTC().UnixNano(), OutcomePending, int64(grace.Seconds()), now.UTC().UnixNano())
	return err
}

func (r *Repository) Outcomes(ctx context.Context, signalID string) ([]Outcome, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT signal_id,horizon_seconds,status,entry_price,COALESCE(mark_price,0),COALESCE(return_bps,0),COALESCE(direction_bps,0),
		COALESCE(source,''),COALESCE(source_at_ns,0),COALESCE(observed_at_ns,0),COALESCE(label,''),profit_percent,COALESCE(label_version,'')
		FROM signal_outcomes WHERE signal_id=? ORDER BY horizon_seconds`, signalID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Outcome
	for rows.Next() {
		var o Outcome
		var horizon, sourceAt, observedAt int64
		if err := rows.Scan(&o.SignalID, &horizon, &o.Status, &o.EntryPrice, &o.MarkPrice, &o.ReturnBps, &o.DirectionBps, &o.Source, &sourceAt, &observedAt, &o.Label, &o.ProfitPercent, &o.LabelVersion); err != nil {
			return nil, err
		}
		o.Horizon = time.Duration(horizon) * time.Second
		if sourceAt > 0 {
			o.SourceAt = time.Unix(0, sourceAt).UTC()
		}
		if observedAt > 0 {
			o.ObservedAt = time.Unix(0, observedAt).UTC()
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

// ResearchSamples returns one reproducible outcome horizon per signal. It is
// intentionally read-only and includes MISSING outcomes so reports cannot hide
// data-quality gaps.
func (r *Repository) ResearchSamples(ctx context.Context, horizon time.Duration) ([]ResearchSample, error) {
	if horizon <= 0 {
		return nil, errors.New("research horizon must be positive")
	}
	rows, err := r.db.QueryContext(ctx, `SELECT s.signal_id,s.occurred_at_ns,s.features_json,o.status,COALESCE(o.direction_bps,0),COALESCE(o.source,''),
		EXISTS(SELECT 1 FROM signal_decisions d WHERE d.signal_id=s.signal_id AND d.stage=?),
		EXISTS(SELECT 1 FROM signal_decisions d WHERE d.signal_id=s.signal_id AND d.result='REJECTED'),
		COALESCE((SELECT MIN(all_o.direction_bps) FROM signal_outcomes all_o WHERE all_o.signal_id=s.signal_id AND all_o.status=?),0),
		COALESCE((SELECT MAX(all_o.direction_bps) FROM signal_outcomes all_o WHERE all_o.signal_id=s.signal_id AND all_o.status=?),0),
		(SELECT COUNT(*) FROM signal_outcomes all_o WHERE all_o.signal_id=s.signal_id AND all_o.status=?)
		FROM signals s JOIN signal_outcomes o ON o.signal_id=s.signal_id
		WHERE o.horizon_seconds=? ORDER BY s.occurred_at_ns,s.signal_id`,
		DecisionCandidate, OutcomeObserved, OutcomeObserved, OutcomeObserved, int64(horizon.Seconds()))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ResearchSample
	for rows.Next() {
		var sample ResearchSample
		var occurred int64
		var features []byte
		var known int
		if err := rows.Scan(&sample.SignalID, &occurred, &features, &sample.Status, &sample.DirectionBps, &sample.OutcomeSource,
			&sample.Candidate, &sample.Rejected,
			&sample.MAEBps, &sample.MFEBps, &known); err != nil {
			return nil, err
		}
		sample.ExcursionsKnown = known > 0
		sample.OccurredAt = time.Unix(0, occurred).UTC()
		var snapshot map[string]any
		if err := json.Unmarshal(features, &snapshot); err != nil {
			return nil, fmt.Errorf("decode features for signal %q: %w", sample.SignalID, err)
		}
		sample.AggregateOrderID = snapshotString(snapshot, "aggregate_order_id", "AggregateOrderID")
		sample.Setup = snapshotString(snapshot, "setup", "setup_type", "SetupType")
		sample.LiquidityTier = snapshotString(snapshot, "liquidity_tier", "LiquidityTier")
		sample.Regime = snapshotString(snapshot, "regime", "MarketRegime")
		sample.ScoreBucket = snapshotString(snapshot, "score_bucket", "ScoreBucket")
		if sample.Setup == "" {
			sample.Setup = "UNKNOWN"
		}
		if sample.LiquidityTier == "" {
			sample.LiquidityTier = "UNKNOWN"
		}
		if sample.Regime == "" {
			sample.Regime = "UNKNOWN"
		}
		if sample.ScoreBucket == "" {
			sample.ScoreBucket = frozenScoreBucket(snapshotInt(snapshot, "score", "Score"))
		}
		if sample.OutcomeSource != "DEMO_REALIZED" {
			sample.OutcomeSource = "PAPER_MARK"
		}
		out = append(out, sample)
	}
	return out, rows.Err()
}

func snapshotString(snapshot map[string]any, keys ...string) string {
	for _, key := range keys {
		if value, ok := snapshot[key].(string); ok {
			return value
		}
	}
	return ""
}

func snapshotInt(snapshot map[string]any, keys ...string) int {
	for _, key := range keys {
		if value, ok := snapshot[key].(float64); ok {
			return int(value)
		}
	}
	return -1
}

// frozenScoreBucket is calculated exclusively from the immutable T0 feature
// snapshot. It must not consult current strategy thresholds.
func frozenScoreBucket(score int) string {
	switch {
	case score >= 90:
		return "90_100"
	case score >= 80:
		return "80_89"
	case score >= 70:
		return "70_79"
	case score >= 60:
		return "60_69"
	case score >= 0:
		return "0_59"
	default:
		return "UNBUCKETED"
	}
}

// TrainingRows projects immutable T0 features with deferred, after-cost labels.
// PENDING and MISSING outcomes deliberately have no label or profit value.
func (r *Repository) TrainingRows(ctx context.Context, horizon time.Duration, costs TrainingCosts) ([]TrainingRow, error) {
	if !supportedHorizon(horizon) {
		return nil, fmt.Errorf("unsupported training horizon %s", horizon)
	}
	if err := validateTrainingCosts(costs); err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, `SELECT s.signal_id,s.occurred_at_ns,s.symbol,s.direction,s.phase,s.feature_version,s.features_json,
		o.status,COALESCE(o.direction_bps,0),COALESCE(o.label_version,'')
		FROM signals s JOIN signal_outcomes o ON o.signal_id=s.signal_id
		WHERE o.horizon_seconds=? ORDER BY s.occurred_at_ns,s.signal_id`, int64(horizon.Seconds()))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TrainingRow
	for rows.Next() {
		var row TrainingRow
		var occurred int64
		var version string
		var raw []byte
		var directionBps float64
		if err := rows.Scan(&row.SignalID, &occurred, &row.Symbol, &row.Direction, &row.Phase, &version, &raw,
			&row.OutcomeStatus, &directionBps, &row.LabelVersion); err != nil {
			return nil, err
		}
		row.OccurredAt = time.Unix(0, occurred).UTC()
		row.Horizon = horizon
		row.HorizonSeconds = int64(horizon.Seconds())
		row.CostVersion = costs.Version
		row.EntryFeeBps = costs.EntryFeeBps
		row.ExitFeeBps = costs.ExitFeeBps
		row.SlippageBps = costs.SlippageBps
		row.TotalCostBps = costs.TotalBps()
		if err := json.Unmarshal(raw, &row.Features); err != nil {
			return nil, fmt.Errorf("decode training features for signal %q: %w", row.SignalID, err)
		}
		if row.Features.FeatureVersion == "" {
			row.Features.FeatureVersion = version
		}
		if row.OutcomeStatus == OutcomeObserved {
			profit := (directionBps - costs.TotalBps()) / 100
			row.ProfitPercent = &profit
			row.Label = "LOSS"
			if profit > 0 {
				row.Label = "WIN"
			}
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func validateTrainingCosts(costs TrainingCosts) error {
	if strings.TrimSpace(costs.Version) == "" {
		return errors.New("training cost version is required")
	}
	if costs.EntryFeeBps < 0 || costs.ExitFeeBps < 0 || costs.SlippageBps < 0 {
		return errors.New("training cost values must be non-negative bps")
	}
	if costs.TotalBps() <= 0 {
		return errors.New("training costs must be positive; zero-cost labels are unsafe")
	}
	return nil
}

func supportedHorizon(horizon time.Duration) bool {
	for _, candidate := range Horizons {
		if candidate == horizon {
			return true
		}
	}
	return false
}

// WriteTrainingJSONL writes a read-only, stable projection suitable for an
// offline dataset job. It never updates ledger rows.
func WriteTrainingJSONL(w io.Writer, rows []TrainingRow) error {
	encoder := json.NewEncoder(w)
	for _, row := range rows {
		if err := encoder.Encode(row); err != nil {
			return err
		}
	}
	return nil
}

// WriteTrainingCSV writes the same projection with an explicit schema header.
func WriteTrainingCSV(w io.Writer, rows []TrainingRow) error {
	writer := csv.NewWriter(w)
	if err := writer.Write([]string{"signal_id", "occurred_at", "symbol", "direction", "phase", "horizon_seconds", "outcome_status",
		"feature_version", "volume_ratio", "oi_change", "price_change", "funding", "orderflow", "spread", "atr", "btc_change",
		"market_regime", "multitf_score", "multitf_available", "multitf_reason", "setup", "score", "label", "profit_percent", "label_version",
		"cost_version", "entry_fee_bps", "exit_fee_bps", "slippage_bps", "total_cost_bps"}); err != nil {
		return err
	}
	for _, row := range rows {
		profit := ""
		if row.ProfitPercent != nil {
			profit = strconv.FormatFloat(*row.ProfitPercent, 'f', -1, 64)
		}
		f := row.Features
		if err := writer.Write([]string{row.SignalID, row.OccurredAt.Format(time.RFC3339Nano), row.Symbol, row.Direction, row.Phase,
			strconv.FormatInt(int64(row.Horizon.Seconds()), 10), row.OutcomeStatus, f.FeatureVersion,
			strconv.FormatFloat(f.VolumeRatio, 'f', -1, 64), strconv.FormatFloat(f.OIChange, 'f', -1, 64),
			strconv.FormatFloat(f.PriceChange, 'f', -1, 64), strconv.FormatFloat(f.Funding, 'f', -1, 64),
			strconv.FormatFloat(f.Orderflow, 'f', -1, 64), strconv.FormatFloat(f.Spread, 'f', -1, 64),
			strconv.FormatFloat(f.ATR, 'f', -1, 64), strconv.FormatFloat(f.BTCChange, 'f', -1, 64),
			f.MarketRegime, strconv.FormatFloat(f.MultiTFScore, 'f', -1, 64), strconv.FormatBool(f.MultiTFAvailable),
			f.MultiTFReason, f.Setup, strconv.Itoa(f.Score), row.Label, profit, row.LabelVersion, row.CostVersion,
			strconv.FormatFloat(row.EntryFeeBps, 'f', -1, 64), strconv.FormatFloat(row.ExitFeeBps, 'f', -1, 64),
			strconv.FormatFloat(row.SlippageBps, 'f', -1, 64), strconv.FormatFloat(row.TotalCostBps, 'f', -1, 64)}); err != nil {
			return err
		}
	}
	writer.Flush()
	return writer.Error()
}

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}
