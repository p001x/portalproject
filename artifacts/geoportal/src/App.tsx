import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { AnalyticsTracker } from "@/hooks/useAnalytics";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
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
import { RareDataPage } from "@/pages/RareDataPage";
import { SampleDigitizationPage } from "@/pages/SampleDigitizationPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { GEEProjectConfig } from "@/components/GEEProjectConfig";
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
  { path: "/rusle", label: "RUSLE", icon: Mountain, description: "Soil Erosion" },
  { path: "/slope", label: "Slope", icon: Mountain, description: "Topography" },
  { path: "/landfill", label: "Landfill", icon: Trash2, description: "Site Suitability" },
  { path: "/air", label: "Air Pollution", icon: Wind, description: "NO2 Monitoring" },
  { path: "/landslide", label: "Landslide", icon: AlertTriangle, description: "Susceptibility" },
  { path: "/flood", label: "Flood", icon: Waves, description: "Flood Risk" },
  { path: "/drought", label: "Drought", icon: Droplet, description: "Agri Drought" },
  { path: "/uhi", label: "UHI", icon: Flame, description: "Urban Heat Island" },
  { path: "/accessibility", label: "Accessibility", icon: Navigation, description: "Facility Access" },
];

const rareDataModules = [
  { path: "/rare-data", label: "RARE DATA Hub", icon: Database, description: "Dataset Repository" },
];

const digitizationModules = [
  { path: "/samples", label: "Sample Digitizer", icon: Edit, description: "Training Samples" },
];

type NavItem = typeof analysisModules[0];

function NavLink({ path, label, icon: Icon, description }: NavItem) {
  const [loc] = useLocation();
  const active = loc === path || (loc === "/" && path === "/ndvi");

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

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-background">
      {/* App sidebar */}
      <nav className="w-56 shrink-0 border-r bg-card flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #00d4aa 0%, #007aff 100%)" }}>
              <Satellite className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="font-bold text-sm leading-tight tracking-wide text-foreground">RWANDA</div>
              <div className="text-[10px] leading-tight font-medium tracking-widest" style={{ color: "#00d4aa" }}>GeoPortal</div>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* Major Category 1: Analysis Modules */}
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

          {/* Major Category 2: Rare Data */}
          <div className="pt-2 border-t border-border/60">
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

          {/* Major Category 3: Sample Digitization */}
          <div className="pt-2 border-t border-border/60">
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

          {/* Major Category 4: Admin */}
          <div className="pt-2 border-t border-border/60">
            <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/90 mb-1">
              <LayoutDashboard className="w-3.5 h-3.5 text-purple-500" />
              <span>Admin</span>
            </div>
            <div className="space-y-0.5">
              <NavLink path="/dashboard" label="Analytics" icon={LayoutDashboard} description="Traffic & Usage" />
            </div>
          </div>
        </div>

        <div className="p-3 border-t space-y-2">
          <GEEProjectConfig />
          <p className="text-[10px] text-muted-foreground text-center">
            Powered by Google Earth Engine
          </p>
        </div>
      </nav>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {children}
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
        <Route path="/" component={NDVIPage} />
        <Route path="/ndvi" component={NDVIPage} />
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
        <Route path="/rare-data" component={RareDataPage} />
        <Route path="/samples" component={SampleDigitizationPage} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}



export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AnalyticsTracker />
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
