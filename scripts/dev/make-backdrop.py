"""Draws the desktop backdrop (img/backdrop.webp): a night stadium, out of focus, made only from shapes and noise.
No photo is used, so there is nothing to license.   python3 scripts/dev/make-backdrop.py"""
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
W, H = 1920, 1200
rng = np.random.default_rng(11)
A = lambda im: np.asarray(im, dtype=np.float32)
def blur(a, r): return A(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)))
def noise(scale, seed):
    r = np.random.default_rng(seed); small = r.random((H // scale + 2, W // scale + 2)).astype(np.float32) * 255
    return A(Image.fromarray(small.astype(np.uint8)).resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(scale / 2))) / 255
y = np.linspace(0, 1, H, dtype=np.float32)[:, None]; x = np.linspace(0, 1, W, dtype=np.float32)[None, :]
lerp = lambda a, b, t: np.array(a, np.float32) * (1 - t)[..., None] + np.array(b, np.float32) * t[..., None]
HZ = .60   # where the pitch starts

# 1. sky: deep teal, lighter and hazier toward the lights and the horizon
t = np.clip(y / HZ, 0, 1) * np.ones_like(x)
sky = lerp((3, 34, 44), (16, 92, 108), t ** 1.1)
cl = noise(170, 1) * .6 + noise(60, 2) * .4
sky *= (0.30 + 1.25 * cl ** 1.4)[..., None]
img = sky

# 2. floodlight banks, bloomed
L = Image.new('RGB', (W, H)); d = ImageDraw.Draw(L)
for cx, cy, n, s, tilt in ((.10, .13, 7, 13, .25), (.36, .20, 8, 12, .12), (.63, .15, 8, 13, -.10), (.90, .22, 7, 12, -.22), (.50, .05, 5, 9, 0)):
    for r in range(3):
        for c in range(n):
            px = cx * W + (c - n / 2) * s * 3.1 + r * 6; py = cy * H + r * s * 2.3 + (c - n / 2) * s * 3.1 * tilt
            if rng.random() < .1: continue
            d.ellipse((px - s * 1.25, py - s * .8, px + s * 1.25, py + s * .8), fill=(255, 244, 222))
La = A(L)
img = img + blur(La, 15) * 1.25 * np.array([1, .93, .78]) + blur(La, 50) * 1.5 * np.array([.85, 1, 1.0]) + blur(La, 160) * 2.4 * np.array([.45, .95, 1.0])

# 3. upper stand and roof: a dark curved band with a lit rim
curve = .40 + .05 * (2 * (x - .5)) ** 2
band = np.clip((y - curve) / .012, 0, 1) * np.clip((HZ - .02 - y) / .02, 0, 1)
img = img * (1 - .80 * band)[..., None] + lerp((4, 26, 34), (7, 40, 46), np.clip((y - curve) / .2, 0, 1) * np.ones_like(x)) * (.80 * band)[..., None]
rim = np.exp(-((y - curve) / .004) ** 2); img += rim[..., None] * np.array([40, 110, 120])

# 4. the crowd: thousands of tiny lights, and the ad boards along the touchline
C = np.zeros((H, W, 3), np.float32); n = 9000
xs = rng.integers(0, W, n); ys = (rng.uniform(.44, HZ - .035, n) * H).astype(int)
cols = np.array([(255, 255, 255), (255, 210, 150), (255, 120, 90), (150, 220, 255), (255, 255, 200)], np.float32)
C[ys, xs] = cols[rng.integers(0, len(cols), n)] * rng.uniform(.25, 1, (n, 1))
C *= (ys.reshape(-1)[0] * 0 + 1)
img += blur(C, 2.2) * 5.5 * np.clip((y - curve) / .03, 0, 1)[..., None]
B = Image.new('RGB', (W, H)); d = ImageDraw.Draw(B); px = 0
while px < W:
    w = int(rng.uniform(60, 190)); c = [(170, 30, 40), (230, 230, 235), (20, 70, 150), (200, 150, 30), (30, 120, 90)][int(rng.integers(0, 5))]
    d.rectangle((px, (HZ - .030) * H, px + w - 6, (HZ - .006) * H), fill=c); px += w
img = img * (1 - (blur(A(B), 3).max(2, keepdims=True) > 8) * .55) + blur(A(B), 5) * .55

# 5. everything so far is far away: out of focus
img = blur(img, 8)

# 6. the pitch: bright under the lights at the far side, darker toward the camera, with mowing stripes
p = np.clip((y - HZ) / (1 - HZ), 0, 1) * np.ones_like(x)
depth = 0.10 + p * 1.6
stripe = (np.sin((x - .5) / depth * 30) > 0).astype(np.float32)
grass = lerp((66, 150, 62), (10, 52, 16), p ** .55)
grass *= (.86 + .14 * stripe)[..., None] * (.82 + .36 * noise(8, 5))[..., None]
grass += (np.exp(-(p / .09) ** 2) * (.6 + .4 * noise(120, 6)))[..., None] * np.array([70, 110, 80])   # haze where pitch meets the boards
m = np.clip((y - HZ) / .006, 0, 1) * np.ones_like(x)
img = img * (1 - m)[..., None] + blur(grass, 5) * m[..., None]

# 7. grass blades in front of the lens
G = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(G, 'RGBA')
for layer, (cnt, y0, hmin, hmax, wd, bl) in enumerate(((2600, .80, 40, 120, 3, 3.5), (2200, .88, 70, 200, 5, 1.8), (1500, .97, 110, 300, 8, 0))):
    T = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dt = ImageDraw.Draw(T)
    for _ in range(cnt):
        bx = rng.uniform(-40, W + 40); by = H * rng.uniform(y0, 1.06); h = rng.uniform(hmin, hmax); lean = rng.normal(0, .28) * h
        g = rng.uniform(.25, 1); c = (int(10 + 50 * g), int(46 + 110 * g), int(14 + 34 * g), 255)
        dt.polygon([(bx - wd, by), (bx + wd, by), (bx + lean * .55 + wd * .4, by - h * .6), (bx + lean, by - h)], fill=c)
    if bl: T = T.filter(ImageFilter.GaussianBlur(bl))
    G.paste(T, (0, 0), T)
img = A(G)

# 8. sink the bottom into the page colour so the page can carry on below the picture, then vignette and grain
page = np.array([6, 24, 10], np.float32)
f = np.clip((y - .70) / .30, 0, 1) ** 1.2 * np.ones_like(x)
img = img * (1 - f * .93)[..., None] + page * (f * .93)[..., None]
v = 1 - .42 * np.clip(((x - .5) ** 2 * 2.6 + (y - .42) ** 2 * 1.2), 0, 1)
img = img * v[..., None] + rng.normal(0, 1.8, (H, W, 1))
Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save('img/backdrop.webp', quality=72, method=6)
