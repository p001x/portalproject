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
import { SampleDigitizationPage } from "@/pages/SampleDigitizationPage";
import { ChangeDetectionPage } from "@/pages/ChangeDetectionPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { DeveloperPage } from "@/pages/DeveloperPage";
import { CloudIngestPage } from "@/pages/CloudIngestPage";
import { ServicesPage } from "@/pages/ServicesPage";
import { CommunityPage } from "@/pages/CommunityPage";
import { HomePage } from "@/pages/HomePage";
import { AuthPage } from "@/pages/AuthPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { AboutPage } from "@/pages/AboutPage";
import { AcademyPage } from "@/pages/AcademyPage";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { GEEProjectConfig } from "@/components/GEEProjectConfig";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { GeeUsageIndicator } from "@/components/GeeUsageIndicator";
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
  Satellite,
  Globe2,
  BarChart3,
  PenTool,
  Droplet,
  Waves,
  LayoutDashboard,
  Navigation,
  MessageSquare,
  ArrowLeft,
  Menu,
  LogOut,
  Activity,
  Terminal,
  Briefcase,
  Settings,
  UploadCloud,
  GraduationCap
} from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1 },
    mutations: { retry: 0 },
  },
});

const analysisModules = [
  { path: "/ndvi", label: "NDVI", icon: Leaf, description: "Vegetation Health" },
  { path: "/lst", label: "LST", icon: Thermometer, description: "Land Surface Temp" },
  { path: "/change-detection", label: "Change Detection", icon: Activity, description: "NDVI Timelapse" },
  { path: "/rusle", label: "RUSLE", icon: Mountain, description: "Soil Erosion" },
  { path: "/slope", label: "Slope", icon: Mountain, description: "Topography" },
  { path: "/landfill", label: "Landfill", icon: Trash2, description: "Site Suitability" },
  { path: "/air", label: "Air Pollution", icon: Wind, description: "NO2 Monitoring" },
  { path: "/landslide", label: "Landslide", icon: AlertTriangle, description: "Susceptibility" },
  { path: "/flood", label: "Flood", icon: Waves, description: "Flood Risk" },
  { path: "/drought", label: "Drought", icon: Droplet, description: "Agri Drought" },
  { path: "/uhi", label: "UHI", icon: Flame, description: "Urban Heat Island" },
  { path: "/accessibility", label: "Accessibility", icon: Navigation, description: "Facility Access" },
  { path: "/habitat", label: "Crane Habitat", icon: Leaf, description: "Suitability (AHP)" },
  { path: "/irrigation", label: "Irrigation", icon: Droplet, description: "Scheduling Advisor" },
  { path: "/water-harvesting", label: "Water Harvesting", icon: Droplet, description: "Rainwater Calculator" },
  { path: "/wellscope", label: "WellScope", icon: Droplet, description: "Borehole Siting" },
  { path: "/biomass", label: "Biomass Tracker", icon: Flame, description: "Depletion Risk" },
];

const rareDataModules = [
  { path: "/rare-data", label: "RARE DATA Hub", icon: Database, description: "Dataset Repository" },
];

const digitizationModules = [
  { path: "/samples", label: "Sample Digitizer", icon: Edit, description: "Training Samples" },
];

const infrastructureModules = [
  { path: "/cloud-ingest", label: "Cloud Ingestion", icon: UploadCloud, description: "Direct GEE Upload" },
  { path: "/developer", label: "API Gateway", icon: Terminal, description: "Backend-as-a-Service" },
  { path: "/services", label: "Premium Services", icon: Briefcase, description: "Consultation & Teaching" },
];

const educationModules = [
  { path: "/academy", label: "Training & Academy", icon: GraduationCap, description: "Courses & Reading" },
];

type NavItem = typeof analysisModules[0];

function NavLink({ path, label, icon: Icon, description }: NavItem) {
  const [loc] = useLocation();
  const active = loc === path;

  return (
    <Link
      href={path}
      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all mb-0.5 ${
        active
          ? "border-l-2 border-primary bg-primary/10 text-primary"
          : "border-l-2 border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
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
  <div className="pt-2 border-t flex flex-col gap-1">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 overflow-hidden">
        <img src={user.avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full bg-slate-800 shrink-0" />
        <div className="overflow-hidden">
          <p className="text-xs font-semibold text-foreground truncate">{user.name}</p>
          <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Link href="/settings">
          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8 text-muted-foreground hover:text-primary" title="Settings">
            <Settings className="w-4 h-4" />
          </Button>
        </Link>
        <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive" onClick={logout} title="Log out">
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    </div>
    <GeeUsageIndicator />
  </div>
  );
}

function Sidebar({ loc, className = "" }: { loc: string; className?: string }) {
  const { user } = useAuth();
  
  const isAnalysis = analysisModules.some(m => m.path === loc);
  const isRareData = rareDataModules.some(m => m.path === loc);
  const isDigitization = digitizationModules.some(m => m.path === loc);
  const isInfrastructure = infrastructureModules.some(m => m.path === loc);
  const isEducation = educationModules.some(m => m.path === loc);
  const isAdminSection = loc === "/dashboard" || loc === "/community";
  
  const isUserAdmin = user?.role === 'admin';

  return (
    <nav className={`w-56 shrink-0 border-r bg-card flex flex-col h-full ${className}`}>
      <div className="p-4 border-b">
        <Link href="/">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors cursor-pointer mb-4">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Hub</span>
          </div>
        </Link>
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="SPETRO Logo" className="h-8 w-auto object-contain shrink-0 drop-shadow-md rounded" />
          <div>
            <div className="font-bold text-sm leading-tight tracking-wide text-foreground">SPETRO</div>
            <div className="text-[10px] leading-tight font-medium tracking-widest" style={{ color: "#00d4aa" }}>Geoportal Analysis</div>
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        
        {isAnalysis && (
          <div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/90 mb-1">
              <BarChart3 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Analysis Modules</span>
            </div>
            <div className="space-y-0.5">
              {analysisModules.map((m) => (
                <NavLink key={m.path} {...m} />
              ))}
            </div>
          </div>
        )}

        {isRareData && (
          <div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/90 mb-1">
              <Database className="w-3.5 h-3.5 text-blue-500" />
              <span>Rare Data</span>
            </div>
            <div className="space-y-0.5">
              {rareDataModules.map((m) => (
                <NavLink key={m.path} {...m} />
              ))}
            </div>
          </div>
        )}

        {isDigitization && (
          <div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/90 mb-1">
              <PenTool className="w-3.5 h-3.5 text-amber-500" />
              <span>Sample Digitization</span>
            </div>
            <div className="space-y-0.5">
              {digitizationModules.map((m) => (
                <NavLink key={m.path} {...m} />
              ))}
            </div>
          </div>
        )}

        {isInfrastructure && (
          <div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/90 mb-1">
              <Terminal className="w-3.5 h-3.5 text-slate-500" />
              <span>Infrastructure</span>
            </div>
            <div className="space-y-0.5">
              {infrastructureModules.map((m) => (
                <NavLink key={m.path} {...m} />
              ))}
            </div>
          </div>
        )}

        {isEducation && (
          <div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/90 mb-1">
              <GraduationCap className="w-3.5 h-3.5 text-teal-500" />
              <span>Education</span>
            </div>
            <div className="space-y-0.5">
              {educationModules.map((m) => (
                <NavLink key={m.path} {...m} />
              ))}
            </div>
          </div>
        )}

        {isAdminSection && (
          <div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/90 mb-1">
              <LayoutDashboard className="w-3.5 h-3.5 text-purple-500" />
              <span>Community & Admin</span>
            </div>
            <div className="space-y-0.5">
              <NavLink path="/community" label="Community Forum" icon={MessageSquare} description="Discuss & Share" />
              {isUserAdmin && (
                <NavLink path="/dashboard" label="Analytics" icon={LayoutDashboard} description="Traffic & Usage" />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t space-y-2">
        <GEEProjectConfig />
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

function Layout({ children }: { children: React.ReactNode }) {
  const [loc, setLocation] = useLocation();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated && loc !== "/" && loc !== "/auth") {
      setLocation("/auth");
    }
  }, [isAuthenticated, isLoading, loc, setLocation]);

  if (loc === "/" || loc === "/auth") {
    return <>{children}</>;
  }

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop Sidebar */}
      <Sidebar loc={loc} className="hidden md:flex" />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b bg-card">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="SPETRO Logo" className="h-6 w-auto object-contain rounded" />
            <div className="font-bold text-sm text-foreground">SPETRO</div>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-56 flex flex-col border-r-0">
              <Sidebar loc={loc} className="w-full border-r-0" />
            </SheetContent>
          </Sheet>
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
        <Route path="/auth" component={AuthPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/about" component={AboutPage} />
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
        <Route path="/samples" component={SampleDigitizationPage} />
        <Route path="/community" component={CommunityPage} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/developer" component={DeveloperPage} />
        <Route path="/cloud-ingest" component={CloudIngestPage} />
        <Route path="/services" component={ServicesPage} />
        <Route path="/academy" component={AcademyPage} />
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
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthProvider>
              <AnalyticsTracker />
              <Router />
            </AuthProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
