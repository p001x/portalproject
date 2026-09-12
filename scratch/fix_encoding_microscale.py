import os

filepath = r"c:\Users\user\Documents\blacportal\artifacts\geoportal\src\pages\MicroScalePage.tsx"

with open(filepath, 'rb') as f:
    raw = f.read()

text = None
if raw.startswith(b'\xff\xfe') or (len(raw) > 2 and raw[1] == 0 and raw[3] == 0):
    text = raw.decode('utf-16le', errors='replace')
else:
    text = raw.decode('utf-8', errors='replace')

if text.startswith('\ufeff'):
    text = text[1:]

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(text)

print("Done restoring encoding for MicroScalePage.tsx")
