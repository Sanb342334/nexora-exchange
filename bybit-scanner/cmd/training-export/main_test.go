package main

import "testing"

func TestParseCostsRequiresVersionAndPositiveCosts(t *testing.T) {
	if _, err := parseCosts("", "6", "6", "3"); err == nil {
		t.Fatal("missing cost version was accepted")
	}
	if _, err := parseCosts("demo-linear/v1", "0", "0", "0"); err == nil {
		t.Fatal("zero-cost labels were accepted")
	}
	costs, err := parseCosts("demo-linear/v1", "6", "6", "3")
	if err != nil {
		t.Fatal(err)
	}
	if costs.Version != "demo-linear/v1" || costs.TotalBps() != 18 {
		t.Fatalf("unexpected export costs: %#v", costs)
	}
}
