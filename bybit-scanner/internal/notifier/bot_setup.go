package notifier

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

func (n *Notifier) setupTelegram(ctx context.Context) {
	if err := n.deleteWebhook(ctx); err != nil {
		n.log.Errors.Warn().Err(err).Msg("telegram deleteWebhook")
	} else {
		n.log.Scanner.Info().Msg("telegram webhook cleared (polling mode)")
	}
	if err := n.setMyCommands(ctx); err != nil {
		n.log.Errors.Warn().Err(err).Msg("telegram setMyCommands")
	}
}

func (n *Notifier) deleteWebhook(ctx context.Context) error {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/deleteWebhook?drop_pending_updates=true", n.cfg.TelegramBotToken)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	res, err := n.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	var resp struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
	}
	_ = json.NewDecoder(res.Body).Decode(&resp)
	if !resp.OK {
		return fmt.Errorf("deleteWebhook: %s", resp.Description)
	}
	return nil
}

func (n *Notifier) setMyCommands(ctx context.Context) error {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/setMyCommands", n.cfg.TelegramBotToken)
	payload := map[string]interface{}{
		"commands": []map[string]string{
			{"command": "start", "description": "Подписаться на сигналы"},
			{"command": "panel", "description": "Главный trading terminal"},
			{"command": "check", "description": "Диагностика сканера"},
			{"command": "help", "description": "Справка и старые команды"},
			{"command": "stats", "description": "Статус и метрики"},
		},
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := n.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	var resp struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
	}
	_ = json.NewDecoder(res.Body).Decode(&resp)
	if !resp.OK {
		return fmt.Errorf("setMyCommands: %s", resp.Description)
	}
	return nil
}

func normalizeCommand(text string) string {
	text = strings.TrimSpace(text)
	if idx := strings.Index(text, "@"); idx > 0 {
		text = text[:idx]
	}
	return strings.ToLower(text)
}

func isCheckButton(text string) bool {
	return text == btnCheck || strings.Contains(text, "Проверка")
}
