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
import { Badge } from '@/components/ui/badge';
import { BarChart3 } from 'lucide-react';

interface MonthlySummaryChartsProps {
  chartData: { date: string; Credit: number; Recovery: number }[];
  dailyBreakdownLength: number;
}

export default function MonthlySummaryCharts({ chartData, dailyBreakdownLength }: MonthlySummaryChartsProps) {
  return (
    <Card className="card-elevated hover-scale-102">
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Daily Activity &mdash; Credit vs Recovery
          </CardTitle>
          <Badge variant="secondary" className="text-[11px]">
            {dailyBreakdownLength} days
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-5">
        {chartData.length > 0 ? (
          <div className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="msCreditGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0.3} />
                  </linearGradient>
                  <linearGradient id="msRecoveryGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#64748B' }}
                  axisLine={{ stroke: '#E2E8F0' }}
                  tickLine={false}
                  interval="preserveStartEnd"
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
                  dataKey="Credit"
                  fill="url(#msCreditGrad)"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={24}
                />
                <Bar
                  dataKey="Recovery"
                  fill="url(#msRecoveryGrad)"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={24}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-64 sm:h-72 flex flex-col items-center justify-center text-sm text-muted-foreground">
            <BarChart3 className="h-10 w-10 mb-2 opacity-30" />
            <p>No activity data for this month</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
