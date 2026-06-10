'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { DerivWS, CandlesResponse, TicksHistoryResponse } from '@deriv/core';

export type StrategyMode = 'Candles' | 'Ticks';

export interface UseGeminiStrategyParams {
  ws: DerivWS | null;
  symbol: string;
  mode: StrategyMode;
  granularity?: number;
  stake: string;
  duration: number;
  durationUnit: string;
  enabled?: boolean;
}

export interface GeminiSignal {
  signal: 'CALL' | 'PUT' | 'WAIT';
  confidence: number;
  reasoning: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  suggested_duration?: number;
}

export interface UseGeminiStrategyReturn {
  lastSignal: GeminiSignal | null;
  isAnalyzing: boolean;
  error: string | null;
  marketData: any[];
}

export function useGeminiStrategy({
  ws,
  symbol,
  mode,
  granularity = 60,
  stake,
  duration,
  durationUnit,
  enabled,
}: UseGeminiStrategyParams): UseGeminiStrategyReturn {
  const [lastSignal, setLastSignal] = useState<GeminiSignal | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const marketDataRef = useRef<any[]>([]);
  const isExecutingRef = useRef(false);

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
      } finally {
        isExecutingRef.current = false;
      }
    },
    [ws, symbol]
  );

  const analyzeMarket = useCallback(async () => {
    if (!enabled || isAnalyzing || marketDataRef.current.length < 10) return;

    setIsAnalyzing(true);
    try {
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketData: marketDataRef.current,
          symbol,
          strategyType: mode,
        }),
      });

      const data = (await response.json()) as GeminiSignal;

      // Risk Management: Confidence threshold and Risk level filtering
      const confidenceThreshold = 0.8;
      const allowedRiskLevels = ['LOW', 'MEDIUM'];

      if (
        data.signal &&
        data.signal !== 'WAIT' &&
        data.confidence >= confidenceThreshold &&
        allowedRiskLevels.includes(data.risk_level)
      ) {
        setLastSignal(data);

        // Automated Risk Alert would be a toast or state, handled here
        const tradeDuration = data.suggested_duration || duration;
        await executeTrade(data.signal, stake, tradeDuration, durationUnit);
      } else {
          setLastSignal(data);
      }
    } catch (err) {
      console.error('Gemini analysis failed:', err);
      setError('Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  }, [enabled, isAnalyzing, symbol, mode, stake, duration, durationUnit, executeTrade]);

  useEffect(() => {
    if (!ws || !symbol || !enabled) return;

    let unsubscribe: (() => void) | undefined;
    marketDataRef.current = [];

    const handleData = (data: any) => {
      if (mode === 'Candles') {
        if (data.ohlc) {
          const newCandle = {
            epoch: data.ohlc.open_time,
            open: parseFloat(data.ohlc.open),
            high: parseFloat(data.ohlc.high),
            low: parseFloat(data.ohlc.low),
            close: parseFloat(data.ohlc.close),
          };

          const lastCandle = marketDataRef.current[marketDataRef.current.length - 1];
          if (lastCandle && lastCandle.epoch === newCandle.epoch) {
            marketDataRef.current[marketDataRef.current.length - 1] = newCandle;
          } else {
            marketDataRef.current.push(newCandle);
            if (marketDataRef.current.length > 50) marketDataRef.current.shift();
            analyzeMarket();
          }
        }
      } else {
        if (data.tick) {
          marketDataRef.current.push({
            epoch: data.tick.epoch,
            price: data.tick.quote,
          });
          if (marketDataRef.current.length > 50) marketDataRef.current.shift();

          // For ticks, analyze every 5 ticks
          if (marketDataRef.current.length % 5 === 0) {
            analyzeMarket();
          }
        }
      }
    };

    const init = async () => {
      try {
        if (mode === 'Candles') {
          const historyReq = {
            ticks_history: symbol,
            style: 'candles',
            granularity,
            count: 50,
            end: 'latest',
          };
          const response = await ws.send<CandlesResponse>(historyReq);
          if (response.candles) {
            marketDataRef.current = response.candles.map((c) => ({
              epoch: c.epoch,
              open: parseFloat(c.open),
              high: parseFloat(c.high),
              low: parseFloat(c.low),
              close: parseFloat(c.close),
            }));
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
          const historyReq = {
            ticks_history: symbol,
            style: 'ticks',
            count: 50,
            end: 'latest',
          };
          const response = await ws.send<TicksHistoryResponse>(historyReq);
          if (response.history && response.history.prices) {
            marketDataRef.current = response.history.prices.map((p, i) => ({
              epoch: response.history.times[i],
              price: p,
            }));
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
        console.error('Failed to initialize Gemini strategy:', err);
        setError('Failed to initialize');
      }
    };

    init();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [ws, symbol, mode, granularity, enabled, analyzeMarket]);

  return {
    lastSignal,
    isAnalyzing,
    error,
    marketData: marketDataRef.current,
  };
}
