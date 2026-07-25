package logger

import (
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"gopkg.in/natefinch/lumberjack.v2"
)

type Loggers struct {
	Console zerolog.Logger
	Scanner zerolog.Logger
	Signals zerolog.Logger
	Errors  zerolog.Logger
}

func Init(logDir string) (*Loggers, error) {
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		return nil, err
	}

	consoleWriter := zerolog.ConsoleWriter{
		Out:        os.Stdout,
		TimeFormat: time.RFC3339,
	}

	scannerFile := newRotatingWriter(filepath.Join(logDir, "scanner.log"))
	signalsFile := newRotatingWriter(filepath.Join(logDir, "signals.log"))
	errorsFile := newRotatingWriter(filepath.Join(logDir, "errors.log"))

	scannerMulti := io.MultiWriter(consoleWriter, scannerFile)
	errorsMulti := io.MultiWriter(consoleWriter, errorsFile)

	loggers := &Loggers{
		Console: zerolog.New(consoleWriter).With().Timestamp().Logger(),
		Scanner: zerolog.New(scannerMulti).With().Timestamp().Logger(),
		Signals: zerolog.New(signalsFile).With().Timestamp().Logger(),
		Errors:  zerolog.New(errorsMulti).With().Timestamp().Logger(),
	}

	log.Logger = loggers.Scanner
	zerolog.SetGlobalLevel(zerolog.InfoLevel)

	return loggers, nil
}

func newRotatingWriter(filename string) io.Writer {
	return &lumberjack.Logger{
		Filename:   filename,
		MaxSize:    10,
		MaxAge:     7,
		MaxBackups: 10,
		Compress:   true,
		LocalTime:  true,
	}
}
