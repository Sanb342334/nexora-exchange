package main

import "testing"

func TestParseCostModelRequiresVersionAndPositiveRoundTripCost(t *testing.T) {
	if _, err := parseCostModel("", "6", "6", "3"); err == nil {
		t.Fatal("missing cost version was accepted")
	}
	if _, err := parseCostModel("demo-linear/v1", "0", "0", "0"); err == nil {
		t.Fatal("zero-cost replay was accepted")
	}
	costs, err := parseCostModel("demo-linear/v1", "6", "6", "3")
	if err != nil {
		t.Fatal(err)
	}
	if costs.RoundTripBps != 18 || costs.Version != "demo-linear/v1" {
		t.Fatalf("unexpected replay costs: %#v", costs)
	}
}
