import re

with open('artifacts/geoportal/src/pages/BiomassPage.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Add missing Lucide icons
code = code.replace(
    'import { Flame, Loader2, Info , Play} from "lucide-react";',
    'import { Flame, Loader2, Info, Play, TreePine, TrendingDown, Timer, Battery, PieChart, Activity } from "lucide-react";'
)

# New Component: KPICard
kpi_card_code = """
function KPICard({ title, value, unit, subtitle, icon, trend }: { title: string, value: any, unit: string, subtitle: string, icon: React.ReactNode, trend: "good"|"bad"|"neutral" }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col justify-between hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className="text-slate-500 font-medium text-sm tracking-tight">{title}</div>
        <div className="p-2 bg-slate-50 rounded-xl">{icon}</div>
      </div>
      <div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-black text-slate-800 tracking-tight">{value}</span>
          <span className="text-sm font-semibold text-slate-400">{unit}</span>
        </div>
        <div className="text-xs text-slate-400 mt-1 font-medium">{subtitle}</div>
      </div>
    </div>
  );
}

function ProgressBar({ label, value, max, color, unit }: { label: string, value: number, max: number, color: string, unit: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100)) || 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs font-semibold">
        <span className="text-slate-600">{label}</span>
        <span className="text-slate-900">{value?.toLocaleString()} <span className="font-normal text-slate-500">{unit}</span></span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-1000 ease-out`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
"""

# Insert new components before InteractiveFactorMapCard
code = code.replace("function InteractiveFactorMapCard", kpi_card_code + "\nfunction InteractiveFactorMapCard")

# Replace InteractiveFactorMapCard UI
old_interactive_card = """
    <div className="border rounded-lg p-4 space-y-4 bg-white shadow-sm flex flex-col">
      <div>
        <h4 className="font-semibold text-base leading-tight">{factor.title || factor.label}</h4>
      </div>

      <div className="relative border rounded bg-slate-50 aspect-square overflow-hidden group flex-1">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50/80 backdrop-blur-sm z-10">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : null}
          {/*<div className="h-full relative bg-muted/20 rounded-lg overflow-hidden border">
            <DistrictMap aoi={aoi} basemap="satellite" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-4 z-[1000]">
              <div className="bg-background/80 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-primary/20 text-center max-w-sm pointer-events-none transition-all hover:scale-105 duration-300">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 text-primary shadow-inner">
                  <Flame className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold mb-2 text-foreground">Biomass Tracking</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Select a district and parameters from the sidebar, then run the analysis to visualize results here.
                </p>
                <Button 
                  onClick={runAnalysis} 
                  className="w-full gap-2 rounded-xl shadow-md hover:shadow-lg transition-all"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Run Analysis
                </Button>
              </div>
            </div>
          </div>
        )}*/}
        <img src={urls.thumb_url} alt={factor.title || factor.label} className="w-full h-full object-cover transition-transform group-hover:scale-[1.02] duration-300" />
      </div>

      <div className="space-y-3 pt-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-500">Color Palette</Label>
          <Select value={selectedPalette} onValueChange={setSelectedPalette} disabled={loading}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PALETTES.map((p) => (
                <SelectItem key={p.value} value={p.value} className="text-xs">{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1 text-[11px] h-8 px-2"
            disabled={loading}
            onClick={() => {
              const link = document.createElement('a');
              link.href = urls.thumb_url;
              link.download = `biomass_${factorKey}_classified.png`;
              link.click();
            }}
          >
            <ImageIcon className="w-3.5 h-3.5 mr-1.5 shrink-0" />
            Classified
          </Button>
          
          <Button 
            variant="default" 
            size="sm" 
            className="flex-1 text-[11px] h-8 px-2"
            disabled={loading}
            onClick={async () => {
              if (urls.download_url) {
                window.open(urls.download_url, '_blank');
              } else {
                await generateExport();
                const paletteParam = selectedPalette === "default" ? undefined : selectedPalette.split(",");
                api.biomass.factorExport({
                  aoi: aoiConfig,
                  factor_key: factorKey,
                  palette: paletteParam,
                  buffer_km: bufferKm,
                  year_start: yearStart,
                  year_end: yearEnd
                }).then(res => {
                  window.open(res.data.download_url, '_blank');
                });
              }
            }}
          >
            <Download className="w-3.5 h-3.5 mr-1.5 shrink-0" />
            Raw
          </Button>
        </div>
      </div>
    </div>
"""

new_interactive_card = """
    <div className="group relative overflow-hidden rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col">
      <div className="p-4 border-b border-slate-50 bg-gradient-to-b from-slate-50/80 to-white">
        <h4 className="font-bold text-slate-800 tracking-tight text-sm">{factor.title || factor.label}</h4>
        {factor.description && <p className="text-[11px] text-slate-500 mt-1 leading-relaxed line-clamp-2">{factor.description}</p>}
      </div>

      <div className="relative aspect-square overflow-hidden bg-slate-100 flex-1">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/40 backdrop-blur-sm">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          </div>
        )}
        <img src={urls.thumb_url} alt={factor.title || factor.label} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
      </div>

      <div className="p-4 space-y-3 bg-white">
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Color Palette</Label>
          <Select value={selectedPalette} onValueChange={setSelectedPalette} disabled={loading}>
            <SelectTrigger className="h-8 text-xs rounded-lg bg-slate-50 border-transparent hover:border-slate-200 transition-colors shadow-none focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PALETTES.map((p) => (
                <SelectItem key={p.value} value={p.value} className="text-xs">{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="text-[11px] h-8 rounded-lg border-slate-200 hover:bg-slate-50 hover:text-slate-900 shadow-none font-medium"
            disabled={loading}
            onClick={() => {
              const link = document.createElement('a');
              link.href = urls.thumb_url;
              link.download = `biomass_${factorKey}_classified.png`;
              link.click();
            }}
          >
            <ImageIcon className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
            Classified
          </Button>
          
          <Button 
            variant="default" 
            size="sm" 
            className="text-[11px] h-8 rounded-lg shadow-sm bg-slate-800 hover:bg-slate-900 font-medium"
            disabled={loading}
            onClick={async () => {
              if (urls.download_url) {
                window.open(urls.download_url, '_blank');
              } else {
                await generateExport();
                const paletteParam = selectedPalette === "default" ? undefined : selectedPalette.split(",");
                api.biomass.factorExport({
                  aoi: aoiConfig,
                  factor_key: factorKey,
                  palette: paletteParam,
                  buffer_km: bufferKm,
                  year_start: yearStart,
                  year_end: yearEnd
                }).then(res => {
                  window.open(res.data.download_url, '_blank');
                });
              }
            }}
          >
            <Download className="w-3.5 h-3.5 mr-1.5 opacity-70" />
            GeoTIFF
          </Button>
        </div>
      </div>
    </div>
"""

code = code.replace(old_interactive_card, new_interactive_card)


old_main_layout = code[code.find('  return ('):]

new_main_layout = """  return (
    <div className="h-[calc(100vh-theme(spacing.16))] flex flex-col lg:flex-row gap-6 p-4 sm:p-6 bg-slate-50/50">
      
      {/* Left Sidebar - Configuration */}
      <div className="w-full lg:w-[340px] flex-shrink-0 flex flex-col gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden flex flex-col h-full">
          <div className="p-6 bg-gradient-to-br from-orange-500 to-orange-600 text-white relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
            <div className="absolute -left-4 -bottom-4 w-24 h-24 bg-black/10 rounded-full blur-xl"></div>
            
            <div className="relative z-10 flex items-center gap-3 mb-3">
              <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm shadow-inner">
                <Flame className="w-6 h-6 text-white drop-shadow-sm" />
              </div>
              <h1 className="text-xl font-bold tracking-tight">Biomass Tracker</h1>
            </div>
            <p className="relative z-10 text-orange-100/90 text-xs leading-relaxed font-medium">
              Monitor forest cover change and analyze biomass depletion risk zones.
            </p>
          </div>
          
          <div className="p-5 flex-1 overflow-y-auto space-y-6">
            <div className="space-y-3">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Study Area Selection</Label>
              <StudyAreaSelector value={aoi} onChange={setAoi} />
            </div>

            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div>
                <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Analysis Buffer</Label>
                <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed font-medium">
                  Search radius from settlements to detect extraction activity.
                </p>
              </div>
              
              <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-100/80 shadow-inner">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-semibold text-slate-700">Radius</span>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-white shadow-sm text-orange-600 border border-slate-200/60">
                    {bufferKm} km
                  </span>
                </div>
                <Slider value={[bufferKm]} min={1} max={10} step={0.5} onValueChange={(v) => setBufferKm(v[0])} className="py-2" />
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-50/50 border-t border-slate-100">
            <Button onClick={runAnalysis} disabled={isPending} className="w-full h-12 rounded-xl bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-900/20 transition-all active:scale-[0.98] font-semibold text-sm tracking-wide">
              {isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin text-orange-400" /> : <Play className="mr-2 h-4 w-4 text-orange-400 fill-current" />}
              {isPending ? "Processing Engine..." : "Generate Analysis"}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden flex flex-col relative min-w-0">
        {error ? (
           <div className="h-full flex flex-col items-center justify-center bg-red-50/50 text-red-500 p-8 text-center">
             <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4 shadow-sm">
               <Info className="w-8 h-8 text-red-600" />
             </div>
             <p className="text-xl font-bold tracking-tight text-slate-800 mb-2">Analysis Failed</p>
             <p className="text-sm text-red-600/80 max-w-md font-medium">{error.message}</p>
           </div>
        ) : isPending && !anyData ? (
          <div className="h-full flex flex-col items-center justify-center bg-slate-50/30">
            <div className="relative">
              <div className="absolute inset-0 rounded-full blur-xl bg-orange-500/20 animate-pulse"></div>
              <Loader2 className="w-10 h-10 animate-spin text-orange-500 relative z-10 mb-6" />
            </div>
            <p className="text-sm font-semibold text-slate-600 tracking-wide">Analyzing Sentinel-2 & Hansen Data...</p>
            <p className="text-xs text-slate-400 mt-2">Computing biomass vectors</p>
          </div>
        ) : anyData ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col h-full">
            <div className="px-4 sm:px-6 py-3 border-b border-slate-100 flex items-center justify-between bg-white z-10 shrink-0 overflow-x-auto no-scrollbar">
              <TabsList className="bg-slate-100/80 p-1 rounded-xl h-11 shrink-0">
                <TabsTrigger value="map" className="rounded-lg px-5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-orange-600 text-sm font-semibold transition-all">Risk Map</TabsTrigger>
                <TabsTrigger value="statistics" className="rounded-lg px-5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-orange-600 text-sm font-semibold transition-all">Dashboard</TabsTrigger>
                <TabsTrigger value="factors" className="rounded-lg px-5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-orange-600 text-sm font-semibold transition-all">Factors</TabsTrigger>
                <TabsTrigger value="static-maps" className="rounded-lg px-5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-orange-600 text-sm font-semibold transition-all">Static Maps</TabsTrigger>
                <TabsTrigger value="report" className="rounded-lg px-5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-orange-600 text-sm font-semibold transition-all">Report</TabsTrigger>
              </TabsList>
              
              <div className="hidden sm:flex items-center gap-2 text-[11px] font-bold tracking-wider uppercase text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 shrink-0 ml-4">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse"></span>
                Engine Ready
              </div>
            </div>

            <div className="flex-1 overflow-hidden relative bg-slate-50/30">
              <TabsContent value="map" className="h-full w-full m-0 data-[state=active]:flex flex-col">
                <div className="flex-1 relative bg-slate-100">
                  <DistrictMap
                    tileUrl={mapData.tile_url}
                    center={mapData.center}
                    bbox={mapData.bbox}
                    title="Biomass Depletion Risk"
                    legend={RISK_LEGEND}
                  />
                </div>
              </TabsContent>

              <TabsContent value="statistics" className="h-full w-full m-0 p-4 sm:p-6 lg:p-8 overflow-y-auto">
                <div className="max-w-7xl mx-auto space-y-6 lg:space-y-8">
                  {/* Top KPI row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <KPICard 
                      title="Total Standing Biomass" 
                      value={statsData.stats["Total Standing Biomass (Tonnes)"]?.toLocaleString()} 
                      unit="Tonnes"
                      subtitle="Current reserves"
                      icon={<TreePine className="w-5 h-5 text-emerald-500" />}
                      trend="neutral"
                    />
                    <KPICard 
                      title="Mean Depletion Risk" 
                      value={statsData.stats["Mean Depletion Risk"]} 
                      unit="/ 100"
                      subtitle="Average risk score"
                      icon={<Activity className="w-5 h-5 text-orange-500" />}
                      trend={statsData.stats["Mean Depletion Risk"] > 60 ? "bad" : "good"}
                    />
                    <KPICard 
                      title="Estimated Biomass Lost" 
                      value={statsData.stats["Estimated Biomass Lost (Tonnes)"]?.toLocaleString()} 
                      unit="Tonnes"
                      subtitle="Recent deforestation"
                      icon={<TrendingDown className="w-5 h-5 text-red-500" />}
                      trend="bad"
                    />
                    <KPICard 
                      title="Depletion Runway" 
                      value={statsData.stats["Depletion Runway (Years)"] === 999 ? "∞" : statsData.stats["Depletion Runway (Years)"]} 
                      unit="Years"
                      subtitle="At current deficit rate"
                      icon={<Timer className="w-5 h-5 text-blue-500" />}
                      trend={statsData.stats["Depletion Runway (Years)"] < 10 ? "bad" : "good"}
                    />
                  </div>

                  {/* Main Content Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* Left Col: Energy Balance */}
                    <div className="lg:col-span-2">
                      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 sm:p-8 h-full flex flex-col justify-center">
                        <div className="flex items-center justify-between mb-8">
                          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 tracking-tight">
                            <Battery className="w-5 h-5 text-slate-400" />
                            Commercial Energy Balance
                          </h3>
                        </div>
                        
                        <div className="flex flex-col sm:flex-row items-center gap-8 lg:gap-12">
                          <div className="flex-shrink-0 flex flex-col items-center justify-center w-40 h-40 rounded-full border-[8px] border-slate-50 bg-white shadow-inner relative group cursor-default transition-all hover:scale-105">
                            <span className={`text-sm font-black text-center px-4 tracking-tight ${statsData.stats["Commercial Energy Status"]?.includes('CRITICAL') ? 'text-red-500' : statsData.stats["Commercial Energy Status"] === 'SUSTAINABLE SURPLUS' ? 'text-emerald-500' : 'text-orange-500'}`}>
                              {statsData.stats["Commercial Energy Status"]}
                            </span>
                          </div>
                          
                          <div className="flex-1 w-full space-y-6">
                            <ProgressBar label="Annual Fuelwood Demand" value={statsData.stats["Annual Fuelwood Demand (Tonnes/yr)"]} max={Math.max(statsData.stats["Annual Fuelwood Demand (Tonnes/yr)"], statsData.stats["Sustainable Annual Yield (Tonnes/yr)"]) * 1.2} color="bg-orange-500" unit="T/yr" />
                            <ProgressBar label="Sustainable Annual Yield" value={statsData.stats["Sustainable Annual Yield (Tonnes/yr)"]} max={Math.max(statsData.stats["Annual Fuelwood Demand (Tonnes/yr)"], statsData.stats["Sustainable Annual Yield (Tonnes/yr)"]) * 1.2} color="bg-emerald-500" unit="T/yr" />
                            
                            <div className="pt-4 mt-2 border-t border-slate-100 flex justify-between items-end">
                              <div>
                                <div className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-1">Net Deficit</div>
                                <div className="text-2xl font-black text-slate-800 tracking-tight">{statsData.stats["Net Biomass Deficit (Tonnes/yr)"]?.toLocaleString()} <span className="text-base font-semibold text-slate-400">T/yr</span></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Col: Risk Distribution */}
                    <div>
                      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 sm:p-8 h-full">
                        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2 tracking-tight">
                          <PieChart className="w-5 h-5 text-slate-400" />
                          Risk Distribution
                        </h3>
                        <div className="space-y-5">
                          {Object.entries(anyData.class_areas_km2).map(([cls, area]: [string, any], i) => {
                            const total = Object.values(anyData.class_areas_km2).reduce((a: any, b: any) => a + b, 0) as number;
                            const pct = total > 0 ? (area / total) * 100 : 0;
                            return (
                              <div key={cls} className="space-y-2 group">
                                <div className="flex justify-between items-baseline text-sm">
                                  <span className="font-semibold text-slate-600">{cls}</span>
                                  <span className="font-bold text-slate-900 group-hover:scale-110 transition-transform">{pct.toFixed(1)}%</span>
                                </div>
                                <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden shadow-inner">
                                  <div 
                                    className="h-full rounded-full transition-all duration-1000 ease-out" 
                                    style={{ width: `${pct}%`, backgroundColor: CLASS_COLOR_LIST[i] }} 
                                  />
                                </div>
                                <div className="text-[10px] font-medium text-slate-400 text-right">{Number(area).toLocaleString()} km²</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="factors" className="h-full w-full m-0 p-4 sm:p-6 lg:p-8 overflow-y-auto">
                <div className="max-w-[1400px] mx-auto space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Biomass Depletion Factors</h2>
                    <p className="text-slate-500 font-medium mt-1">Preview, customize, and export individual factor maps that contributed to the final risk assessment.</p>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                    {mapData?.factor_maps && Object.entries(mapData.factor_maps).map(([key, factor]: [string, any]) => (
                      <InteractiveFactorMapCard 
                        key={key} 
                        factorKey={key} 
                        factor={factor} 
                        aoiConfig={aoi}
                        bufferKm={bufferKm}
                        yearStart={2019}
                        yearEnd={2023}
                      />
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="static-maps" className="h-full w-full m-0 p-4 sm:p-6 lg:p-8 overflow-y-auto">
                <div className="max-w-[1400px] mx-auto space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Static Maps</h2>
                    <p className="text-slate-500 font-medium mt-1">Print-ready static maps with scalebars and legends for reports.</p>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="border border-slate-200/60 rounded-2xl p-5 space-y-4 bg-white shadow-sm">
                      <h4 className="font-bold text-slate-800 tracking-tight text-sm">Final Depletion Risk Map</h4>
                      <div className="relative border border-slate-100 rounded-xl bg-slate-50 aspect-square overflow-hidden shadow-inner">
                        <img src={mapData?.thumb_url} alt="Final Map" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 ring-1 ring-inset ring-black/5 rounded-xl pointer-events-none"></div>
                        <div className="absolute bottom-3 right-3 drop-shadow-lg">
                          <SmallNorthArrow />
                        </div>
                      </div>
                    </div>
                    {mapData?.factor_maps && Object.entries(mapData.factor_maps).map(([key, factor]: [string, any]) => (
                      <StaticMapCard 
                        key={key} 
                        factorKey={key} 
                        factor={factor} 
                        analysisDate={new Date().toLocaleDateString()}
                      />
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="report" className="h-full w-full m-0 p-6 overflow-y-auto flex items-center justify-center">
                <div className="max-w-2xl w-full">
                  <div className="bg-white border border-slate-200/60 rounded-3xl p-10 shadow-sm text-center space-y-6 hover:shadow-md transition-shadow">
                    <div className="w-20 h-20 bg-orange-50 border-8 border-orange-100/50 text-orange-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                      <FileText className="w-8 h-8" />
                    </div>
                    <div className="space-y-2">
                      <h2 className="font-bold text-3xl tracking-tight text-slate-800">Biomass Depletion Report</h2>
                      <p className="text-slate-500 font-medium text-lg">
                        {effectiveDistrictName}
                      </p>
                      <p className="text-slate-400 text-sm max-w-md mx-auto pt-2">
                        Download a comprehensive PDF report including all statistics, class area breakdowns, and high-resolution classification maps.
                      </p>
                    </div>
                    
                    <div className="pt-6 flex justify-center">
                      <ReportDownloadButton 
                        aoi={aoi}
                        moduleName="Firewood/Biomass Depletion Tracker"
                        dateRange="2019 - 2023"
                        stats={statsData?.stats || {}}
                        classAreas={anyData?.class_areas_km2 || {}}
                        district={effectiveDistrictName}
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400">
            <div className="text-center space-y-4">
              <MapIcon className="w-16 h-16 mx-auto opacity-20" />
              <p className="font-medium text-lg tracking-tight text-slate-500">Ready to analyze</p>
              <p className="text-sm max-w-sm mx-auto">Configure your study area on the left and click Generate Analysis.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
"""

with open('artifacts/geoportal/src/pages/BiomassPage.tsx', 'w', encoding='utf-8') as f:
    f.write(code)
