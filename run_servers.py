import subprocess
import os
import sys

backend_dir = os.path.abspath("backend")
frontend_dir = os.path.abspath(os.path.join("artifacts", "geoportal"))
venv_python = os.path.abspath(os.path.join(".venv", "Scripts", "python.exe"))

print(f"Using Python: {venv_python}")
print(f"Backend directory: {backend_dir}")
print(f"Frontend directory: {frontend_dir}")

# Start FastAPI backend
backend_cmd = [venv_python, "-m", "uvicorn", "main:app", "--reload", "--host", "127.0.0.1", "--port", "8001"]
print(f"Launching backend: {' '.join(backend_cmd)}")
backend_proc = subprocess.Popen(backend_cmd, cwd=backend_dir, creationflags=subprocess.CREATE_NEW_CONSOLE)

# Start Vite frontend
env = os.environ.copy()
env["PORT"] = "5000"
env["BASE_PATH"] = "/"
frontend_cmd = ["cmd.exe", "/c", "npx.cmd", "vite", "--config", "vite.config.ts", "--port", "5000", "--host", "127.0.0.1"]
print(f"Launching frontend: {' '.join(frontend_cmd)}")
frontend_proc = subprocess.Popen(frontend_cmd, cwd=frontend_dir, env=env, creationflags=subprocess.CREATE_NEW_CONSOLE)

print("Servers spawned in separate consoles!")
print("Backend: http://localhost:8001")
print("Frontend: http://localhost:5000")
