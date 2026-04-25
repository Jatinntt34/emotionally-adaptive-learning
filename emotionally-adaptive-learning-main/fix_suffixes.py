import os
import re

def fix_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Regex to find ' />' that is likely a corruption
    # Pattern: a word or closing bracket followed by ' />'
    # and NOT followed by a newline or end of string if it's inside a tag?
    # Actually, if it's 'DASHBOARD />', it matches \w+ />
    
    # Let's be surgical.
    corruptions = [
        r'INITIALIZE ACCESS />',
        r'Privacy />',
        r'OSINT />',
        r'Neural Net />',
        r'Neutral Entry />',
        r'SIGN IN />',
        r'CREATE ACCOUNT />',
        r'Neural Address />',
        r'Access Cipher />',
        r'Complete Module />'
    ]
    
    new_content = content
    for c in corruptions:
        fixed = c.replace(' />', '')
        new_content = new_content.replace(c, fixed)
    
    if new_content != content:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        return True
    return False

def main():
    src_dir = 'src'
    fixed_count = 0
    for root, dirs, files in os.walk(src_dir):
        for file in files:
            if file.endswith(('.tsx', '.ts')):
                path = os.path.join(root, file)
                if fix_file(path):
                    print(f"Fixed {path}")
                    fixed_count += 1
    print(f"Total files fixed: {fixed_count}")

if __name__ == '__main__':
    main()
