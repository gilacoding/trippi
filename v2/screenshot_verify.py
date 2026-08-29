#!/usr/bin/env python3
"""Screenshot all v2 screens for verification against Penpot PNG assets."""

import subprocess, os, json, time, urllib.request, sys

def kill_chrome():
    subprocess.run(["taskkill", "/F", "/IM", "chrome.exe"], capture_output=True)
    time.sleep(1)

def start_chrome(port=9222, profile_dir=None):
    if not profile_dir:
        profile_dir = f"C:\\Users\\ASUS\\AppData\\Local\\Temp\\chrome_verify_{int(time.time())}"
    cmd = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        f"--remote-debugging-port={port}",
        f"--user-data-dir={profile_dir}",
        "file:///D:/HERMES%20WORKS/TRIPPi/TRIPPY/trippi-deploy/v2/index.html"
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(3)
    return proc, profile_dir

def find_page(port=9222):
    for _ in range(5):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=3) as resp:
                pages = json.loads(resp.read().decode())
                for p in pages:
                    # Match by URL being file:// or title containing MarkiCab
                    url = p.get("url", "")
                    title = p.get("title", "")
                    if url.startswith("file:///D:/HERMES") or "MarkiCab" in title:
                        return p["id"], url
        except Exception:
            time.sleep(0.5)
    return None, None

def eval_js(page_id, js_code, port=9222):
    payload = json.dumps({
        "id": 1,
        "method": "Runtime.evaluate",
        "params": {"expression": js_code, "returnByValue": False}
    }).encode()
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/json",
        data=payload, method="POST",
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read().decode())

def take_screenshot(page_id, output_path, port=9222):
    payload = json.dumps({
        "id": 2,
        "method": "Page.getScreenshot",
        "params": {"format": "png", "captureBeyondViewport": True, "fromSurface": True}
    }).encode()
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/json",
        data=payload, method="POST",
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = resp.read()
        with open(output_path, "wb") as f:
            f.write(data)
        return len(data)

def main():
    kill_chrome()
    proc, profile = start_chrome()
    
    try:
        page_id, page_url = find_page()
        if not page_id:
            print("ERROR: Could not connect to Chrome")
            return 1
        
        print(f"Connected to MarkiCab page: {page_url}")
        
        screens = [
            ("screenHome", "home"),
            ("screenProfile", "profile"),
            ("CreateTripModal", "create-trip"),
            ("screenPlanner", "planner"),
            ("screenJourney", "journey"),
            ("screenHistory", "history"),
            ("DeleteConfirmModal", "delete-confirm"),
        ]
        
        results = []
        for screen_id, name in screens:
            print(f"\n--- {name} ({screen_id}) ---")
            
            # Show target screen, hide others
            if screen_id == "CreateTripModal":
                js = """
                document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
                document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.add('hidden'));
                document.getElementById('createTripModal').classList.remove('hidden');
                """
            elif screen_id == "DeleteConfirmModal":
                js = """
                document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
                document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.add('hidden'));
                document.getElementById('deleteModal').classList.remove('hidden');
                """
            elif screen_id == "screenProfile":
                js = """
                document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
                document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.add('hidden'));
                document.getElementById('screenProfile').classList.add('active');
                """
            else:
                js = f"""
                document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
                document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.add('hidden'));
                document.getElementById('{screen_id}').classList.add('active');
                """
            
            eval_js(page_id, js)
            time.sleep(0.3)
            
            output = f"C:/Users/ASUS/AppData/Local/Temp/v2_{name}.png"
            size = take_screenshot(page_id, output)
            print(f"Saved: {output} ({size} bytes)")
            results.append((name, output, size))
        
        print(f"\n=== Summary: {len(results)} screenshots ===")
        for name, path, size in results:
            print(f"  {name}: {size} bytes")
        
    finally:
        proc.terminate()
        proc.wait(timeout=5)
        kill_chrome()
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
