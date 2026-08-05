import os
import sys
import time
import subprocess
import urllib.request
import json

root_dir = os.path.abspath(os.path.dirname(__file__))
backend_dir = os.path.join(root_dir, "backend")
frontend_dir = os.path.join(root_dir, "artifacts", "geoportal")
venv_python = os.path.join(root_dir, ".venv", "Scripts", "python.exe")

print(f"Root: {root_dir}")
print(f"Venv Python: {venv_python}")

# Kill any existing processes on ports 8001 and 5000
try:
    ps_cmd = "Get-NetTCPConnection -LocalPort 8001, 5000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
    subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], capture_output=True)
except Exception as e:
    print(f"Cleanup note: {e}")

time.sleep(1)

# Start Backend
backend_cmd = [venv_python, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8001"]
print("Starting backend server...")
backend_proc = subprocess.Popen(
    backend_cmd,
    cwd=backend_dir,
    creationflags=subprocess.CREATE_NEW_CONSOLE if os.name == 'nt' else 0
)

# Start Frontend
env = os.environ.copy()
env["PORT"] = "5000"
env["BASE_PATH"] = "/"
frontend_cmd = ["cmd.exe", "/c", "npx.cmd", "vite", "--config", "vite.config.ts", "--port", "5000", "--host", "127.0.0.1"]
print("Starting frontend server...")
frontend_proc = subprocess.Popen(
    frontend_cmd,
    cwd=frontend_dir,
    env=env,
    creationflags=subprocess.CREATE_NEW_CONSOLE if os.name == 'nt' else 0
)

print("Waiting 5 seconds for servers to warm up...")
time.sleep(5)

# Verify Backend
backend_ok = False
try:
    req = urllib.request.urlopen("http://localhost:8001/api/health", timeout=5)
    data = json.loads(req.read().decode())
    print(f"Backend status: {data}")
    backend_ok = True
except Exception as e:
    print(f"Backend check failed: {e}")

# Verify Frontend
frontend_ok = False
try:
    req = urllib.request.urlopen("http://localhost:5000", timeout=5)
    code = req.getcode()
    print(f"Frontend HTTP status code: {code}")
    if code == 200:
        frontend_ok = True
except Exception as e:
    print(f"Frontend check failed: {e}")

if backend_ok and frontend_ok:
    print("SUCCESS: Both Backend (8001) and Frontend (5000) are up and running!")
else:
    print(f"STATUS: backend_ok={backend_ok}, frontend_ok={frontend_ok}")
