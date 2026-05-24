import re

with open(r"D:\_LINE BOT\_C3_PRO\src\web\index.html", "r", encoding="utf-8") as f:
    html = f.read()

# Pattern to find all div and template tags, supporting multiline
pattern = re.compile(r'<(/?)(div|template)\b[^>]*>', re.IGNORECASE | re.DOTALL)

# Let's count newlines up to each match to get line number
def get_line_num(pos):
    return html[:pos].count('\n') + 1

# Find start and end within admin section
start_match = re.search(r'<template x-if="currentMode === \'admin\'">', html)
end_match = re.search(r'<!-- ================= STUDENT BINDING PORTAL', html)

start_pos = start_match.start()
end_pos = end_match.start()

stack = []
matches = list(pattern.finditer(html, start_pos, end_pos))

print(f"{'Line':6s} | {'TagType':10s} | {'Action':8s} | Stack Depth | Details")
print("-" * 85)

for m in matches:
    raw = m.group(0)
    is_close = bool(m.group(1))
    tag_name = m.group(2).lower()
    line_num = get_line_num(m.start())
    
    # Normalize multiline raw for display
    display_raw = " ".join(raw.split())
    if len(display_raw) > 50:
        display_raw = display_raw[:47] + "..."
        
    if is_close:
        if stack and stack[-1][1] == tag_name:
            op_line, op_name, op_raw = stack.pop()
            print(f"{line_num:6d} | {tag_name:10s} | CLOSE    | {len(stack):11d} | Closed <{tag_name}> from line {op_line}")
        else:
            print(f"{line_num:6d} | {tag_name:10s} | MISMATCH | {len(stack):11d} | Unmatched </{tag_name}>: {display_raw}")
    else:
        stack.append((line_num, tag_name, raw))
        print(f"{line_num:6d} | {tag_name:10s} | OPEN     | {len(stack):11d} | Opened <{tag_name}>: {display_raw}")

print("-" * 85)
if stack:
    print("Unclosed tags remaining on stack:")
    for op_line, op_name, op_raw in stack:
        display_raw = " ".join(op_raw.split())
        if len(display_raw) > 60:
            display_raw = display_raw[:57] + "..."
        print(f"  Line {op_line:4d} (<{op_name}>): {display_raw}")
else:
    print("All tags matched successfully!")
