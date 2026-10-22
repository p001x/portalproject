import React, { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { AnalyticsTracker } from "@/hooks/useAnalytics";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NDVIPage } from "@/pages/NDVIPage";
import { LSTPage } from "@/pages/LSTPage";
import { RUSLEPage } from "@/pages/RUSLEPage";
import { SlopePage } from "@/pages/SlopePage";
import EarthworkPage from "@/pages/EarthworkPage";
import { LandfillPage } from "@/pages/LandfillPage";
import { AirPollutionPage } from "@/pages/AirPollutionPage";
import { LandslidePage } from "@/pages/LandslidePage";
import { UHIPage } from "@/pages/UHIPage";
import { DroughtPage } from "@/pages/DroughtPage";
import { FloodPage } from "@/pages/FloodPage";
import { AccessibilityPage } from "@/pages/AccessibilityPage";
import { HabitatSuitabilityPage } from "@/pages/HabitatSuitabilityPage";
import { IrrigationPage } from "@/pages/IrrigationPage";
import { WaterHarvestingPage } from "@/pages/WaterHarvestingPage";
import { WellScopePage } from "@/pages/WellScopePage";
import { BiomassPage } from "@/pages/BiomassPage";
import { RareDataPage } from "@/pages/RareDataPage";
import { DataHarvesterPage } from "@/pages/DataHarvesterPage";
import { SampleDigitizationPage } from "@/pages/SampleDigitizationPage";
import { ChangeDetectionPage } from "@/pages/ChangeDetectionPage";
import { AnalysisHubPage } from "@/pages/AnalysisHubPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { CloudIngestPage } from "@/pages/CloudIngestPage";
import { ServicesPage } from "@/pages/ServicesPage";
import { PricingPage } from "@/pages/PricingPage";
import { CommunityPage } from "@/pages/CommunityPage";
import { HomePage } from "@/pages/HomePage";
import { PlatformPage } from "@/pages/PlatformPage";
import { AuthPage } from "@/pages/AuthPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { AboutPage } from "@/pages/AboutPage";
import { ContactPage } from "@/pages/ContactPage";
import { AcademyPage } from "@/pages/AcademyPage";
import { BlogPage } from "@/pages/BlogPage";
import { CanvaStandalonePage } from "@/pages/CanvaStandalonePage";
import { UserManagementPage } from "@/pages/UserManagementPage";
import { AccountBlockedDialog } from "@/components/AccountBlockedDialog";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { NotificationProvider, useNotifications } from "@/hooks/use-notifications";
import { GEEAuthGate } from "@/components/GEEAuthGate";
import { UserNav } from "@/components/UserNav";
import { GEEProjectConfig } from "@/components/GEEProjectConfig";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { GeeUsageIndicator } from "@/components/GeeUsageIndicator";
import { SiteBrand, SiteLogoOnly } from "@/components/SiteBrand";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  agriWaterModules,
  riskDisasterModules,
  urbanEnvModules,
  coreSpatialModules,
  analysisModules,
  rareDataModules,
  digitizationModules,
  infrastructureModules,
  educationModules,
} from "@/config/modules";
import {
  Leaf,
  Thermometer,
  Mountain,
  Wind,
  Trash2,
  AlertTriangle,
  Database,
  Flame,
  Edit,
  Activity,
  Globe2,
  Navigation,
  Droplet,
  Waves,
  UploadCloud,
  GraduationCap,
  BookOpen,
  Briefcase,
  Home,
  Map,
  LayoutDashboard,
  MessageSquare,
  ArrowLeft,
  Menu,
  LogOut,
  Settings,
  Bell
} from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { 
      retry: (failureCount, error: any) => {
        if (String(error).includes("initializing") && failureCount < 10) return true;
        return failureCount < 1;
      },
      retryDelay: (attemptIndex, error: any) => {
        if (String(error).includes("initializing")) return 3000;
        return Math.min(1000 * 2 ** attemptIndex, 30000);
      }
    },
    mutations: { retry: 0 },
  },
});



type NavItem = typeof analysisModules[0];

function NavLink({ path, label, icon: Icon, description }: NavItem) {
  const [loc] = useLocation();
  const active = loc === path;

  return (
    <Link
      href={path}
      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm transition-all duration-300 mb-0.5 ${
        active
          ? "border-l-4 border-primary bg-primary/10 text-primary shadow-sm"
          : "border-l-4 border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:-translate-y-[1px]"
      }`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <div>
        <div className="font-medium text-xs leading-tight">{label}</div>
        <div className={`text-[10px] leading-tight ${active ? "text-primary/70" : "text-muted-foreground/60"}`}>
          {description}
        </div>
      </div>
    </Link>
  );
}

function UserProfile() {
  const { user, logout } = useAuth();
  if (!user) return null;

  const isAdmin = user.role === "admin" || 
    ["petersonyang8@gmail.com", "pierrendorimana16@gmail.com"].includes(user.email?.toLowerCase());

  const displayName = user.name || user.email.split("@")[0].replace(".", " ").replace(/_/g, " ");
  const avatarUrl = user.avatarUrl || user.profile_picture;
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "U";

  return (
    <div className="pt-3 border-t border-border/60 flex flex-col gap-3">
      {/* Profile Info Card */}
      <div className="flex items-center gap-3 overflow-hidden px-2 py-1.5 rounded-xl bg-muted/40 dark:bg-card/40 border border-border/50">
        <div className="relative shrink-0">
          <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 flex items-center justify-center text-white text-xs font-bold border border-white/20 shadow-sm">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
        </div>

        <div className="overflow-hidden flex-1 leading-tight">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-bold text-foreground truncate">{displayName}</p>
            {isAdmin && (
              <span className="px-1 py-0.2 text-[8px] font-extrabold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 rounded">
                Admin
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">{user.email}</p>
        </div>
      </div>

      {/* Icon Menu Row */}
      <div className="flex items-center justify-between px-2 bg-muted/20 py-1 rounded-xl">
        {/* Notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground h-8 w-8 rounded-lg" title="Notifications">
              <Bell className="w-4 h-4" />
              <NotificationBadge />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start" side="right">
            <NotificationList />
          </PopoverContent>
        </Popover>

        {/* Settings */}
        <Link href="/settings">
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-8 w-8 rounded-lg" title="Settings">
            <Settings className="w-4 h-4" />
          </Button>
        </Link>

        {/* Logout */}
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8 rounded-lg" onClick={logout} title="Log out">
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
      
      <div className="px-1">
        <GeeUsageIndicator />
      </div>
    </div>
  );
}

export function NotificationBadge() {
  const { unreadCount } = useNotifications();
  if (unreadCount === 0) return null;
  return (
    <span className="ml-auto flex items-center justify-center bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
      {unreadCount} new
    </span>
  );
}

import { Shield, Users, Info, CheckCircle2 } from "lucide-react";

export function NotificationList() {
  const { notifications, markAsRead, markAllAsRead, unreadCount } = useNotifications();
  
  const getIcon = (type: string) => {
    switch(type) {
      case 'security': return <Shield className="w-4 h-4 text-emerald-500" />;
      case 'analysis': return <Activity className="w-4 h-4 text-blue-500" />;
      case 'community': return <Users className="w-4 h-4 text-purple-500" />;
      default: return <Info className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="flex flex-col bg-card text-card-foreground rounded-xl shadow-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between p-3.5 border-b border-border bg-muted/30">
        <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
          Notifications
          {unreadCount > 0 && (
            <span className="bg-destructive text-destructive-foreground text-[10px] px-2 py-0.5 rounded-full font-bold">
              {unreadCount} new
            </span>
          )}
        </h4>
        {unreadCount > 0 && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-auto p-1 text-xs text-primary hover:bg-primary/10 font-semibold transition-colors" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              markAllAsRead();
            }}
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1 inline" />
            Mark all read
          </Button>
        )}
      </div>
      <div className="max-h-[350px] overflow-y-auto overflow-x-hidden custom-scrollbar">
        {notifications.length === 0 ? (
          <div className="p-8 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3 text-muted-foreground">
              <Bell className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium text-foreground">You're all caught up!</p>
            <p className="text-xs text-muted-foreground mt-1">No new notifications right now.</p>
          </div>
        ) : (
          notifications.map(n => (
            <div 
              key={n.id} 
              className={`p-3.5 border-b border-border/50 last:border-0 hover:bg-muted/50 transition-colors ${!n.read ? 'bg-primary/5 cursor-pointer' : ''}`}
              onClick={(e) => {
                if (!n.read) {
                  e.preventDefault();
                  e.stopPropagation();
                  markAsRead(n.id);
                }
              }}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center shrink-0">
                  {getIcon(n.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-semibold truncate ${!n.read ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {n.title}
                    </p>
                    {!n.read && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />}
                  </div>
                  <p className={`text-xs mt-1 leading-relaxed ${!n.read ? 'text-foreground/90 font-medium' : 'text-muted-foreground'}`}>
                    {n.message}
                  </p>
                  <p className="text-[10px] font-medium text-muted-foreground/70 mt-2 tracking-wide uppercase">
                    {new Date(n.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })} • {new Date(n.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Sidebar({ loc, className = "" }: { loc: string; className?: string }) {
  const { user } = useAuth();
  
  const isUserAdmin = user?.role === 'admin';

  return (
    <nav className={`flex flex-col h-full bg-card/60 backdrop-blur-2xl border-r border-border ${className}`}>
      {/* Sidebar Header */}
      <div className="p-4 border-b shrink-0 flex items-center justify-between group cursor-pointer hover:bg-muted/50 transition-colors">
        <SiteBrand size="normal" hideSubtitleOnMobile />
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        
        {/* Main Home Tab */}
        <div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/90 mb-1">
            <Home className="w-3.5 h-3.5 text-blue-500" />
            <span>Navigation</span>
          </div>
          <div className="space-y-0.5">
            <NavLink path="/" label="Home" icon={Home} description="Landing Page" />
            <NavLink path="/platform" label="Platform" icon={LayoutDashboard} description="Module Hub" />
          </div>
        </div>

        <Accordion type="multiple" defaultValue={["agri", "risk", "urban", "core", "data", "admin"]} className="w-full">
          <AccordionItem value="agri" className="border-b-0">
            <AccordionTrigger className="flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/90 hover:no-underline hover:text-foreground">
              <div className="flex items-center gap-1.5"><Leaf className="w-3.5 h-3.5 text-emerald-500" /> Agriculture & Water</div>
            </AccordionTrigger>
            <AccordionContent className="pb-2 pt-0 space-y-0.5">
              {agriWaterModules.map((m) => <NavLink key={m.path} {...m} />)}
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="risk" className="border-b-0">
            <AccordionTrigger className="flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/90 hover:no-underline hover:text-foreground">
              <div className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Risk & Disasters</div>
            </AccordionTrigger>
            <AccordionContent className="pb-2 pt-0 space-y-0.5">
              {riskDisasterModules.map((m) => <NavLink key={m.path} {...m} />)}
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="urban" className="border-b-0">
            <AccordionTrigger className="flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/90 hover:no-underline hover:text-foreground">
              <div className="flex items-center gap-1.5"><Flame className="w-3.5 h-3.5 text-orange-500" /> Urban & Env</div>
            </AccordionTrigger>
            <AccordionContent className="pb-2 pt-0 space-y-0.5">
              {urbanEnvModules.map((m) => <NavLink key={m.path} {...m} />)}
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="core" className="border-b-0">
            <AccordionTrigger className="flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/90 hover:no-underline hover:text-foreground">
              <div className="flex items-center gap-1.5"><Map className="w-3.5 h-3.5 text-blue-500" /> Core Spatial</div>
            </AccordionTrigger>
            <AccordionContent className="pb-2 pt-0 space-y-0.5">
              {coreSpatialModules.map((m) => <NavLink key={m.path} {...m} />)}
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="data" className="border-b-0">
            <AccordionTrigger className="flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/90 hover:no-underline hover:text-foreground">
              <div className="flex items-center gap-1.5"><Database className="w-3.5 h-3.5 text-indigo-500" /> Data & Infra</div>
            </AccordionTrigger>
            <AccordionContent className="pb-2 pt-0 space-y-0.5">
              {rareDataModules.map((m) => <NavLink key={m.path} {...m} />)}
              {digitizationModules.map((m) => <NavLink key={m.path} {...m} />)}
              {infrastructureModules.map((m) => <NavLink key={m.path} {...m} />)}
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="admin" className="border-b-0">
            <AccordionTrigger className="flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/90 hover:no-underline hover:text-foreground">
              <div className="flex items-center gap-1.5"><GraduationCap className="w-3.5 h-3.5 text-purple-500" /> Community</div>
            </AccordionTrigger>
            <AccordionContent className="pb-2 pt-0 space-y-0.5">
              {educationModules.map((m) => <NavLink key={m.path} {...m} />)}
              <NavLink path="/community" label="Community Forum" icon={MessageSquare} description="Discuss & Share" />
              {isUserAdmin && <NavLink path="/admin/users" label="User Management" icon={Users} description="Moderation & Activities" />}
              {isUserAdmin && <NavLink path="/dashboard" label="Admin Command Center" icon={LayoutDashboard} description="Traffic, Accounts & Habits" />}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <div className="p-3 border-t space-y-2">
        {isUserAdmin && <GEEProjectConfig />}
        <p className="text-[10px] text-muted-foreground text-center">
          Powered by Google Earth Engine
        </p>
      </div>
      
      {/* Sidebar Footer */}
      <div className="p-4 border-t space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-500 font-medium">v1.0.0</div>
            <Link href="/about" className="text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer font-medium">About</Link>
          </div>
          <ThemeToggle />
        </div>
        <UserProfile />
      </div>
    </nav>
  );
}

function UserProfileDropdown() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full overflow-hidden w-8 h-8 ml-2">
          <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56" align="end">
        <div className="flex flex-col space-y-4">
          <div>
            <p className="text-sm font-bold truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
          <div className="flex flex-col gap-1">
            <Link href="/settings">
              <Button variant="ghost" className="w-full justify-start h-8 text-xs">
                <Settings className="w-3.5 h-3.5 mr-2" />
                Settings
              </Button>
            </Link>
            <Button variant="ghost" className="w-full justify-start h-8 text-xs text-destructive hover:text-destructive" onClick={logout}>
              <LogOut className="w-3.5 h-3.5 mr-2" />
              Log out
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const [loc, setLocation] = useLocation();
  const { isAuthenticated, isLoading, user } = useAuth();

  // Normalize location: strip any leading wouter tilde '~', query strings, and trailing slashes
  const cleanLoc = (loc || "").replace(/^~/, "").split("?")[0].replace(/\/+$/, "") || "/";
  const publicStandaloneRoutes = ["/", "/platform", "/analysis-hub", "/about", "/contact", "/auth", "/blog", "/export-editor"];
  const isStandalone = publicStandaloneRoutes.includes(cleanLoc) || cleanLoc.startsWith("/reset-password");

  const strictlyProtectedRoutes = ["/settings", "/admin/users", "/cloud-ingest", "/dashboard"];
  const requiresAuth = strictlyProtectedRoutes.some(p => cleanLoc === p || cleanLoc.startsWith(p + "/"));

  useEffect(() => {
    if (!isLoading && !isAuthenticated && requiresAuth) {
      setLocation("/auth");
    }
  }, [isAuthenticated, isLoading, requiresAuth, setLocation]);

  if (isStandalone) {
    return <>{children}</>;
  }

  if (isLoading || (!isAuthenticated && requiresAuth)) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">
        Loading...
      </div>
    );
  }

  const isFocusedMode = [...analysisModules, ...rareDataModules, ...digitizationModules, ...infrastructureModules, ...educationModules].some(m => m.path === cleanLoc) || cleanLoc === "/community" || cleanLoc === "/dashboard" || cleanLoc === "/settings" || cleanLoc === "/admin/users";
  const isAnalysisFocused = analysisModules.some(m => m.path === cleanLoc);

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop Sidebar (Hidden in focused mode) */}
      {!isFocusedMode && <Sidebar loc={cleanLoc} className="hidden md:flex" />}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header - Always visible on mobile, visible on desktop ONLY if focused mode */}
        <header className={`flex items-center justify-between p-4 border-b bg-card ${isFocusedMode ? "flex" : "md:hidden"}`}>
          <div className="flex items-center gap-3">
            <SiteBrand size={isFocusedMode ? "normal" : "small"} />
            {isFocusedMode && (
              <div className="hidden md:flex items-center pl-4 border-l border-border ml-2">
                <Link href={isAnalysisFocused ? "/analysis-hub" : "/platform"}>
                  <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="w-4 h-4" />
                    {isAnalysisFocused ? "Back to Analysis Modules" : "Back to Platform"}
                  </Button>
                </Link>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {isFocusedMode && (
              <div className="hidden md:flex items-center gap-2">
                <UserNav />
              </div>
            )}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className={isFocusedMode ? "md:hidden" : ""} aria-label="Toggle Menu">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-64 flex flex-col border-r-0">
                <Sidebar loc={loc} className="w-full border-r-0" />
              </SheetContent>
            </Sheet>
          </div>
        </header>
        
        <main className="flex-1 overflow-hidden relative">
          {children}
        </main>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="h-full flex items-center justify-center text-muted-foreground">
      Page not found.
    </div>
  );
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/platform" component={PlatformPage} />
        <Route path="/auth" component={AuthPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/about" component={AboutPage} />
        <Route path="/contact" component={ContactPage} />
        <Route path="/analysis" component={AnalysisHubPage} />
        <Route path="/export-editor" component={CanvaStandalonePage} />
        <Route path="/analysis-hub" component={AnalysisHubPage} />
        <Route path="/ndvi" component={NDVIPage} />
        <Route path="/change-detection" component={ChangeDetectionPage} />
        <Route path="/lst" component={LSTPage} />
        <Route path="/rusle" component={RUSLEPage} />
        <Route path="/slope" component={SlopePage} />
        <Route path="/earthwork" component={EarthworkPage} />
        <Route path="/landfill" component={LandfillPage} />
        <Route path="/air" component={AirPollutionPage} />
        <Route path="/landslide" component={LandslidePage} />
        <Route path="/flood" component={FloodPage} />
        <Route path="/drought" component={DroughtPage} />
        <Route path="/uhi" component={UHIPage} />
        <Route path="/accessibility" component={AccessibilityPage} />
        <Route path="/habitat" component={HabitatSuitabilityPage} />
        <Route path="/irrigation" component={IrrigationPage} />
        <Route path="/water-harvesting" component={WaterHarvestingPage} />
        <Route path="/wellscope" component={WellScopePage} />
        <Route path="/biomass" component={BiomassPage} />
        <Route path="/rare-data" component={RareDataPage} />
        <Route path="/harvester" component={DataHarvesterPage} />
        <Route path="/samples">
          <GEEAuthGate>
            <div className="h-full flex flex-col">
              <div className="flex-1 overflow-hidden">
                <SampleDigitizationPage />
              </div>
            </div>
          </GEEAuthGate>
        </Route>
        <Route path="/community" component={CommunityPage} />
        <Route path="/admin/users" component={UserManagementPage} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/cloud-ingest" component={CloudIngestPage} />
        <Route path="/services" component={PricingPage} />
        <Route path="/academy" component={AcademyPage} />
        <Route path="/blog" component={BlogPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}



export default function App() {
  const rawBase = import.meta.env.BASE_URL || "/";
  const routerBase = (rawBase === "./" || rawBase === "." || rawBase === "/") ? undefined : rawBase.replace(/\/$/, "");

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={routerBase}>
            <AuthProvider>
              <NotificationProvider>
                <AnalyticsTracker />
                <AccountBlockedDialog />
                <Router />
              </NotificationProvider>
            </AuthProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
