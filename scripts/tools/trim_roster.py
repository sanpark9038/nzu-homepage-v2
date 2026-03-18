path = r"c:\Users\NZU03\Downloads\nzu-homepage\nzu_roster.html"
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

output = []
recording = False
for line in lines:
    if "<tbody>" in line:
        recording = True
    if recording:
        output.append(line)
    if "</tbody>" in line:
        break

with open(path, "w", encoding="utf-8") as f:
    f.writelines(output)
print(f"[*] Trimmed file. {len(output)} lines preserved.")
