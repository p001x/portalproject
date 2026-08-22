import concurrent.futures
import time

def worker(i):
    try:
        with open("test.bin", "r+b") as f:
            f.seek(i * 10)
            f.write(b"1234567890")
            print(f"Thread {i} wrote successfully.")
    except Exception as e:
        print(f"Thread {i} failed: {e}")

with open("test.bin", "wb") as f:
    f.write(b"\0" * 40)

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
    futures = [executor.submit(worker, i) for i in range(4)]
    for f in futures:
        f.result()
