#!/usr/bin/env python3
"""Fix double-escaped newline in m45_browser_e2e.py."""
path = ".agent/tests/m45_browser_e2e.py"
with open(path, "r") as f:
    content = f.read()

# The file has: print(\"\\n=== S2: Member consent banner
# (where \\n = backslash-backslash-n in the actual file)
# We want: print(\"\n=== S2: Member consent banner
# (where \n = backslash-n in the actual file, which Python interprets as newline)
content = content.replace('print("\\n=== S2: Member consent banner', 'print("\n=== S2: Member consent banner')

with open(path, "w") as f:
    f.write(content)
print("Done")
