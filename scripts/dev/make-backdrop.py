"""Draws the desktop backdrop (img/backdrop.webp): a blurred night-stadium mood made only from shapes and noise.
No photo is used, so there is nothing to license.   python3 scripts/dev/make-backdrop.py"""
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
W, H = 1600, 1000
rng = np.random.default_rng(7)
def layer(): return Image.new('RGB', (W, H), (0, 0, 0))
def add(a, b, k=1.0): return np.clip(a + np.asarray(b, dtype=np.float32) * k, 0, 255)

y = np.linspace(0, 1, H)[:, None]; x = np.linspace(0, 1, W)[None, :]
# night sky to pitch: near-black green, lifting to grass green at the bottom
base = np.zeros((H, W, 3), np.float32)
top = np.array([5, 11, 10]); mid = np.array([4, 14, 11]); bot = np.array([9, 46, 27])
t = np.clip(y / .62, 0, 1); u = np.clip((y - .62) / .38, 0, 1) ** 1.3
base[:] = top * (1 - t)[..., None] + mid * t[..., None]
base = base * (1 - u)[..., None] + bot * u[..., None]

# floodlight banks: rows of lamps top-left and top-right, bloomed
L = layer(); d = ImageDraw.Draw(L)
for cx, cy, tilt in ((.17, .10, -1), (.83, .10, 1), (.50, .035, 0)):
    for r in range(4):
        for c in range(9):
            px = cx * W + (c - 4) * 22 + r * 3 * tilt; py = cy * H + r * 17 + abs(c - 4) * 2
            s = 5 if tilt else 4
            d.ellipse((px - s, py - s, px + s, py + s), fill=(235, 245, 255) if tilt else (150, 170, 190))
img = add(base, L.filter(ImageFilter.GaussianBlur(7)), .55)
img = add(img, L.filter(ImageFilter.GaussianBlur(38)), 2.2)
img = add(img, L.filter(ImageFilter.GaussianBlur(120)), 5.0)

# the stands: a band of tiny out-of-focus lights
C = np.zeros((H, W), np.float32)
n = 2600; xs = rng.integers(0, W, n); ys = (rng.normal(.36, .075, n) * H).astype(int).clip(0, H - 1)
C[ys, xs] = rng.uniform(80, 255, n)
Ci = Image.fromarray(C.astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))
Cb = np.asarray(Ci, np.float32)[..., None] * np.array([.75, 1.0, .9])
img = np.clip(img + Cb * 2.6, 0, 255)
# upper tier shadow line and a faint roof edge
img *= (1 - .35 * np.exp(-((y - .50) / .03) ** 2))[..., None]

# the pitch: mowing stripes in perspective, then haze
P = np.zeros((H, W, 3), np.float32)
yy = np.clip((y - .60) / .40, 0, 1)
stripe = (np.sin((x - .5) / (0.25 + yy * 1.0) * 26) > 0).astype(np.float32)
g = (yy ** .8) * (0.75 + .25 * stripe)
P[..., 1] = g * 70; P[..., 0] = g * 14; P[..., 2] = g * 30
img = np.clip(img + np.asarray(Image.fromarray(P.astype(np.uint8)).filter(ImageFilter.GaussianBlur(14)), np.float32), 0, 255)
# green glow rising off the grass
img += (np.exp(-((y - 1.02) / .22) ** 2) * (1 - .5 * (x - .5) ** 2 * 4))[..., None] * np.array([6, 60, 30])

out = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(9))
a = np.asarray(out, np.float32)
# vignette and a little grain so the gradients don't band
v = 1 - .55 * np.clip(((x - .5) ** 2 * 2.2 + (y - .45) ** 2 * 1.6), 0, 1)
a = a * v[..., None] + rng.normal(0, 1.6, (H, W, 1))
Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save('img/backdrop.webp', quality=62, method=6)
