import { Link } from "wouter";
import { ArrowLeft, Globe, Map, Zap, Target, BookOpen, Shield, Users, Mail, Linkedin, Leaf, Eye, BarChart } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export function AboutPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
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
      <main className="flex-1 w-full pb-20">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-muted/30 pt-24 pb-20 px-6 border-b">
          <div className="max-w-4xl mx-auto text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
              About <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-blue-600">SPETRO</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              We are a dedicated team of geospatial engineers and data scientists transforming complex Earth observation data into clear, actionable intelligence for a sustainable future.
            </p>
          </div>
        </section>

        {/* Mission & Vision */}
        <section className="max-w-5xl mx-auto px-6 py-20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="bg-card border p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-emerald-500/10 text-emerald-600 rounded-xl flex items-center justify-center mb-6">
                <Target className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold mb-4">Our Mission</h2>
              <p className="text-muted-foreground leading-relaxed">
                To bridge the critical gap between advanced remote sensing algorithms and commercial decision-making. We strive to provide high-resolution, scalable spatial analytics that help organizations mitigate risks and optimize operations.
              </p>
            </div>
            <div className="bg-card border p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-blue-500/10 text-blue-600 rounded-xl flex items-center justify-center mb-6">
                <Eye className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold mb-4">Our Vision</h2>
              <p className="text-muted-foreground leading-relaxed">
                A world where real-time environmental data is accessible and comprehensible for every industry leader. We envision a future driven by data-backed sustainability, reducing our collective ecological footprint through smart insights.
              </p>
            </div>
          </div>
        </section>

        {/* Core Values / What we do */}
        <section className="bg-muted/20 py-20 border-y">
          <div className="max-w-5xl mx-auto px-6 text-center space-y-12">
            <div>
              <h2 className="text-3xl font-bold">Unlocking Strategic Value</h2>
              <p className="text-lg text-muted-foreground mt-4 max-w-2xl mx-auto">
                We focus on three core pillars to ensure our spatial analytics drive meaningful impact for our clients.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
              <div className="space-y-4">
                <div className="p-3 bg-emerald-500/10 text-emerald-600 rounded-lg inline-block">
                  <Shield className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-lg">Risk Mitigation</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Anticipate supply chain disruptions, monitor climate-related hazards, and assess vulnerabilities before they impact your bottom line.
                </p>
              </div>
              <div className="space-y-4">
                <div className="p-3 bg-blue-500/10 text-blue-600 rounded-lg inline-block">
                  <BarChart className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-lg">Operational Efficiency</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Automate the large-scale monitoring of global assets, removing the need for manual, costly, and time-consuming physical surveys.
                </p>
              </div>
              <div className="space-y-4">
                <div className="p-3 bg-purple-500/10 text-purple-600 rounded-lg inline-block">
                  <Leaf className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-lg">ESG Compliance</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Track vital sustainability metrics, verify carbon credits, and report environmental impacts to stakeholders with absolute confidence.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Leadership Team */}
        <section className="max-w-4xl mx-auto px-6 py-20">
          <div className="text-center space-y-12">
            <div>
              <h2 className="text-3xl font-bold">Our Leadership</h2>
              <p className="text-lg text-muted-foreground mt-4">
                The experts driving innovation behind the SPETRO platform.
              </p>
            </div>

            <div className="flex flex-col items-center p-8 bg-card border rounded-3xl shadow-sm hover:shadow-md transition-all max-w-2xl mx-auto">
              <img 
                src="https://api.dicebear.com/7.x/avataaars/svg?seed=Pierre" 
                alt="Ndorimana Pierre" 
                className="w-32 h-32 rounded-full bg-slate-200 border-4 border-background shadow-md mb-6"
              />
              <div className="text-center">
                <h3 className="text-2xl font-bold">Ndorimana Pierre</h3>
                <p className="text-emerald-600 font-medium mb-6">Lead GIS Architect & Founder</p>
                <p className="text-muted-foreground text-sm max-w-lg mb-8 leading-relaxed">
                  With deep expertise in cloud computing and remote sensing, Pierre architected the SPETRO Geoportal to democratize Earth observation data. He specializes in deploying scalable Google Earth Engine algorithms for enterprise applications.
                </p>
                <div className="flex justify-center gap-6">
                  <a href="mailto:pierrendorimana16@gmail.com" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors bg-muted/50 px-4 py-2 rounded-full">
                    <Mail className="w-4 h-4" />
                    <span>Contact Pierre</span>
                  </a>
                  <a href="https://www.linkedin.com/in/ndorimana-pierre-b470bb2a8/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors bg-muted/50 px-4 py-2 rounded-full">
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
