import re

with open(r"D:\_LINE BOT\_C3_PRO\src\web\index.html", "r", encoding="utf-8") as f:
    html = f.read()

# Let's locate the admin template start and end
# Admin panel starts with: <template x-if="currentMode === 'admin'">
# Ends with: </template> followed by <!-- ================= STUDENT BINDING PORTAL

start_match = re.search(r'<template x-if="currentMode === \'admin\'">', html)
end_match = re.search(r'<!-- ================= STUDENT BINDING PORTAL', html)

if not start_match or not end_match:
    print("Could not find start or end matches")
    exit(1)

start_pos = start_match.start()
end_pos = end_match.start()

admin_html = html[start_pos:end_pos]

# Let's tokenize tags in admin_html
# We are interested in <div, </div, <template, </template
tokens = []
pattern = re.compile(r'<(div|/div|template|/template)\b[^>]*>', re.IGNORECASE)

# Split admin_html into lines to track line numbers
lines = html.splitlines()
start_line = html[:start_pos].count('\n') + 1

for i, line in enumerate(lines[start_line - 1 : html[:end_pos].count('\n') + 1]):
    line_num = start_line + i
    for match in pattern.finditer(line):
        tag = match.group(1).lower()
        tokens.append((line_num, tag, match.group(0)))

# Print tokens and trace stack
stack = []
print(f"{'Line':6s} | {'Action':8s} | {'Tag':10s} | Stack Depth | Current Stack Openers")
print("-" * 80)
for line_num, tag, raw in tokens:
    if tag.startswith('/'):
        # Closing tag
        opening_tag = tag[1:]
        if stack and stack[-1][1] == opening_tag:
            op_line, op_tag, op_raw = stack.pop()
            print(f"{line_num:6d} | CLOSE    | {raw:10s} | {len(stack):11d} | Closed tag from line {op_line}")
        else:
            print(f"{line_num:6d} | MISMATCH | {raw:10s} | {len(stack):11d} | Unmatched closing tag!")
    else:
        # Opening tag
        stack.append((line_num, tag, raw))
        print(f"{line_num:6d} | OPEN     | {raw:10s} | {len(stack):11d} | Openers: {[x[0] for x in stack]}")

print("-" * 80)
if stack:
    print("Unclosed tags remaining on stack:")
    for op_line, op_tag, op_raw in stack:
        print(f"  Line {op_line}: {op_raw}")
else:
    print("All tags matched successfully in token stream!")
