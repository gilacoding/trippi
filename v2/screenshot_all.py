import subprocess, time, os, urllib.request, json

chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
profile = r"C:\Users\ASUS\AppData\Local\Temp\chrome_v2_verify"

# Kill existing
subprocess.run(["taskkill", "/F", "/IM", "chrome.exe"], capture_output=True)
time.sleep(1)

# Start Chrome
proc = subprocess.Popen([
    chrome,
    "--remote-debugging-port=9222",
    f"--user-data-dir={profile}",
    "file:///D:/HERMES%20WORKS/TRIPPi/TRIPPY/trippi-deploy/v2/index.html"
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

time.sleep(3)

screenshots = {}

for screen_id in ["screenHome", "screenProfile", "CreateTrip", "Planner", "Journey", "History", "DeleteConfirm"]:
    # Open page and modify active class
    try:
        req = urllib.request.Request("http://127.0.0.1:9222/json")
        with urllib.request.urlopen(req, timeout=5) as resp:
            pages = json.loads(resp.read().decode())
        
        # Find the MarkiCab page
        target = None
        for p in pages:
            if "MarkiCab" in p.get("title", ""):
                target = p
                break
        
        if not target:
            print(f"No MarkiCab page found for {screen_id}")
            continue
        
        page_id = target["id"]
        
        # Use CDP to execute JS that shows the target screen and takes screenshot
        ws_url = f"ws://127.0.0.1:9222/devtools/page/{page_id}"
        
        # For simplicity, use the CDP HTTP endpoint
        # Navigate to a data URL that has the screen shown
        js_code = f"""
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('{screen_id}').classList.add('active');
        document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.add('hidden'));
        """
        
        if screen_id == "CreateTrip":
            js_code = """
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.add('hidden'));
            document.getElementById('createTripModal').classList.remove('hidden');
            """
        elif screen_id == "DeleteConfirm":
            js_code = """
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.add('hidden'));
            document.getElementById('deleteModal').classList.remove('hidden');
            """
        
        cdp_req = urllib.request.Request(
            f"http://127.0.0.1:9222/json",
            data=json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": js_code}}).encode(),
            method="POST",
            headers={"Content-Type": "application/json"}
        )
        
        try:
            with urllib.request.urlopen(cdp_req, timeout=5) as resp:
                result = json.loads(resp.read().decode())
                if result.get("result", {}).get("error"):
                    print(f"JS error for {screen_id}: {result['result']['error']}")
        except Exception as e:
            print(f"CDP eval error for {screen_id}: {e}")
        
        time.sleep(0.5)
        
        # Get screenshot via CDP
        cdp_screenshot = json.dumps({
            "id": 2,
            "method": "Page.getScreenshot",
            "params": {"format": "png", "captureBeyondViewport": True}
        }).encode()
        
        screenshot_req = urllib.request.Request(
            f"http://127.0.0.1:9222/json",
            data=cdp_screenshot,
            method="POST",
            headers={"Content-Type": "application/json"}
        )
        
        try:
            with urllib.request.urlopen(screenshot_req, timeout=10) as resp:
                png_data = resp.read()
                if png_data:
                    path = f"C:/Users/ASUS/AppData/Local/Temp/v2_{screen_id}.png"
                    with open(path, 'wb') as f:
                        f.write(png_data)
                    screenshots[screen_id] = path
                    print(f"Screenshot {screen_id}: {len(png_data)} bytes")
                else:
                    print(f"Empty screenshot for {screen_id}")
        except Exception as e:
            print(f"Screenshot error for {screen_id}: {e}")
            
    except Exception as e:
        print(f"Error for {screen_id}: {e}")

proc.terminate()
proc.wait(timeout=5)

print(f"\nTotal screenshots: {len(screenshots)}")
for name, path in screenshots.items():
    print(f"  {name}: {path} ({os.path.getsize(path)} bytes)")
