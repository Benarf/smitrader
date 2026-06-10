'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { runBacktest, type BacktestResult } from '@/lib/backtesting-utils';
import { Loader2 } from 'lucide-react';

interface BacktestingToolProps {
  historicalData: any[];
  symbol: string;
  stake: string;
  duration: number;
}

export function BacktestingTool({ historicalData, symbol, stake, duration }: BacktestingToolProps) {
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const startBacktest = async () => {
    setIsRunning(true);
    try {
      const mockStrategy = async (data: any[]) => {
        const response = await fetch('/api/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            marketData: data.slice(-20),
            symbol,
            strategyType: 'Backtest',
          }),
        });
        return await response.json();
      };

      const backtestResult = await runBacktest(
        historicalData,
        mockStrategy,
        parseFloat(stake),
        duration,
        't'
      );
      setResult(backtestResult);
    } catch (error) {
      console.error('Backtest failed:', error);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-lg">Automated Backtesting</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={startBacktest}
          disabled={isRunning || historicalData.length === 0}
          className="w-full"
        >
          {isRunning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running Backtest...</> : 'Run AI Backtest (Historical)'}
        </Button>

        {result && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded bg-muted">
              <span className="block opacity-70">Win Rate</span>
              <span className="text-lg font-bold">{(result.winRate * 100).toFixed(1)}%</span>
            </div>
            <div className="p-2 rounded bg-muted">
              <span className="block opacity-70">Total Profit</span>
              <span className={`text-lg font-bold ${result.totalProfit >= 0 ? 'text-green-500' : 'text-destructive'}`}>
                ${result.totalProfit.toFixed(2)}
              </span>
            </div>
            <div className="p-2 rounded bg-muted">
              <span className="block opacity-70">Total Trades</span>
              <span className="text-lg font-bold">{result.totalTrades}</span>
            </div>
            <div className="p-2 rounded bg-muted">
              <span className="block opacity-70">Max Drawdown</span>
              <span className="text-lg font-bold text-destructive">${result.maxDrawdown.toFixed(2)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
