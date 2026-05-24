import re

with open(r"D:\_LINE BOT\_C3_PRO\src\web\index.html", "r", encoding="utf-8") as f:
    html = f.read()

start_match = re.search(r'<template x-if="currentMode === \'admin\'">', html)
end_match = re.search(r'<!-- ================= STUDENT BINDING PORTAL', html)

start_pos = start_match.start()
end_pos = end_match.start()

admin_html = html[start_pos:end_pos]
lines = html.splitlines()
start_line = html[:start_pos].count('\n') + 1

pattern = re.compile(r'<(div|/div|template|/template)\b[^>]*>', re.IGNORECASE)

stack = []
for i, line in enumerate(lines[start_line - 1 : html[:end_pos].count('\n') + 1]):
    line_num = start_line + i
    for match in pattern.finditer(line):
        tag = match.group(1).lower()
        if tag.startswith('/'):
            opening_tag = tag[1:]
            if stack and stack[-1][1] == opening_tag:
                op_line, op_tag, op_raw = stack.pop()
                if op_line in (251, 252, 277, 929):
                    print(f"Line {line_num} closed {op_tag} opened on line {op_line}")
            else:
                print(f"Line {line_num} has mismatched closing tag: {match.group(0)}")
        else:
            stack.append((line_num, tag, match.group(0)))
            if line_num in (251, 252, 277, 929):
                print(f"Line {line_num} opened {tag}: {match.group(0)}")
