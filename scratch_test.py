import urllib.request
import json

BASE_URL = 'http://127.0.0.1:8001'

def post_json(endpoint, payload):
    url = f'{BASE_URL}{endpoint}'
    print(f'--- Testing {endpoint} ---')
    try:
        body = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=body, headers={'Content-Type': 'application/json'}, method='POST')
        with urllib.request.urlopen(req, timeout=30) as res:
            data = json.loads(res.read().decode('utf-8'))
            print('Success')
    except urllib.error.HTTPError as e:
        print(f'HTTP ERROR: {e.code}')
        print(f'BODY: {e.read().decode("utf-8")}')
    except Exception as e:
        print(f'ERROR: {e}')

post_json('/api/ndvi', {'district': 'Gasabo', 'start_date': '2024-01-01', 'end_date': '2024-06-30', 'n_classes': 5})
