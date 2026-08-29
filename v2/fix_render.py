import re

with open("index.html", "r", encoding="utf-8") as f:
    content = f.read()

lines = content.split('\n')

# Find renderHome function and fix issues
in_render_home = False
fixed = False
for i, line in enumerate(lines):
    if 'function renderHome()' in line:
        in_render_home = True
        print(f"Found renderHome at line {i}")
    if in_render_home and 'card-title' in line and '<br>' in line:
        print(f"Found problematic line {i}: {line[:80]}")
        lines[i] = line.replace('<br>', ', ').replace(
            '<div class="card-title">',
            '<div class="card-title" style="font-family:\'Poppins\';font-size:20px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'
        )
        fixed = True
        print(f"Fixed to: {lines[i][:120]}")
    if in_render_home and line.strip() == '}' and i > 367:
        in_render_home = False

if fixed:
    content = '\n'.join(lines)
    with open("index.html", "w", encoding="utf-8") as f:
        f.write(content)
    print("File saved with fixes")
else:
    print("No fix needed or pattern not found")
