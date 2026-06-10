export interface BacktestResult {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalProfit: number;
  maxDrawdown: number;
  history: {
    epoch: number;
    type: 'CALL' | 'PUT';
    entryPrice: number;
    exitPrice: number;
    profit: number;
    result: 'WIN' | 'LOSS';
  }[];
}

export async function runBacktest(
  historicalData: any[],
  strategyFn: (data: any[]) => Promise<{ signal: 'CALL' | 'PUT' | 'WAIT' }>,
  stake: number,
  duration: number,
  durationUnit: string
): Promise<BacktestResult> {
  let balance = 0;
  let totalTrades = 0;
  let winningTrades = 0;
  let losingTrades = 0;
  const history: BacktestResult['history'] = [];
  let maxBalance = 0;
  let maxDrawdown = 0;

  // Simplified backtesting: window-based
  for (let i = 20; i < historicalData.length - duration; i++) {
    const currentWindow = historicalData.slice(0, i);
    const { signal } = await strategyFn(currentWindow);

    if (signal !== 'WAIT') {
      const entryPrice = historicalData[i].close || historicalData[i].price;
      const exitIndex = i + duration;
      const exitPrice = historicalData[exitIndex].close || historicalData[exitIndex].price;

      let result: 'WIN' | 'LOSS' = 'LOSS';
      let profit = -stake;

      if (signal === 'CALL' && exitPrice > entryPrice) {
        result = 'WIN';
        profit = stake * 0.95; // Assuming 95% payout
      } else if (signal === 'PUT' && exitPrice < entryPrice) {
        result = 'WIN';
        profit = stake * 0.95;
      }

      totalTrades++;
      if (result === 'WIN') winningTrades++;
      else losingTrades++;

      balance += profit;
      maxBalance = Math.max(maxBalance, balance);
      maxDrawdown = Math.max(maxDrawdown, maxBalance - balance);

      history.push({
        epoch: historicalData[i].epoch,
        type: signal,
        entryPrice,
        exitPrice,
        profit,
        result
      });

      // Skip forward by duration to avoid overlapping trades in simple backtest
      i += duration;
    }
  }

  return {
    totalTrades,
    winningTrades,
    losingTrades,
    winRate: totalTrades > 0 ? winningTrades / totalTrades : 0,
    totalProfit: balance,
    maxDrawdown,
    history
  };
}
