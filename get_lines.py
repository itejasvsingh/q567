with open('app.js', 'r') as f:
    lines = f.readlines()
for i, line in enumerate(lines):
    if "let hasClasses = false;" in line:
        print(f"Start: {i+1}")
    if "if (!hasClasses) {" in line:
        print(f"End block starts: {i+1}")
