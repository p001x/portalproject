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
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium text-sm mb-4 border border-emerald-500/20">
              <Globe className="w-4 h-4" />
              <span>Pioneering Geospatial Analytics</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-foreground leading-tight">
              Empowering Decisions <br /> with <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-blue-500">Spatial Intelligence</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              SPETRO Geoportal is a cutting-edge environmental monitoring and remote sensing platform built on top of Google Earth Engine. We democratize access to critical spatial data.
            </p>
          </div>
        </section>

        {/* Mission & Vision */}
        <section className="max-w-6xl mx-auto px-6 py-20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6 animate-in fade-in slide-in-from-left-8 duration-700">
              <h2 className="text-3xl font-bold">Our Mission</h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                To provide researchers, governments, and organizations with the tools they need to monitor environmental changes, assess natural risks, and plan sustainable developments without the barrier of complex coding.
              </p>
              <ul className="space-y-4 pt-4">
                <li className="flex items-start gap-3">
                  <div className="p-1.5 bg-emerald-500/20 text-emerald-600 rounded-lg shrink-0 mt-0.5">
                    <Target className="w-4 h-4" />
                  </div>
                  <span className="text-foreground font-medium">Precision Analytics: High-resolution satellite processing.</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="p-1.5 bg-blue-500/20 text-blue-600 rounded-lg shrink-0 mt-0.5">
                    <Zap className="w-4 h-4" />
                  </div>
                  <span className="text-foreground font-medium">Real-time Insights: Fast, cloud-native Earth Engine execution.</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="p-1.5 bg-purple-500/20 text-purple-600 rounded-lg shrink-0 mt-0.5">
                    <Shield className="w-4 h-4" />
                  </div>
                  <span className="text-foreground font-medium">Reliable Data: Sourced from NASA, ESA, and USGS.</span>
                </li>
              </ul>
            </div>
            
            <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-right-8 duration-700">
              <div className="space-y-4">
                <div className="bg-card border p-6 rounded-2xl shadow-sm">
                  <Leaf className="w-8 h-8 text-emerald-500 mb-4" />
                  <h3 className="font-bold text-lg mb-2">Environment</h3>
                  <p className="text-sm text-muted-foreground">Monitoring deforestation, vegetation health (NDVI), and biomass changes.</p>
                </div>
                <div className="bg-card border p-6 rounded-2xl shadow-sm">
                  <Map className="w-8 h-8 text-amber-500 mb-4" />
                  <h3 className="font-bold text-lg mb-2">Topography</h3>
                  <p className="text-sm text-muted-foreground">Advanced slope and digital elevation model (DEM) analytics.</p>
                </div>
              </div>
              <div className="space-y-4 pt-8">
                <div className="bg-card border p-6 rounded-2xl shadow-sm">
                  <Globe className="w-8 h-8 text-blue-500 mb-4" />
                  <h3 className="font-bold text-lg mb-2">Climate</h3>
                  <p className="text-sm text-muted-foreground">Tracking Land Surface Temperature (LST) and Urban Heat Islands.</p>
                </div>
                <div className="bg-card border p-6 rounded-2xl shadow-sm">
                  <Users className="w-8 h-8 text-purple-500 mb-4" />
                  <h3 className="font-bold text-lg mb-2">Community</h3>
                  <p className="text-sm text-muted-foreground">Fostering collaboration and sharing of spatial insights.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Developer Info */}
        <section className="bg-muted/30 py-20 border-y">
          <div className="max-w-4xl mx-auto px-6 text-center space-y-8">
            <h2 className="text-3xl font-bold">Behind the Platform</h2>
            <p className="text-lg text-muted-foreground">
              SPETRO Geoportal is developed and maintained by a dedicated team passionate about geospatial technology and environmental conservation.
            </p>
            
            <div className="inline-flex flex-col md:flex-row items-center gap-6 p-8 bg-card border rounded-3xl shadow-xl mt-8">
              <img 
                src="https://api.dicebear.com/7.x/avataaars/svg?seed=Pierre" 
                alt="Ndorimana Pierre" 
                className="w-24 h-24 rounded-full bg-slate-200 border-4 border-background shadow-md"
              />
              <div className="text-left">
                <h3 className="text-2xl font-bold">Ndorimana Pierre</h3>
                <p className="text-emerald-600 font-medium mb-4">Lead Developer & GIS Specialist</p>
                <div className="flex gap-4">
                  <a href="mailto:pierrendorimana16@gmail.com" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <Mail className="w-4 h-4" />
                    <span>Email</span>
                  </a>
                  <a href="https://www.linkedin.com/in/ndorimana-pierre-b470bb2a8/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <Linkedin className="w-4 h-4" />
                    <span>LinkedIn</span>
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
