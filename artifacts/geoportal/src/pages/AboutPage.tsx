import { Link } from "wouter";
import {
  ArrowLeft,
  Globe,
  Target,
  Eye,
  Satellite,
  Sprout,
  ShieldAlert,
  Building2,
  Mail,
  Linkedin,
  ArrowRight,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserNav } from "@/components/UserNav";
import { Button } from "@/components/ui/button";

const FOCUS_AREAS = [
  {
    icon: Satellite,
    title: "Satellite Earth Observation",
    desc: "Leveraging multi-sensor satellite imagery across optical, radar, and thermal bands to monitor surface dynamics at sub-hectare resolution.",
  },
  {
    icon: Sprout,
    title: "Agriculture & Vegetation Health",
    desc: "Continuous tracking of crop vigor, drought severity, vegetation dynamics, and land degradation to support food security and sustainable farming.",
  },
  {
    icon: ShieldAlert,
    title: "Hazard & Climate Resilience",
    desc: "Rapid assessment of natural risks including flood inundation, landslide susceptibility, and soil erosion dynamics across vulnerable landscapes.",
  },
  {
    icon: Building2,
    title: "Urban & Spatial Planning",
    desc: "Analyzing urban heat islands, land surface temperatures, settlement expansion footprints, and regional accessibility to essential services.",
  },
];

export function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <header className="bg-card/70 backdrop-blur-md border-b border-border/70 sticky top-0 z-50 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <button
              className="p-1.5 hover:bg-muted rounded-lg transition-colors cursor-pointer text-muted-foreground hover:text-foreground border border-border/50"
              title="Return to Geoportal"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="SPETRO Logo" className="h-8 w-auto object-contain shrink-0" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-base leading-tight tracking-tight text-foreground">SPETRO</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Geoportal &amp; Spatial Intelligence</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          <UserNav />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full pb-16">
        {/* 1. Clean Hero Section */}
        <section className="relative overflow-hidden bg-muted/20 border-b border-border/60 py-16 sm:py-20 px-4 sm:px-8">
          <div className="max-w-4xl mx-auto text-center space-y-4">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              About <span className="text-emerald-500">SPETRO</span>
            </h1>

            <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Transforming Earth observation data into clear, actionable spatial intelligence for environmental stewardship,
              agriculture, and resilient regional planning.
            </p>

            <div className="pt-2">
              <Link href="/platform">
                <Button size="sm" className="h-9 px-4 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 shadow-sm">
                  <span>Explore Platform</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* 2. Mission & Vision */}
        <section className="max-w-4xl mx-auto px-4 sm:px-8 py-14">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 rounded-xl bg-card border border-border/70 shadow-2xs space-y-2.5">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <Target className="w-4 h-4" />
              </div>
              <h2 className="text-lg font-bold text-foreground">Our Mission</h2>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                To make advanced satellite remote sensing accessible, intuitive, and immediately actionable. We bridge the gap
                between complex Earth observation data and real-world decision-making across East Africa and beyond.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-card border border-border/70 shadow-2xs space-y-2.5">
              <div className="w-9 h-9 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center">
                <Eye className="w-4 h-4" />
              </div>
              <h2 className="text-lg font-bold text-foreground">Our Vision</h2>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                A sustainable future guided by transparent, reliable spatial analytics—empowering researchers, institutions,
                and communities to protect vital ecosystems and plan with confidence.
              </p>
            </div>
          </div>
        </section>

        {/* 3. Core Focus Areas */}
        <section className="bg-muted/10 py-14 border-y border-border/60">
          <div className="max-w-4xl mx-auto px-4 sm:px-8 space-y-8">
            <div className="text-center space-y-1.5">
              <h2 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
                Core Capabilities
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-xl mx-auto">
                Specialized geospatial analysis designed for practical environmental and development challenges.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {FOCUS_AREAS.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="p-5 rounded-xl bg-card border border-border/60 space-y-2 shadow-2xs">
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-foreground">
                      <Icon className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* 4. Leadership Profile */}
        <section className="max-w-3xl mx-auto px-4 sm:px-8 py-14 space-y-6">
          <div className="text-center space-y-1.5">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">Leadership</h2>
            <p className="text-xs text-muted-foreground">The spatial engineering expertise driving SPETRO.</p>
          </div>

          <div className="p-6 sm:p-7 rounded-xl bg-card border border-border/70 shadow-2xs space-y-4 max-w-xl mx-auto">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left">
              {/* Executive Monogram Badge */}
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-emerald-500/20 to-sky-500/20 border border-emerald-500/30 text-emerald-500 font-bold flex items-center justify-center text-xl shadow-inner shrink-0">
                NP
              </div>

              <div className="space-y-0.5">
                <h3 className="text-lg font-bold text-foreground">Ndorimana Pierre</h3>
                <p className="text-xs font-semibold text-emerald-500">Lead GIS Architect &amp; Founder</p>
                <p className="text-xs text-muted-foreground">Remote Sensing &amp; Environmental Analytics Specialist</p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Pierre designed and architected the SPETRO Geoportal to provide high-resolution satellite analytics for regional
              environmental monitoring and resource planning. He specializes in remote sensing methodology, spatial analysis, and
              geospatial application design.
            </p>

            <div className="flex items-center justify-center sm:justify-start gap-2.5 pt-1">
              <a
                href="mailto:pierrendorimana16@gmail.com"
                className="inline-flex items-center gap-1.5 text-xs text-foreground bg-muted/60 hover:bg-muted border border-border/60 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Mail className="w-3.5 h-3.5 text-emerald-500" />
                <span>Contact</span>
              </a>

              <a
                href="https://www.linkedin.com/in/ndorimana-pierre-b470bb2a8/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-foreground bg-muted/60 hover:bg-muted border border-border/60 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Linkedin className="w-3.5 h-3.5 text-sky-500" />
                <span>LinkedIn</span>
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Clean Minimalist Footer */}
      <footer className="bg-card border-t border-border mt-auto w-full py-6 px-4 sm:px-8">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="SPETRO Logo" className="h-5 w-auto object-contain opacity-75" />
            <span>&copy; {new Date().getFullYear()} SPETRO Geoportal. All rights reserved.</span>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/platform" className="hover:text-foreground transition-colors">
              Platform
            </Link>
            <Link href="/community" className="hover:text-foreground transition-colors">
              Community
            </Link>
            <Link href="/contact" className="hover:text-foreground transition-colors">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
