'use client';

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart3,
  PieChart as PieChartIcon,
} from 'lucide-react';

interface DailyTrend {
  date: string;
  label: string;
  credit: number;
  recovery: number;
  net: number;
}

interface Orderbooker {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  totalShops: number;
  totalOutstanding: number;
  totalCreditPosted: number;
  totalRecovery: number;
}

interface RouteDataItem {
  name: string;
  value: number;
  fill: string;
}

interface DashboardChartsProps {
  trends: DailyTrend[];
  orderbookers: Orderbooker[];
  routeData: RouteDataItem[];
  allShopsCount: number;
}

export default function DashboardCharts({ trends, orderbookers, routeData, allShopsCount }: DashboardChartsProps) {
  return (
    <>
      {/* Daily Trends Chart */}
      <Card className="hover-scale-102 card-shadow-transition">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Daily Credit vs Recovery — Last 7 Days
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-5">
          {trends.length > 0 ? (
            <div className="h-56 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="creditGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="recoveryGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="label"
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
                    formatter={(value: number, name: string) => [
                      `Rs. ${value.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`,
                      name === 'credit' ? 'Credit' : 'Recovery',
                    ]}
                    labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="credit"
                    stroke="#6366F1"
                    strokeWidth={3}
                    fill="url(#creditGradient)"
                    dot={{ r: 3, fill: '#6366F1', strokeWidth: 0 }}
                    activeDot={{ r: 6, fill: '#6366F1', strokeWidth: 2, stroke: '#fff' }}
                    isAnimationActive={true}
                    animationBegin={0}
                    animationDuration={1500}
                    animationEasing="ease-out"
                  />
                  <Area
                    type="monotone"
                    dataKey="recovery"
                    stroke="#10B981"
                    strokeWidth={3}
                    fill="url(#recoveryGradient)"
                    dot={{ r: 3, fill: '#10B981', strokeWidth: 0 }}
                    activeDot={{ r: 6, fill: '#10B981', strokeWidth: 2, stroke: '#fff' }}
                    isAnimationActive={true}
                    animationBegin={300}
                    animationDuration={1500}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-56 sm:h-64 flex items-center justify-center text-sm text-muted-foreground">
              No trend data available
            </div>
          )}
          <div className="flex items-center justify-center gap-6 mt-2">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
              <span className="text-xs text-muted-foreground">Credit</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="text-xs text-muted-foreground">Recovery</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orderbooker Performance Chart */}
      <Card className="hover-scale-102 card-shadow-transition">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Orderbooker Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-5">
          {orderbookers.length > 0 ? (
            <div className="h-72 sm:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={orderbookers} margin={{ top: 30, right: 10, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="creditPostedGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4F46E5" stopOpacity={1} />
                      <stop offset="100%" stopColor="#6366F1" stopOpacity={0.85} />
                    </linearGradient>
                    <linearGradient id="recoveryGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#059669" stopOpacity={1} />
                      <stop offset="100%" stopColor="#10B981" stopOpacity={0.85} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: '#64748B' }}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tickLine={false}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 10, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    width={50}
                    tickFormatter={(value: number) => {
                      if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                      if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
                      return String(value);
                    }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 10, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    width={50}
                    tickFormatter={(value: number) => {
                      if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                      if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
                      return String(value);
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      fontSize: '12px',
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === 'Credit Posted') return [`Rs. ${Number(value).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`, 'Credit Posted'];
                      if (name === 'Recovery') return [`Rs. ${Number(value).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`, 'Recovery'];
                      return [value, name];
                    }}
                    labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="center"
                    height={36}
                    iconType="circle"
                    iconSize={10}
                    wrapperStyle={{ fontSize: '12px', paddingBottom: 8 }}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="totalCreditPosted"
                    name="Credit Posted"
                    fill="url(#creditPostedGradient)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={42}
                    isAnimationActive={true}
                    animationBegin={0}
                    animationDuration={1200}
                    animationEasing="ease-out"
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="totalRecovery"
                    name="Recovery"
                    fill="url(#recoveryGradient)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={42}
                    isAnimationActive={true}
                    animationBegin={200}
                    animationDuration={1200}
                    animationEasing="ease-out"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 sm:h-[300px] flex items-center justify-center text-sm text-muted-foreground">
              No orderbooker data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Route Distribution Pie Chart */}
      <Card className="hover-scale-102 card-shadow-transition">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <PieChartIcon className="h-4 w-4 text-primary" />
            Route Distribution
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-5">
          {routeData.length > 0 ? (
            <div className="h-72 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={routeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    strokeWidth={2}
                    stroke="hsl(var(--background))"
                    label={({ name, value }: { name: string; value: number }) =>
                      value > 0 ? `${name} (${value})` : ''
                    }
                    labelLine={{ stroke: '#64748B', strokeWidth: 1 }}
                    isAnimationActive={true}
                    animationBegin={0}
                    animationDuration={1600}
                    animationEasing="ease-out"
                  >
                    {routeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      fontSize: '12px',
                    }}
                    formatter={(value: number) => [`${value} shops`, 'Shops']}
                    labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                  />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 sm:h-80 flex items-center justify-center text-sm text-muted-foreground">
              No route data available
            </div>
          )}
          <div className="flex items-center justify-center gap-4 mt-1">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-primary" />
              <span className="text-xs text-muted-foreground">{allShopsCount} total shops</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
