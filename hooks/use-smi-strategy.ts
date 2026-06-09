'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { DerivWS } from '@deriv/core';
import { calculateSMI, DEFAULT_SMI_PARAMS, type OHLC, type SMIResult } from '@/lib/smi-utils';

export type StrategyMode = 'Candles' | 'Ticks';

export interface UseSmiStrategyParams {
  ws: DerivWS | null;
  symbol: string;
  mode: StrategyMode;
  granularity?: number; // for candles, e.g., 60 for 1m
  stake: string;
  duration: number;
  durationUnit: string;
}

export interface UseSmiStrategyReturn {
  smiData: SMIResult[];
  lastResult: SMIResult | null;
  isCalculating: boolean;
  executeTrade: (type: 'CALL' | 'PUT', stake: string, duration: number, unit: string) => Promise<void>;
  error: string | null;
}

export function useSmiStrategy({
  ws,
  symbol,
  mode,
  granularity = 60,
  stake,
  duration,
  durationUnit,
}: UseSmiStrategyParams): UseSmiStrategyReturn {
  const [smiData, setSmiData] = useState<SMIResult[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candleState = useRef<OHLC[]>([]);
  const tickBuffer = useRef<number[]>([]);
  const lastSmiRef = useRef<SMIResult | null>(null);
  const lastCompletedSmiRef = useRef<SMIResult | null>(null);
  const isExecutingRef = useRef(false);

  const tradeParamsRef = useRef({ stake, duration, durationUnit });
  useEffect(() => {
    tradeParamsRef.current = { stake, duration, durationUnit };
  }, [stake, duration, durationUnit]);

  const executeTrade = useCallback(
    async (type: 'CALL' | 'PUT', tradeStake: string, tradeDuration: number, tradeUnit: string) => {
      if (!ws || isExecutingRef.current) return;

      try {
        isExecutingRef.current = true;
        const request = {
          buy: '1',
          price: parseFloat(tradeStake),
          parameters: {
            amount: parseFloat(tradeStake),
            basis: 'stake',
            contract_type: type,
            currency: 'USD',
            duration: tradeDuration,
            duration_unit: tradeUnit,
            symbol: symbol,
          },
        };
        await ws.send(request);
      } catch (err) {
        console.error('Trade execution failed:', err);
        setError('Trade execution failed');
      } finally {
        isExecutingRef.current = false;
      }
    },
    [ws, symbol]
  );

  const checkCandleStrategy = useCallback(
    (current: SMIResult, previous: SMIResult) => {
      const overbought = 40;
      const oversold = -40;

      const { stake: currentStake, duration: currentDuration, durationUnit: currentUnit } = tradeParamsRef.current;

      // Rise (Buy Call): SMI Line crosses ABOVE Signal Line while both are below Oversold (-40)
      if (
        previous.smi <= previous.signal &&
        current.smi > current.signal &&
        current.smi < oversold &&
        current.signal < oversold
      ) {
        executeTrade('CALL', currentStake, currentDuration, currentUnit);
      }

      // Fall (Buy Put): SMI Line crosses BELOW Signal Line while both are above Overbought (+40)
      if (
        previous.smi >= previous.signal &&
        current.smi < current.signal &&
        current.smi > overbought &&
        current.signal > overbought
      ) {
        executeTrade('PUT', currentStake, currentDuration, currentUnit);
      }
    },
    [executeTrade]
  );

  const checkTickStrategy = useCallback(
    (current: SMIResult, previous: SMIResult) => {
      const boundary = 70;
      const { stake: currentStake, duration: currentDuration, durationUnit: currentUnit } = tradeParamsRef.current;

      // Trigger if SMI pierces extreme boundaries (± 70) and shows immediate directional reversal

      // Reversal from below -70
      if (previous.smi <= -boundary && current.smi > previous.smi) {
        executeTrade('CALL', currentStake, currentDuration, currentUnit);
      }

      // Reversal from above +70
      if (previous.smi >= boundary && current.smi < previous.smi) {
        executeTrade('PUT', currentStake, currentDuration, currentUnit);
      }
    },
    [executeTrade]
  );

  useEffect(() => {
    if (!ws || !symbol) return;

    let unsubscribe: (() => void) | undefined;
    candleState.current = [];
    tickBuffer.current = [];
    lastSmiRef.current = null;
    setSmiData([]);

    const handleData = (data: any) => {
      if (mode === 'Candles') {
        if (data.ohlc) {
          const newCandle: OHLC = {
            epoch: data.ohlc.open_time,
            open: parseFloat(data.ohlc.open),
            high: parseFloat(data.ohlc.high),
            low: parseFloat(data.ohlc.low),
            close: parseFloat(data.ohlc.close),
          };

          const lastCandle = candleState.current[candleState.current.length - 1];
          let results: SMIResult[] = [];

          if (lastCandle && lastCandle.epoch === newCandle.epoch) {
            candleState.current[candleState.current.length - 1] = newCandle;
            results = calculateSMI(candleState.current);
          } else {
            candleState.current.push(newCandle);
            if (candleState.current.length > 100) candleState.current.shift();
            results = calculateSMI(candleState.current);

            // On candle close (new candle starts), we check the completed candle's SMI against the previous one
            if (results.length >= 2 && lastCompletedSmiRef.current) {
               const completedSmi = results[results.length - 2];
               checkCandleStrategy(completedSmi, lastCompletedSmiRef.current);
            }
            // Update last completed SMI when a new candle starts
            if (results.length >= 2) {
                lastCompletedSmiRef.current = results[results.length - 2];
            }
          }

          if (results.length > 0) {
            lastSmiRef.current = results[results.length - 1];
            setSmiData(results);
          }
        }
      } else {
        // Ticks Mode
        if (data.tick) {
          const quote = data.tick.quote;
          tickBuffer.current.push(quote);
          if (tickBuffer.current.length > 50) tickBuffer.current.shift();

          if (tickBuffer.current.length >= DEFAULT_SMI_PARAMS.n) {
            const ohlcData: OHLC[] = [];
            const n = DEFAULT_SMI_PARAMS.n;

            // Build sliding OHLC from tick buffer
            // For SMI calculation, we need at least n + q + r + s points to get a valid last signal
            // But calculateSMI handles padding.
            for (let i = 0; i < tickBuffer.current.length; i++) {
                const start = Math.max(0, i - n + 1);
                const window = tickBuffer.current.slice(start, i + 1);
                ohlcData.push({
                    epoch: 0, // epoch not used in calculation
                    open: window[0],
                    high: Math.max(...window),
                    low: Math.min(...window),
                    close: window[window.length - 1],
                });
            }

            const results = calculateSMI(ohlcData);
            if (results.length > 0) {
              const currentSmi = results[results.length - 1];
              if (lastSmiRef.current) {
                checkTickStrategy(currentSmi, lastSmiRef.current);
              }
              lastSmiRef.current = currentSmi;
              setSmiData(results);
            }
          }
        }
      }
    };

    const init = async () => {
      setIsCalculating(true);
      setError(null);
      try {
        if (mode === 'Candles') {
          const historyReq = {
            ticks_history: symbol,
            style: 'candles',
            granularity,
            count: 100,
            end: 'latest',
          };
          const response = await ws.send(historyReq);
          if (response.candles) {
            candleState.current = response.candles.map((c: any) => ({
              epoch: c.epoch,
              open: parseFloat(c.open),
              high: parseFloat(c.high),
              low: parseFloat(c.low),
              close: parseFloat(c.close),
            }));
            const results = calculateSMI(candleState.current);
            setSmiData(results);
            if (results.length > 0) {
              lastSmiRef.current = results[results.length - 1];
            }
          }

          const sub = await ws.subscribe(
            {
              ticks_history: symbol,
              style: 'candles',
              granularity,
              subscribe: 1,
            },
            handleData
          );
          unsubscribe = sub.unsubscribe;
        } else {
          // Tick Mode
          const historyReq = {
            ticks_history: symbol,
            style: 'ticks',
            count: 50,
            end: 'latest',
          };
          const response = await ws.send(historyReq);
          if (response.history && response.history.prices) {
            tickBuffer.current = response.history.prices;

            const ohlcData: OHLC[] = [];
            const n = DEFAULT_SMI_PARAMS.n;
            for (let i = 0; i < tickBuffer.current.length; i++) {
                const start = Math.max(0, i - n + 1);
                const window = tickBuffer.current.slice(start, i + 1);
                ohlcData.push({
                    epoch: response.history.times[i],
                    open: window[0],
                    high: Math.max(...window),
                    low: Math.min(...window),
                    close: window[window.length - 1],
                });
            }
            const results = calculateSMI(ohlcData);
            setSmiData(results);
            if (results.length > 0) {
              lastSmiRef.current = results[results.length - 1];
            }
          }

          const sub = await ws.subscribe(
            {
              ticks: symbol,
              subscribe: 1,
            },
            handleData
          );
          unsubscribe = sub.unsubscribe;
        }
      } catch (err) {
        console.error('Failed to initialize SMI strategy:', err);
        setError('Failed to initialize SMI strategy');
      } finally {
        setIsCalculating(false);
      }
    };

    init();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [ws, symbol, mode, granularity]);

  return {
    smiData,
    lastResult: lastSmiRef.current,
    isCalculating,
    executeTrade,
    error,
  };
}
