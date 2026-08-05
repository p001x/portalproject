with open('c:/Users/user/Documents/blacportal/artifacts/geoportal/src/pages/FloodPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
'''        maps: [
          ["Flood Susceptibility Index", data.thumb_url],
          ["Classified Flood Risk", data.classify.panels[0].thumb_url],''',
'''        maps: [
          ["Flood Susceptibility Index", data.thumb_url] as [string, string],
          ["Classified Flood Risk", data.classify.panels[0].thumb_url] as [string, string],''')

with open('c:/Users/user/Documents/blacportal/artifacts/geoportal/src/pages/FloodPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
