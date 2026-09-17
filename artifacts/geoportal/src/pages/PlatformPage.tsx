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
  Briefcase,
  Mail,
  Send,
  BookOpen,
  Globe2
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SiteBrand, SiteLogoOnly } from "@/components/SiteBrand";

const HUB_MODULES = [
  {
    title: "Analysis Modules",
    description: "Explore geospatial datasets, run analytics, and view detailed maps for NDVI, LST, Slope, and more.",
    icon: BarChart3,
    color: "text-emerald-600",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
    path: "/analysis-hub",
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
    title: "Data Harvester",
    description: "Universal spatial ingestion and data harvesting module.",
    icon: Globe2,
    color: "text-cyan-600",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/20",
    path: "/harvester",
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
    title: "Premium Services",
    description: "Book 1-on-1 consultations, corporate training, and custom GIS analysis projects.",
    icon: Briefcase,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
    path: "/services",
  }
];

export function PlatformPage() {
  const { user } = useAuth();
  
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between shadow-sm">
        <SiteBrand size="normal" hideSubtitleOnMobile />
        <ThemeToggle />
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-8 flex flex-col justify-center">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold text-foreground mb-4 tracking-tight">Select a Category to Begin</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            Welcome to the SPETRO Geoportal Analysis platform. Choose a category below to dive into analysis, data management, or community collaboration.
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

      {/* Newsletter Section */}
      <section className="bg-primary/5 border-t border-border py-16 px-6">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="w-12 h-12 bg-primary/20 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="w-6 h-6" />
          </div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Stay Updated on Geospatial Tech</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Get the latest case studies, new module announcements, and tips for analyzing satellite data delivered right to your inbox.
          </p>
          <div className="flex flex-col sm:flex-row max-w-md mx-auto gap-3 pt-4">
            <Input 
              type="email" 
              placeholder="Enter your email address" 
              className="bg-background"
            />
            <Button className="gap-2 w-full sm:w-auto">
              Subscribe <Send className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground pt-2">
            We promise not to spam you. Unsubscribe at any time.
          </p>
        </div>
      </section>

      {/* Global Footer (Esri-style Fat Footer) */}
      <footer className="bg-card border-t border-border mt-auto w-full py-16 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12">
          
          {/* Column 1: Brand & Copyright */}
          <div className="flex flex-col gap-4 md:col-span-1">
            <SiteBrand size="normal" hideSubtitleOnMobile={false} />
            <p className="text-sm text-muted-foreground mt-2">
              Empowering environmental analysis with advanced geospatial intelligence.
            </p>
            <div className="text-xs font-medium text-muted-foreground mt-6">
              &copy; {new Date().getFullYear()} SPETRO. All rights reserved.
            </div>
          </div>

          {/* Column 2: Platform */}
          <div className="flex flex-col gap-4">
            <h4 className="text-sm font-extrabold uppercase tracking-widest text-foreground mb-2">Platform</h4>
            <a href="/analysis-hub" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary font-medium transition-colors">Analysis Hub</a>
            <a href="/rare-data" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary font-medium transition-colors">Rare Data Hub</a>
            <a href="/harvester" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary font-medium transition-colors">Data Harvester</a>
            <a href="/samples" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary font-medium transition-colors">Sample Digitizer</a>
          </div>

          {/* Column 3: Community & Resources */}
          <div className="flex flex-col gap-4">
            <h4 className="text-sm font-extrabold uppercase tracking-widest text-foreground mb-2">Community</h4>
            <a href="/community" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary font-medium transition-colors">Community Forum</a>
            <a href="/blog" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary font-medium transition-colors">Blog & Case Studies</a>
            <a href="/services" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary font-medium transition-colors">Premium Services</a>
          </div>

          {/* Column 4: Company */}
          <div className="flex flex-col gap-4">
            <h4 className="text-sm font-extrabold uppercase tracking-widest text-foreground mb-2">Company</h4>
            <a href="/about" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary font-medium transition-colors">About Us</a>
            <a href="mailto:pierrendorimana16@gmail.com" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary font-medium transition-colors">Contact Support</a>
            <a href="https://www.linkedin.com/in/ndorimana-pierre-b470bb2a8/" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary font-medium transition-colors">LinkedIn</a>
            <a href="#" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary font-medium transition-colors">Privacy Policy</a>
            
            {user?.role === 'admin' && (
              <div className="pt-4 border-t border-border mt-2">
                <a href="/dashboard" target="_blank" rel="noopener noreferrer" className="text-sm text-purple-600 hover:text-purple-700 font-bold transition-colors">Admin: Analytics</a>
              </div>
            )}
          </div>
          
        </div>
      </footer>
    </div>
  );
}
