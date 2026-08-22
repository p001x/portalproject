import { Link } from "wouter";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/hooks/use-auth";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { SiteBrand } from "@/components/SiteBrand";
import { analysisModules } from "@/App";
import { Button } from "@/components/ui/button";

export function AnalysisHubPage() {
  const { user } = useAuth();
  
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <SiteBrand size="normal" hideSubtitleOnMobile />
          <div className="hidden md:flex items-center pl-4 border-l border-border ml-2">
            <Link href="/platform">
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-4 h-4" />
                Back to Platform
              </Button>
            </Link>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-8 flex flex-col justify-start mt-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold text-foreground mb-4 tracking-tight">Analysis Modules</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            Explore geospatial datasets, run analytics, and view detailed maps. Select a specific module below.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {analysisModules.map((module) => (
            <Link key={module.path} href={module.path}>
              <div className="group relative bg-card rounded-2xl p-6 border border-border shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden flex flex-col h-full">
                
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-transparent to-emerald-500/5" />
                
                <div className="flex items-start justify-between mb-4 relative z-10">
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                    <module.icon className="w-7 h-7" />
                  </div>
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary-foreground" />
                  </div>
                </div>
                
                <div className="relative z-10 mt-auto">
                  <h3 className="text-xl font-bold text-foreground mb-2">{module.label}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {module.description}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
