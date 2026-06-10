'use client';

import { useDerivWSContext } from '@/components/custom/deriv-ws-provider';
import { useLogoSrc } from '@/components/custom/logo-src-provider';
import { Header } from '@/components/custom/header';
import { ThemeToggle } from '@/components/custom/theme-toggle';
import { Footer } from '@/components/custom/footer';
import { useRiseFallTrading } from '@/hooks/use-rise-fall-trading';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PositionsTable } from '@/components/custom/positions-table';
import { TrendingUp, TrendingDown, Activity, ShieldAlert } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const logoSrc = useLogoSrc();
  const { ws, isConnected, isExhausted, auth } = useDerivWSContext();
  const { authState, accounts, activeAccount, login, signUp, logout, switchAccount } = auth;
  const trading = useRiseFallTrading({ ws, isConnected, isExhausted, isAuthenticated: !!auth.wsUrl, onAuthWSFailed: logout });

  const stats = {
    totalProfit: trading.closedPositions.reduce((acc, p) => acc + (p.sell_price - p.buy_price), 0),
    winRate: trading.closedPositions.length > 0 ? (trading.closedPositions.filter(p => p.sell_price > p.buy_price).length / trading.closedPositions.length) * 100 : 0,
    openTrades: trading.openPositions.length,
  };

  return (
    <main className="flex flex-col bg-background min-h-dvh">
      <Header
        authState={authState}
        accounts={accounts}
        activeAccount={activeAccount}
        onLogin={login}
        onSignUp={signUp}
        onLogout={logout}
        onSwitchAccount={switchAccount}
        logoSrc={logoSrc}
        actions={<ThemeToggle />}
      />
      <div className="h-[76px] shrink-0" />

      <div className="flex-1 w-full max-w-7xl mx-auto px-3 py-6 sm:px-4 sm:py-8 gap-6 flex flex-col">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">AI Trading Dashboard</h1>
            <p className="text-muted-foreground">Monitor your real-time performance and AI insights.</p>
          </div>
          <Link href="/" className="text-sm font-medium text-primary hover:underline">Back to Trade</Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${stats.totalProfit >= 0 ? 'text-green-500' : 'text-destructive'}`}>
                ${stats.totalProfit.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">Across all closed positions</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
              <Activity className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.winRate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">Success rate of AI signals</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open Positions</CardTitle>
              <TrendingDown className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.openTrades}</div>
              <p className="text-xs text-muted-foreground">Currently active in market</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Risk Status</CardTitle>
              <ShieldAlert className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">SECURE</div>
              <p className="text-xs text-muted-foreground">Real-time risk management active</p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6">
          <h2 className="text-xl font-semibold mb-4">Trade History & Performance</h2>
          <PositionsTable
            openPositions={trading.openPositions}
            closedPositions={trading.closedPositions}
            onSell={trading.sellContract}
            sellingId={trading.sellingId}
            sellError={trading.sellError}
            onClearSellError={trading.clearSellError}
            contractTypeLabels={{CALL: 'Rise', PUT: 'Fall', CALLE: 'Rise (Equal)', PUTE: 'Fall (Equal)'}}
          />
        </div>
      </div>
      <Footer />
    </main>
  );
}
