import { useEffect, useState } from "react";
import { InteractiveMapEditor } from "@/components/InteractiveMapEditor";
import { Loader2, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";

export function CanvaStandalonePage() {
  const [_, setLocation] = useLocation();
  const [state, setState] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const data = sessionStorage.getItem("canvaState");
      if (data) {
        setState(JSON.parse(data));
      }
    } catch (e) {
      console.error("Failed to load canva state", e);
    } finally {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!state) {
    return (
      <div className="h-screen w-screen flex flex-col gap-4 items-center justify-center bg-background text-foreground p-4">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <h1 className="text-xl font-bold">No Map Data Found</h1>
        <p className="text-muted-foreground text-center max-w-md">
          Please open the Canva editor from one of the analysis modules. Data is passed securely via your current session.
        </p>
        <button 
          onClick={() => setLocation("/")}
          className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium"
        >
          Return Home
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-background text-foreground flex flex-col overflow-hidden">
      {/* Top Header/Navbar */}
      <header className="h-14 bg-card text-card-foreground border-b flex items-center px-6 shrink-0 justify-between">
        <div className="flex items-center gap-4">
          <h1 className="font-bold text-lg text-primary">Map Canva Editor</h1>
          <span className="text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded">
            {state.title || "Untitled Map"} • {state.district}
          </span>
        </div>
        <button
          onClick={() => window.close()}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Close Editor
        </button>
      </header>

      {/* Main Canvas Area */}
      <div className="flex-1 overflow-hidden p-6">
        <InteractiveMapEditor
          tileUrl={state.tileUrl}
          thumbUrl={state.thumbUrl}
          classAreas={state.classAreas}
          palette={state.palette}
          bbox={state.bbox}
          title={state.title}
          district={state.district}
          fullScreen={true}
        />
      </div>
    </div>
  );
}
