const fs = require('fs');
const filepath = 'c:/Users/user/Documents/blacportal/artifacts/geoportal/src/components/InteractiveMapEditor.tsx';
let content = fs.readFileSync(filepath, 'utf8');

if (!content.includes('import { BASE }')) {
    content = content.replace(
        'import { Label } from "@/components/ui/label";',
        'import { Label } from "@/components/ui/label";\nimport { BASE } from "@/lib/api";'
    );
}

content = content.replace(
    'type: "map" | "text" | "legend" | "scale" | "northArrow";',
    'type: "map" | "text" | "legend" | "scale" | "northArrow" | "image";'
);

const props_target = `interface InteractiveMapEditorProps {
  title: string;
  thumbUrl: string;
  district: string;
  classAreas?: Record<string, number>;
  palette?: string[];
}`;
const props_replace = `interface InteractiveMapEditorProps {
  title: string;
  thumbUrl: string;
  district: string;
  classAreas?: Record<string, number>;
  palette?: string[];
  bbox?: number[];
}

function getDistanceKM(lon1: number, lat1: number, lon2: number, lat2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}`;
content = content.replace(props_target, props_replace);

content = content.replace(
    '  palette,\n}: InteractiveMapEditorProps) {',
    '  palette,\n  bbox,\n}: InteractiveMapEditorProps) {'
);

const state_target = `  const [insertDialogOpen, setInsertDialogOpen] = useState(false);
  const [previewType, setPreviewType] = useState<"text" | "legend" | "scale" | "northArrow">("northArrow");
  const [previewVariant, setPreviewVariant] = useState("classic");
  const [previewColor, setPreviewColor] = useState("#1a1a2e");
  const [previewBgColor, setPreviewBgColor] = useState("transparent");`;
const state_replace = `  const [insertDialogOpen, setInsertDialogOpen] = useState(false);
  const [previewType, setPreviewType] = useState<"text" | "legend" | "scale" | "northArrow" | "image">("northArrow");
  const [previewVariant, setPreviewVariant] = useState("classic");
  const [previewColor, setPreviewColor] = useState("#1a1a2e");
  const [previewBgColor, setPreviewBgColor] = useState("transparent");
  const [previewImage, setPreviewImage] = useState<string | null>(null);`;
content = content.replace(state_target, state_replace);

const payload_target = `          width: previewType === "scale" ? 150 : previewType === "northArrow" ? 40 : previewType === "text" ? 200 : 150,
          height: previewType === "northArrow" ? 50 : previewType === "scale" ? 30 : previewType === "text" ? 40 : "auto",
          content: previewType === "text" ? "New Text Element" : undefined,`;
const payload_replace = `          width: previewType === "scale" ? 150 : previewType === "northArrow" ? 40 : previewType === "text" ? 200 : previewType === "image" ? 100 : 150,
          height: previewType === "northArrow" ? 50 : previewType === "scale" ? 30 : previewType === "text" ? 40 : previewType === "image" ? 100 : "auto",
          content: previewType === "text" ? "New Text Element" : previewType === "image" ? (previewImage || undefined) : undefined,`;
content = content.replace(payload_target, payload_replace);

const proxy_target = `    fetch("https://geoportal-api-ygzi.onrender.com/api/proxy-image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },`;
const proxy_replace = `    fetch(\`\${BASE}/proxy-image\`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },`;
content = content.replace(proxy_target, proxy_replace);

const dialog_target = `                    <Button 
                      variant={previewType === "text" ? "default" : "outline"} 
                      size="sm" 
                      onClick={() => setPreviewType("text")}
                    >Text Box</Button>
                  </div>
                </div>`;
const dialog_replace = `                    <Button 
                      variant={previewType === "text" ? "default" : "outline"} 
                      size="sm" 
                      onClick={() => setPreviewType("text")}
                    >Text Box</Button>
                    <Button 
                      variant={previewType === "image" ? "default" : "outline"} 
                      size="sm" 
                      onClick={() => setPreviewType("image")}
                    >Image/Logo</Button>
                  </div>
                </div>
                {previewType === "image" && (
                  <div className="space-y-2">
                    <Label>Upload Image</Label>
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (event) => setPreviewImage(event.target?.result as string);
                        reader.readAsDataURL(file);
                      }}
                      className="w-full text-sm file:mr-4 file:py-1 file:px-4 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                    />
                  </div>
                )}`;
content = content.replace(dialog_target, dialog_replace);

const scale_target = `            {(!el.variant || el.variant === "line") && (
              <div className="w-[80%] h-1 bg-current mb-1 border-x-2" style={{ backgroundColor: el.color, borderColor: el.color }}></div>
            )}
            <span className="text-[10px] leading-none" style={{ color: el.color }}>~25 km</span>
          </div>
        )}
      </div>`;
const scale_replace = `            {(!el.variant || el.variant === "line") && (
              <div className="w-[80%] h-1 bg-current mb-1 border-x-2" style={{ backgroundColor: el.color, borderColor: el.color }}></div>
            )}
            <span className="text-[10px] leading-none" style={{ color: el.color }}>
              {(() => {
                let mapWidthKm = 25; // fallback
                if (bbox && bbox.length === 4) {
                  const centerLat = (bbox[1] + bbox[3]) / 2;
                  mapWidthKm = getDistanceKM(bbox[0], centerLat, bbox[2], centerLat);
                }
                const elWidth = typeof el.width === "number" ? el.width : parseFloat(el.width as string);
                const calcDist = (elWidth * 0.8) / canvasSize.width * mapWidthKm;
                return calcDist > 1 ? \`~\${calcDist.toFixed(1)} km\` : \`~\${(calcDist * 1000).toFixed(0)} m\`;
              })()}
            </span>
          </div>
        )}

        {el.type === "image" && (
          <div className="w-full h-full flex items-center justify-center pointer-events-none">
            {el.content ? (
              <img src={el.content} alt="Uploaded" className="w-full h-full object-contain" />
            ) : (
              <div className="text-xs text-muted-foreground border-2 border-dashed border-gray-300 w-full h-full flex items-center justify-center">No Image</div>
            )}
          </div>
        )}
      </div>`;
content = content.replace(scale_target, scale_replace);

const rnd_target = `        className={\`absolute \${isSelected ? "ring-2 ring-primary border-dashed" : ""} hover:ring-1 hover:ring-primary/50 transition-all cursor-move\`}
        style={{ zIndex: el.type === "map" ? 0 : 10 }}`;
const rnd_replace = `        className={\`absolute \${isSelected ? "ring-2 ring-primary border-dashed" : ""} hover:ring-1 hover:ring-primary/50 transition-all cursor-move\`}
        style={{ zIndex: elements.indexOf(el) }}`;
content = content.replace(rnd_target, rnd_replace);

const layer_target = `          <div className="space-y-2">
            <Label>Selected Element</Label>
            <div className="text-sm px-3 py-2 bg-muted rounded border capitalize font-medium">
              {selectedElement ? selectedElement.id.replace(/-/g, " ") : "Canvas Background"}
            </div>
          </div>

          {!selectedElement && (`;
const layer_replace = `          <div className="space-y-2">
            <Label>Selected Element</Label>
            <div className="text-sm px-3 py-2 bg-muted rounded border capitalize font-medium">
              {selectedElement ? selectedElement.id.replace(/-/g, " ") : "Canvas Background"}
            </div>
            {selectedElement && selectedElement.type !== "map" && (
              <div className="flex gap-2 mt-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 text-xs h-8"
                  onClick={() => {
                    setElementsState(prev => {
                      const next = [...prev];
                      const idx = next.findIndex(e => e.id === selectedElement.id);
                      if (idx < next.length - 1) {
                        const temp = next[idx];
                        next[idx] = next[idx + 1];
                        next[idx + 1] = temp;
                        pushStateDirect(next);
                      }
                      return next;
                    });
                  }}
                >
                  Bring Forward
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 text-xs h-8"
                  onClick={() => {
                    setElementsState(prev => {
                      const next = [...prev];
                      const idx = next.findIndex(e => e.id === selectedElement.id);
                      if (idx > 0 && next[idx - 1].type !== "map") {
                        const temp = next[idx];
                        next[idx] = next[idx - 1];
                        next[idx - 1] = temp;
                        pushStateDirect(next);
                      }
                      return next;
                    });
                  }}
                >
                  Send Backward
                </Button>
              </div>
            )}
          </div>

          {!selectedElement && (`;
content = content.replace(layer_target, layer_replace);

fs.writeFileSync(filepath, content);
console.log('Successfully updated InteractiveMapEditor.tsx');
