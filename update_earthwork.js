const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'artifacts', 'geoportal', 'src', 'pages', 'EarthworkPage.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add recharts imports
if (!content.includes('recharts')) {
    content = content.replace(
        'import "leaflet-draw/dist/leaflet.draw.css";',
        'import "leaflet-draw/dist/leaflet.draw.css";\nimport { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";'
    );
}

// 2. Add new states
const stateInsert = `
  const [lineCoords, setLineCoords] = useState<number[][] | null>(null);
  const [profileData, setProfileData] = useState<any[] | null>(null);
  const [isProfilePending, setIsProfilePending] = useState(false);
`;
if (!content.includes('lineCoords')) {
    content = content.replace(
        'const [result, setResult] = useState<any>(null);',
        'const [result, setResult] = useState<any>(null);' + stateInsert
    );
}

// 3. Add fetchProfile method
const fetchProfileStr = `
  const fetchProfile = async (coords: number[][]) => {
    if (!polygonCoords) return;
    setIsProfilePending(true);
    try {
      const data = await api.earthwork.profile({
        polygon: polygonCoords,
        line: coords,
        target_elevation: Number(targetElevation) || 0,
        slope_grade: slopeGrade,
        slope_angle: slopeAngle,
        topsoil_depth: topsoilDepth
      });
      setProfileData(data);
    } catch(err: any) {
      setError(err.message || "Failed to fetch profile");
    } finally {
      setIsProfilePending(false);
    }
  };
`;
if (!content.includes('fetchProfile')) {
    content = content.replace(
        'const handleAnalyze = async () => {',
        fetchProfileStr + '\n  const handleAnalyze = async () => {'
    );
}

// 4. Update onCreated
const newOnCreated = `
  const onCreated = (e: any) => {
    const layer = e.layer;
    const fg = featureGroupRef.current;
    
    if (e.layerType === "polygon") {
      fg.getLayers().forEach((l: any) => {
        if (l instanceof L.Polygon && l !== layer) fg.removeLayer(l);
      });
      const latlngs = layer.getLatLngs()[0];
      const coords = latlngs.map((ll: any) => [ll.lng, ll.lat]);
      coords.push([latlngs[0].lng, latlngs[0].lat]);
      setPolygonCoords(coords);
      setResult(null);
      setTargetElevation("");
      setProfileData(null);
    } else if (e.layerType === "polyline") {
      fg.getLayers().forEach((l: any) => {
        if (l instanceof L.Polyline && !(l instanceof L.Polygon) && l !== layer) fg.removeLayer(l);
      });
      const latlngs = layer.getLatLngs();
      const coords = latlngs.map((ll: any) => [ll.lng, ll.lat]);
      setLineCoords(coords);
      fetchProfile(coords);
    }
  };
`;
content = content.replace(/const onCreated = \(e: any\) => \{[\s\S]*?\n  \};\n/, newOnCreated.trim() + '\n\n');

// 5. Enable polyline in EditControl
content = content.replace('polyline: false,', 'polyline: { shapeOptions: { color: "#f97316", weight: 3 } },');

// 6. Add Profile Chart to the Map area
const profileChart = `
        {profileData && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-background border rounded-lg shadow-lg w-[600px] h-[250px] flex flex-col overflow-hidden">
            <div className="bg-muted px-3 py-1.5 border-b flex justify-between items-center text-xs font-semibold">
              <span>Cross-Section Profile</span>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setProfileData(null)}>x</Button>
            </div>
            <div className="flex-1 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={profileData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="distance" tick={{fontSize: 10}} />
                  <YAxis tick={{fontSize: 10}} domain={['auto', 'auto']} />
                  <RechartsTooltip contentStyle={{fontSize: 11, padding: 4}} />
                  <Line type="monotone" dataKey="existing_elev" stroke="#3b82f6" name="Existing Elev" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="proposed_elev" stroke="#ef4444" name="Proposed Elev" dot={false} strokeWidth={2} strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        
        {isProfilePending && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-background px-4 py-2 border rounded-full shadow-lg flex items-center gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-primary" /> Computing profile...
          </div>
        )}
`;

if (!content.includes('Cross-Section Profile')) {
    content = content.replace(
        '        <MapContainer',
        profileChart + '\n        <MapContainer'
    );
}

fs.writeFileSync(filePath, content, 'utf8');
console.log("Updated EarthworkPage.tsx");
