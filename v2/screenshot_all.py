#!/usr/bin/env python3
"""Generate per-screen HTML versions for screenshot verification."""

import subprocess, os, sys, time, shutil

BASE_HTML = r"D:\HERMES WORKS\TRIPPi\TRIPPY\trippi-deploy\v2\index.html"
SCREENS = [
    ("screenHome", "home"),
    ("screenProfile", "profile"),
    ("createTripModal", "create-trip"),
    ("screenPlanner", "planner"),
    ("screenJourney", "journey"),
    ("screenHistory", "history"),
    ("deleteModal", "delete-confirm"),
]
SCREENS_WITH_SPLIT = {
    "home": "screenHome",
    "profile": "screenProfile", 
    "planner": "screenPlanner",
    "journey": "screenJourney",
    "history": "screenHistory",
}

def kill_chrome():
    subprocess.run(["taskkill", "/F", "/IM", "chrome.exe"], capture_output=True)
    time.sleep(1)

def screenshot_html(html_path, output_path, window_size="390,844"):
    """Open HTML file in Chrome headless and take screenshot."""
    url = "file:///" + html_path.replace("\\", "/")
    cmd = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        "--headless=new",
        "--disable-gpu", 
        f"--screenshot={output_path}",
        f"--window-size={window_size}",
        url
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
    if result.stderr:
        print(f"  Stderr: {result.stderr[:100]}")
    if os.path.exists(output_path):
        size = os.path.getsize(output_path)
        print(f"  Saved: {output_path} ({size} bytes)")
        return size
    else:
        print(f"  FAILED: no output file")
        return 0

def main():
    kill_chrome()
    
    with open(BASE_HTML, "r", encoding="utf-8") as f:
        base_content = f.read()
    
    results = []
    
    for screen_id, name in SCREENS:
        print(f"\n--- {name} ({screen_id}) ---")
        
        # Modify HTML to show only this screen
        modified = base_content
        
        # Remove active class from all screens, add to target
        # This is tricky because we need to handle both screen divs and modal divs
        
        # Find and modify the target element
        if screen_id.startswith("screen"):
            # It's a screen div - make it active
            target_pattern = f'class="screen"' + ('' if f'id="{screen_id}"' not in modified else '')
            # Find the div with this id and add active class
            import re
            modified = re.sub(
                f'(<div class="screen" id="{screen_id}")',
                f'<div class="screen active" id="{screen_id}"',
                modified
            )
            # Remove active from other screens
            for other_id in ["screenHome", "screenProfile", "screenPlanner", "screenJourney", "screenHistory", "screenGuest"]:
                if other_id != screen_id:
                    modified = re.sub(
                        f'(<div class="screen active" id="{other_id}")',
                        f'<div class="screen" id="{other_id}"',
                        modified
                    )
        elif screen_id.startswith("createTripModal") or screen_id.startswith("deleteModal"):
            # It's a modal - make it visible (remove hidden class)
            modified = re.sub(
                f'(<div class="modal-backdrop hidden" id="{screen_id}")',
                f'<div class="modal-backdrop" id="{screen_id}">',
                modified
            )
            # Also hide screens
            for sid in ["screenHome", "screenProfile", "screenPlanner", "screenJourney", "screenHistory", "screenGuest"]:
                modified = re.sub(
                    f'(<div class="screen active" id="{sid}")',
                    f'<div class="screen" id="{sid}"',
                    modified
                )
        
        # Write temp file
        temp_html = f"C:/temp/v2_{name}.html"
        with open(temp_html, "w", encoding="utf-8") as f:
            f.write(modified)
        
        # Take screenshot
        output = f"C:/temp/v2_{name}.png"
        size = screenshot_html(temp_html, output)
        results.append((name, output, size))
        
        # Clean up temp HTML
        try:
            os.remove(temp_html)
        except:
            pass
    
    kill_chrome()
    
    print(f"\n=== Summary: {len(results)} screenshots ===")
    for name, path, size in results:
        status = "PASS" if size > 0 else "FAIL"
        print(f"  {name}: {status} ({size} bytes)")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
