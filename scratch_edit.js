const fs = require('fs');

const path = "C:/Users/user/Documents/blacportal/artifacts/geoportal/src/pages/RUSLEPage.tsx";
let content = fs.readFileSync(path, 'utf8');

const target = `export function RUSLEPage() {
  const [aoi, setAoi] = useState<AOIConfig>({ type: "gaul2", country: "Rwanda", name: "Musanze", level1: "North/Amajyaruguru", level2: "Musanze" });
  const [year, setYear] = useState(2023);
  const [nClasses, setNClasses] = useState(5);
  const [reverseR, setReverseR] = useState(false);
  const [reverseK, setReverseK] = useState(false);
  const [reverseLs, setReverseLs] = useState(false);
  const [reverseC, setReverseC] = useState(false);
  const [reverseP, setReverseP] = useState(false);
  const [activeLayer, setActiveLayer] = useState("A");

  const { mutate, data, isPending, error } = useMutation<RUSLEResult, Error>({
    mutationFn: () =>
      api.rusle({
        aoi,
                year,
        n_classes: nClasses,
        reverse_r: reverseR,
        reverse_k: reverseK,
        reverse_ls: reverseLs,
        reverse_c: reverseC,
        reverse_p: reverseP,
      }),
  });


  const getActiveTileUrl = () => {
    if (!data) return "";
    if (activeLayer === "A") return data.tile_url;
    return data.factor_maps[activeLayer]?.class_tile_url ?? data.factor_maps[activeLayer]?.tile_url ?? data.tile_url;
  };

  const getActiveThumbUrl = () => {
    if (!data) return undefined;
    if (activeLayer === "risk") return (data as any).risk_index?.thumb_url;
    if (activeLayer === "A") return (data as any).factor_maps?.A?.thumb_url;
    return (data as any).factor_maps?.[activeLayer]?.class_thumb_url ?? (data as any).factor_maps?.[activeLayer]?.thumb_url;
  };

  const getActiveDownloadUrl = () => {
    if (!data) return undefined;
    if (activeLayer === "risk") return (data as any).risk_index?.download_url;
    return (data as any).factor_maps?.[activeLayer]?.download_url;
  };`;

const replacement = `const DEFAULT_PRESETS: Record<number, string[]> = {
  1: ["Uniform / Full Area"],
  2: ["Low", "High"],
  3: ["Low", "Moderate", "High"],
  4: ["Low", "Moderate", "High", "Very High"],
  5: ["Very Low", "Low", "Moderate", "High", "Very High"],
  6: ["Very Low", "Low", "Moderate", "High", "Very High", "Extreme"],
  7: ["Extremely Low", "Very Low", "Low", "Moderate", "High", "Very High", "Extreme"],
  8: ["Extremely Low", "Very Low", "Low", "Moderately Low", "Moderately High", "High", "Very High", "Extreme"],
  9: ["Extremely Low", "Very Low", "Low", "Moderately Low", "Moderate", "Moderately High", "High", "Very High", "Extreme"],
  10: ["Extremely Low", "Very Low", "Low", "Moderately Low", "Moderate", "Moderately High", "High", "Very High", "Extremely High", "Extreme"],
};

function getDefaultLabels(n: number): string[] {
  if (DEFAULT_PRESETS[n]) return [...DEFAULT_PRESETS[n]];
  return Array.from({ length: n }, (_, i) => \`Class \${i + 1}\`);
}

export function RUSLEPage() {
  const [aoi, setAoi] = useState<AOIConfig>({ type: "gaul2", country: "Rwanda", name: "Musanze", level1: "North/Amajyaruguru", level2: "Musanze" });
  const [year, setYear] = useState(2023);
  const [nClasses, setNClasses] = useState(5);
  const [method, setMethod] = useState("natural_breaks");
  const [customClassNames, setCustomClassNames] = useState<string[]>(() => getDefaultLabels(5));
  
  useEffect(() => {
    setCustomClassNames((prev) => {
      if (prev.length === nClasses) return prev;
      const next = getDefaultLabels(nClasses);
      for (let i = 0; i < Math.min(prev.length, nClasses); i++) {
        if (!DEFAULT_PRESETS[prev.length]?.includes(prev[i])) {
          next[i] = prev[i];
        }
      }
      return next;
    });
  }, [nClasses]);

  const [reverseR, setReverseR] = useState(false);
  const [reverseK, setReverseK] = useState(false);
  const [reverseLs, setReverseLs] = useState(false);
  const [reverseC, setReverseC] = useState(false);
  const [reverseP, setReverseP] = useState(false);
  const [activeLayer, setActiveLayer] = useState("A");

  const getReq = () => ({
    aoi,
    year,
    n_classes: nClasses,
    method,
    custom_labels: customClassNames,
    reverse_r: reverseR,
    reverse_k: reverseK,
    reverse_ls: reverseLs,
    reverse_c: reverseC,
    reverse_p: reverseP,
  });

  const mapMutation = useMutation({ mutationFn: () => api.rusle.map(getReq()) });
  const statsMutation = useMutation({ mutationFn: () => api.rusle.stats(getReq()) });
  const classifyMutation = useMutation({ mutationFn: () => api.rusle.classify(getReq()) });
  const exportMutation = useMutation({ mutationFn: () => api.rusle.export(getReq()) });

  const handleAnalyze = () => {
    mapMutation.mutate();
    statsMutation.mutate();
    classifyMutation.mutate();
    exportMutation.mutate();
  };

  const isPending = mapMutation.isPending || statsMutation.isPending || classifyMutation.isPending || exportMutation.isPending;
  const error = mapMutation.error || statsMutation.error || classifyMutation.error || exportMutation.error;
  
  const mapData = mapMutation.data as any;
  const statsData = statsMutation.data as any;
  const classifyData = classifyMutation.data as any;
  const exportData = exportMutation.data as any;
  const data = mapData || statsData || classifyData || exportData;

  const getActiveTileUrl = () => {
    if (!mapData && !classifyData) return "";
    if (activeLayer === "risk") return classifyData?.panels?.find((p: any) => p.name === "risk_index")?.tile_url || mapData?.factor_maps?.["risk_index"]?.tile_url;
    
    if (activeLayer === "A") {
      if (method === "continuous") return mapData?.tile_url;
      return classifyData?.panels?.find((p: any) => p.name === "A")?.tile_url || mapData?.tile_url;
    }
    
    if (method === "continuous") return mapData?.factor_maps?.[activeLayer]?.tile_url;
    return classifyData?.panels?.find((p: any) => p.name === activeLayer)?.tile_url || mapData?.factor_maps?.[activeLayer]?.tile_url;
  };

  const getActiveThumbUrl = () => {
    if (!mapData && !classifyData) return undefined;
    if (activeLayer === "risk") return classifyData?.panels?.find((p: any) => p.name === "risk_index")?.thumb_url || mapData?.factor_maps?.["risk_index"]?.thumb_url;
    
    if (activeLayer === "A") {
      if (method === "continuous") return mapData?.thumb_url;
      return classifyData?.panels?.find((p: any) => p.name === "A")?.thumb_url || mapData?.thumb_url;
    }

    if (method === "continuous") return mapData?.factor_maps?.[activeLayer]?.thumb_url;
    return classifyData?.panels?.find((p: any) => p.name === activeLayer)?.thumb_url || mapData?.factor_maps?.[activeLayer]?.thumb_url;
  };

  const getActiveDownloadUrl = () => {
    if (!exportData) return undefined;
    if (activeLayer === "risk") return exportData?.risk_index;
    return exportData?.[activeLayer];
  };`;

// Also fix the UI controls
const targetUI = `        <div className="space-y-2">
          <Label>Classes: {nClasses}</Label>
          <Slider
            min={2}
            max={10}
            step={1}
            value={[nClasses]}
            onValueChange={([v]) => setNClasses(v)}
          />
        </div>`;

const replacementUI = `        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center justify-between">
              Classification Method
            </Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="natural_breaks">Natural Breaks (Jenks)</SelectItem>
                <SelectItem value="equal_interval">Equal Interval</SelectItem>
                <SelectItem value="quantile">Quantile</SelectItem>
                <SelectItem value="continuous">Continuous (Unclassified)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {method !== "continuous" && (
            <div className="space-y-2">
              <Label>Classes: {nClasses}</Label>
              <Slider
                min={2}
                max={10}
                step={1}
                value={[nClasses]}
                onValueChange={([v]) => setNClasses(v)}
              />
            </div>
          )}
        </div>`;

const targetBtn = `<Button
          className="w-full gap-2"
          onClick={() => mutate()}
          disabled={isPending}
        >`;

const replacementBtn = `<Button
          className="w-full gap-2"
          onClick={handleAnalyze}
          disabled={isPending}
        >`;

if (content.indexOf(target) !== -1) {
  content = content.replace(target, replacement);
  content = content.replace(targetUI, replacementUI);
  content = content.replace(targetBtn, replacementBtn);
  fs.writeFileSync(path, content, 'utf8');
  console.log("Success");
} else {
  console.log("Target not found");
}`;
