import time
import requests

start = time.time()
res = requests.post("http://127.0.0.1:8001/api/drought", json={
    "district": "Kayonza",
    "year": 2023,
    "n_classes": 5
})
print(f"Status: {res.status_code}")
if res.status_code != 200:
    print(res.text)
else:
    print("Success")
print(f"Time taken: {time.time() - start:.2f} seconds")
