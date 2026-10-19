import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Users, 
  ShieldAlert, 
  ShieldCheck, 
  Activity, 
  MessageSquare, 
  Search, 
  Filter, 
  MoreVertical, 
  Ban, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Eye, 
  Calendar, 
  Clock, 
  Sparkles, 
  BarChart3, 
  Inbox, 
  ChevronRight,
  UserX,
  UserCheck,
  Send,
  Loader2,
  RefreshCw,
  ExternalLink,
  ThumbsUp,
  FileText
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { api, AdminUserSummary, AdminUserDetail, UserActivityLog, UserAppealItem } from "@/lib/api";
import { toast } from "sonner";

export function UserManagementPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("users");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "blocked" | "admins">("all");
  
  // Modals state
  const [selectedUserEmail, setSelectedUserEmail] = useState<string | null>(null);
  const [blockModalUser, setBlockModalUser] = useState<AdminUserSummary | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [appealReviewItem, setAppealReviewItem] = useState<UserAppealItem | null>(null);
  const [adminReviewNote, setAdminReviewNote] = useState("");

  const isUserAdmin = user?.role === "admin";

  // ── Queries ──
  const { data: usersData, isLoading: loadingUsers, refetch: refetchUsers } = useQuery({
    queryKey: ["admin_users"],
    queryFn: async () => {
      const res = await api.admin.getUsers();
      return res.users;
    },
    enabled: isUserAdmin,
  });

  const { data: activitiesData, isLoading: loadingActivities, refetch: refetchActivities } = useQuery({
    queryKey: ["admin_activities"],
    queryFn: async () => {
      const res = await api.admin.getActivities(150);
      return res.activities;
    },
    enabled: isUserAdmin && (activeTab === "activities" || activeTab === "users"),
  });

  const { data: appealsData, isLoading: loadingAppeals, refetch: refetchAppeals } = useQuery({
    queryKey: ["admin_appeals"],
    queryFn: async () => {
      const res = await api.admin.getAppeals("all");
      return res.appeals;
    },
    enabled: isUserAdmin,
  });

  const { data: userDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ["admin_user_detail", selectedUserEmail],
    queryFn: async () => {
      if (!selectedUserEmail) return null;
      const res = await api.admin.getUserDetail(selectedUserEmail);
      return res.user;
    },
    enabled: !!selectedUserEmail && isUserAdmin,
  });

  // ── Mutations ──
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
      queryClient.invalidateQueries({ queryKey: ["admin_activities"] });
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
      toast.success(`Account ${email} suspension has been lifted.`);
      queryClient.invalidateQueries({ queryKey: ["admin_users"] });
      queryClient.invalidateQueries({ queryKey: ["admin_user_detail", email] });
      queryClient.invalidateQueries({ queryKey: ["admin_appeals"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to unblock user.");
    }
  });

  const reviewAppealMutation = useMutation({
    mutationFn: async ({ appealId, action, note }: { appealId: number; action: "approve" | "reject"; note?: string }) => {
      return await api.admin.reviewAppeal(appealId, action, note);
    },
    onSuccess: (data, vars) => {
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

  if (!isUserAdmin) {
    return (
      <div className="h-full w-full flex items-center justify-center p-6 bg-slate-950 text-slate-100">
        <Card className="max-w-md w-full border-red-500/20 bg-slate-900/80 backdrop-blur-xl text-center p-6 space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Administrator Access Required</h2>
            <p className="text-xs text-slate-400 mt-1">
              You must be logged into an administrator account to view the user management and moderation console.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  const usersList = usersData || [];
  const appealsList = appealsData || [];
  const activitiesList = activitiesData || [];

  // Filter users
  const filteredUsers = usersList.filter(u => {
    const matchesSearch = 
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      u.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;

    if (statusFilter === "active") return !u.is_blocked;
    if (statusFilter === "blocked") return u.is_blocked;
    if (statusFilter === "admins") return u.role === "admin";
    return true;
  });

  // KPI Calculations
  const totalUsers = usersList.length;
  const blockedCount = usersList.filter(u => u.is_blocked).length;
  const pendingAppealsCount = appealsList.filter(a => a.status === "pending").length;
  const activeCount = usersList.filter(u => !u.is_blocked).length;

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-y-auto">
      {/* ── Top Header Banner ── */}
      <div className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-6 py-5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-950/50">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">Management of Users</h1>
                <Badge variant="outline" className="text-[10px] bg-indigo-500/10 border-indigo-500/30 text-indigo-400">
                  Admin Console
                </Badge>
              </div>
              <p className="text-xs text-slate-400">
                Monitor member activities, favorite analysis tools, community posts, enforce account moderation, and review appeals.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                refetchUsers();
                refetchActivities();
                refetchAppeals();
                toast.success("User management data refreshed");
              }}
              className="h-8 text-xs border-slate-800 bg-slate-900 hover:bg-slate-800 gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto w-full p-6 space-y-6">
        {/* ── KPI Summary Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-slate-800/80 bg-slate-900/50 backdrop-blur-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Total Registered</p>
                <h3 className="text-2xl font-bold text-white mt-1">{totalUsers}</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Accounts created</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800/80 bg-slate-900/50 backdrop-blur-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider">Active Accounts</p>
                <h3 className="text-2xl font-bold text-emerald-400 mt-1">{activeCount}</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Standard standing</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                <UserCheck className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800/80 bg-slate-900/50 backdrop-blur-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-rose-400 uppercase tracking-wider">Suspended Accounts</p>
                <h3 className="text-2xl font-bold text-rose-400 mt-1">{blockedCount}</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Blocked from platform</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center">
                <UserX className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card 
            className={`border-slate-800/80 bg-slate-900/50 backdrop-blur-sm cursor-pointer transition-all hover:border-amber-500/40 ${pendingAppealsCount > 0 ? "border-amber-500/30" : ""}`}
            onClick={() => setActiveTab("appeals")}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-[11px] font-medium text-amber-400 uppercase tracking-wider">Pending Appeals</p>
                  {pendingAppealsCount > 0 && (
                    <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                  )}
                </div>
                <h3 className="text-2xl font-bold text-amber-400 mt-1">{pendingAppealsCount}</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Awaiting admin review</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
                <Inbox className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Main Tabbed Section ── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-2">
            <TabsList className="bg-slate-900 border border-slate-800 p-1">
              <TabsTrigger value="users" className="gap-2 text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
                <Users className="w-3.5 h-3.5" />
                Users Directory ({totalUsers})
              </TabsTrigger>
              <TabsTrigger value="activities" className="gap-2 text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
                <Activity className="w-3.5 h-3.5" />
                Live Activity Audit
              </TabsTrigger>
              <TabsTrigger value="appeals" className="gap-2 text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white relative">
                <Inbox className="w-3.5 h-3.5" />
                Appeals Inbox
                {pendingAppealsCount > 0 && (
                  <Badge className="ml-1.5 px-1.5 py-0 text-[10px] bg-amber-500 text-slate-950 font-bold hover:bg-amber-400">
                    {pendingAppealsCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ══════════════ TAB 1: USERS DIRECTORY ══════════════ */}
          <TabsContent value="users" className="space-y-4 mt-0">
            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search user by name or email address..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-slate-950/80 border-slate-800 text-xs text-white placeholder:text-slate-500 h-9"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <Button
                  variant={statusFilter === "all" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setStatusFilter("all")}
                  className="h-8 text-xs text-slate-300"
                >
                  All ({usersList.length})
                </Button>
                <Button
                  variant={statusFilter === "active" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setStatusFilter("active")}
                  className="h-8 text-xs text-emerald-400"
                >
                  Active ({activeCount})
                </Button>
                <Button
                  variant={statusFilter === "blocked" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setStatusFilter("blocked")}
                  className="h-8 text-xs text-rose-400"
                >
                  Blocked ({blockedCount})
                </Button>
                <Button
                  variant={statusFilter === "admins" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setStatusFilter("admins")}
                  className="h-8 text-xs text-purple-400"
                >
                  Admins
                </Button>
              </div>
            </div>

            {/* Users Table */}
            <Card className="border-slate-800 bg-slate-900/40 backdrop-blur-sm overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-900/80">
                    <TableRow className="border-slate-800 hover:bg-transparent">
                      <TableHead className="text-xs font-semibold text-slate-300 w-64">User Profile</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-300">Account Status</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-300">Favorite Tool</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-300 text-center">Activities</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-300 text-center">Forum Posts</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-300">Joined</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-300 text-right">Moderation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingUsers ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-32 text-center text-slate-400">
                          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-500" />
                          Loading registered users...
                        </TableCell>
                      </TableRow>
                    ) : filteredUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-32 text-center text-slate-500">
                          No users found matching current criteria.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredUsers.map((u) => {
                        const isBlocked = u.is_blocked;
                        const isAdmin = u.role === "admin";
                        return (
                          <TableRow key={u.id} className="border-slate-800/60 hover:bg-slate-800/30 transition-colors">
                            {/* User Avatar & Name */}
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="w-9 h-9 border border-slate-700/60">
                                  {u.profile_picture ? (
                                    <AvatarImage src={u.profile_picture} />
                                  ) : null}
                                  <AvatarFallback className="bg-gradient-to-br from-indigo-900 to-slate-800 text-indigo-300 font-bold text-xs">
                                    {u.name?.slice(0, 2).toUpperCase() || u.email.slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold text-white truncate">{u.name}</span>
                                    {isAdmin && (
                                      <Badge className="px-1.5 py-0 text-[9px] bg-purple-500/20 text-purple-300 border-purple-500/30">
                                        Admin
                                      </Badge>
                                    )}
                                  </div>
                                  <span className="text-[11px] text-slate-400 truncate block">{u.email}</span>
                                </div>
                              </div>
                            </TableCell>

                            {/* Status */}
                            <TableCell>
                              {isBlocked ? (
                                <Badge variant="outline" className="text-[11px] bg-rose-500/10 border-rose-500/30 text-rose-400 gap-1 font-medium">
                                  <Ban className="w-3 h-3" />
                                  Suspended
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[11px] bg-emerald-500/10 border-emerald-500/30 text-emerald-400 gap-1 font-medium">
                                  <CheckCircle className="w-3 h-3" />
                                  Active
                                </Badge>
                              )}
                            </TableCell>

                            {/* Favorite Tool */}
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                                <span className="text-xs font-medium text-slate-200">
                                  {u.favorite_tool || "Exploring Platform"}
                                </span>
                              </div>
                            </TableCell>

                            {/* Activities Count */}
                            <TableCell className="text-center">
                              <Badge variant="secondary" className="bg-slate-800 text-slate-300 text-[11px] font-mono">
                                {u.total_activities}
                              </Badge>
                            </TableCell>

                            {/* Forum Posts Count */}
                            <TableCell className="text-center">
                              <span className="text-xs font-mono text-slate-300 flex items-center justify-center gap-1">
                                <MessageSquare className="w-3 h-3 text-slate-500" />
                                {u.comments_count}
                              </span>
                            </TableCell>

                            {/* Joined Date */}
                            <TableCell className="text-[11px] text-slate-400 whitespace-nowrap">
                              {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                            </TableCell>

                            {/* Actions */}
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedUserEmail(u.email)}
                                  className="h-7 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/40 gap-1"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  Inspect
                                </Button>

                                {!isAdmin && (
                                  isBlocked ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => unblockMutation.mutate(u.email)}
                                      disabled={unblockMutation.isPending}
                                      className="h-7 text-xs border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                                    >
                                      Unblock
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setBlockModalUser(u);
                                        setBlockReason("");
                                      }}
                                      className="h-7 text-xs border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                                    >
                                      Block
                                    </Button>
                                  )
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          {/* ══════════════ TAB 2: LIVE ACTIVITY AUDIT ══════════════ */}
          <TabsContent value="activities" className="space-y-4 mt-0">
            <Card className="border-slate-800 bg-slate-900/40 backdrop-blur-sm">
              <CardHeader className="pb-3 border-b border-slate-800/80">
                <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-400" />
                  Website Interaction Audit Stream
                </CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Real-time log of analyses executed, datasets exported, community contributions, and member actions.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-slate-800/60 max-h-[600px] overflow-y-auto">
                  {loadingActivities ? (
                    <div className="p-8 text-center text-slate-400">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-500" />
                      Loading activity records...
                    </div>
                  ) : activitiesList.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">
                      No activity events recorded yet.
                    </div>
                  ) : (
                    activitiesList.map((act) => (
                      <div key={act.id} className="p-3.5 px-4 flex items-center justify-between hover:bg-slate-800/20 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 text-xs font-bold">
                            {act.user_name?.slice(0, 2).toUpperCase() || "US"}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-white">{act.user_name}</span>
                              <span className="text-[11px] text-slate-500">({act.email})</span>
                              <Badge variant="outline" className="text-[10px] bg-slate-800 border-slate-700 text-slate-300">
                                {act.module}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-300 mt-0.5">
                              {act.details || act.action}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-[11px] text-slate-500 flex items-center gap-1 font-mono">
                            <Clock className="w-3 h-3" />
                            {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-[10px] text-slate-600">
                            {new Date(act.timestamp).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══════════════ TAB 3: APPEALS INBOX ══════════════ */}
          <TabsContent value="appeals" className="space-y-4 mt-0">
            <Card className="border-slate-800 bg-slate-900/40 backdrop-blur-sm">
              <CardHeader className="pb-3 border-b border-slate-800/80">
                <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                  <Inbox className="w-4 h-4 text-amber-400" />
                  Account Suspension Appeals
                </CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Review explanations submitted by suspended users and make decisions to restore accounts or uphold restrictions.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                {loadingAppeals ? (
                  <div className="p-8 text-center text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-500" />
                    Loading appeals...
                  </div>
                ) : appealsList.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    No suspension appeals currently in queue.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {appealsList.map((appeal) => {
                      const isPending = appeal.status === "pending";
                      return (
                        <div 
                          key={appeal.id} 
                          className={`p-4 rounded-xl border transition-all ${
                            isPending 
                              ? "bg-slate-900/90 border-amber-500/30 shadow-md shadow-amber-950/20" 
                              : "bg-slate-900/40 border-slate-800"
                          }`}
                        >
                          <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                            <div className="space-y-2 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-white">{appeal.user_name}</span>
                                <span className="text-xs text-slate-400 font-mono">({appeal.email})</span>
                                <Badge 
                                  className={`text-[10px] ${
                                    appeal.status === "pending"
                                      ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                                      : appeal.status === "approved"
                                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                      : "bg-rose-500/20 text-rose-400 border-rose-500/30"
                                  }`}
                                >
                                  {appeal.status.toUpperCase()}
                                </Badge>
                                <span className="text-[11px] text-slate-500">
                                  Submitted on {new Date(appeal.created_at).toLocaleString()}
                                </span>
                              </div>

                              {/* Suspension reason stated by admin */}
                              <div className="p-2.5 rounded-lg bg-red-950/20 border border-red-500/20 text-xs">
                                <span className="font-semibold text-red-400">Suspension Reason: </span>
                                <span className="text-slate-300">"{appeal.blocked_reason}"</span>
                              </div>

                              {/* User Appeal Statement */}
                              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                                <div className="text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                                  <FileText className="w-3 h-3 text-indigo-400" />
                                  User Appeal Statement:
                                </div>
                                <p className="text-slate-200 leading-relaxed italic whitespace-pre-wrap">
                                  "{appeal.appeal_message}"
                                </p>
                              </div>

                              {appeal.admin_note && (
                                <div className="text-xs text-slate-400 pl-2 border-l-2 border-indigo-500">
                                  <span className="font-semibold text-indigo-400">Admin Response: </span>
                                  {appeal.admin_note} (Reviewed by {appeal.reviewed_by})
                                </div>
                              )}
                            </div>

                            {/* Action Buttons */}
                            {isPending && (
                              <div className="flex md:flex-col gap-2 pt-2 md:pt-0">
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setAppealReviewItem(appeal);
                                    setAdminReviewNote("Your account suspension has been reviewed and cleared.");
                                  }}
                                  className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white gap-1"
                                >
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  Review & Restore
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setAppealReviewItem(appeal);
                                    setAdminReviewNote("Suspension upheld due to repeated policy breaches.");
                                  }}
                                  className="h-8 text-xs border-slate-700 text-slate-300 hover:bg-slate-800 gap-1"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  Decline
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ══════════════ MODAL: INSPECT USER PROFILE & ACTIVITY ══════════════ */}
      {selectedUserEmail && (
        <Dialog open={!!selectedUserEmail} onOpenChange={() => setSelectedUserEmail(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto bg-slate-950 border-slate-800 text-slate-100 p-6">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="w-12 h-12 border border-slate-700">
                    <AvatarFallback className="bg-indigo-900 text-indigo-200 font-bold">
                      {userDetail?.name?.slice(0, 2).toUpperCase() || "US"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
                      {userDetail?.name || selectedUserEmail}
                      {userDetail?.is_blocked ? (
                        <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30 text-[10px]">
                          Suspended
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                          Active
                        </Badge>
                      )}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-400">
                      {userDetail?.email} • Registered on {userDetail?.created_at ? new Date(userDetail.created_at).toLocaleDateString() : "—"}
                    </DialogDescription>
                  </div>
                </div>

                {/* Quick Moderation Button */}
                {userDetail && userDetail.role !== "admin" && (
                  userDetail.is_blocked ? (
                    <Button
                      size="sm"
                      onClick={() => unblockMutation.mutate(userDetail.email)}
                      className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                    >
                      Restore Account
                    </Button>
                  ) : (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setBlockModalUser(userDetail);
                        setBlockReason("");
                      }}
                      className="h-8 text-xs"
                    >
                      Suspend Account
                    </Button>
                  )
                )}
              </div>
            </DialogHeader>

            {loadingDetail || !userDetail ? (
              <div className="p-8 text-center text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                Loading deep-dive user analytics...
              </div>
            ) : (
              <div className="space-y-5 my-2">
                {/* 1. Tool Usage Distribution */}
                <Card className="border-slate-800 bg-slate-900/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-white">
                      <BarChart3 className="w-4 h-4 text-indigo-400" />
                      What this user mostly likes to use (Feature Usage):
                    </div>
                    <Badge variant="secondary" className="text-xs bg-indigo-500/20 text-indigo-300">
                      Favorite: {userDetail.favorite_tool}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    {Object.entries(userDetail.tool_breakdown || {}).length === 0 ? (
                      <p className="text-xs text-slate-500 col-span-4">No tool interactions recorded yet.</p>
                    ) : (
                      Object.entries(userDetail.tool_breakdown).map(([mod, count]) => (
                        <div key={mod} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80">
                          <p className="text-[11px] text-slate-400 truncate">{mod}</p>
                          <p className="text-sm font-bold text-white mt-0.5">{count} uses</p>
                        </div>
                      ))
                    )}
                  </div>
                </Card>

                {/* 2. Community Forum Comments Tracked */}
                <Card className="border-slate-800 bg-slate-900/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-white">
                      <MessageSquare className="w-4 h-4 text-purple-400" />
                      Community Forum Interactions ({userDetail.comments.length} Comments/Posts):
                    </div>
                  </div>

                  <div className="divide-y divide-slate-800/80 max-h-48 overflow-y-auto pr-1">
                    {userDetail.comments.length === 0 ? (
                      <p className="text-xs text-slate-500 py-3 text-center">User has not posted any comments in the community forum.</p>
                    ) : (
                      userDetail.comments.map((c) => (
                        <div key={c.id} className="py-2.5 space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-purple-400 font-semibold">{c.category || "General"}</span>
                            <span className="text-slate-500">{new Date(c.timestamp).toLocaleString()}</span>
                          </div>
                          <p className="text-xs text-slate-200 leading-relaxed bg-slate-950/70 p-2 rounded border border-slate-800/60">
                            "{c.content}"
                          </p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500">
                            <span className="flex items-center gap-1"><ThumbsUp className="w-2.5 h-2.5" /> {c.upvotes} upvotes</span>
                            {c.tag && <span>Tag: #{c.tag}</span>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>

                {/* 3. Recent Activity Stream */}
                <Card className="border-slate-800 bg-slate-900/50 p-4 space-y-2">
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-400" />
                    Timeline of Recent User Actions:
                  </div>

                  <div className="divide-y divide-slate-800 max-h-44 overflow-y-auto pr-1">
                    {userDetail.activities.length === 0 ? (
                      <p className="text-xs text-slate-500 py-2">No activity history recorded.</p>
                    ) : (
                      userDetail.activities.map((a) => (
                        <div key={a.id} className="py-2 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-semibold text-slate-200">{a.module}: </span>
                            <span className="text-slate-400">{a.details || a.action}</span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap ml-2">
                            {new Date(a.timestamp).toLocaleDateString()} {new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              </div>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={() => setSelectedUserEmail(null)} className="text-xs text-slate-400">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ══════════════ MODAL: BLOCK ACCOUNT REASON PROMPT ══════════════ */}
      {blockModalUser && (
        <Dialog open={!!blockModalUser} onOpenChange={() => setBlockModalUser(null)}>
          <DialogContent className="max-w-md bg-slate-950 border-rose-500/30 text-slate-100 p-6">
            <DialogHeader>
              <div className="flex items-center gap-2.5 text-rose-500">
                <Ban className="w-5 h-5" />
                <DialogTitle className="text-base font-bold text-white">Suspend User Account</DialogTitle>
              </div>
              <DialogDescription className="text-xs text-slate-400">
                Suspending this user will immediately revoke login access and restrict community participation. The user will be shown this explanation with an option to appeal.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 my-2">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
                <span>Account: </span>
                <span className="font-bold text-white">{blockModalUser.name}</span>
                <span className="text-slate-400 font-mono ml-1">({blockModalUser.email})</span>
              </div>

              {/* Preset Reasons */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-400">Common Violation Presets:</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "Community guidelines violation (inappropriate comments)",
                    "Harassment or abusive language in forum",
                    "Suspicious automated activity / spam",
                    "Unauthorized data harvesting attempt"
                  ].map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setBlockReason(preset)}
                      className="h-6 text-[10px] border-slate-800 bg-slate-900 text-slate-300 hover:border-rose-500/40"
                    >
                      {preset}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300">Reason for Suspension (Visible to User):</label>
                <Textarea
                  placeholder="Explain why this account is being suspended..."
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  rows={3}
                  className="bg-slate-900 border-slate-800 text-xs text-white resize-none"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" size="sm" onClick={() => setBlockModalUser(null)} className="text-xs text-slate-400">
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={!blockReason.trim() || blockMutation.isPending}
                onClick={() => blockMutation.mutate({ email: blockModalUser.email, reason: blockReason })}
                className="text-xs gap-1.5 bg-rose-600 hover:bg-rose-500"
              >
                {blockMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                Confirm Suspension
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ══════════════ MODAL: REVIEW APPEAL ══════════════ */}
      {appealReviewItem && (
        <Dialog open={!!appealReviewItem} onOpenChange={() => setAppealReviewItem(null)}>
          <DialogContent className="max-w-md bg-slate-950 border-slate-800 text-slate-100 p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
                <Inbox className="w-4 h-4 text-amber-400" />
                Review User Suspension Appeal
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Decide whether to restore account access for {appealReviewItem.user_name} ({appealReviewItem.email}).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 my-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-400">Original Suspension Reason:</span>
                <p className="text-red-400 font-medium mt-0.5">"{appealReviewItem.blocked_reason}"</p>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-400">User's Appeal Explanation:</span>
                <p className="text-slate-200 mt-1 italic whitespace-pre-wrap">"{appealReviewItem.appeal_message}"</p>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300">Admin Resolution Note (Sent to User):</label>
                <Textarea
                  placeholder="Optional response or conditions for the user..."
                  value={adminReviewNote}
                  onChange={(e) => setAdminReviewNote(e.target.value)}
                  rows={3}
                  className="bg-slate-900 border-slate-800 text-xs text-white resize-none"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-1">
              <Button variant="ghost" size="sm" onClick={() => setAppealReviewItem(null)} className="text-xs text-slate-400">
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={reviewAppealMutation.isPending}
                onClick={() => reviewAppealMutation.mutate({ appealId: appealReviewItem.id, action: "reject", note: adminReviewNote })}
                className="text-xs border-slate-700 text-rose-400 hover:bg-slate-900"
              >
                Decline Appeal
              </Button>
              <Button
                size="sm"
                disabled={reviewAppealMutation.isPending}
                onClick={() => reviewAppealMutation.mutate({ appealId: appealReviewItem.id, action: "approve", note: adminReviewNote })}
                className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white gap-1"
              >
                {reviewAppealMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                Approve & Reinstate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
