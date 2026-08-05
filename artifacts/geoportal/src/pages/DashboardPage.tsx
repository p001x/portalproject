import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Legend, Cell, PieChart, Pie } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Eye, Globe2, Loader2, LayoutDashboard, MapPin, Lock, Activity } from "lucide-react";
import { toast } from "sonner";

export function DashboardPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [password, setPassword] = useState("");
  const [days, setDays] = useState<string>("30");

  useEffect(() => {
    if (sessionStorage.getItem("admin_auth") === "true") {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Simple frontend protection (password: admin123)
    if (password === "admin123" || password === "geoportal") {
      setIsAuthenticated(true);
      sessionStorage.setItem("admin_auth", "true");
      toast.success("Authenticated successfully");
    } else {
      toast.error("Incorrect password");
    }
  };

  const daysQuery = days === "all" ? "" : `?days=${days}`;

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['analytics_summary', days],
    queryFn: async () => (await fetch(`/api/analytics/summary${daysQuery}`)).json(),
    enabled: isAuthenticated
  });

  const { data: timeseries, isLoading: loadingTimeseries } = useQuery({
    queryKey: ['analytics_timeseries', days],
    queryFn: async () => (await fetch(`/api/analytics/timeseries${daysQuery}`)).json(),
    enabled: isAuthenticated
  });

  const { data: modules, isLoading: loadingModules } = useQuery({
    queryKey: ['analytics_modules', days],
    queryFn: async () => (await fetch(`/api/analytics/modules${daysQuery}`)).json(),
    enabled: isAuthenticated
  });

  const { data: locations, isLoading: loadingLocations } = useQuery({
    queryKey: ['analytics_locations', days],
    queryFn: async () => (await fetch(`/api/analytics/locations${daysQuery}`)).json(),
    enabled: isAuthenticated
  });

  const { data: rawEvents, isLoading: loadingRaw } = useQuery({
    queryKey: ['analytics_raw'],
    queryFn: async () => (await fetch(`/api/analytics/raw?limit=50`)).json(),
    enabled: isAuthenticated,
    refetchInterval: 10000 // auto refresh every 10s
  });

  if (!isAuthenticated) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-50 dark:bg-background">
        <Card className="w-full max-w-sm shadow-lg">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-2">
              <Lock className="w-6 h-6" />
            </div>
            <CardTitle>Admin Analytics</CardTitle>
            <CardDescription>Enter password to view usage data</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="flex gap-2">
              <Input 
                type="password" 
                placeholder="Password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              <Button type="submit">Unlock</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLoading = loadingSummary || loadingTimeseries || loadingModules || loadingLocations || loadingRaw;

  if (isLoading && !summary) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background/50 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground font-medium animate-pulse">Loading analytics...</p>
        </div>
      </div>
    );
  }

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#a855f7', '#ec4899', '#ef4444', '#14b8a6'];

  return (
    <div className="p-8 h-full overflow-y-auto bg-slate-50/50 dark:bg-background">
      <div className="max-w-7xl mx-auto space-y-8 pb-12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <LayoutDashboard className="h-8 w-8 text-primary" />
              Analytics Dashboard
            </h1>
            <p className="text-muted-foreground">
              Overview of GeoPortal usage, active sessions, and global reach.
            </p>
          </div>
          
          <div className="w-40">
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger>
                <SelectValue placeholder="Select timeframe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Top KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Views</CardTitle>
              <Eye className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{summary?.total_events || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Recorded events {days !== 'all' ? `(last ${days} days)` : ''}</p>
            </CardContent>
          </Card>
          
          <Card className="border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Unique Sessions</CardTitle>
              <Users className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{summary?.unique_sessions || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Distinct user visits {days !== 'all' ? `(last ${days} days)` : ''}</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Global Reach</CardTitle>
              <Globe2 className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{summary?.unique_countries || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Countries visited from {days !== 'all' ? `(last ${days} days)` : ''}</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="shadow-sm flex flex-col">
            <CardHeader>
              <CardTitle className="text-lg">Traffic Over Time</CardTitle>
              <CardDescription>Daily page views across all modules.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeseries || []} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: '#6b7280' }}
                      dy={10}
                      tickFormatter={(val) => {
                        const d = new Date(val);
                        return `${d.getMonth()+1}/${d.getDate()}`;
                      }}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: '#6b7280' }}
                    />
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      labelFormatter={(label) => new Date(label).toLocaleDateString()}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="count" 
                      name="Views"
                      stroke="#0ea5e9" 
                      strokeWidth={3}
                      dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm flex flex-col">
            <CardHeader>
              <CardTitle className="text-lg">Module Popularity</CardTitle>
              <CardDescription>Distribution of views by tool.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="h-[300px] w-full flex items-center justify-center">
                {modules && modules.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={modules}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="count"
                        nameKey="module"
                      >
                        {modules.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: number, name: string) => [value, name.toUpperCase()]}
                      />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-muted-foreground text-sm flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Waiting for data...
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Location Table */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-5 w-5 text-rose-500" />
              Visitor Locations
            </CardTitle>
            <CardDescription>Breakdown of public IP traffic by country and city.</CardDescription>
          </CardHeader>
          <CardContent>
            {locations && locations.length > 0 ? (
              <div className="rounded-md border max-h-[300px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="w-[100px]">#</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead className="text-right">Views</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {locations.map((loc: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="font-semibold">{loc.country}</TableCell>
                        <TableCell>{loc.city}</TableCell>
                        <TableCell className="text-right font-medium">
                          <span className="bg-primary/10 text-primary px-2.5 py-0.5 rounded-full text-xs">
                            {loc.count}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-10 text-muted-foreground border rounded-md border-dashed">
                <Globe2 className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                <p>No public location data available yet.</p>
                <p className="text-xs mt-1">Visits from localhost/private IPs are excluded.</p>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Raw Events Stream */}
        <Card className="shadow-sm border-t-4 border-t-amber-500">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-amber-500" />
              Live Event Stream
            </CardTitle>
            <CardDescription>Raw logs of the 50 most recent events (auto-updates every 10s).</CardDescription>
          </CardHeader>
          <CardContent>
            {rawEvents && rawEvents.length > 0 ? (
              <div className="rounded-md border max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>Time (UTC)</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Module</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead>Location</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rawEvents.map((evt: any) => (
                      <TableRow key={evt.id} className="text-xs">
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {new Date(evt.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-mono">{evt.event_type}</TableCell>
                        <TableCell>
                          <span className="px-2 py-0.5 bg-muted rounded-full font-medium">
                            {evt.module}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">{evt.ip_address}</TableCell>
                        <TableCell>
                          {evt.country && evt.city 
                            ? `${evt.city}, ${evt.country}` 
                            : <span className="text-muted-foreground italic">Resolving...</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-10 text-muted-foreground border rounded-md border-dashed">
                <Activity className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                <p>No events logged yet.</p>
              </div>
            )}
          </CardContent>
        </Card>
        
      </div>
    </div>
  );
}
