#!/usr/bin/env python3
"""Fix JavaScript operators and escape sequences in Python code."""
path = "D:/HERMES WORKS/TRIPPi/TRIPPY/trippi-deploy/.agent/tests/m45_browser_e2e.py"
with open(path, "rb") as f:
    content = f.read()

# Fix: journey_state === 'active' → journey_state == 'active'
content = content.replace(b"journey_state === 'active'", b"journey_state == 'active'")

# Fix: print(\"  Owner: Journey started\") → print("  Owner: Journey started")
content = content.replace(b'print(\"  Owner: Journey started\")', b'print("  Owner: Journey started")')

# Fix: print(f\"  Owner Start Journey... → print(f"  Owner Start Journey...
content = content.replace(b'print(f\\"  Owner Start Journey:', b'print(f"  Owner Start Journey:')

with open(path, "wb") as f:
    f.write(content)
print("✅ Fixed")
