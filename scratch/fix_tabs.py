import re

with open('c:/Users/user/Documents/blacportal/artifacts/geoportal/src/pages/SampleDigitizationPage.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace the first hack
old1 = r"document\.querySelector\('\[data-value=\"map\"\]'\)\?\.dispatchEvent\(new MouseEvent\('click', \{bubbles: true\}\)\);\s*loadImageryMut\.mutate\(\{ dataSource: \"custom\", customAssetId: dataset\.id \}\);"
new1 = """if (dataset.storage_key?.includes("kaggle://") || dataset.asset_id?.includes("kaggle://")) { toast({ variant: "destructive", title: "External Data", description: "This dataset is stored externally (e.g. Kaggle). Earth Engine requires Cloud Optimized GeoTIFFs to be hosted in Google Cloud Storage (gs://). You must download the dataset or import its features instead." }); return; } setActiveTab("map"); loadImageryMut.mutate({ dataSource: "custom", customAssetId: dataset.storage_key || dataset.asset_id || dataset.id });"""
text = re.sub(old1, new1, text)

# Replace the second hack
old2 = r"document\.querySelector\('\[data-value=\"map\"\]'\)\?\.dispatchEvent\(new MouseEvent\('click', \{bubbles: true\}\)\);\s*loadImageryMut\.mutate\(\{ dataSource: \"custom\", customAssetId: linkUrl \}\);"
new2 = """setActiveTab("map"); loadImageryMut.mutate({ dataSource: "custom", customAssetId: linkUrl });"""
text = re.sub(old2, new2, text)

with open('c:/Users/user/Documents/blacportal/artifacts/geoportal/src/pages/SampleDigitizationPage.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print('Done!')
