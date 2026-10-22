import { Link } from "wouter";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/hooks/use-auth";
import { 
  ArrowUpRight, 
  Mail, 
  Send 
} from "lucide-react";
import { EarthAnalyticsEmblem } from "@/components/EarthAnalyticsEmblem";
import { DataVaultEmblem } from "@/components/DataVaultEmblem";
import { DataHarvesterEmblem } from "@/components/DataHarvesterEmblem";
import { SampleDigitizerEmblem } from "@/components/SampleDigitizerEmblem";
import { ExpertConsultationEmblem } from "@/components/ExpertConsultationEmblem";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SiteBrand } from "@/components/SiteBrand";

const MODULES = [
  {
    title: "Earth Analytics",
    path: "/analysis-hub",
    emblem: EarthAnalyticsEmblem,
    glowColor: "rgba(59, 130, 246, 0.25)",
    hoverBorder: "hover:border-blue-500/50",
  },
  {
    title: "Data Vault",
    path: "/rare-data",
    emblem: DataVaultEmblem,
    glowColor: "rgba(59, 130, 246, 0.25)",
    hoverBorder: "hover:border-blue-500/50",
  },
  {
    title: "Spatial Harvester",
    path: "/harvester",
    emblem: DataHarvesterEmblem,
    glowColor: "rgba(6, 182, 212, 0.25)",
    hoverBorder: "hover:border-cyan-500/50",
  },
  {
    title: "Ground Truth Digitizer",
    path: "/samples",
    emblem: SampleDigitizerEmblem,
    glowColor: "rgba(245, 158, 11, 0.25)",
    hoverBorder: "hover:border-amber-500/50",
  },
  {
    title: "Expert Consultation",
    path: "/services",
    emblem: ExpertConsultationEmblem,
    glowColor: "rgba(168, 85, 247, 0.25)",
    hoverBorder: "hover:border-purple-500/50",
  }
];

import { UserNav } from "@/components/UserNav";

export function PlatformPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background flex flex-col selection:bg-primary/20">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-md border-b border-border/80 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-8">
          <SiteBrand size="normal" hideSubtitleOnMobile />
          
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/">
              <span className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Home</span>
            </Link>
            <Link href="/about">
              <span className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer">About</span>
            </Link>
            <Link href="/services">
              <span className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Services</span>
            </Link>
            <Link href="/contact">
              <span className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Contact</span>
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <UserNav />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-16 md:py-20 flex flex-col justify-center">
        
        {/* Confident, Minimal Header */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h1 className="text-3xl md:text-5xl font-extrabold text-foreground tracking-tight mb-3">
            Geospatial Intelligence
          </h1>
          <p className="text-muted-foreground text-base md:text-lg">
            Select an operational module to begin.
          </p>
        </div>

        {/* Clean Launchpad Grid */}
        <div className="flex flex-wrap justify-center gap-6 max-w-5xl mx-auto w-full">
          {MODULES.map((module) => {
            return (
              <Link 
                key={module.path} 
                href={module.path}
                className="w-full sm:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)]"
              >
                <div 
                  className={`group relative bg-card hover:bg-card/95 rounded-2xl p-7 md:p-8 border border-border/80 ${module.hoverBorder} transition-all duration-300 cursor-pointer flex flex-col justify-between h-[185px] shadow-sm hover:shadow-xl hover:-translate-y-1.5 overflow-hidden`}
                >
                  {/* Subtle Ambient Radial Glow on Hover */}
                  <div 
                    className="absolute -right-12 -top-12 w-36 h-36 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none blur-3xl"
                    style={{ background: module.glowColor }}
                  />

                  {/* Top Row: Emblem + Micro-Arrow */}
                  <div className="flex items-start justify-between relative z-10">
                    <div className="relative -ml-1 -mt-1 w-[72px] h-[72px] shrink-0 transition-transform duration-300 group-hover:scale-105">
                      <module.emblem className="w-[72px] h-[72px] drop-shadow-sm" />
                    </div>

                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground/40 group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300">
                      <ArrowUpRight className="w-5 h-5" />
                    </div>
                  </div>

                  {/* Bottom: Bold, Clean Title Only */}
                  <div className="relative z-10">
                    <h3 className="text-xl font-bold text-foreground tracking-tight group-hover:text-primary transition-colors">
                      {module.title}
                    </h3>
                  </div>
                </div>
              </Link>
            );
          })}
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
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-extrabold uppercase tracking-widest text-foreground mb-1">Platform</h4>
            <Link href="/analysis-hub" className="text-sm text-muted-foreground hover:text-primary font-medium transition-colors">Earth Analytics</Link>
            <Link href="/rare-data" className="text-sm text-muted-foreground hover:text-primary font-medium transition-colors">Data Vault</Link>
            <Link href="/harvester" className="text-sm text-muted-foreground hover:text-primary font-medium transition-colors">Spatial Harvester</Link>
            <Link href="/samples" className="text-sm text-muted-foreground hover:text-primary font-medium transition-colors">Ground Truth Digitizer</Link>
          </div>

          {/* Column 3: Academy & Community */}
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-extrabold uppercase tracking-widest text-foreground mb-1">Community & Learning</h4>
            <Link href="/academy" className="text-sm text-muted-foreground hover:text-primary font-medium transition-colors">Academy & Tutorials</Link>
            <Link href="/community" className="text-sm text-muted-foreground hover:text-primary font-medium transition-colors">Community Forum</Link>
            <Link href="/blog" className="text-sm text-muted-foreground hover:text-primary font-medium transition-colors">Blog & Case Studies</Link>
            <Link href="/services" className="text-sm text-muted-foreground hover:text-primary font-medium transition-colors">Consulting Services</Link>
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
