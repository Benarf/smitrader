/**
 * SMI Calculation Utilities
 */

export interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
  epoch: number;
}

/**
 * Calculates EMA for an array of values
 * @param values Array of numbers
 * @param period EMA period
 * @returns Array of EMA values
 */
export function calculateEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const ema: number[] = [];
  const k = 2 / (period + 1);

  // Initialize with the first value or SMA
  ema[0] = values[0];

  for (let i = 1; i < values.length; i++) {
    ema[i] = (values[i] - ema[i - 1]) * k + ema[i - 1];
  }

  return ema;
}

export interface SMIResult {
  smi: number;
  signal: number;
}

export interface SMIParams {
  n: number; // Lookback window
  q: number; // First smoothing period
  r: number; // Second smoothing period
  s: number; // Signal smoothing period
}

export const DEFAULT_SMI_PARAMS: SMIParams = {
  n: 10,
  q: 3,
  r: 3,
  s: 3,
};

/**
 * Calculates Stochastic Momentum Index (SMI)
 * @param data Array of OHLC objects
 * @param params SMI parameters
 * @returns Array of SMI results (smi and signal lines)
 */
export function calculateSMI(data: OHLC[], params: SMIParams = DEFAULT_SMI_PARAMS): SMIResult[] {
  const { n, q, r, s } = params;
  if (data.length < n) return [];

  const ds: number[] = [];
  const hls: number[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i < n - 1) {
      ds.push(0);
      hls.push(0);
      continue;
    }

    const window = data.slice(i - n + 1, i + 1);
    const highestHigh = Math.max(...window.map(d => d.high));
    const lowestLow = Math.min(...window.map(d => d.low));

    const midpoint = (highestHigh + lowestLow) / 2;
    const d = data[i].close - midpoint;
    const hl = highestHigh - lowestLow;

    ds.push(d);
    hls.push(hl);
  }

  // Double smooth D
  const dSmoothed1 = calculateEMA(ds.slice(n - 1), q);
  const dSmoothed2 = calculateEMA(dSmoothed1, r);

  // Double smooth HL
  const hlSmoothed1 = calculateEMA(hls.slice(n - 1), q);
  const hlSmoothed2 = calculateEMA(hlSmoothed1, r);

  const smiLines: number[] = [];
  for (let i = 0; i < dSmoothed2.length; i++) {
    const d2 = dSmoothed2[i];
    const hl2 = hlSmoothed2[i];

    if (hl2 === 0) {
      smiLines.push(0);
    } else {
      smiLines.push(200 * (d2 / (hl2 / 2)));
    }
  }

  const signalLines = calculateEMA(smiLines, s);

  const results: SMIResult[] = [];
  // Pad the results to match input data length
  const offset = data.length - signalLines.length;
  for (let i = 0; i < data.length; i++) {
    if (i < offset) {
      results.push({ smi: 0, signal: 0 });
    } else {
      results.push({
        smi: smiLines[i - offset],
        signal: signalLines[i - offset],
      });
    }
  }

  return results;
}
