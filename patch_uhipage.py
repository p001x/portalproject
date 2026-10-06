import re

with open('artifacts/geoportal/src/pages/UHIPage.tsx', 'r') as f:
    content = f.read()

# Add lstSource state
content = re.sub(
    r'const \[nClasses, setNClasses\] = useState\(5\);', 
    'const [nClasses, setNClasses] = useState(5);\n  const [lstSource, setLstSource] = useState("hybrid");', 
    content
)

# Add lst_source to API payload
content = re.sub(
    r'method \n    \}\),', 
    'method,\n      lst_source: lstSource\n    }),', 
    content
)

# Add selector UI
ui_addition = """
        <div className="space-y-1 mt-4">
          <Label>Temperature Source</Label>
          <Select value={lstSource} onValueChange={setLstSource}>
            <SelectTrigger className="w-full text-xs h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hybrid" className="text-xs">Hybrid (MODIS+SRTM 30m)</SelectItem>
              <SelectItem value="landsat" className="text-xs">Landsat TIRS (100m)</SelectItem>
              <SelectItem value="modis" className="text-xs">Raw MODIS (1km)</SelectItem>
            </SelectContent>
          </Select>
        </div>
"""
content = content.replace(
    '<div className="space-y-2 pt-2 border-t mt-2">', 
    ui_addition + '\n        <div className="space-y-2 pt-2 border-t mt-2">'
)

with open('artifacts/geoportal/src/pages/UHIPage.tsx', 'w') as f:
    f.write(content)
