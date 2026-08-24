#!/usr/bin/env python3
"""Fix the escaped newline in m45_browser_e2e.py line 236."""
path = ".agent/tests/m45_browser_e2e.py"
with open(path, "r") as f:
    lines = f.readlines()

old_line = lines[235]
print(f"Old line 236: {repr(old_line)}")

# The file has literal backslash characters: print(\"<backslash><backslash>n===
# We want: print(\"<backslash>n===
# In Python repr, backslash is \\. So file repr has \\\\\\\\n = 4 chars: \ \
# We want \\\\n in repr = 2 chars: \ + n
lines[235] = old_line.replace("\\\\", "\\")
print(f"New line 236: {repr(lines[235])}")

with open(path, "w") as f:
    f.writelines(lines)
print("Done")
