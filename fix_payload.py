with open('c:/Users/user/Documents/blacportal/artifacts/geoportal/src/pages/FloodPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('module_name:', 'moduleName:')
content = content.replace('date_range:', 'dateRange:')
content = content.replace('class_areas:', 'classAreas:')
content = content.replace('extra_notes:', 'extraNotes:')

with open('c:/Users/user/Documents/blacportal/artifacts/geoportal/src/pages/FloodPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
