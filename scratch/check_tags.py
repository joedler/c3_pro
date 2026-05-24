with open(r"D:\_LINE BOT\_C3_PRO\src\web\index.html", "r", encoding="utf-8") as f:
    lines = f.readlines()

with open(r"D:\_LINE BOT\_C3_PRO\scratch\output.txt", "w", encoding="utf-8") as f_out:
    for line_num in range(910, 975):
        line = lines[line_num - 1]
        f_out.write(f"{line_num:4d}: {line.strip()}\n")
