import { Link } from "wouter";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/hooks/use-auth";
import { ArrowRight, Globe2, Layers, Map, Bell, Settings, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications } from "@/hooks/use-notifications";
import { NotificationList } from "@/App";
import { SiteBrand, SiteLogoOnly } from "@/components/SiteBrand";

export function HomePage() {
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  
  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      {/* Background aesthetic */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-500/10 via-background to-background pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 px-6 py-4 flex items-center justify-between">
        <SiteBrand size="normal" hideSubtitleOnMobile />
        <div className="flex items-center gap-4">
          <ThemeToggle />
          {user ? (
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute top-0 right-0 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-red-500 ring-2 ring-background"></span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end">
                  <NotificationList />
                </PopoverContent>
              </Popover>

              <Link href="/settings">
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" title="Settings">
                  <Settings className="w-5 h-5" />
                </Button>
              </Link>

              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={logout} title="Log out">
                <LogOut className="w-5 h-5" />
              </Button>
              
              <Link href="/platform">
                <Button className="gap-2 ml-2 shadow-md shadow-emerald-500/10">
                  Open Platform <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          ) : (
            <Link href="/auth">
              <Button>Sign In</Button>
            </Link>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-6 flex flex-col items-center justify-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 text-sm font-medium mb-8 border border-emerald-500/20">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          Next-Generation Geospatial Analytics
        </div>

        <h2 className="text-5xl md:text-7xl font-black text-foreground mb-6 tracking-tight leading-tight max-w-4xl">
          Welcome to the <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-400">SPETRO</span> Geoportal
        </h2>
        
        <p className="text-muted-foreground text-xl md:text-2xl max-w-3xl mb-12 leading-relaxed">
          Advanced satellite data analysis, seamless sample digitization, and collaborative environmental monitoring in one unified platform.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mb-20">
          <Link href="/platform">
            <Button size="lg" className="h-14 px-8 text-lg font-bold gap-2 w-full sm:w-auto shadow-xl shadow-emerald-500/20">
              Access the Platform <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
          <Link href="/about">
            <Button variant="outline" size="lg" className="h-14 px-8 text-lg font-bold w-full sm:w-auto border-2">
              Learn More
            </Button>
          </Link>
        </div>
        
        {/* Simple Features Showcase */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-5xl">
          <div className="flex flex-col items-center p-6 bg-card rounded-2xl border border-border shadow-sm">
            <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 mb-4">
              <Globe2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold mb-2">Earth Observation</h3>
            <p className="text-sm text-muted-foreground text-center">Process high-resolution satellite imagery directly from Google Earth Engine.</p>
          </div>
          <div className="flex flex-col items-center p-6 bg-card rounded-2xl border border-border shadow-sm">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 mb-4">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold mb-2">Advanced Analytics</h3>
            <p className="text-sm text-muted-foreground text-center">Calculate NDVI, LST, Slope, and multi-temporal indices on the fly.</p>
          </div>
          <div className="flex flex-col items-center p-6 bg-card rounded-2xl border border-border shadow-sm">
            <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-500 mb-4">
              <Map className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold mb-2">Immersive Stories</h3>
            <p className="text-sm text-muted-foreground text-center">Publish interactive case studies and scroll-driven geospatial story maps.</p>
          </div>
        </div>
      </main>

      {/* Global Footer */}
      <footer className="relative z-10 bg-background border-t border-border mt-auto w-full">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row justify-between items-center gap-4">
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
