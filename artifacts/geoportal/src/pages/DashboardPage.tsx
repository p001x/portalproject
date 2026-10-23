import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend 
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { 
  Users, Eye, Globe2, Loader2, LayoutDashboard, MapPin, Lock, Activity, 
  ShieldAlert, ShieldCheck, Search, Filter, Ban, CheckCircle, XCircle, 
  AlertCircle, Calendar, Clock, Sparkles, BarChart3, Inbox, ChevronRight, 
  UserX, UserCheck, RefreshCw, MessageSquare, Download, Laptop, Smartphone, 
  Tablet, Cpu, Key, UserCog, Check, Copy, ExternalLink, Zap
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { api, AdminUserSummary, AdminUserDetail, UserAppealItem } from "@/lib/api";

const PALETTE = [
  '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', 
  '#14b8a6', '#f97316', '#6366f1', '#06b6d4', '#84cc16', 
  '#d946ef', '#e11d48', '#3b82f6', '#22c55e', '#a855f7'
];

export function DashboardPage() {
  const { user: authUser, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [password, setPassword] = useState("");

  // Navigation & Filter State
  const [activeTab, setActiveTab] = useState<string>("traffic");
  const [days, setDays] = useState<string>("30");
  const [excludeBots, setExcludeBots] = useState<boolean>(true);
  const [userSearch, setUserSearch] = useState<string>("");
  const [userStatusFilter, setUserStatusFilter] = useState<"all" | "active" | "blocked" | "admins">("all");
  
  // Selected user for Deep-dive behavioral analysis & Modals
  const [selectedUserEmail, setSelectedUserEmail] = useState<string | null>(null);
  const [blockModalUser, setBlockModalUser] = useState<AdminUserSummary | null>(null);
  const [blockReason, setBlockReason] = useState<string>("");
  const [appealReviewItem, setAppealReviewItem] = useState<UserAppealItem | null>(null);
  const [adminReviewNote, setAdminReviewNote] = useState<string>("");
  
  // Reset Password Modal
  const [resetModalInfo, setResetModalInfo] = useState<{ email: string; resetUrl: string } | null>(null);
  const [hasCopiedReset, setHasCopiedReset] = useState(false);

  // 1. Auto-authenticate if logged-in user is an Admin
  useEffect(() => {
    if (authUser?.role === "admin") {
      setIsAuthenticated(true);
      sessionStorage.setItem("admin_auth", "true");
    } else if (sessionStorage.getItem("admin_auth") === "true") {
      setIsAuthenticated(true);
    }
  }, [authUser]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "admin123" || password === "geoportal") {
      setIsAuthenticated(true);
      sessionStorage.setItem("admin_auth", "true");
      toast.success("Admin access granted");
    } else {
      toast.error("Incorrect password");
    }
  };

  // ── Real-Time Active Pulse Query (every 5s) ──────────────────────────────
  const { data: realtimeData } = useQuery({
    queryKey: ['analytics_realtime'],
    queryFn: () => api.analytics.getRealtime(),
    enabled: isAuthenticated,
    refetchInterval: 5000
  });

  // ── Traffic & Telemetry Queries ──────────────────────────────────────────
  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['analytics_summary', days, excludeBots],
    queryFn: () => api.analytics.getSummary(days, excludeBots),
    enabled: isAuthenticated
  });

  const { data: timeseries, isLoading: loadingTimeseries } = useQuery({
    queryKey: ['analytics_timeseries', days, excludeBots],
    queryFn: () => api.analytics.getTimeseries(days, excludeBots),
    enabled: isAuthenticated
  });

  const { data: modules, isLoading: loadingModules } = useQuery({
    queryKey: ['analytics_modules', days, excludeBots],
    queryFn: () => api.analytics.getModules(days, excludeBots),
    enabled: isAuthenticated
  });

  const { data: locations, isLoading: loadingLocations } = useQuery({
    queryKey: ['analytics_locations', days, excludeBots],
    queryFn: () => api.analytics.getLocations(days, excludeBots),
    enabled: isAuthenticated
  });

  const { data: deviceStats, isLoading: loadingDevices } = useQuery({
    queryKey: ['analytics_devices', days, excludeBots],
    queryFn: () => api.analytics.getDevices(days, excludeBots),
    enabled: isAuthenticated
  });

  const { data: rawEvents, isLoading: loadingRaw } = useQuery({
    queryKey: ['analytics_raw', excludeBots],
    queryFn: () => api.analytics.getRawEvents(50, excludeBots),
    enabled: isAuthenticated,
    refetchInterval: 10000
  });

  // ── System Health Query ──────────────────────────────────────────────────
  const { data: systemHealth } = useQuery({
    queryKey: ['admin_system_health'],
    queryFn: () => api.admin.getSystemHealth(),
    enabled: isAuthenticated,
    refetchInterval: 30000
  });

  // ── User Management & Behavior Queries ──────────────────────────────────
  const { data: usersData, isLoading: loadingUsers, refetch: refetchUsers } = useQuery({
    queryKey: ["admin_users"],
    queryFn: async () => {
      const res = await api.admin.getUsers();
      return res.users;
    },
    enabled: isAuthenticated
  });

  const { data: appealsData, isLoading: loadingAppeals } = useQuery({
    queryKey: ["admin_appeals"],
    queryFn: async () => {
      const res = await api.admin.getAppeals("all");
      return res.appeals;
    },
    enabled: isAuthenticated
  });

  const { data: userDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ["admin_user_detail", selectedUserEmail],
    queryFn: async () => {
      if (!selectedUserEmail) return null;
      const res = await api.admin.getUserDetail(selectedUserEmail);
      return res.user;
    },
    enabled: !!selectedUserEmail && isAuthenticated
  });

  // ── Moderation & Role Mutations ──────────────────────────────────────────
  const blockMutation = useMutation({
    mutationFn: async ({ email, reason }: { email: string; reason: string }) => {
      return await api.admin.blockUser(email, reason);
    },
    onSuccess: (_, vars) => {
      toast.success(`Account ${vars.email} has been suspended.`);
      setBlockModalUser(null);
      setBlockReason("");
      queryClient.invalidateQueries({ queryKey: ["admin_users"] });
      queryClient.invalidateQueries({ queryKey: ["admin_user_detail", vars.email] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to block user.");
    }
  });

  const unblockMutation = useMutation({
    mutationFn: async (email: string) => {
      return await api.admin.unblockUser(email);
    },
    onSuccess: (_, email) => {
      toast.success(`Account ${email} suspension lifted.`);
      queryClient.invalidateQueries({ queryKey: ["admin_users"] });
      queryClient.invalidateQueries({ queryKey: ["admin_user_detail", email] });
      queryClient.invalidateQueries({ queryKey: ["admin_appeals"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to unblock user.");
    }
  });

  const roleMutation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: "admin" | "user" }) => {
      return await api.admin.updateUserRole(email, role);
    },
    onSuccess: (data, vars) => {
      toast.success(data.message || `Updated ${vars.email} to ${vars.role}.`);
      queryClient.invalidateQueries({ queryKey: ["admin_users"] });
      if (selectedUserEmail === vars.email) {
        queryClient.invalidateQueries({ queryKey: ["admin_user_detail", vars.email] });
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update role.");
    }
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      return await api.admin.sendPasswordReset(email);
    },
    onSuccess: (data, email) => {
      const fullUrl = window.location.origin + data.reset_url;
      setResetModalInfo({ email, resetUrl: fullUrl });
      toast.success("Password reset link created!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create reset link.");
    }
  });

  const reviewAppealMutation = useMutation({
    mutationFn: async ({ appealId, action, note }: { appealId: number; action: "approve" | "reject"; note?: string }) => {
      return await api.admin.reviewAppeal(appealId, action, note);
    },
    onSuccess: (_, vars) => {
      if (vars.action === "approve") {
        toast.success("Appeal approved! The user account has been restored.");
      } else {
        toast.info("Appeal declined.");
      }
      setAppealReviewItem(null);
      setAdminReviewNote("");
      queryClient.invalidateQueries({ queryKey: ["admin_appeals"] });
      queryClient.invalidateQueries({ queryKey: ["admin_users"] });
      if (selectedUserEmail) {
        queryClient.invalidateQueries({ queryKey: ["admin_user_detail", selectedUserEmail] });
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to review appeal.");
    }
  });

  // Set default selected user
  useEffect(() => {
    if (!selectedUserEmail && usersData && usersData.length > 0) {
      setSelectedUserEmail(usersData[0].email);
    }
  }, [usersData, selectedUserEmail]);

  // ── CSV Export Helpers ───────────────────────────────────────────────────
  const exportTrafficCSV = () => {
    if (!timeseries || timeseries.length === 0) {
      toast.error("No traffic data available to export.");
      return;
    }
    const headers = ["Date", "Pageviews"];
    const rows = timeseries.map(t => [t.date, t.count]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `geoportal_traffic_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Traffic report exported successfully!");
  };

  const exportUsersCSV = () => {
    if (!usersData || usersData.length === 0) {
      toast.error("No user data available to export.");
      return;
    }
    const headers = ["ID", "Name", "Email", "Role", "Joined Date", "Last Active", "Total Actions", "Favorite Tool", "Status"];
    const rows = usersData.map(u => [
      u.id,
      `"${u.name.replace(/"/g, '""')}"`,
      u.email,
      u.role,
      u.created_at,
      u.last_active || "Never",
      u.total_activities,
      `"${(u.favorite_tool || "None").replace(/"/g, '""')}"`,
      u.is_blocked ? "Suspended" : "Active"
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `geoportal_users_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("User directory exported successfully!");
  };

  const exportEventsJSON = () => {
    if (!rawEvents || rawEvents.length === 0) {
      toast.error("No raw events available to export.");
      return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(rawEvents, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `geoportal_raw_events_${new Date().toISOString().split("T")[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Raw events JSON exported successfully!");
  };

  // Auth Gate
  if (!isAuthenticated && !authLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-50 dark:bg-background p-4">
        <Card className="w-full max-w-md shadow-xl border-slate-200 dark:border-slate-800">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-2">
              <Lock className="w-6 h-6" />
            </div>
            <CardTitle className="text-xl">Administrative Access</CardTitle>
            <CardDescription>Enter administrator credentials to access platform controls and metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <Input 
                type="password" 
                placeholder="Enter admin password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              <Button type="submit" className="w-full font-medium">Sign In to Admin Panel</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Filter users list
  const filteredUsers = (usersData || []).filter((u) => {
    const matchesSearch = 
      u.name.toLowerCase().includes(userSearch.toLowerCase()) || 
      u.email.toLowerCase().includes(userSearch.toLowerCase());
    
    if (!matchesSearch) return false;

    if (userStatusFilter === "active") return !u.is_blocked;
    if (userStatusFilter === "blocked") return u.is_blocked;
    if (userStatusFilter === "admins") return u.role === "admin";
    return true;
  });

  const pendingAppealsCount = (appealsData || []).filter(a => a.status === "pending").length;

  return (
    <div className="p-4 sm:p-8 h-full overflow-y-auto bg-slate-50/60 dark:bg-background">
      <div className="max-w-7xl mx-auto space-y-6 pb-20">
        
        {/* Top Header with Real-Time Pulse */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-6 rounded-xl border shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                <LayoutDashboard className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                  Admin Command & Analytics Center
                </h1>
                <p className="text-sm text-muted-foreground">
                  Enterprise telemetry, real-time visitor intelligence, account moderation, and behavioral habits.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Realtime Active Pulse Badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs font-semibold">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span>{realtimeData?.active_visitors || 0} active now (15m)</span>
            </div>

            {/* GEE System Health Indicator */}
            <Badge variant="outline" className={`px-2.5 py-1 text-xs flex items-center gap-1.5 ${systemHealth?.gee?.authenticated ? "text-sky-600 border-sky-500/30 bg-sky-500/10" : "text-amber-600 border-amber-500/30"}`}>
              <Cpu className="w-3.5 h-3.5" />
              GEE: {systemHealth?.gee?.authenticated ? "Connected" : "Standby"}
            </Badge>

            {authUser?.email && (
              <Badge variant="secondary" className="text-xs">
                {authUser.email} ({authUser.role})
              </Badge>
            )}
          </div>
        </div>

        {/* Unified Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full md:w-auto h-auto p-1 bg-muted/80 rounded-xl gap-1">
            <TabsTrigger value="traffic" className="py-2.5 flex items-center gap-2 text-xs font-semibold">
              <Activity className="h-4 w-4 text-blue-500" />
              Traffic & Environments
            </TabsTrigger>
            <TabsTrigger value="users" className="py-2.5 flex items-center gap-2 text-xs font-semibold">
              <Users className="h-4 w-4 text-indigo-500" />
              User IAM & Accounts ({usersData?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="behavior" className="py-2.5 flex items-center gap-2 text-xs font-semibold">
              <BarChart3 className="h-4 w-4 text-emerald-500" />
              Behavioral Habits
            </TabsTrigger>
            <TabsTrigger value="appeals" className="py-2.5 flex items-center gap-2 text-xs font-semibold">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              Ban Appeals
              {pendingAppealsCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px]">
                  {pendingAppealsCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ════════════════════════════════════════════════════════════════════
              TAB 1: TRAFFIC, DEVICES & ENVIRONMENTS
          ════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="traffic" className="space-y-6">
            
            {/* Control Bar: Timeframe, Bot Filter & CSV Export */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border shadow-xs">
              <div className="flex flex-wrap items-center gap-4">
                <div className="w-40">
                  <Select value={days} onValueChange={setDays}>
                    <SelectTrigger className="bg-background h-8 text-xs">
                      <SelectValue placeholder="Timeframe" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">Last 7 days</SelectItem>
                      <SelectItem value="30">Last 30 days</SelectItem>
                      <SelectItem value="90">Last 90 days</SelectItem>
                      <SelectItem value="all">All time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Bot Filter Toggle */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground border-l pl-4">
                  <Switch 
                    id="bot-filter" 
                    checked={excludeBots} 
                    onCheckedChange={setExcludeBots} 
                  />
                  <label htmlFor="bot-filter" className="cursor-pointer font-medium text-foreground">
                    Filter Bots & Automated Crawlers
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={exportTrafficCSV}
                  className="h-8 text-xs flex items-center gap-1.5 shadow-xs"
                >
                  <Download className="w-3.5 h-3.5 text-primary" />
                  Export Traffic (CSV)
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={exportEventsJSON}
                  className="h-8 text-xs flex items-center gap-1.5 shadow-xs"
                >
                  <Download className="w-3.5 h-3.5 text-indigo-500" />
                  Export JSON
                </Button>
              </div>
            </div>

            {/* Top KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border-l-4 border-l-blue-500 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Total Views</CardTitle>
                  <Eye className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary?.total_events || 0}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {excludeBots ? "Human views recorded" : "All requests including bots"}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-emerald-500 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Unique Sessions</CardTitle>
                  <Users className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary?.unique_sessions || 0}</div>
                  <p className="text-xs text-muted-foreground mt-1">Distinct visitor journeys</p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-purple-500 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Global Reach</CardTitle>
                  <Globe2 className="h-4 w-4 text-purple-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary?.unique_countries || 0}</div>
                  <p className="text-xs text-muted-foreground mt-1">Distinct visiting countries</p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-indigo-500 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Live Concurrency</CardTitle>
                  <Zap className="h-4 w-4 text-indigo-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-indigo-600">{realtimeData?.active_visitors || 0}</div>
                  <p className="text-xs text-muted-foreground mt-1">Active within 15 min window</p>
                </CardContent>
              </Card>
            </div>

            {/* Charts Row 1: Traffic Over Time & Module Popularity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Traffic Over Time */}
              <Card className="shadow-sm flex flex-col">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="h-4 w-4 text-sky-500" />
                    Daily Traffic Over Time
                  </CardTitle>
                  <CardDescription>Daily page views across all portal modules.</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="h-[280px] w-full">
                    {timeseries && timeseries.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={timeseries} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis 
                            dataKey="date" 
                            axisLine={false} 
                            tickLine={false}
                            tick={{ fontSize: 11, fill: '#64748b' }}
                            tickFormatter={(val) => {
                              if (!val) return "";
                              const parts = val.split('-');
                              return parts.length === 3 ? `${parts[1]}/${parts[2]}` : val;
                            }}
                          />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                          <RechartsTooltip 
                            contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="count" 
                            name="Views" 
                            stroke="#0284c7" 
                            strokeWidth={2.5} 
                            dot={{ r: 3, fill: '#0284c7' }} 
                            activeDot={{ r: 5 }} 
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                        {loadingTimeseries ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : "No traffic recorded for this timeframe"}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Module Popularity */}
              <Card className="shadow-sm flex flex-col">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-emerald-500" />
                    Module Popularity Breakdown
                  </CardTitle>
                  <CardDescription>Distribution of interactions by tool.</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="h-[280px] w-full flex items-center justify-center">
                    {modules && modules.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={modules}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={90}
                            paddingAngle={3}
                            dataKey="count"
                            nameKey="module"
                          >
                            {modules.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
                            ))}
                          </Pie>
                          <RechartsTooltip 
                            contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
                            formatter={(value: any, name: any) => [value, String(name || "Module").toUpperCase()]}
                          />
                          <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        {loadingModules ? <Loader2 className="w-4 h-4 animate-spin" /> : "No module data available"}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts Row 2: Devices, Operating Systems & Browsers */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Device Types */}
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Laptop className="w-4 h-4 text-sky-500" />
                    Device Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {deviceStats?.devices && deviceStats.devices.length > 0 ? (
                    <div className="space-y-2.5">
                      {deviceStats.devices.map((d: any) => (
                        <div key={d.name} className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 font-medium">
                            {d.name === "Desktop" && <Laptop className="w-3.5 h-3.5 text-muted-foreground" />}
                            {d.name === "Mobile" && <Smartphone className="w-3.5 h-3.5 text-muted-foreground" />}
                            {d.name === "Tablet" && <Tablet className="w-3.5 h-3.5 text-muted-foreground" />}
                            {d.name}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {d.count} views
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-4">No device telemetry yet.</p>
                  )}
                </CardContent>
              </Card>

              {/* Top Browsers */}
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Globe2 className="w-4 h-4 text-emerald-500" />
                    Browsers Used
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {deviceStats?.browsers && deviceStats.browsers.length > 0 ? (
                    <div className="space-y-2.5">
                      {deviceStats.browsers.map((b: any) => (
                        <div key={b.name} className="flex items-center justify-between text-xs">
                          <span className="font-medium">{b.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {b.count}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-4">No browser data yet.</p>
                  )}
                </CardContent>
              </Card>

              {/* Operating Systems */}
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-purple-500" />
                    Operating Systems
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {deviceStats?.os && deviceStats.os.length > 0 ? (
                    <div className="space-y-2.5">
                      {deviceStats.os.map((o: any) => (
                        <div key={o.name} className="flex items-center justify-between text-xs">
                          <span className="font-medium">{o.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {o.count}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-4">No OS telemetry yet.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Visitor Locations Table */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-rose-500" />
                  Visitor Locations (Public IP Geolocation)
                </CardTitle>
                <CardDescription>Breakdown of public traffic by country and city.</CardDescription>
              </CardHeader>
              <CardContent>
                {locations && locations.length > 0 ? (
                  <div className="rounded-md border max-h-[250px] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background">
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <TableHead>Country</TableHead>
                          <TableHead>City</TableHead>
                          <TableHead className="text-right">Views</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {locations.map((loc: any, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium text-xs text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell className="font-semibold text-xs">{loc.country}</TableCell>
                            <TableCell className="text-xs">{loc.city}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary" className="text-xs">
                                {loc.count}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground border rounded-md border-dashed">
                    <Globe2 className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm">No public location data recorded for this timeframe.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Live Event Stream */}
            <Card className="shadow-sm border-t-4 border-t-amber-500">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="h-4 w-4 text-amber-500" />
                    Live Event Stream
                  </CardTitle>
                  <CardDescription>Real-time audit log of incoming telemetry requests (auto-updates every 10s).</CardDescription>
                </div>
                <Badge variant="outline" className="text-[11px] text-amber-600 bg-amber-500/10">
                  Polling 10s
                </Badge>
              </CardHeader>
              <CardContent>
                {rawEvents && rawEvents.length > 0 ? (
                  <div className="rounded-md border max-h-[350px] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background text-xs">
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>User Account</TableHead>
                          <TableHead>Event</TableHead>
                          <TableHead>Module</TableHead>
                          <TableHead>Device / Browser</TableHead>
                          <TableHead>IP Address</TableHead>
                          <TableHead>Location</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rawEvents.map((evt: any) => (
                          <TableRow key={evt.id} className="text-xs">
                            <TableCell className="text-muted-foreground whitespace-nowrap">
                              {new Date(evt.created_at).toLocaleTimeString()}
                            </TableCell>
                            <TableCell>
                              {evt.user_email ? (
                                <span className="font-medium text-primary flex items-center gap-1">
                                  <UserCheck className="w-3.5 h-3.5" />
                                  {evt.user_email}
                                </span>
                              ) : (
                                <span className="text-muted-foreground italic">Guest</span>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-[11px]">{evt.event_type}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-normal text-[11px]">
                                {evt.module}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground whitespace-nowrap">
                              {evt.device} • {evt.browser}
                            </TableCell>
                            <TableCell className="font-mono text-muted-foreground">{evt.ip_address}</TableCell>
                            <TableCell>
                              {evt.country && evt.city && evt.country !== "Local/Unknown"
                                ? `${evt.city}, ${evt.country}`
                                : <span className="text-muted-foreground italic">Local / Network</span>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">No events recorded yet.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════════
              TAB 2: USER IAM, ROLES & MODERATION
          ════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="users" className="space-y-6">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search accounts by name or email..." 
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="pl-9 bg-card"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex bg-muted p-1 rounded-lg gap-1 text-xs">
                  <Button 
                    variant={userStatusFilter === "all" ? "default" : "ghost"} 
                    size="sm" 
                    onClick={() => setUserStatusFilter("all")}
                    className="h-7 text-xs"
                  >
                    All
                  </Button>
                  <Button 
                    variant={userStatusFilter === "active" ? "default" : "ghost"} 
                    size="sm" 
                    onClick={() => setUserStatusFilter("active")}
                    className="h-7 text-xs text-emerald-600"
                  >
                    Active
                  </Button>
                  <Button 
                    variant={userStatusFilter === "blocked" ? "default" : "ghost"} 
                    size="sm" 
                    onClick={() => setUserStatusFilter("blocked")}
                    className="h-7 text-xs text-rose-600"
                  >
                    Suspended
                  </Button>
                  <Button 
                    variant={userStatusFilter === "admins" ? "default" : "ghost"} 
                    size="sm" 
                    onClick={() => setUserStatusFilter("admins")}
                    className="h-7 text-xs text-indigo-600"
                  >
                    Admins
                  </Button>
                </div>

                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={exportUsersCSV}
                  className="h-8 text-xs flex items-center gap-1.5 shadow-xs"
                >
                  <Download className="w-3.5 h-3.5 text-primary" />
                  Export Users (CSV)
                </Button>

                <Button variant="outline" size="sm" onClick={() => refetchUsers()} className="h-8">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Users Table */}
            <Card className="shadow-sm">
              <CardContent className="p-0">
                {loadingUsers ? (
                  <div className="p-12 text-center text-muted-foreground">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
                    Loading registered accounts...
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                    No user accounts matched your search criteria.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>User Account</TableHead>
                        <TableHead>Role / Privileges</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead>Last Active</TableHead>
                        <TableHead>Total Actions</TableHead>
                        <TableHead>Favorite Tool</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">IAM & Moderation Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((u) => (
                        <TableRow key={u.id} className="hover:bg-muted/50 transition-colors">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={u.profile_picture || undefined} />
                                <AvatarFallback className="text-xs bg-primary/10 text-primary font-bold">
                                  {u.name.substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-semibold text-sm leading-none">{u.name}</p>
                                <p className="text-xs text-muted-foreground mt-1">{u.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-xs">
                                {u.role === "admin" ? "Admin" : "Member"}
                              </Badge>
                              {/* Quick Role Toggle */}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                  const targetRole = u.role === "admin" ? "user" : "admin";
                                  if (confirm(`Change role of ${u.email} to ${targetRole.toUpperCase()}?`)) {
                                    roleMutation.mutate({ email: u.email, role: targetRole });
                                  }
                                }}
                                title="Toggle Admin/User role"
                              >
                                <UserCog className="w-3 h-3 mr-0.5" />
                                {u.role === "admin" ? "Demote" : "Promote"}
                              </Button>
                            </div>
                          </TableCell>

                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(u.created_at).toLocaleDateString()}
                          </TableCell>

                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {u.last_active ? new Date(u.last_active).toLocaleDateString() : "Never"}
                          </TableCell>

                          <TableCell>
                            <Badge variant="outline" className="text-xs font-mono">
                              {u.total_activities} actions
                            </Badge>
                          </TableCell>

                          <TableCell>
                            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                              {u.favorite_tool || "None yet"}
                            </span>
                          </TableCell>

                          <TableCell>
                            {u.is_blocked ? (
                              <Badge variant="destructive" className="text-xs flex items-center gap-1 w-fit">
                                <Ban className="w-3 h-3" /> Suspended
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs text-emerald-600 bg-emerald-500/10 border-emerald-500/20 flex items-center gap-1 w-fit">
                                <CheckCircle className="w-3 h-3" /> Active
                              </Badge>
                            )}
                          </TableCell>

                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Habit Deep-dive */}
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-7 text-xs flex items-center gap-1"
                                onClick={() => {
                                  setSelectedUserEmail(u.email);
                                  setActiveTab("behavior");
                                }}
                                title="Inspect behavior habits"
                              >
                                <BarChart3 className="w-3 h-3 text-primary" />
                                Habits
                              </Button>

                              {/* Password Reset Trigger */}
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-7 text-xs flex items-center gap-1"
                                onClick={() => resetPasswordMutation.mutate(u.email)}
                                disabled={resetPasswordMutation.isPending}
                                title="Generate Password Reset Link"
                              >
                                <Key className="w-3 h-3 text-amber-500" />
                                Reset
                              </Button>

                              {/* Block / Unblock */}
                              {u.is_blocked ? (
                                <Button 
                                  variant="secondary" 
                                  size="sm" 
                                  className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                  onClick={() => unblockMutation.mutate(u.email)}
                                  disabled={unblockMutation.isPending}
                                >
                                  Reinstate
                                </Button>
                              ) : (
                                u.role !== "admin" && (
                                  <Button 
                                    variant="destructive" 
                                    size="sm" 
                                    className="h-7 text-xs"
                                    onClick={() => {
                                      setBlockModalUser(u);
                                      setBlockReason("");
                                    }}
                                  >
                                    Suspend
                                  </Button>
                                )
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════════
              TAB 3: USER BEHAVIORAL ANALYTICS & HABITS
          ════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="behavior" className="space-y-6">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold">User Behavioral Habits & Feature Engagement</h3>
                <p className="text-xs text-muted-foreground">Detailed breakdown of which portal tools each user prefers to execute.</p>
              </div>

              {/* User Selector Dropdown */}
              <div className="w-full sm:w-72">
                <Select value={selectedUserEmail || ""} onValueChange={(val) => setSelectedUserEmail(val)}>
                  <SelectTrigger className="bg-card">
                    <SelectValue placeholder="Choose user account..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(usersData || []).map((u) => (
                      <SelectItem key={u.email} value={u.email}>
                        {u.name} ({u.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {loadingDetail ? (
              <div className="p-16 text-center text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
                Aggregating user behavioral history...
              </div>
            ) : !userDetail ? (
              <div className="p-16 text-center text-muted-foreground border rounded-xl border-dashed">
                <Users className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
                Select an account above to inspect their tool usage breakdown and favorite features.
              </div>
            ) : (
              <div className="space-y-6">
                {/* User Summary Header Card */}
                <Card className="border-l-4 border-l-primary shadow-sm">
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <Avatar className="h-14 w-14 border-2 border-primary/20">
                          <AvatarImage src={userDetail.profile_picture || undefined} />
                          <AvatarFallback className="text-lg font-bold bg-primary/10 text-primary">
                            {userDetail.name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-xl font-bold">{userDetail.name}</h2>
                            <Badge variant={userDetail.role === "admin" ? "default" : "outline"} className="text-xs">
                              {userDetail.role}
                            </Badge>
                            {userDetail.is_blocked && (
                              <Badge variant="destructive" className="text-xs">
                                Suspended
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5">{userDetail.email}</p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                            <span>Joined: {new Date(userDetail.created_at).toLocaleDateString()}</span>
                            <span>•</span>
                            <span>Last Active: {userDetail.last_active ? new Date(userDetail.last_active).toLocaleString() : "Never"}</span>
                          </div>
                        </div>
                      </div>

                      {/* Favorite Tool Card */}
                      <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-center min-w-[200px]">
                        <p className="text-xs uppercase font-semibold text-primary">#1 Preferred Feature</p>
                        <p className="text-lg font-bold text-foreground mt-1">
                          {userDetail.favorite_tool || "Exploring"}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">Calculated by platform interactions</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Feature Usage Grid */}
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-primary" />
                      Feature Usage Breakdown (What this user likes to do)
                    </CardTitle>
                    <CardDescription>
                      Breakdown of total actions executed across different portal tools.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {Object.entries(userDetail.tool_breakdown || {}).length === 0 ? (
                      <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg border-dashed">
                        No specific tool usage records logged yet for this account.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {Object.entries(userDetail.tool_breakdown).map(([tool, count]) => (
                          <div key={tool} className="p-3.5 rounded-xl border bg-card/60 shadow-xs hover:border-primary/50 transition-colors">
                            <p className="text-xs font-medium text-muted-foreground truncate">{tool}</p>
                            <div className="flex items-baseline justify-between mt-1">
                              <span className="text-xl font-bold text-foreground">{count}</span>
                              <span className="text-[10px] text-muted-foreground">uses</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Forum Comments & Activity Trail */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Forum Comments */}
                  <Card className="shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-purple-500" />
                        Community Discussions & Comments ({userDetail.comments?.length || 0})
                      </CardTitle>
                      <CardDescription>Contributions to the platform forum.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {(!userDetail.comments || userDetail.comments.length === 0) ? (
                        <p className="text-xs text-muted-foreground text-center py-6 border rounded-lg border-dashed">
                          User has not posted any forum comments.
                        </p>
                      ) : (
                        <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                          {userDetail.comments.map((c) => (
                            <div key={c.id} className="p-3 rounded-lg border bg-muted/30 space-y-1 text-xs">
                              <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                                <Badge variant="outline" className="text-[10px]">{c.category || "General"}</Badge>
                                <span>{new Date(c.timestamp).toLocaleDateString()}</span>
                              </div>
                              <p className="text-foreground">{c.content}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Activity Log Trail */}
                  <Card className="shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Clock className="w-4 h-4 text-sky-500" />
                        Chronological Activity Timeline ({userDetail.activities?.length || 0})
                      </CardTitle>
                      <CardDescription>Recent interactions audit trail.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {(!userDetail.activities || userDetail.activities.length === 0) ? (
                        <p className="text-xs text-muted-foreground text-center py-6 border rounded-lg border-dashed">
                          No recent activities logged for this user.
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {userDetail.activities.map((a) => (
                            <div key={a.id} className="p-2.5 rounded-lg border bg-muted/20 flex items-center justify-between text-xs">
                              <div>
                                <span className="font-semibold text-foreground">{a.module}: </span>
                                <span className="text-muted-foreground">{a.details || a.action}</span>
                              </div>
                              <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                                {new Date(a.timestamp).toLocaleDateString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════════
              TAB 4: BAN APPEALS MODERATION
          ════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="appeals" className="space-y-6">
            <div>
              <h3 className="text-base font-semibold">Account Suspension Appeals</h3>
              <p className="text-xs text-muted-foreground">Review formal appeals submitted by users whose accounts were suspended.</p>
            </div>

            <Card className="shadow-sm">
              <CardContent className="p-0">
                {loadingAppeals ? (
                  <div className="p-12 text-center text-muted-foreground">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
                    Loading appeals queue...
                  </div>
                ) : (!appealsData || appealsData.length === 0) ? (
                  <div className="p-12 text-center text-muted-foreground">
                    <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                    No account appeals currently pending review.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>User Account</TableHead>
                        <TableHead>Suspension Reason</TableHead>
                        <TableHead>User's Appeal Message</TableHead>
                        <TableHead>Date Filed</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {appealsData.map((appeal) => (
                        <TableRow key={appeal.id}>
                          <TableCell>
                            <div>
                              <p className="font-semibold text-xs">{appeal.user_name}</p>
                              <p className="text-[11px] text-muted-foreground">{appeal.email}</p>
                            </div>
                          </TableCell>
                          
                          <TableCell className="text-xs text-rose-600 max-w-[200px] truncate">
                            {appeal.blocked_reason || "Violation of terms"}
                          </TableCell>

                          <TableCell className="text-xs max-w-[260px] truncate">
                            {appeal.appeal_message}
                          </TableCell>

                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(appeal.created_at).toLocaleDateString()}
                          </TableCell>

                          <TableCell>
                            <Badge 
                              variant={
                                appeal.status === "approved" ? "default" :
                                appeal.status === "rejected" ? "destructive" : "secondary"
                              }
                              className="text-[11px]"
                            >
                              {appeal.status.toUpperCase()}
                            </Badge>
                          </TableCell>

                          <TableCell className="text-right">
                            {appeal.status === "pending" ? (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-7 text-xs"
                                onClick={() => {
                                  setAppealReviewItem(appeal);
                                  setAdminReviewNote("");
                                }}
                              >
                                Review Appeal
                              </Button>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">Reviewed</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ── Suspension Reason Dialog ──────────────────────────────────── */}
        <Dialog open={!!blockModalUser} onOpenChange={(open) => !open && setBlockModalUser(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-rose-600 flex items-center gap-2">
                <Ban className="w-5 h-5" />
                Suspend Account: {blockModalUser?.name}
              </DialogTitle>
              <DialogDescription>
                Suspended users are blocked from logging in or using portal resources until reinstated.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <label className="text-xs font-semibold text-foreground">
                Violation / Suspension Reason (Mandatory):
              </label>
              <Textarea 
                placeholder="e.g. Abuse of API rate limits, non-compliance with terms, or suspicious requests..." 
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                rows={3}
              />
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setBlockModalUser(null)}>
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => {
                  if (!blockReason.trim()) {
                    toast.error("Please provide a suspension reason.");
                    return;
                  }
                  if (blockModalUser) {
                    blockMutation.mutate({ email: blockModalUser.email, reason: blockReason });
                  }
                }}
                disabled={blockMutation.isPending}
              >
                Confirm Suspension
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Appeal Review Dialog ────────────────────────────────────── */}
        <Dialog open={!!appealReviewItem} onOpenChange={(open) => !open && setAppealReviewItem(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-500" />
                Review User Appeal: {appealReviewItem?.user_name}
              </DialogTitle>
              <DialogDescription>
                Account: {appealReviewItem?.email}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-sm">
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs">
                <p className="font-semibold text-rose-600">Original Suspension Reason:</p>
                <p className="text-foreground mt-0.5">{appealReviewItem?.blocked_reason || "Not specified"}</p>
              </div>

              <div className="p-3 rounded-lg bg-muted border text-xs">
                <p className="font-semibold text-muted-foreground">User Appeal Statement:</p>
                <p className="text-foreground mt-1 whitespace-pre-wrap">{appealReviewItem?.appeal_message}</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold">Admin Resolution Note (Optional):</label>
                <Textarea 
                  placeholder="Note explaining why the appeal was approved or rejected..." 
                  value={adminReviewNote}
                  onChange={(e) => setAdminReviewNote(e.target.value)}
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button 
                variant="destructive" 
                onClick={() => {
                  if (appealReviewItem) {
                    reviewAppealMutation.mutate({
                      appealId: appealReviewItem.id,
                      action: "reject",
                      note: adminReviewNote
                    });
                  }
                }}
                disabled={reviewAppealMutation.isPending}
              >
                Reject Appeal
              </Button>
              <Button 
                variant="default"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => {
                  if (appealReviewItem) {
                    reviewAppealMutation.mutate({
                      appealId: appealReviewItem.id,
                      action: "approve",
                      note: adminReviewNote
                    });
                  }
                }}
                disabled={reviewAppealMutation.isPending}
              >
                Approve & Lift Suspension
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Admin Password Reset Link Modal ───────────────────────────── */}
        <Dialog open={!!resetModalInfo} onOpenChange={(open) => !open && setResetModalInfo(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-primary">
                <Key className="w-5 h-5" />
                Password Reset Link Generated
              </DialogTitle>
              <DialogDescription>
                Generated a 24-hour single-use password recovery link for: <strong>{resetModalInfo?.email}</strong>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <label className="text-xs font-semibold text-foreground">
                Copy and share this link directly with the user:
              </label>
              <div className="flex items-center gap-2">
                <Input 
                  readOnly 
                  value={resetModalInfo?.resetUrl || ""} 
                  className="font-mono text-xs bg-muted"
                />
                <Button 
                  size="sm" 
                  onClick={() => {
                    if (resetModalInfo?.resetUrl) {
                      navigator.clipboard.writeText(resetModalInfo.resetUrl);
                      setHasCopiedReset(true);
                      toast.success("Link copied to clipboard!");
                      setTimeout(() => setHasCopiedReset(false), 3000);
                    }
                  }}
                  className="shrink-0"
                >
                  {hasCopiedReset ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                When opened, this URL allows the user to immediately set a new password without needing access to their old password.
              </p>
            </div>

            <DialogFooter>
              <Button onClick={() => setResetModalInfo(null)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}
