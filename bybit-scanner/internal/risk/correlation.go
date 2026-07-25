package risk

import "strings"

func bucketForSymbol(symbol string, buckets map[string][]string) string {
	symbol = strings.ToUpper(symbol)
	for name, syms := range buckets {
		for _, s := range syms {
			if s == symbol {
				return name
			}
		}
	}
	return "alt"
}
