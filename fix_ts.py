import os
import re

# 1. Fix ReportDownloadButton.tsx
rdb_path = 'c:/Users/user/Documents/blacportal/artifacts/geoportal/src/components/ReportDownloadButton.tsx'
with open(rdb_path, 'r', encoding='utf-8') as f:
    rdb = f.read()

rdb = rdb.replace('import { api } from "@/lib/api";', 'import { api, AOIConfig } from "@/lib/api";')
rdb = rdb.replace('interface Props {\n  moduleName: string;\n  district: string;', 'interface Props {\n  moduleName: string;\n  aoi: AOIConfig;\n  district?: string;')
rdb = rdb.replace('export function ReportDownloadButton({\n  moduleName,\n  district,', 'export function ReportDownloadButton({\n  moduleName,\n  aoi,\n  district,')
rdb = rdb.replace('module_name: moduleName,\n        district,', 'module_name: moduleName,\n        aoi,\n        district,')
with open(rdb_path, 'w', encoding='utf-8') as f:
    f.write(rdb)

# 2. Fix api.ts lst and slope signatures
api_path = 'c:/Users/user/Documents/blacportal/artifacts/geoportal/src/lib/api.ts'
with open(api_path, 'r', encoding='utf-8') as f:
    api = f.read()

api = api.replace('lst: (req: { district: string; start_date: string; end_date: string; n_classes: number })', 'lst: (req: { aoi: AOIConfig; district?: string; start_date: string; end_date: string; n_classes: number })')
api = api.replace('slope: (req: { district: string; n_classes: number })', 'slope: (req: { aoi: AOIConfig; district?: string; n_classes: number })')
with open(api_path, 'w', encoding='utf-8') as f:
    f.write(api)

# 3. Fix all pages using ReportDownloadButton
pages_dir = 'c:/Users/user/Documents/blacportal/artifacts/geoportal/src/pages'
for p in os.listdir(pages_dir):
    if not p.endswith('.tsx'): continue
    path = os.path.join(pages_dir, p)
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    changed = False
    
    # ReportDownloadButton aoi prop
    if '<ReportDownloadButton' in content and 'aoi={aoi}' not in content:
        content = content.replace('<ReportDownloadButton', '<ReportDownloadButton aoi={aoi}')
        changed = True

    # FloodPage.tsx passed district={aoi} instead of district={aoi.name}
    if 'FloodPage' in p or 'LandfillPage' in p:
        if 'district={aoi}' in content:
            content = content.replace('district={aoi}', 'district={aoi.name || "Custom"}')
            changed = True

    # LandfillPage localStorage usages of district
    if 'LandfillPage' in p:
        content = content.replace('landfill_weights_${district}', 'landfill_weights_${aoi.name || "Custom"}')
        content = content.replace('analyze landfill suitability for {district}', 'analyze landfill suitability for {aoi.name || "Custom"}')
        
        # We need to manually fix district usages
        content = re.sub(r'(?<!_)district(?!:|=|_|[A-Z])', '(aoi.name || "Custom")', content)
        changed = True

    if 'UHIPage' in p:
        content = re.sub(r'(?<!_)district(?!:|=|_|[A-Z])', '(aoi.name || "Custom")', content)
        changed = True

    if 'SampleDigitizationPage' in p:
        content = content.replace('visualized_download_url', 'download_url')
        changed = True

    if changed:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)

print("All fixed")
