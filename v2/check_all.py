import subprocess, os, re

chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
path = r"D:\HERMES WORKS\TRIPPi\TRIPPY\trippi-deploy\v2/index.html"
url = "file://" + path.replace("\\", "/")
outfile = r"C:\Users\ASUS\AppData\Local\Temp\v2_all.png"

subprocess.run(["taskkill", "/F", "/IM", "chrome.exe"], capture_output=True)

# Screenshot
result = subprocess.run([
    chrome, "--headless=new", "--disable-gpu",
    f"-screenshot={outfile}",
    "--window-size=390,1200",
    url
], capture_output=True, timeout=30)

# DOM dump
result2 = subprocess.run([
    chrome, "--headless=new", "--disable-gpu",
    "--dump-dom",
    "--window-size=390,844",
    url
], capture_output=True, timeout=30)

output = result2.stdout.decode("utf-8", errors="replace")

print("Screenshot:", os.path.exists(outfile), os.path.getsize(outfile) if os.path.exists(outfile) else 0)
print("profile-section:", output.count("profile-section"))
print("modal-backdrop:", output.count("modal-backdrop"))
print("screen active:", output.count("screen active"))

# Check each screen exists
for screen in ["screenHome", "screenProfile", "screenCreate", "screenPlanner", "screenHistory"]:
    found = f' id="{screen}"' in output
    print(f"{screen}: {found}")

# Check CSS
css_classes = re.findall(r"\.(\w+)\{", output)
important_classes = ["profile-section", "profile-card", "avatar", "badge", "fab", "status-badge"]
for cls in important_classes:
    print(f".{cls} exists: {cls in css_classes}")
