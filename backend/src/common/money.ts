import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

// Configure global precision for monetary math.
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type Money = Decimal;

export const D = (value: Decimal.Value | Prisma.Decimal): Decimal =>
  new Decimal(value as Decimal.Value);

export const ZERO = new Decimal(0);

/** Round a monetary value to a fixed number of decimals (default 10 for crypto). */
export const round = (value: Decimal.Value, decimals = 10): Decimal =>
  new Decimal(value as Decimal.Value).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);

/** Round fiat to 2 decimals. */
export const roundFiat = (value: Decimal.Value): Decimal => round(value, 2);

/** Convert a Decimal to the string Prisma expects for Decimal columns. */
export const toDb = (value: Decimal): string => value.toFixed();

export const isPositive = (value: Decimal.Value): boolean =>
  new Decimal(value as Decimal.Value).gt(0);

export const gte = (a: Decimal.Value, b: Decimal.Value): boolean =>
  new Decimal(a as Decimal.Value).gte(b as Decimal.Value);
