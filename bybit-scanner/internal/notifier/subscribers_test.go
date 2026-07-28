package notifier

import "testing"

func TestSubscriberStorePersistsSymbolPreferences(t *testing.T) {
	dir := t.TempDir()
	store := NewSubscriberStore(dir)
	if _, err := store.SubscribeAndSave(42, "user", "User"); err != nil {
		t.Fatal(err)
	}

	favorite, err := store.ToggleFavorite(42, "btcusdt")
	if err != nil || !favorite {
		t.Fatalf("favorite = %v, err = %v", favorite, err)
	}
	ignored, err := store.ToggleIgnoredSymbol(42, "ethusdt")
	if err != nil || !ignored {
		t.Fatalf("ignored = %v, err = %v", ignored, err)
	}

	reloaded := NewSubscriberStore(dir)
	if !reloaded.IgnoresSymbol(42, "ETHUSDT") {
		t.Fatal("ignored symbol was not persisted")
	}
	favorite, err = reloaded.ToggleFavorite(42, "BTCUSDT")
	if err != nil || favorite {
		t.Fatalf("favorite removal = %v, err = %v", favorite, err)
	}
}
