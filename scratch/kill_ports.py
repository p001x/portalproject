import psutil
import time

def kill_port(port):
    killed = False
    for conn in psutil.net_connections():
        if conn.laddr.port == port:
            print(f"Found process {conn.pid} on port {port}. Killing...")
            try:
                p = psutil.Process(conn.pid)
                p.kill()
                killed = True
            except Exception as e:
                print(f"Failed to kill: {e}")
    return killed

if __name__ == "__main__":
    kill_port(8001)
    kill_port(5000)
    time.sleep(2)
    print("Done")
