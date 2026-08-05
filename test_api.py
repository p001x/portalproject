import urllib.request
import json

try:
    req = urllib.request.urlopen('http://127.0.0.1:8001/api/datasets?source=admin')
    res = req.read().decode('utf-8')
    with open('test_api.txt', 'w') as f:
        f.write(res)
except Exception as e:
    with open('test_api.txt', 'w') as f:
        f.write(str(e))
