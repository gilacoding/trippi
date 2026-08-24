#!/usr/bin/env python3
"""Fix escaped quotes in print statements."""
path = "D:/HERMES WORKS/TRIPPi/TRIPPY/trippi-deploy/.agent/tests/m45_browser_e2e.py"
with open(path, "rb") as f:
    content = f.read()

# Fix: print(\"  ...\") -> print("  ...")  — remove backslash before quote inside print
content = content.replace(b'print(\\\\\"', b'print("')

with open(path, "wb") as f:
    f.write(content)
print("done")
