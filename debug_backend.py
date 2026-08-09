import subprocess
import os

backend_dir = os.path.abspath("backend")
venv_python = os.path.abspath(os.path.join(".venv", "Scripts", "python.exe"))

print("Running uvicorn to capture crash logs...")
cmd = [venv_python, "-m", "uvicorn", "main:app", "--port", "8001"]

with open("backend_crash.log", "w") as f:
    process = subprocess.Popen(cmd, cwd=backend_dir, stdout=f, stderr=subprocess.STDOUT)
    process.wait()

print("Backend exited. Crash log written to backend_crash.log")
