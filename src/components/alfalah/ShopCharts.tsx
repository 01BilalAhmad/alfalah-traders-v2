'use client';

import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { formatPKR } from '@/lib/utils';

interface Transaction {
  createdAt: string;
  newBalance: number;
  type: string;
  amount: number;
}

interface ShopChartsProps {
  transactions: Transaction[];
}

export default function ShopCharts({ transactions }: ShopChartsProps) {
  if (!transactions || transactions.length === 0) return null;

  const allTxns = [...transactions];
  const last10 = allTxns.length > 10 ? allTxns.slice(allTxns.length - 10) : allTxns;
  const chartData = last10.map((t) => ({
    date: new Date(t.createdAt).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' }),
    balance: t.newBalance,
    type: t.type,
    amount: t.amount,
  }));

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground font-medium mb-3">Balance Trend (Last 10 Transactions)</p>
        <div className="h-28 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
            >
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid hsl(var(--border))',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  fontSize: '11px',
                }}
                formatter={(value: number, name: string) => [formatPKR(value), 'Balance']}
              />
              <Line
                type="monotone"
                dataKey="balance"
                stroke="#6366F1"
                strokeWidth={2}
                dot={(props: Record<string, unknown>) => {
                  const { cx, cy, payload } = props as { cx: number; cy: number; payload: { type: string } };
                  const fill = payload.type === 'credit' ? '#6366F1' : '#10B981';
                  return (
                    <circle
                      key={`dot-${cx}-${cy}`}
                      cx={cx}
                      cy={cy}
                      r={4}
                      fill={fill}
                      stroke="white"
                      strokeWidth={2}
                    />
                  );
                }}
                activeDot={{ r: 6, stroke: '#6366F1', strokeWidth: 2, fill: 'white' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 mt-2">
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" /> Credit
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Recovery
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
