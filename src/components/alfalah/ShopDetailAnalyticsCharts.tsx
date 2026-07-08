'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';
import { formatPKR } from '@/lib/utils';

interface ShopDetailAnalyticsChartsProps {
  chartData: { name: string; Credit: number; Recovery: number }[];
}

export default function ShopDetailAnalyticsCharts({ chartData }: ShopDetailAnalyticsChartsProps) {
  return (
    <Card className="card-elevated hover-scale-102">
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Monthly Trend — Last 6 Months
          </CardTitle>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Credit
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Recovery
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-5">
        {chartData.length > 0 ? (
          <div className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="sdaCreditGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="sdaRecoveryGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
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
                  formatter={(value: number) => [
                    formatPKR(value),
                  ]}
                  labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                />
                <Area
                  type="monotone"
                  dataKey="Credit"
                  stroke="#F59E0B"
                  strokeWidth={2}
                  fill="url(#sdaCreditGradient)"
                  dot={{ r: 4, fill: '#F59E0B', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 6, fill: '#F59E0B' }}
                />
                <Area
                  type="monotone"
                  dataKey="Recovery"
                  stroke="#10B981"
                  strokeWidth={2}
                  fill="url(#sdaRecoveryGradient)"
                  dot={{ r: 4, fill: '#10B981', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 6, fill: '#10B981' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-64 sm:h-72 flex flex-col items-center justify-center text-sm text-muted-foreground">
            <BarChart3 className="h-10 w-10 mb-2 opacity-30" />
            <p>No trend data available for the last 6 months</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
