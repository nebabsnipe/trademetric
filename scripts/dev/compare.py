"""Compares two folders of screenshots and lists any that differ.  python3 scripts/dev/compare.py <before> <after> [pattern]"""
import sys, glob, os
from PIL import Image, ImageChops
a, b = sys.argv[1], sys.argv[2]; pat = sys.argv[3] if len(sys.argv) > 3 else '*.png'; bad = 0; n = 0
for f in sorted(glob.glob(os.path.join(b, pat))):
    g = os.path.join(a, os.path.basename(f))
    if not os.path.exists(g): continue
    n += 1; x, y = Image.open(g).convert('RGB'), Image.open(f).convert('RGB')
    if x.size != y.size: print('SIZE', os.path.basename(f), x.size, y.size); bad += 1; continue
    box = ImageChops.difference(x, y).getbbox()
    if box: print('DIFF', os.path.basename(f), box); bad += 1
print(f'{n} compared, {bad} different')
