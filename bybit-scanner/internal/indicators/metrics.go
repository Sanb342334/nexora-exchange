package indicators

import (
	"math"

	"bybit-scanner/internal/analyzer"
)

func ema(values []float64, period int) float64 {
	if len(values) == 0 || period <= 0 {
		return 0
	}
	if len(values) < period {
		period = len(values)
	}
	k := 2.0 / (float64(period) + 1)
	sum := 0.0
	for i := 0; i < period; i++ {
		sum += values[i]
	}
	emaVal := sum / float64(period)
	for i := period; i < len(values); i++ {
		emaVal = values[i]*k + emaVal*(1-k)
	}
	return emaVal
}

func rsi(closes []float64, period int) float64 {
	if len(closes) <= period || period <= 0 {
		return 50
	}
	gain, loss := 0.0, 0.0
	for i := 1; i <= period; i++ {
		delta := closes[i] - closes[i-1]
		if delta >= 0 {
			gain += delta
		} else {
			loss -= delta
		}
	}
	avgGain := gain / float64(period)
	avgLoss := loss / float64(period)
	for i := period + 1; i < len(closes); i++ {
		delta := closes[i] - closes[i-1]
		if delta >= 0 {
			avgGain = (avgGain*float64(period-1) + delta) / float64(period)
			avgLoss = (avgLoss * float64(period-1)) / float64(period)
		} else {
			avgGain = (avgGain * float64(period-1)) / float64(period)
			avgLoss = (avgLoss*float64(period-1) - delta) / float64(period)
		}
	}
	if avgLoss == 0 {
		return 100
	}
	rs := avgGain / avgLoss
	return 100 - (100 / (1 + rs))
}

func macdHistogram(closes []float64) float64 {
	if len(closes) < 26 {
		return 0
	}
	fast := emaSeries(closes, 12)
	slow := emaSeries(closes, 26)
	if len(fast) == 0 || len(slow) == 0 {
		return 0
	}
	minLen := len(fast)
	if len(slow) < minLen {
		minLen = len(slow)
	}
	macdLine := make([]float64, minLen)
	for i := 0; i < minLen; i++ {
		macdLine[i] = fast[len(fast)-minLen+i] - slow[len(slow)-minLen+i]
	}
	if len(macdLine) < 9 {
		return macdLine[len(macdLine)-1]
	}
	signal := emaSeries(macdLine, 9)
	if len(signal) == 0 {
		return 0
	}
	return macdLine[len(macdLine)-1] - signal[len(signal)-1]
}

func emaSeries(values []float64, period int) []float64 {
	if len(values) == 0 || period <= 0 {
		return nil
	}
	out := make([]float64, 0, len(values))
	k := 2.0 / (float64(period) + 1)
	for i, v := range values {
		if i == 0 {
			out = append(out, v)
			continue
		}
		out = append(out, v*k+out[i-1]*(1-k))
	}
	return out
}

func bollingerPosition(closes []float64, period int, mult float64) float64 {
	if len(closes) < period || period <= 0 {
		return 0
	}
	window := closes[len(closes)-period:]
	mean := 0.0
	for _, c := range window {
		mean += c
	}
	mean /= float64(period)
	variance := 0.0
	for _, c := range window {
		d := c - mean
		variance += d * d
	}
	std := math.Sqrt(variance / float64(period))
	if std == 0 {
		return 0
	}
	last := closes[len(closes)-1]
	return (last - mean) / (mult * std)
}

func volumeRatio(candles []analyzer.Candle, lookback int) float64 {
	if len(candles) == 0 {
		return 0
	}
	last := candles[len(candles)-1].VolumeUSDT
	if last <= 0 {
		return 0
	}
	start := 0
	if len(candles) > lookback+1 {
		start = len(candles) - lookback - 1
	}
	sum := 0.0
	count := 0
	for i := start; i < len(candles)-1; i++ {
		sum += candles[i].VolumeUSDT
		count++
	}
	if count == 0 {
		return 0
	}
	avg := sum / float64(count)
	if avg <= 0 {
		return 0
	}
	return last / avg
}

// Vote holds one indicator's directional vote: +1 bullish, -1 bearish, 0 neutral.
type Vote struct {
	Name  string
	Value float64
	Score int
}

func fiveVotes(candles []analyzer.Candle, rsiPeriod int) []Vote {
	closes := candleCloses(candles)
	votes := make([]Vote, 0, 5)

	rsiVal := rsi(closes, rsiPeriod)
	switch {
	case rsiVal >= 55:
		votes = append(votes, Vote{Name: "RSI", Value: rsiVal, Score: 1})
	case rsiVal <= 45:
		votes = append(votes, Vote{Name: "RSI", Value: rsiVal, Score: -1})
	default:
		votes = append(votes, Vote{Name: "RSI", Value: rsiVal, Score: 0})
	}

	if len(closes) >= 26 {
		fast := ema(closes, 12)
		slow := ema(closes, 26)
		switch {
		case fast > slow*1.0005:
			votes = append(votes, Vote{Name: "EMA12/26", Value: fast - slow, Score: 1})
		case fast < slow*0.9995:
			votes = append(votes, Vote{Name: "EMA12/26", Value: fast - slow, Score: -1})
		default:
			votes = append(votes, Vote{Name: "EMA12/26", Value: fast - slow, Score: 0})
		}
	}

	hist := macdHistogram(closes)
	switch {
	case hist > 0:
		votes = append(votes, Vote{Name: "MACD", Value: hist, Score: 1})
	case hist < 0:
		votes = append(votes, Vote{Name: "MACD", Value: hist, Score: -1})
	default:
		votes = append(votes, Vote{Name: "MACD", Value: hist, Score: 0})
	}

	vr := volumeRatio(candles, 20)
	switch {
	case vr >= 1.4:
		votes = append(votes, Vote{Name: "Volume", Value: vr, Score: 1})
	case vr <= 0.7:
		votes = append(votes, Vote{Name: "Volume", Value: vr, Score: -1})
	default:
		votes = append(votes, Vote{Name: "Volume", Value: vr, Score: 0})
	}

	bb := bollingerPosition(closes, 20, 2)
	switch {
	case bb >= 0.35:
		votes = append(votes, Vote{Name: "Bollinger", Value: bb, Score: 1})
	case bb <= -0.35:
		votes = append(votes, Vote{Name: "Bollinger", Value: bb, Score: -1})
	default:
		votes = append(votes, Vote{Name: "Bollinger", Value: bb, Score: 0})
	}

	if len(closes) >= 2 {
		momentum := (closes[len(closes)-1] - closes[len(closes)-2]) / closes[len(closes)-2] * 100
		switch {
		case momentum > 0.05:
			votes = append(votes, Vote{Name: "Momentum", Value: momentum, Score: 1})
		case momentum < -0.05:
			votes = append(votes, Vote{Name: "Momentum", Value: momentum, Score: -1})
		default:
			votes = append(votes, Vote{Name: "Momentum", Value: momentum, Score: 0})
		}
	}

	return votes
}

func sumVotes(votes []Vote) int {
	total := 0
	for _, v := range votes {
		total += v.Score
	}
	return total
}

func candleCloses(candles []analyzer.Candle) []float64 {
	out := make([]float64, len(candles))
	for i, c := range candles {
		out[i] = c.Close
	}
	return out
}

func candleVolumes(candles []analyzer.Candle) []float64 {
	out := make([]float64, len(candles))
	for i, c := range candles {
		out[i] = c.VolumeUSDT
	}
	return out
}
