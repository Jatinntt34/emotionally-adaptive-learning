import io

files = ['train_facial.py', 'train_voice.py']

for fname in files:
    with io.open(fname, 'r', encoding='utf-8') as f:
        txt = f.read()

    # Build a clean ASCII-only version — replace EVERY non-ASCII char
    result = []
    for ch in txt:
        code = ord(ch)
        if code <= 127:
            result.append(ch)
        elif code == 0x2013 or code == 0x2014:  # en-dash, em-dash
            result.append('--')
        elif code == 0x2192:   # right arrow
            result.append('-->')
        elif code == 0x2190:   # left arrow
            result.append('<--')
        elif code == 0x2713 or code == 0x2714:  # checkmarks
            result.append('[OK]')
        elif code == 0x2705:   # green checkmark
            result.append('[DONE]')
        elif code == 0x274C:   # red X
            result.append('[ERROR]')
        elif code == 0x2019 or code == 0x2018:  # smart quotes
            result.append("'")
        elif code == 0x201C or code == 0x201D:  # smart double quotes
            result.append('"')
        elif code == 0x2026:   # ellipsis
            result.append('...')
        elif code == 0x00e9:   # e with accent
            result.append('e')
        elif code == 0x00E0:   # a grave
            result.append('a')
        elif code == 0x2190:
            result.append('<--')
        elif code == 0x25BA:   # right-pointing pointer
            result.append('>')
        else:
            # For any other unicode (like arrows in comments), just skip
            result.append(' ')

    cleaned = ''.join(result)

    # Verify
    bad = [c for c in cleaned if ord(c) > 127]
    print(f"[DONE] {fname} -- non-ASCII remaining: {len(bad)}")
    if bad:
        print(f"  Still has: {set(bad)}")

    with io.open(fname, 'w', encoding='utf-8') as f:
        f.write(cleaned)
