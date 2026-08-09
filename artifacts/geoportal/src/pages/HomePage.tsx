import { Link } from "wouter";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/hooks/use-auth";
import { 
  BarChart3, 
  Database, 
  PenTool, 
  LayoutDashboard, 
  MessageSquare,
  ArrowRight,
  Satellite,
  Terminal,
  Briefcase
} from "lucide-react";

const HUB_MODULES = [
  {
    title: "Analysis Module",
    description: "Explore geospatial datasets, run analytics, and view detailed maps for NDVI, LST, Slope, and more.",
    icon: BarChart3,
    color: "text-emerald-600",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
    path: "/ndvi",
  },
  {
    title: "RARE DATA Hub",
    description: "Access and upload specialized environmental datasets and repositories.",
    icon: Database,
    color: "text-blue-600",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
    path: "/rare-data",
  },
  {
    title: "Sample Digitizer",
    description: "Draw, digitize, and extract GeoJSON training samples directly from the map.",
    icon: PenTool,
    color: "text-amber-600",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
    path: "/samples",
  },
  {
    title: "Analytics",
    description: "View overarching traffic, usage statistics, and platform analytics.",
    icon: LayoutDashboard,
    color: "text-purple-600",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/20",
    path: "/dashboard",
  },
  {
    title: "Community Forum",
    description: "Discuss findings, share map snapshots, and collaborate with other users.",
    icon: MessageSquare,
    color: "text-pink-600",
    bgColor: "bg-pink-500/10",
    borderColor: "border-pink-500/20",
    path: "/community",
  },
  {
    title: "API Gateway",
    description: "Access the backend analysis engines directly via API keys for external applications.",
    icon: Terminal,
    color: "text-slate-600",
    bgColor: "bg-slate-500/10",
    borderColor: "border-slate-500/20",
    path: "/developer",
  },
  {
    title: "Premium Services",
    description: "Book 1-on-1 consultations, corporate training, and custom GIS analysis projects.",
    icon: Briefcase,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
    path: "/services",
  }
];

export function HomePage() {
  const { user } = useAuth();
  
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="SPETRO Logo" className="h-12 w-auto object-contain shrink-0 drop-shadow-md rounded-md" />
          <div>
            <h1 className="font-bold text-lg leading-tight tracking-wide text-foreground">SPETRO</h1>
            <p className="text-xs font-medium tracking-widest text-emerald-600 uppercase">Geoportal Analysis</p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-8 flex flex-col justify-center">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold text-foreground mb-4 tracking-tight">Select a Module to Begin</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            Welcome to the SPETRO Geoportal Analysis platform. Choose one of the core modules below to dive into analysis, data management, or community collaboration.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {HUB_MODULES.filter(m => m.path !== '/dashboard' || user?.role === 'admin').map((module) => (
            <Link key={module.path} href={module.path}>
              <div className="group relative bg-card rounded-2xl p-6 border border-border shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden flex flex-col h-full">
                
                {/* Accent Background Glow on Hover */}
                <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-transparent to-${module.color.replace('text-', '')}/5`} />
                
                <div className="flex items-start justify-between mb-4 relative z-10">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${module.bgColor} ${module.color} border ${module.borderColor}`}>
                    <module.icon className="w-7 h-7" />
                  </div>
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary-foreground" />
                  </div>
                </div>
                
                <div className="relative z-10 mt-auto">
                  <h3 className="text-xl font-bold text-foreground mb-2">{module.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {module.description}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>

      {/* Global Footer */}
      <footer className="bg-card border-t border-border mt-auto w-full">
        <div className="max-w-6xl mx-auto px-8 py-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="SPETRO Logo" className="h-6 w-auto grayscale opacity-70" />
            <span className="text-sm font-medium text-muted-foreground">
              &copy; {new Date().getFullYear()} SPETRO Geoportal. All rights reserved.
            </span>
          </div>
          <div className="flex gap-6 text-sm text-muted-foreground font-medium">
            <Link href="/about"><a className="hover:text-primary transition-colors cursor-pointer">About Us</a></Link>
            <a href="#" className="hover:text-primary transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-primary transition-colors">Terms of Service</a>
            <a href="mailto:pierrendorimana16@gmail.com" className="hover:text-primary transition-colors">Email</a>
            <a href="https://www.linkedin.com/in/ndorimana-pierre-b470bb2a8/" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">LinkedIn</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
