import os
import subprocess

def run_cmd(cmd):
    print(f"Running: {cmd}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    print("STDOUT:", result.stdout)
    if result.stderr:
        print("STDERR:", result.stderr)

run_cmd("git add .")
run_cmd("git commit -m \"Fix password reset email SMTP configuration and add better error messages\"")
run_cmd("git push")
