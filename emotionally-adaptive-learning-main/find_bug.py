import os
import re

def main():
    src_dir = 'src'
    # Pattern: something that looks like text followed by />
    # But not preceded by <
    pattern = re.compile(r'(?<!<)([A-Za-z0-9])\s*/>')
    
    for root, dirs, files in os.walk(src_dir):
        for file in files:
            if file.endswith('.tsx'):
                path = os.path.join(root, file)
                with open(path, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                
                for i, line in enumerate(lines):
                    if pattern.search(line):
                        print(f"Found in {path}:{i+1} -> {line.strip()}")

if __name__ == '__main__':
    main()
