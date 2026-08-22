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
  BookOpen
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
    title: "Premium Services",
    description: "Book 1-on-1 consultations, corporate training, and custom GIS analysis projects.",
    icon: Briefcase,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
    path: "/services",
  },
  {
    title: "Blog & Case Studies",
    description: "Read how our modules are being used in real-world scenarios and explore immersive StoryMaps.",
    icon: BookOpen,
    color: "text-indigo-600",
    bgColor: "bg-indigo-500/10",
    borderColor: "border-indigo-500/20",
    path: "/blog",
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

      {/* Global Footer */}
      <footer className="bg-card border-t border-border mt-auto w-full">
        <div className="max-w-6xl mx-auto px-8 py-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <SiteLogoOnly size="small" />
            <span className="text-sm font-medium text-muted-foreground ml-2">
              &copy; {new Date().getFullYear()} All rights reserved.
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
