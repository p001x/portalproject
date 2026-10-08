lines = open('backend/main.py', encoding='utf-8').read().split('\n')
for i, line in enumerate(lines):
    if '@app.post("/api/air-pollution' in line:
        print(f"Found at {i}: {line}")
        for j in range(i, i+30):
            print(f"{j}: {lines[j]}")
        break
