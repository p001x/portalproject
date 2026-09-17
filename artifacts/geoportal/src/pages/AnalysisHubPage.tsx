import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArrowRight, ArrowLeft, Search, Star, Database } from "lucide-react";
import { SiteBrand } from "@/components/SiteBrand";
import { agriWaterModules, riskDisasterModules, urbanEnvModules, coreSpatialModules } from "@/config/modules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const CATEGORIES = [
  {
    id: "agri",
    title: "Agriculture & Water",
    color: "emerald",
    modules: agriWaterModules.map(m => ({
      ...m,
      dataBadges: ["Sentinel-2", "Landsat"],
    }))
  },
  {
    id: "risk",
    title: "Risk & Disasters",
    color: "amber",
    modules: riskDisasterModules.map(m => ({
      ...m,
      dataBadges: ["Sentinel-1", "CHIRPS", "MODIS"],
    }))
  },
  {
    id: "urban",
    title: "Urban & Environment",
    color: "orange",
    modules: urbanEnvModules.map(m => ({
      ...m,
      dataBadges: ["Landsat 8", "Sentinel-2"],
    }))
  },
  {
    id: "core",
    title: "Core Spatial",
    color: "blue",
    modules: coreSpatialModules.map(m => ({
      ...m,
      dataBadges: ["SRTM DEM", "Sentinel-2"],
    }))
  }
];

const getColorClasses = (color: string) => {
  const classes: Record<string, { text: string, bg: string, border: string, glow: string }> = {
    emerald: { text: "text-emerald-600 dark:text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20", glow: "to-emerald-500/5" },
    amber: { text: "text-amber-600 dark:text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20", glow: "to-amber-500/5" },
    orange: { text: "text-orange-600 dark:text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/20", glow: "to-orange-500/5" },
    blue: { text: "text-blue-600 dark:text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20", glow: "to-blue-500/5" },
  };
  return classes[color] || classes.blue;
};

export function AnalysisHubPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("spetro_favorite_modules");
    if (saved) {
      try {
        setFavorites(JSON.parse(saved));
      } catch (e) {
        // Handle invalid JSON
      }
    }
  }, []);

  const toggleFavorite = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    e.stopPropagation();
    setFavorites(prev => {
      const next = prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path];
      localStorage.setItem("spetro_favorite_modules", JSON.stringify(next));
      return next;
    });
  };

  const filteredCategories = CATEGORIES.map(category => ({
    ...category,
    modules: category.modules.filter(m => 
      m.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
      m.description.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(category => category.modules.length > 0);

  // Extract all modules for the favorites section
  const allModulesWithColor = CATEGORIES.flatMap(c => 
    c.modules.map(m => ({ ...m, color: c.color }))
  );
  const favoriteModules = allModulesWithColor.filter(m => favorites.includes(m.path));

  // Render a module card (used in both favorites and categories)
  const renderModuleCard = (module: any, colorStr: string) => {
    const colors = getColorClasses(colorStr);
    const isFav = favorites.includes(module.path);
    
    return (
      <Link key={module.path} href={module.path}>
        <div className="group relative bg-card rounded-2xl p-6 border border-border shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden flex flex-col h-full">
          
          <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-transparent ${colors.glow}`} />
          
          {/* Status Badge (NEW, BETA, PRO) */}
          {module.status && (
            <div className={`absolute top-4 left-1/2 -translate-x-1/2 text-[10px] font-bold px-2 py-0.5 rounded-full z-20 
              ${module.status === 'NEW' ? 'bg-green-500 text-white' : 
                module.status === 'BETA' ? 'bg-amber-500 text-white' : 
                'bg-purple-500 text-white'}`}>
              {module.status}
            </div>
          )}

          <div className="flex items-start justify-between mb-4 relative z-10">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${colors.bg} ${colors.text} border ${colors.border}`}>
              <module.icon className="w-7 h-7" />
            </div>
            
            <div className="flex items-center gap-2">
              {/* Favorite Button */}
              <button 
                onClick={(e) => toggleFavorite(e, module.path)}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-300 hover:bg-muted"
              >
                <Star className={`w-4 h-4 ${isFav ? "fill-amber-400 text-amber-400" : "text-muted-foreground group-hover:text-amber-400/50"}`} />
              </button>
              
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300 hidden md:flex">
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary-foreground" />
              </div>
            </div>
          </div>
          
          <div className="relative z-10 mt-auto flex-1 flex flex-col">
            <h3 className="text-xl font-bold text-foreground mb-2">{module.label}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed flex-1">
              {module.description}
            </p>
            
            <div className="mt-4 pt-4 border-t border-border/50 flex flex-wrap gap-2">
              {module.dataBadges.map((badge: string) => (
                <Badge key={badge} variant="secondary" className="text-[10px] bg-muted/50 text-muted-foreground font-medium px-2 py-0.5 rounded-md flex items-center gap-1">
                  <Database className="w-3 h-3" /> {badge}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-50">
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
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-10 flex flex-col justify-start">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-12">
          <div>
            <h2 className="text-3xl font-extrabold text-foreground tracking-tight mb-2">Analysis Hub</h2>
            <p className="text-muted-foreground max-w-2xl text-lg">
              Explore geospatial datasets, run analytics, and view detailed maps.
            </p>
          </div>

          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search modules (e.g., NDVI, Flood)..."
              className="pl-10 h-12 rounded-xl bg-card border-border shadow-sm focus-visible:ring-primary"
            />
          </div>
        </div>

        {/* Favorites Section */}
        {favoriteModules.length > 0 && searchQuery === "" && (
          <section className="mb-12 bg-muted/30 p-6 rounded-2xl border border-border/50">
            <div className="flex items-center gap-3 mb-6">
              <Star className="w-6 h-6 fill-amber-400 text-amber-400" />
              <h3 className="text-2xl font-bold tracking-tight">Favorites</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {favoriteModules.map(module => renderModuleCard(module, module.color))}
            </div>
          </section>
        )}

        {/* Empty State */}
        {filteredCategories.length === 0 && (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-xl font-bold mb-2">No modules found</h3>
            <p className="text-muted-foreground">Try adjusting your search query.</p>
          </div>
        )}

        {/* Categories Grid */}
        <div className="space-y-12">
          {filteredCategories.map(category => (
            <section key={category.id} className="scroll-mt-24">
              <div className="flex items-center gap-3 mb-6">
                <h3 className="text-2xl font-bold tracking-tight">{category.title}</h3>
                <div className="flex-1 h-px bg-border ml-4 hidden md:block"></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {category.modules.map(module => renderModuleCard(module, category.color))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
