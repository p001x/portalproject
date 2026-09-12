import { Link } from "wouter";
import { ArrowLeft, Globe, Map, Zap, Target, BookOpen, Shield, Users, Mail, Linkedin, Leaf } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export function AboutPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-md border-b border-border sticky top-0 z-50 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/">
            <button className="p-2 hover:bg-muted rounded-full transition-colors group">
              <ArrowLeft className="w-5 h-5 text-muted-foreground group-hover:text-foreground" />
            </button>
          </Link>
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="SPETRO Logo" className="h-10 w-auto object-contain shrink-0 drop-shadow-md rounded-md" />
            <div>
              <h1 className="font-bold text-lg leading-tight tracking-wide text-foreground">SPETRO</h1>
              <p className="text-xs font-medium tracking-widest text-emerald-600 uppercase">Geoportal Analysis</p>
            </div>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full pb-16">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-br from-emerald-900/10 via-background to-blue-900/10 pt-20 pb-24 px-6">
          <div className="max-w-4xl mx-auto text-center space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700">

            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-foreground leading-tight">
              Transform Earth Data into <br /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-blue-500">Business Advantage</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              SPETRO delivers scalable, high-resolution satellite analytics to help corporations, governments, and NGOs mitigate risk, drive ROI, and accelerate sustainable growth.
            </p>
            <div className="pt-6 flex justify-center gap-4">
              <Link href="/auth">
                <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-lg font-bold transition-all shadow-lg shadow-emerald-500/25">
                  Start Free Trial
                </button>
              </Link>
              <button className="bg-transparent border-2 border-border hover:bg-muted text-foreground px-8 py-3 rounded-lg font-bold transition-all">
                Request Demo
              </button>
            </div>
          </div>
        </section>

        {/* Business Value Proposition */}
        <section className="max-w-6xl mx-auto px-6 py-20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6 animate-in fade-in slide-in-from-left-8 duration-700">
              <h2 className="text-3xl font-bold">Unlocking Strategic Value</h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Stop guessing and start knowing. SPETRO bridges the gap between complex Earth Engine algorithms and actionable commercial insights. We help you make data-driven decisions at scale.
              </p>
              <ul className="space-y-4 pt-4">
                <li className="flex items-start gap-3">
                  <div className="p-1.5 bg-emerald-500/20 text-emerald-600 rounded-lg shrink-0 mt-0.5">
                    <Target className="w-4 h-4" />
                  </div>
                  <span className="text-foreground font-medium">Risk Mitigation: Anticipate supply chain disruptions and climate-related hazards before they impact your bottom line.</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="p-1.5 bg-blue-500/20 text-blue-600 rounded-lg shrink-0 mt-0.5">
                    <Zap className="w-4 h-4" />
                  </div>
                  <span className="text-foreground font-medium">Operational Efficiency: Automate large-scale monitoring of global assets without the need for manual surveys.</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="p-1.5 bg-purple-500/20 text-purple-600 rounded-lg shrink-0 mt-0.5">
                    <Shield className="w-4 h-4" />
                  </div>
                  <span className="text-foreground font-medium">ESG Compliance: Track sustainability metrics, verify carbon credits, and report with absolute confidence.</span>
                </li>
              </ul>
            </div>
            
            <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-right-8 duration-700">
              <div className="space-y-4">
                <div className="bg-card border p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                  <Leaf className="w-8 h-8 text-emerald-500 mb-4" />
                  <h3 className="font-bold text-lg mb-2">Agriculture</h3>
                  <p className="text-sm text-muted-foreground">Maximize crop yields, monitor soil health, and verify regenerative farming practices.</p>
                </div>
                <div className="bg-card border p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                  <Map className="w-8 h-8 text-amber-500 mb-4" />
                  <h3 className="font-bold text-lg mb-2">Infrastructure</h3>
                  <p className="text-sm text-muted-foreground">Optimize site selection, track construction progress, and monitor structural displacement.</p>
                </div>
              </div>
              <div className="space-y-4 pt-8">
                <div className="bg-card border p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                  <Shield className="w-8 h-8 text-blue-500 mb-4" />
                  <h3 className="font-bold text-lg mb-2">Insurance</h3>
                  <p className="text-sm text-muted-foreground">Automate claims processing with real-time flood, drought, and landslide damage assessment.</p>
                </div>
                <div className="bg-card border p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                  <Globe className="w-8 h-8 text-purple-500 mb-4" />
                  <h3 className="font-bold text-lg mb-2">Urban Planning</h3>
                  <p className="text-sm text-muted-foreground">Drive smart city initiatives with detailed heat island and surface permeability analysis.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Developer Info / CTA */}
        <section className="bg-muted/30 py-20 border-y">
          <div className="max-w-4xl mx-auto px-6 text-center space-y-8">
            <h2 className="text-3xl font-bold">Ready to Elevate Your Operations?</h2>
            <p className="text-lg text-muted-foreground">
              Join industry leaders who trust SPETRO Geoportal for their most critical spatial intelligence needs. Engineered for scale and precision.
            </p>
            
            <div className="inline-flex flex-col md:flex-row items-center gap-6 p-8 bg-card border rounded-3xl shadow-xl mt-8">
              <img 
                src="https://api.dicebear.com/7.x/avataaars/svg?seed=Pierre" 
                alt="Ndorimana Pierre" 
                className="w-24 h-24 rounded-full bg-slate-200 border-4 border-background shadow-md"
              />
              <div className="text-left">
                <h3 className="text-2xl font-bold">Talk to our Experts</h3>
                <p className="text-emerald-600 font-medium mb-4">Ndorimana Pierre - Lead GIS Architect</p>
                <div className="flex gap-4">
                  <a href="mailto:pierrendorimana16@gmail.com" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <Mail className="w-4 h-4" />
                    <span>Contact Sales</span>
                  </a>
                  <a href="https://www.linkedin.com/in/ndorimana-pierre-b470bb2a8/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <Linkedin className="w-4 h-4" />
                    <span>Connect on LinkedIn</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
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
        </div>
      </footer>
    </div>
  );
}
