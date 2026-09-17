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
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { NotificationProvider, useNotifications } from "@/hooks/use-notifications";
import { GEEAuthGate } from "@/components/GEEAuthGate";
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

  return (
  <div className="pt-4 border-t flex flex-col gap-4">
    {/* Profile Info */}
    <div className="flex items-center gap-3 overflow-hidden px-2">
      <img src={user.avatarUrl} alt="Avatar" className="w-10 h-10 rounded-full bg-slate-800 shrink-0 border border-border" />
      <div className="overflow-hidden">
        <p className="text-sm font-bold text-foreground truncate">{user.name}</p>
        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
      </div>
    </div>

    {/* Menu Items with clear written text */}
    <div className="flex flex-col gap-1">
      {/* Notifications */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground font-medium">
            <Bell className="w-4 h-4 mr-3" />
            Notifications
            <NotificationBadge />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start" side="right">
          <NotificationList />
        </PopoverContent>
      </Popover>

      {/* Settings */}
      <Link href="/settings" className="w-full">
        <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground font-medium">
          <Settings className="w-4 h-4 mr-3" />
          Settings
        </Button>
      </Link>

      {/* Logout */}
      <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-destructive font-medium" onClick={logout}>
        <LogOut className="w-4 h-4 mr-3" />
        Log out
      </Button>
    </div>
    
    <div className="px-2">
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

export function NotificationList() {
  const { notifications, markAsRead, markAllAsRead, unreadCount } = useNotifications();
  
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between p-3 border-b">
        <h4 className="font-semibold text-sm">Notifications</h4>
        {unreadCount > 0 && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-auto p-1 text-xs" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              markAllAsRead();
            }}
          >
            Mark all read
          </Button>
        )}
      </div>
      <div className="max-h-[300px] overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">No notifications</div>
        ) : (
          notifications.map(n => (
            <div 
              key={n.id} 
              className={`p-3 border-b last:border-0 hover:bg-muted/50 transition-colors ${!n.read ? 'bg-primary/5 cursor-pointer' : ''}`}
              onClick={(e) => {
                if (!n.read) {
                  e.preventDefault();
                  e.stopPropagation();
                  markAsRead(n.id);
                }
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium leading-tight">{n.title}</p>
                {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1" />}
              </div>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.message}</p>
              <p className="text-[10px] text-muted-foreground/70 mt-1">{new Date(n.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
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
              {isUserAdmin && <NavLink path="/dashboard" label="Analytics" icon={LayoutDashboard} description="Traffic & Usage" />}
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
            <Link href="/about"><a className="text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer font-medium">About</a></Link>
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
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated && loc !== "/" && loc !== "/platform" && loc !== "/analysis-hub" && loc !== "/about" && loc !== "/contact" && loc !== "/auth" && loc !== "/blog" && !loc.startsWith("/reset-password") && loc !== "/export-editor") {
      setLocation("/auth");
    }
  }, [isAuthenticated, isLoading, loc, setLocation]);

  if (loc === "/" || loc === "/platform" || loc === "/analysis-hub" || loc === "/about" || loc === "/contact" || loc === "/auth" || loc === "/blog" || loc.startsWith("/reset-password") || loc === "/export-editor") {
    return <>{children}</>;
  }

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">
        Loading...
      </div>
    );
  }

  const isFocusedMode = [...analysisModules, ...rareDataModules, ...digitizationModules, ...infrastructureModules, ...educationModules].some(m => m.path === loc) || loc === "/community" || loc === "/dashboard";
  const isAnalysisFocused = analysisModules.some(m => m.path === loc);

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop Sidebar (Hidden in focused mode) */}
      {!isFocusedMode && <Sidebar loc={loc} className="hidden md:flex" />}

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
                <ThemeToggle />
                <UserProfileDropdown />
              </div>
            )}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className={isFocusedMode ? "md:hidden" : ""}>
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
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <NotificationProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <AuthProvider>
                <AnalyticsTracker />
                <Router />
              </AuthProvider>
            </WouterRouter>
            <Toaster />
          </NotificationProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
