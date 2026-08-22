import urllib.request
try:
    with urllib.request.urlopen('https://earthengine.googleapis.com', timeout=5) as response:
        print(response.status)
except Exception as e:
    print(f"Error: {e}")

try:
    import requests
    response = requests.get('https://earthengine.googleapis.com', timeout=5)
    print(f"requests status: {response.status_code}")
except Exception as e:
    print(f"requests error: {e}")
