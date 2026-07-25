package notifier

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const maxLogChars = 3800

func readLogTail(logDir, filename string, maxLines int) (string, error) {
	path := filepath.Join(logDir, filename)
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Sprintf("📄 <b>%s</b>\n\nФайл пока пуст или не создан.", filename), nil
		}
		return "", err
	}

	lines := strings.Split(strings.TrimRight(string(data), "\n"), "\n")
	if len(lines) == 0 {
		return fmt.Sprintf("📄 <b>%s</b>\n\nФайл пуст.", filename), nil
	}
	if len(lines) > maxLines {
		lines = lines[len(lines)-maxLines:]
	}

	text := strings.Join(lines, "\n")
	text = escapeHTML(text)

	header := fmt.Sprintf("📄 <b>%s</b> (последние %d строк)\n<code>", filename, len(lines))
	footer := "</code>"

	out := header + text + footer
	if len(out) > maxLogChars {
		out = out[:maxLogChars] + "…</code>"
	}
	return out, nil
}

func escapeHTML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return s
}
