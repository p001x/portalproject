with open('c:/Users/user/Documents/blacportal/artifacts/geoportal/src/pages/FloodPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the maps array typing
content = content.replace(
'''          ...Object.entries(data.factor_maps).map(
            ([key, fm]) => [fm.label, fm.thumb_url] as [string, string]
          )
        ]''',
'''          ...Object.entries(data.factor_maps).map(
            ([key, fm]) => [fm.label, fm.thumb_url] as [string, string]
          )
        ] as [string, string][]''')

with open('c:/Users/user/Documents/blacportal/artifacts/geoportal/src/pages/FloodPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
