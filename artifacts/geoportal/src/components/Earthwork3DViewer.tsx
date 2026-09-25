import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, X, Loader2 } from 'lucide-react';
import { Button } from './ui/button';

export function Earthwork3DViewer({ 
  polygon, 
  targetElevation, 
  slopeGrade, 
  slopeAngle, 
  topsoilDepth, 
  batterRatio,
  customDemId,
  onClose 
}: any) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    // Load Plotly from CDN
    const loadPlotly = async () => {
      if (!(window as any).Plotly) {
        const script = document.createElement('script');
        script.src = 'https://cdn.plot.ly/plotly-2.32.0.min.js';
        script.async = true;
        document.body.appendChild(script);
        await new Promise((resolve) => {
          script.onload = resolve;
        });
      }
      return (window as any).Plotly;
    };

    const fetchDataAndRender = async () => {
      try {
        setIsLoading(true);
        const Plotly = await loadPlotly();
        
        const reqBody = {
          polygon,
          target_elevation: targetElevation,
          slope_grade: slopeGrade,
          slope_angle: slopeAngle,
          topsoil_depth: topsoilDepth,
          batter_ratio: batterRatio,
          custom_dem_id: customDemId
        };
        
        const res = await fetch('/api/earthwork/3d', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody)
        });
        
        if (!res.ok) throw new Error('Failed to fetch 3D grid data');
        const data = await res.json();
        
        if (!isMounted) return;

        // Render Plotly
        if (containerRef.current) {
          const originalSurface = {
            z: data.original_z,
            type: 'surface',
            colorscale: 'Earth',
            name: 'Original Terrain',
            opacity: 0.7,
            showscale: false
          };
          
          const proposedSurface = {
            z: data.proposed_z,
            type: 'surface',
            colorscale: 'Viridis',
            name: 'Proposed Grading',
            opacity: 0.9,
            showscale: true,
            colorbar: { title: 'Elevation (m)' }
          };
          
          const layout = {
            title: '',
            autosize: true,
            margin: { l: 0, r: 0, b: 0, t: 0 },
            scene: {
              aspectmode: 'manual',
              aspectratio: { x: 1, y: 1, z: 0.3 },
              xaxis: { title: '' },
              yaxis: { title: '' },
              zaxis: { title: 'Elevation (m)' },
              camera: {
                eye: { x: 1.5, y: 1.5, z: 1.2 }
              }
            },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: '#ffffff' }
          };
          
          const config = { responsive: true, displayModeBar: true, displaylogo: false };
          
          Plotly.newPlot(containerRef.current, [originalSurface, proposedSurface], layout, config);
        }
        setIsLoading(false);
      } catch (err: any) {
        if (isMounted) {
          setError(err.message);
          setIsLoading(false);
        }
      }
    };
    
    fetchDataAndRender();
    
    return () => {
      isMounted = false;
      if (containerRef.current && (window as any).Plotly) {
        (window as any).Plotly.purge(containerRef.current);
      }
    };
  }, [polygon, targetElevation, slopeGrade, slopeAngle, topsoilDepth, batterRatio, customDemId]);
  
  return (
    <div className={`fixed ${isExpanded ? 'inset-4 z-[9999]' : 'bottom-6 right-6 w-[600px] h-[500px] z-[2000]'} bg-[#1a1f2e]/95 backdrop-blur-xl border border-[#3b82f6]/30 rounded-xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-black/40 border-b border-white/10">
        <h3 className="text-sm font-semibold text-white px-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          Interactive 3D Digital Twin
        </h3>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-red-500/80" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      {/* Body */}
      <div className="flex-1 relative bg-black/20">
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1f2e]/80 backdrop-blur-sm z-10">
            <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
            <p className="text-sm text-primary animate-pulse font-medium">Generating 3D Terrain Mesh...</p>
            <p className="text-xs text-muted-foreground mt-2">Sampling elevation matrix</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-red-400 bg-[#1a1f2e]/90 z-10">
            <p>Error loading 3D view: {error}</p>
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  );
}
