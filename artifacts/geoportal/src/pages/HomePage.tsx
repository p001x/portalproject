import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteBrand, SiteLogoOnly } from "@/components/SiteBrand";
import { UserNav } from "@/components/UserNav";

export function HomePage() {
  const { user } = useAuth();
  const [loc] = useLocation();
  
  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      {/* Background aesthetic */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-500/10 via-background to-background pointer-events-none" />
      <div className="absolute top-0 -left-40 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Unified Premium Header */}
      <header className="relative z-20 px-6 py-4 flex justify-between items-center border-b border-border/40 bg-background/60 backdrop-blur-xl sticky top-0">
        <div className="flex items-center gap-8">
          <SiteBrand size="normal" hideSubtitleOnMobile />

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1.5 bg-muted/40 dark:bg-muted/30 p-1.5 rounded-full border border-border/60 shadow-sm">
            <Link href="/">
              <span className={`text-sm font-semibold px-4 py-2 rounded-full transition-all cursor-pointer ${
                loc === "/" 
                  ? "bg-background text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}>
                Home
              </span>
            </Link>
            <Link href="/platform">
              <span className={`text-sm font-semibold px-4 py-2 rounded-full transition-all cursor-pointer ${
                loc === "/platform" 
                  ? "bg-background text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}>
                Platform
              </span>
            </Link>
            <Link href="/about">
              <span className={`text-sm font-semibold px-4 py-2 rounded-full transition-all cursor-pointer ${
                loc === "/about" 
                  ? "bg-background text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}>
                About
              </span>
            </Link>
            <Link href="/services">
              <span className={`text-sm font-semibold px-4 py-2 rounded-full transition-all cursor-pointer ${
                loc === "/services" 
                  ? "bg-background text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}>
                Services
              </span>
            </Link>
            <Link href="/contact">
              <span className={`text-sm font-semibold px-4 py-2 rounded-full transition-all cursor-pointer ${
                loc === "/contact" 
                  ? "bg-background text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}>
                Contact
              </span>
            </Link>
          </nav>
        </div>

        {/* Right Header: Open Platform + Always Visible User Profile / Auth Nav */}
        <div className="flex items-center gap-3">
          {user && (
            <Link href="/platform" className="hidden lg:inline-flex">
              <Button 
                size="sm" 
                className="gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs rounded-xl shadow-sm hover:shadow-emerald-500/20 px-3.5 h-9"
              >
                <span>Launch Hub</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          )}

          {/* User Nav (Avatar + Name Pill + Notifications Bell) */}
          <UserNav />
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-6 flex flex-col items-center justify-center text-center">

        <h2 className="text-5xl md:text-7xl font-black text-foreground mb-6 tracking-tight leading-tight max-w-4xl">
          Welcome to the <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-400">SPETRO</span> Geoportal
        </h2>
        
        <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mb-8 leading-relaxed">
          Comprehensive satellite Earth observation, digital sample archiving, and environmental spatial analytics.
        </p>

        {user ? (
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/platform">
              <Button size="lg" className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-6 py-5 rounded-xl shadow-sm cursor-pointer">
                Launch Platform Modules <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/analysis-hub">
              <Button variant="outline" size="lg" className="px-6 py-5 rounded-xl font-medium cursor-pointer">
                Earth Analytics Hub
              </Button>
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/auth">
              <Button size="lg" className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-7 py-5 rounded-xl shadow-sm cursor-pointer">
                Get Started <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/platform">
              <Button variant="outline" size="lg" className="px-6 py-5 rounded-xl font-medium cursor-pointer">
                Explore Modules
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
            <Link href="/about" className="hover:text-primary transition-colors cursor-pointer">About Us</Link>
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
