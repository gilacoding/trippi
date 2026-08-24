#!/usr/bin/env python3
"""Fix the escaped newline in m45_browser_e2e.py line 236."""
path = ".agent/tests/m45_browser_e2e.py"
with open(path, "r") as f:
    lines = f.readlines()

# Line 236 (0-indexed: 235)
old_line = lines[235]
print(f"Old line 236: {repr(old_line)}")

# Replace the double-backslash + n with single backslash + n
lines[235] = old_line.replace("\\\\\\\\n", "\\\\n")
print(f"New line 236: {repr(lines[235])}")

with open(path, "w") as f:
    f.writelines(lines)
print("✅ Fixed")
