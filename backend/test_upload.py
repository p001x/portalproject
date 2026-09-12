import requests
import json

url = "http://127.0.0.1:8000/api/academy/books/upload"
# We don't have a valid token, but a 401 Unauthorized would mean auth failed.
# A 422 Unprocessable Entity means validation failed BEFORE auth (or auth is valid but body invalid, but Depends evaluates in order, usually body is parsed first or auth is parsed first depending on definition).
# Actually if we send no token, it might 401. Let's get a token.
# To bypass, we can just look at the validation error.

files = {'file': ('test.pdf', b'fake pdf data', 'application/pdf')}
data = {
    'title': 'Test Title',
    'author': 'Unknown',
    'pages': 0,
    'description': ''
}

response = requests.post(url, data=data, files=files)
print("Status Code:", response.status_code)
print("Response:", response.text)
