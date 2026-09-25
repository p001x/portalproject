import re

filepath = r'c:\Users\user\Documents\blacportal\artifacts\geoportal\src\pages\EarthworkPage.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Find the start of the return statement
match = re.search(r'^\s*return\s*\(\s*<ResizablePanelGroup', content, flags=re.MULTILINE)
if not match:
    print("Could not find return statement!")
    exit(1)

pre_return = content[:match.start()]

# The new JSX
new_return = '''  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden font-sans">
      {/* Top Ribbon (ArcGIS Style) */}
      <div className="flex flex-col border-b shadow-sm z-[1000] relative bg-[#f5f5f5]">
        
        {/* Top Header / Module Title */}
        <div className="flex items-center justify-between px-4 py-1.5 bg-[#1e293b] text-white">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Box className="w-4 h-4 text-[#ff5a5f]" />
            <span>Advanced Earthwork & Grading</span>
          </div>
          <select 
            value={industryMode} 
            onChange={(e) => {
              setIndustryMode(e.target.value as any);
              setResult(null);
              setIsTerracing(false);
            }}
            className="h-6 text-[11px] rounded bg-white/10 text-white font-semibold px-2 border-0 focus:ring-0 outline-none cursor-pointer"
          >
            <option value="civil" className="text-black">🚧 Civil Grading</option>
            <option value="hydrology" className="text-black">💧 Hydrology & Water</option>
            <option value="mining" className="text-black">⛏️ Mining & Stockpiles</option>
          </select>
        </div>

        {/* Ribbon Tabs */}
        <div className="flex px-4 pt-2 gap-1 border-b bg-white">
          <button className="px-4 py-1.5 text-[11px] font-semibold rounded-t-sm border-b-2 border-[#007AC2] bg-[#f3f4f6] text-[#007AC2] uppercase tracking-wider">
            Analysis & Design
          </button>
          <button className="px-4 py-1.5 text-[11px] font-semibold rounded-t-sm border-b-2 border-transparent text-gray-500 hover:bg-gray-50 uppercase tracking-wider">
            Geotechnical
          </button>
          <button className="px-4 py-1.5 text-[11px] font-semibold rounded-t-sm border-b-2 border-transparent text-gray-500 hover:bg-gray-50 uppercase tracking-wider">
            Reporting
          </button>
        </div>
        
        {/* Ribbon Toolbar Content */}
        <div className="p-2 flex gap-4 items-stretch h-[85px] overflow-x-auto bg-white shrink-0 border-b">
           
           {/* Tool Group: Site Area */}
           <div className="flex flex-col gap-1 border-r border-gray-200 pr-4 h-full min-w-[120px]">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider text-center">Site Boundary</span>
              <div className="flex-1 flex items-center justify-center bg-gray-50 rounded border border-gray-200 border-dashed px-2 text-[10px] text-gray-500 text-center leading-tight">
                {polygonCoords ? Selected:\\n vertices : "Draw Polygon\\nOn Map"}
              </div>
           </div>

           {/* Tool Group: Grading Parameters */}
           <div className="flex flex-col gap-1 border-r border-gray-200 pr-4 h-full min-w-[280px]">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Grading Constraints</span>
                <label className="flex items-center gap-1 text-[9px] font-bold text-[#ff5a5f] cursor-pointer hover:underline" title="Generative Design optimization">
                  <input type="checkbox" checked={autoBalance} onChange={(e) => setAutoBalance(e.target.checked)} className="w-2.5 h-2.5 accent-[#ff5a5f]" />
                  Auto-Balance
                </label>
              </div>
              <div className="flex gap-2 items-center flex-1">
                 <div className="flex flex-col flex-1">
                    <span className="text-[9px] text-gray-600 mb-0.5">Target Elev (m)</span>
                    <input type="number" value={targetElevation} onChange={(e) => setTargetElevation(e.target.value === "" ? "" : Number(e.target.value))} disabled={autoBalance} className="w-full h-6 text-[11px] rounded border border-gray-300 px-1 disabled:opacity-50" placeholder="Auto" />
                 </div>
                 <div className="flex flex-col flex-1">
                    <span className="text-[9px] text-gray-600 mb-0.5">Grade (%)</span>
                    <input type="number" step="0.5" value={slopeGrade} onChange={(e) => setSlopeGrade(Number(e.target.value))} className="w-full h-6 text-[11px] rounded border border-gray-300 px-1" />
                 </div>
                 <div className="flex flex-col flex-1">
                    <span className="text-[9px] text-gray-600 mb-0.5">Azimuth (°)</span>
                    <input type="number" value={slopeAngle} onChange={(e) => setSlopeAngle(Number(e.target.value))} className="w-full h-6 text-[11px] rounded border border-gray-300 px-1" />
                 </div>
              </div>
           </div>

           {/* Tool Group: Soils */}
           <div className="flex flex-col gap-1 border-r border-gray-200 pr-4 h-full min-w-[220px]">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Material Properties</span>
              <div className="flex gap-2 items-center flex-1">
                 <div className="flex flex-col flex-1">
                    <span className="text-[9px] text-gray-600 mb-0.5">Topsoil Strip (m)</span>
                    <input type="number" step="0.1" value={topsoilDepth} onChange={(e) => setTopsoilDepth(Number(e.target.value))} className="w-full h-6 text-[11px] rounded border border-gray-300 px-1 text-orange-600" />
                 </div>
                 <div className="flex flex-col flex-1">
                    <span className="text-[9px] text-gray-600 mb-0.5">Swell Factor</span>
                    <input type="number" step="0.01" value={swellFactor} onChange={(e) => setSwellFactor(Number(e.target.value))} className="w-full h-6 text-[11px] rounded border border-gray-300 px-1" />
                 </div>
                 <div className="flex flex-col flex-1">
                    <span className="text-[9px] text-gray-600 mb-0.5">Shrink Factor</span>
                    <input type="number" step="0.01" value={shrinkFactor} onChange={(e) => setShrinkFactor(Number(e.target.value))} className="w-full h-6 text-[11px] rounded border border-gray-300 px-1" />
                 </div>
              </div>
           </div>
           
           {/* Tool Group: Actions */}
           <div className="flex items-center h-full min-w-[200px] pl-2 gap-2">
              <Button onClick={handleAnalyze} disabled={isPending || !polygonCoords} className="h-[40px] flex-1 bg-[#007AC2] hover:bg-[#005a8f] text-white font-bold text-[11px] shadow-sm rounded">
                 {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Calculator className="w-4 h-4 mr-1.5" />}
                 {isPending ? "Computing..." : "Run Analysis"}
              </Button>
              {result && (
                <Button onClick={() => setShow3DViewer(!show3DViewer)} variant="outline" className="h-[40px] w-[40px] p-0 border-[#007AC2] text-[#007AC2] shadow-sm" title="3D Viewer">
                  <Box className="w-5 h-5" />
                </Button>
              )}
           </div>
        </div>
      </div>

      {/* Main Content Area (Map + Floating Results) */}
      <div className="flex-1 relative flex bg-gray-100">
         
         {/* Map Container */}
         <MapContainer center={[-1.9441, 30.0619]} zoom={11} className="w-full h-full z-[0]">
            <LayersControl position="bottomleft">
              <LayersControl.BaseLayer checked name="Satellite">
                <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="&copy; Esri" />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Street Map">
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
              </LayersControl.BaseLayer>
            </LayersControl>

            <FeatureGroup ref={featureGroupRef}>
              <EditControl
                position="topleft"
                onCreated={onCreated}
                onEdited={onEdited}
                onDeleted={onDeleted}
                draw={{
                  polyline: { shapeOptions: { color: "#f97316", weight: 3 } },
                  circle: false,
                  circlemarker: false,
                  marker: false,
                  polygon: {
                    allowIntersection: false,
                    showArea: false,
                    shapeOptions: { color: "#facc15", weight: 3, dashArray: "5, 5", fillOpacity: 0 }
                  },
                  rectangle: {
                    showArea: false,
                    shapeOptions: { color: "#facc15", weight: 3, dashArray: "5, 5", fillOpacity: 0 }
                  }
                }}
              />
            </FeatureGroup>

            {result && result.heatmap_tile_url && (
              <TileLayer key={result.heatmap_tile_url} url={result.heatmap_tile_url} opacity={0.85} zIndex={10} />
            )}
            
            {result && result.max_cut_point && (
              <Marker position={[result.max_cut_point.lat, result.max_cut_point.lon]} icon={cutIcon}>
                <Tooltip permanent direction="top" className="bg-red-900/90 text-red-100 border-red-500 font-bold">
                  Max Cut: {result.max_cut_point.depth}m
                </Tooltip>
              </Marker>
            )}

            {result && result.max_fill_point && (
              <Marker position={[result.max_fill_point.lat, result.max_fill_point.lon]} icon={fillIcon}>
                <Tooltip permanent direction="bottom" className="bg-blue-900/90 text-blue-100 border-blue-500 font-bold">
                  Max Fill: {result.max_fill_point.depth}m
                </Tooltip>
              </Marker>
            )}
         </MapContainer>
         
         {/* Floating Cross-Section Profile (Bottom) */}
         {profileData && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[600px] h-48 bg-white/95 backdrop-blur shadow-xl border rounded-lg z-[1000] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b bg-gray-50">
              <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5"><Sliders className="w-3 h-3" /> Cross-Section Profile</span>
              <button className="text-gray-400 hover:text-red-500" onClick={() => setProfileData(null)}>✖</button>
            </div>
            <div className="flex-1 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={profileData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="distance" tick={{fontSize: 9, fill: "#6b7280"}} axisLine={{stroke: "#d1d5db"}} tickLine={false} />
                  <YAxis tick={{fontSize: 9, fill: "#6b7280"}} domain={['auto', 'auto']} axisLine={false} tickLine={false} />
                  <RechartsTooltip contentStyle={{fontSize: 10, padding: 4, borderRadius: 4, border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'}} />
                  <Line type="monotone" dataKey="existing_elev" stroke="#10b981" name="Existing Terrain" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="proposed_elev" stroke="#3b82f6" name="Proposed Grade" dot={false} strokeWidth={2} strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
         )}

         {/* ArcGIS Dockable Contents Pane (Right Side) */}
         {result && (
           <div className="absolute top-4 right-4 z-[1000] w-[320px] bg-white shadow-xl rounded-md border flex flex-col max-h-[calc(100%-2rem)] overflow-hidden">
             {/* Header */}
             <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between shrink-0">
               <h3 className="text-[12px] font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                 <Calculator className="w-4 h-4 text-[#007AC2]" /> Volumetric Report
               </h3>
               <button onClick={handleGenerateReport} disabled={isReportPending} className="text-[#007AC2] hover:text-[#005a8f] disabled:opacity-50" title="Export PDF">
                 {isReportPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>}
               </button>
             </div>
             
             {/* Body */}
             <div className="flex-1 overflow-y-auto p-3 space-y-4">
                
                {/* Volumes Block */}
                <div>
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 border-b pb-1">Cut & Fill Quantities</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-red-50 p-2 rounded border border-red-100 flex flex-col items-center">
                      <span className="text-red-800 font-bold text-[10px] uppercase">Total Cut</span>
                      <span className="text-red-600 font-mono text-sm mt-1">{result.adjusted_cut_m3.toLocaleString()} m³</span>
                    </div>
                    <div className="bg-blue-50 p-2 rounded border border-blue-100 flex flex-col items-center">
                      <span className="text-blue-800 font-bold text-[10px] uppercase">Total Fill</span>
                      <span className="text-blue-600 font-mono text-sm mt-1">{result.adjusted_fill_m3.toLocaleString()} m³</span>
                    </div>
                  </div>
                  <div className="mt-2 flex justify-between items-center text-[11px] bg-gray-50 p-1.5 rounded border">
                    <span className="font-semibold text-gray-600">Net Balance:</span>
                    <span className={ont-mono font-bold }>
                      {Math.abs(result.net_balance_m3).toLocaleString()} m³ {result.net_balance_m3 > 0 ? "(Export)" : "(Import)"}
                    </span>
                  </div>
                </div>

                {/* Logistics */}
                {result.logistics && result.logistics.haul_distance_m > 0 && (
                  <div>
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 border-b pb-1">Mass Haul Logistics</h4>
                    <div className="flex justify-between items-center text-[11px] mb-1">
                      <span className="text-gray-600">Avg Haul Distance:</span>
                      <span className="font-mono text-gray-800">{result.logistics.haul_distance_m.toLocaleString()} m</span>
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-gray-600">Haul Effort:</span>
                      <span className="font-mono text-gray-800">{result.logistics.haul_effort_m3_km.toLocaleString()} m³·km</span>
                    </div>
                  </div>
                )}
                
                {/* Land Cover */}
                {result.land_cover && result.land_cover.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 border-b pb-1">Site Clearance</h4>
                    <div className="space-y-1">
                      {result.land_cover.map((lc: any, i: number) => (
                        <div key={i} className="flex justify-between items-center text-[11px]">
                          <span className="text-gray-600 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-green-500"></span> {lc.class_name}
                          </span>
                          <span className="font-mono text-gray-800">{lc.area_ha.toLocaleString()} ha</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
             </div>
           </div>
         )}
         
         {/* 3D Viewer Popup */}
         {show3DViewer && polygonCoords && (
          <div className="absolute inset-0 z-[2000] bg-background/80 backdrop-blur-sm flex items-center justify-center p-8">
            <div className="w-full h-full bg-card rounded-lg border shadow-2xl overflow-hidden relative">
              <Earthwork3DViewer 
                polygon={polygonCoords}
                targetElevation={targetElevation === "" ? undefined : targetElevation}
                slopeGrade={slopeGrade}
                slopeAngle={slopeAngle}
                topsoilDepth={topsoilDepth}
                customDemId={customDemId}
                onClose={() => setShow3DViewer(false)}
              />
            </div>
          </div>
         )}

      </div>
    </div>
  );
}
'''

new_content = pre_return + new_return

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Updated EarthworkPage.tsx successfully!")
