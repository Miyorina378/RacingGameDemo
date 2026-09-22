import sys
import os
import json
import socket

def run_in_blender(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        code = f.read()

    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(120.0)
    try:
        s.connect(("127.0.0.1", 9876))
        req = {
            "type": "execute",
            "strict_json": True,
            "code": code
        }
        s.sendall(json.dumps(req).encode("utf-8") + b"\x00")

        data = b""
        while True:
            chunk = s.recv(8192)
            if not chunk:
                break
            data += chunk
            if b"\x00" in chunk:
                break

        cleaned = data.split(b"\x00")[0].decode("utf-8", errors="replace")
        res = json.loads(cleaned)
        print(json.dumps(res, indent=2))
    finally:
        s.close()

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else r"d:\trifilpla\scripts\build_accord_2026.py"
    run_in_blender(target)
