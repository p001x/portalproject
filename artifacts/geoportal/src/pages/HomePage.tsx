import { useState } from "react";
import { Link } from "wouter";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/hooks/use-auth";
import { ArrowRight, Globe2, Layers, Map, Bell, Settings, LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications } from "@/hooks/use-notifications";
import { NotificationList } from "@/App";
import { SiteBrand, SiteLogoOnly } from "@/components/SiteBrand";

export function HomePage() {
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      {/* Background aesthetic */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-500/10 via-background to-background pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 px-6 py-6 flex justify-between items-start">
        <div className="flex flex-col gap-6">
          <SiteBrand size="normal" hideSubtitleOnMobile />
          
          {user && (
            <div className="relative flex flex-col items-start gap-4 ml-2 mt-2">
              <Button variant="ghost" onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-3 text-muted-foreground hover:text-foreground transition-colors" title={isMenuOpen ? "Fold Menu" : "Unfold Menu"}>
                <Menu className="w-12 h-12" />
              </Button>
              
              {isMenuOpen && (
                <div className="absolute top-12 left-0 flex flex-col items-start gap-6 animate-in fade-in slide-in-from-top-2 duration-300 bg-background/95 backdrop-blur-sm p-6 rounded-xl border shadow-xl z-50 min-w-[240px]">
              <div className="flex items-center gap-4">
                <ThemeToggle />
                <span className="text-base font-semibold text-muted-foreground">Theme</span>
              </div>
              
              <Popover>
                <PopoverTrigger asChild>
                  <div className="flex items-center gap-4 cursor-pointer group">
                    <Button variant="ghost" size="icon" className="relative text-muted-foreground group-hover:text-foreground pointer-events-none scale-110">
                      <Bell className="w-6 h-6" />
                      {unreadCount > 0 && (
                        <span className="absolute top-0 right-0 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 ring-2 ring-background"></span>
                      )}
                    </Button>
                    <span className="text-base font-semibold text-muted-foreground group-hover:text-foreground transition-colors">Notifications</span>
                  </div>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <NotificationList />
                </PopoverContent>
              </Popover>

              <Link href="/settings">
                <div className="flex items-center gap-4 cursor-pointer group">
                  <Button variant="ghost" size="icon" className="text-muted-foreground group-hover:text-foreground pointer-events-none scale-110" title="Settings">
                    <Settings className="w-6 h-6" />
                  </Button>
                  <span className="text-base font-semibold text-muted-foreground group-hover:text-foreground transition-colors">Settings</span>
                </div>
              </Link>

              <div className="flex items-center gap-4 cursor-pointer group" onClick={logout}>
                <Button variant="ghost" size="icon" className="text-muted-foreground group-hover:text-destructive pointer-events-none scale-110" title="Log out">
                  <LogOut className="w-6 h-6" />
                </Button>
                <span className="text-base font-semibold text-muted-foreground group-hover:text-destructive transition-colors">Log out</span>
              </div>

              </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-8">
          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/">
              <span className="text-sm font-bold text-foreground cursor-pointer hover:text-emerald-500 transition-colors">Home</span>
            </Link>
            <Link href="/about">
              <span className="text-sm font-bold text-muted-foreground cursor-pointer hover:text-foreground transition-colors">About</span>
            </Link>
            <Link href="/services">
              <span className="text-sm font-bold text-muted-foreground cursor-pointer hover:text-foreground transition-colors">Services</span>
            </Link>
            <Link href="/contact">
              <span className="text-sm font-bold text-muted-foreground cursor-pointer hover:text-foreground transition-colors">Contact</span>
            </Link>
          </nav>

          <div className="flex items-center gap-4">
            {!user ? (
              <>
                <ThemeToggle />
                <Link href="/about">
                  <Button variant="outline">Learn More</Button>
              </Link>
              <Link href="/auth">
                <Button>Sign In</Button>
              </Link>
            </>
          ) : (
            <Link href="/platform">
              <Button className="gap-2 bg-emerald-500 text-white hover:bg-emerald-600 shadow-md shadow-emerald-500/10">
                Open Platform <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-6 flex flex-col items-center justify-center text-center">

        <h2 className="text-5xl md:text-7xl font-black text-foreground mb-6 tracking-tight leading-tight max-w-4xl">
          Welcome to the <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-400">SPETRO</span> Geoportal
        </h2>
        
        <p className="text-muted-foreground text-xl md:text-2xl max-w-3xl mb-12 leading-relaxed">
          Advanced satellite data analysis, seamless sample digitization, and collaborative environmental monitoring in one unified platform.
        </p>

        {user && (
          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-20 w-full">
            <Link href="/platform">
              <Button size="lg" className="h-14 px-8 text-lg font-bold gap-2 w-full sm:w-auto shadow-xl shadow-emerald-500/20">
                Access the Platform <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
          </div>
        )}


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
