'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart3,
  CalendarDays,
  Loader2,
} from 'lucide-react';

interface OBPerformance {
  orderbookerId: string;
  orderbookerName: string;
  orderbookerPhone: string | null;
  totalShops: number;
  totalOutstanding: number;
  todayRecovery: number;
  periodRecovery: number;
  lastActive: string | null;
  avgRecoveryPerShop: number;
  recoveryRate: number;
}

interface OBAnalyticsChartsProps {
  chartData: { name: string; fullName: string; Recovery: number; Outstanding: number }[];
  dailyBreakdownData: { date: string; credit: number; recovery: number }[];
  dailyBreakdownOB: OBPerformance | null;
  dailyBreakdownLoading: boolean;
  onCloseDailyBreakdown: () => void;
}

export default function OBAnalyticsCharts({
  chartData,
  dailyBreakdownData,
  dailyBreakdownOB,
  dailyBreakdownLoading,
  onCloseDailyBreakdown,
}: OBAnalyticsChartsProps) {
  return (
    <>
      {/* Performance Bar Chart */}
      <Card className="card-elevated hover-scale-102">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Top Orderbookers by Recovery
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-5">
          {chartData.length > 0 ? (
            <div className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="perfRecoveryGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.9} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0.4} />
                    </linearGradient>
                    <linearGradient id="perfOutstandingGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.9} />
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value: number) =>
                      value >= 1000 ? `${(value / 1000).toFixed(0)}k` : String(value)
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      fontSize: '12px',
                    }}
                    formatter={(value: number, name: string) => [
                      `Rs. ${value.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`,
                      name,
                    ]}
                    labelFormatter={(label: string) => {
                      const item = chartData.find(d => d.name === label);
                      return item?.fullName || label;
                    }}
                    labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={28}
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '12px' }}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="Recovery"
                    fill="url(#perfRecoveryGradient)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 sm:h-72 flex flex-col items-center justify-center text-sm text-muted-foreground">
              <BarChart3 className="h-10 w-10 mb-2 opacity-30" />
              <p>No performance data available</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily Breakdown Chart */}
      {dailyBreakdownOB && (
        <Card className="card-elevated hover-scale-102">
          <CardHeader className="pb-2 pt-4 px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                Daily Breakdown — {dailyBreakdownOB.orderbookerName}
              </CardTitle>
              <Button
            type="button"
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={onCloseDailyBreakdown}
              >
                Close
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Last 28 days — pre-aggregated from single API call</p>
          </CardHeader>
          <CardContent className="px-4 pb-5">
            {dailyBreakdownLoading ? (
              <div className="h-64 sm:h-72 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : dailyBreakdownData.length > 0 ? (
              <div className="h-64 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyBreakdownData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dailyCreditGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366F1" stopOpacity={0.9} />
                        <stop offset="95%" stopColor="#6366F1" stopOpacity={0.4} />
                      </linearGradient>
                      <linearGradient id="dailyRecoveryGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.9} />
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0.4} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: '#64748B' }}
                      axisLine={{ stroke: '#E2E8F0' }}
                      tickLine={false}
                      tickFormatter={(value: string) => {
                        const d = new Date(value);
                        return `${d.getDate()}/${d.getMonth() + 1}`;
                      }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#64748B' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(value: number) =>
                        value >= 1000 ? `${(value / 1000).toFixed(0)}k` : String(value)
                      }
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                        fontSize: '12px',
                      }}
                      formatter={(value: number, name: string) => [
                        `Rs. ${value.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`,
                        name,
                      ]}
                      labelFormatter={(label: string) => {
                        const d = new Date(label);
                        return d.toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric', month: 'short' });
                      }}
                      labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                    />
                    <Legend
                      verticalAlign="top"
                      height={28}
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: '12px' }}
                    />
                    <Bar
                      dataKey="credit"
                      name="Credit"
                      fill="url(#dailyCreditGradient)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={24}
                    />
                    <Bar
                      dataKey="recovery"
                      name="Recovery"
                      fill="url(#dailyRecoveryGradient)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={24}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 sm:h-72 flex flex-col items-center justify-center text-sm text-muted-foreground">
                <BarChart3 className="h-10 w-10 mb-2 opacity-30" />
                <p>No daily breakdown data available</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
