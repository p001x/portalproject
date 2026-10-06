import re

with open('src/pages/DroughtPage.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Add customWeights state
state_old = '''  const [reverseLst, setReverseLst] = useState(false);
  const [reverseCdd, setReverseCdd] = useState(false);
  const [reverseEvi, setReverseEvi] = useState(false);

  const baseReq = {'''

state_new = '''  const [reverseLst, setReverseLst] = useState(false);
  const [reverseCdd, setReverseCdd] = useState(false);
  const [reverseEvi, setReverseEvi] = useState(false);
  const [customWeights, setCustomWeights] = useState<Record<string, number> | null>(null);

  const baseReq = {'''
code = code.replace(state_old, state_new)

# Add customWeights to baseReq
basereq_old = '''    season, start_month: season === "custom" ? startMonth : undefined, end_month: season === "custom" ? endMonth : undefined,
    reverse_sm: reverseSm, reverse_rf: reverseRf, reverse_ndvi: reverseNdvi, reverse_vci: reverseVci, reverse_lst: reverseLst, reverse_cdd: reverseCdd, reverse_evi: reverseEvi
  };'''

basereq_new = '''    season, start_month: season === "custom" ? startMonth : undefined, end_month: season === "custom" ? endMonth : undefined,
    reverse_sm: reverseSm, reverse_rf: reverseRf, reverse_ndvi: reverseNdvi, reverse_vci: reverseVci, reverse_lst: reverseLst, reverse_cdd: reverseCdd, reverse_evi: reverseEvi,
    custom_weights: customWeights || undefined
  };'''
code = code.replace(basereq_old, basereq_new)

# Add AHP weights UI in sidebar
sidebar_old = '''        {/* Factor Reversal Section */}
        <div className="space-y-2.5 pt-2 border-t">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Reverse Factors
          </Label>'''

sidebar_new = '''        {/* AHP Weights */}
        <div className="space-y-3 pt-3 border-t">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
              AHP Weights (0-100)
            </Label>
          </div>
          <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1 text-xs">
            {["sm", "rf", "ndvi", "vci", "lst", "cdd", "evi"].map(factor => (
               <div key={factor} className="flex items-center justify-between gap-2">
                 <span className="uppercase font-medium w-12">{factor}</span>
                 <input
                   type="number"
                   min="0"
                   max="100"
                   className="w-16 h-7 rounded border border-input bg-background px-2 text-foreground"
                   placeholder="Auto"
                   value={customWeights?.[factor] !== undefined ? Math.round(customWeights[factor] * 100) : ""}
                   onChange={(e) => {
                     const val = e.target.value ? Number(e.target.value) / 100 : undefined;
                     setCustomWeights(prev => {
                       const next = { ...(prev || {}) };
                       if (val === undefined) delete next[factor];
                       else next[factor] = val;
                       return Object.keys(next).length ? next : null;
                     });
                   }}
                 />
               </div>
            ))}
            <p className="text-[10px] text-muted-foreground leading-tight">Leave empty to use default AHP matrix. Values are normalized.</p>
          </div>
        </div>

        {/* Factor Reversal Section */}
        <div className="space-y-2.5 pt-2 border-t">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Reverse Factors
          </Label>'''
code = code.replace(sidebar_old, sidebar_new)

# Add Factors Tab Trigger
tabst_old = '''              <TabsTrigger value="classify">Classification Components</TabsTrigger>
              <TabsTrigger value="static-map">Static Maps</TabsTrigger>'''
tabst_new = '''              <TabsTrigger value="classify">Classification Components</TabsTrigger>
              <TabsTrigger value="factors">Factor Maps</TabsTrigger>
              <TabsTrigger value="static-map">Static Maps</TabsTrigger>'''
code = code.replace(tabst_old, tabst_new)

# Add Factors Tab Content
tabsc_old = '''            {/* Static Maps */}
            <TabsContent value="static-map" className="flex-1 overflow-y-auto space-y-4">'''
tabsc_new = '''            {/* Factors */}
            <TabsContent value="factors" className="space-y-6">
              <div>
                <h2 className="font-semibold text-lg mb-1">Drought Factors — {data.district}</h2>
                <p className="text-sm text-muted-foreground">Individual factor maps and statistics contributing to the final DVI. Weights used: {data.weights_used && Object.entries(data.weights_used).map(([k,v]) => ${k.toUpperCase()}: %).join(', ')}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.factor_maps && Object.entries(data.factor_maps).map(([key, mapData]) => (
                  <div key={key} className="border rounded-lg p-3 bg-card space-y-2">
                    <h3 className="font-medium text-sm text-foreground">{mapData.label}</h3>
                    <img src={mapData.thumb_url} alt={mapData.label} className="w-full h-40 object-cover rounded bg-muted" />
                    {data.factor_means && data.factor_means[mapData.label] !== undefined && (
                      <p className="text-xs text-muted-foreground">Mean Value: {data.factor_means[mapData.label]}</p>
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Static Maps */}
            <TabsContent value="static-map" className="flex-1 overflow-y-auto space-y-4">'''
code = code.replace(tabsc_old, tabsc_new)

with open('src/pages/DroughtPage.tsx', 'w', encoding='utf-8') as f:
    f.write(code)
