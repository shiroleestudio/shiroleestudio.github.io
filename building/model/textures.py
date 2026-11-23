# 시로의 집 — 생성 텍스처 (build_house.py 가 부른다)
# 나뭇결·지붕널·회벽·돌·풀을 PIL + numpy 로 그려 glb 안에 WebP 로 넣는다. 손그림·사진 텍스처가 생기면 RECIPES 에서 그 그림으로 바꿔 끼운다.
# 3단계 그래픽 일신(2026-11-23, 두호: '8번 출구'급 실사 + 몽환): 색 지도만 있던 것을 PBR 세 벌로 — 색(1024²), 높이에서 만든 법선 지도,
# 거칠기(ORM: R=1, G=거칠기, B=0). 법선·거칠기는 색이 다른 변형끼리(log/log2 등) 한 벌을 같이 쓴다(FAMILY).
# 모든 텍스처는 이음새 없이 반복되고, 1 타일 = 건물 1 m 다(UV 는 build_house.py 의 상자 투영).
import math
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024          # 색 지도 한 변 (화소)
NSIZE = 1024         # 법선·거칠기 지도 한 변


def _hex(c):
    c = c.lstrip('#')
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def _shade(c, k):
    return tuple(max(0, min(255, int(round(v * k)))) for v in c)


# ---------------------------------------------------------------- 주기적 잡음 (numpy)
def _vnoise(rng, n, size):
    """격자 n×n 의 값 잡음을 size×size 로 부드럽게 키운 것(주기적 → 이음새 없음). 0..1"""
    g = rng.random((n, n))
    y = np.linspace(0, n, size, endpoint=False); x = y
    yi = np.floor(y).astype(int); xi = np.floor(x).astype(int)
    fy = (y - yi)[:, None]; fx = (x - xi)[None, :]
    fy = fy * fy * (3 - 2 * fy); fx = fx * fx * (3 - 2 * fx)
    a = g[yi[:, None] % n, xi[None, :] % n]; b = g[yi[:, None] % n, (xi[None, :] + 1) % n]
    c = g[(yi[:, None] + 1) % n, xi[None, :] % n]; d = g[(yi[:, None] + 1) % n, (xi[None, :] + 1) % n]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def _fbm(rng, size, n0=4, octaves=6, gain=0.5):
    out = np.zeros((size, size)); w = 1.0; n = n0; tot = 0
    for _ in range(octaves):
        out += w * _vnoise(rng, n, size); tot += w; w *= gain; n *= 2
    return out / tot


def _tile_blur(img, r):
    """이음새가 남지 않게 3x3 으로 깔고 흐린 뒤 가운데를 잘라 낸다."""
    S = img.size[0]
    big = Image.new(img.mode, (S * 3, S * 3))
    for i in range(3):
        for j in range(3):
            big.paste(img, (i * S, j * S))
    big = big.filter(ImageFilter.GaussianBlur(r))
    return big.crop((S, S, S * 2, S * 2))


def _blur_arr(a, r):
    """주기적 가우스 흐림(FFT) — 배열은 자동으로 이음새 없이 흐려진다."""
    if r <= 0:
        return a
    S = a.shape[0]
    f = np.fft.fftfreq(S)
    k = np.exp(-2 * (math.pi * r) ** 2 * (f[:, None] ** 2 + f[None, :] ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * k))


def _wrap_draw(d, fn, S):
    """경계를 넘는 도형은 네 번 그려 이음새 없이."""
    for ox in (0, -S, S):
        for oy in (0, -S, S):
            fn(d, ox, oy)


# ---------------------------------------------------------------- 그리기 → (색 RGB, 높이 0..1, 거칠기 0..1)
class Tex:
    def __init__(self, base, size=SIZE):
        self.S = size
        self.c = _hex(base)
        self.color = Image.new('RGB', (size, size), self.c)
        self.height = Image.new('L', (size, size), 128)
        self.dc = ImageDraw.Draw(self.color)
        self.dh = ImageDraw.Draw(self.height)
        self.rough = None           # numpy, 없으면 높이로 만든다

    def finish(self, rng, blotch=0.08, blotch_n=6, grain=0.04, h_blur=0.8, rough_base=0.75, rough_var=0.2, rough_gap=0.15, h_shade=0.25, c_blur=0.0):
        S = self.S
        col = np.asarray(self.color, dtype=np.float64) / 255
        h = np.asarray(self.height, dtype=np.float64) / 255
        h = _blur_arr(h, h_blur)
        if c_blur > 0:
            col = np.asarray(_tile_blur(Image.fromarray((col * 255).astype(np.uint8)), c_blur), dtype=np.float64) / 255
        # 큰 얼룩(풍화) + 고운 알갱이(실사의 질감) + 낮은 곳(틈)이 어둡다
        bl = 1 + (_fbm(rng, S, blotch_n, 4) - 0.5) * 2 * blotch
        gr = 1 + (rng.random((S, S)) - 0.5) * 2 * grain
        gr = _blur_arr(gr, 0.6) if grain else gr
        shade = 1 - h_shade * (1 - h) ** 2 * 1.4
        col = np.clip(col * (bl * gr * shade)[..., None], 0, 1)
        if self.rough is None:
            self.rough = np.clip(rough_base + (_fbm(rng, S, 8, 4) - 0.5) * 2 * rough_var + (1 - h) * rough_gap, 0.05, 1)
        return (Image.fromarray((col * 255).astype(np.uint8)), h, self.rough)


def wood(base, boards=5, vertical=False, knots=True, seed=1, size=SIZE):
    """널빤지: 결은 가로(u 방향). vertical 이면 세로. 널 사이 틈은 낮고 어둡다."""
    rng = random.Random(seed); nrng = np.random.default_rng(seed)
    t = Tex(base, size); S = size; c = t.c
    bh = S / boards
    for b in range(boards):
        y0 = int(b * bh)
        tone = _shade(c, rng.uniform(0.86, 1.14))
        t.dc.rectangle((0, y0, S, y0 + bh), fill=tone)
        t.dh.rectangle((0, y0, S, y0 + bh), fill=int(rng.uniform(118, 138)))
        for _ in range(int(bh / 6)):                   # 결: 얇고 긴 물결선
            yy = y0 + rng.uniform(2, bh - 2)
            amp = rng.uniform(1.0, 5.0); ph = rng.uniform(0, 6.28); k = rng.choice([1, 2, 3])
            col = _shade(tone, rng.uniform(0.7, 0.92)); w = rng.choice([1, 1, 2, 2, 3, 4])
            pts = [(x, yy + amp * math.sin(x / S * 2 * math.pi * k + ph)) for x in range(0, S + 1, 8)]
            t.dc.line(pts, fill=col, width=w)
            t.dh.line(pts, fill=int(128 - rng.uniform(4, 14)), width=max(1, w - 1))
        if knots and rng.random() < 0.7:               # 옹이
            kx, ky = rng.uniform(0, S), y0 + bh * rng.uniform(0.3, 0.7)
            for r in range(int(S / 50), 3, -3):
                t.dc.ellipse((kx - r * 1.6, ky - r, kx + r * 1.6, ky + r), outline=_shade(tone, 0.62 + r * 0.012), width=3)
                t.dh.ellipse((kx - r * 1.6, ky - r, kx + r * 1.6, ky + r), outline=int(124 + 6 * math.sin(r)), width=3)
        gw = max(3, S // 170)                           # 널 사이 틈
        t.dc.line((0, y0, S, y0), fill=_shade(tone, 0.5), width=gw)
        t.dh.line((0, y0, S, y0), fill=40, width=gw)
        t.dh.line((0, y0 + gw, S, y0 + gw), fill=150, width=2)   # 틈 옆 모서리는 살짝 들린다
    img, h, r = t.finish(nrng, blotch=0.10, blotch_n=5, grain=0.05, h_blur=0.9, rough_base=0.62, rough_var=0.15, rough_gap=0.3, h_shade=0.3)
    if vertical:
        img = img.rotate(90); h = np.rot90(h); r = np.rot90(r)
    return img, h, r


def shingles(base, rows=6, seed=3, size=SIZE):
    """지붕널: 가로 줄마다 엇갈린 널. 널마다 조금 기울고, 아래 가장자리가 두껍게 들린다(높이)."""
    rng = random.Random(seed); nrng = np.random.default_rng(seed)
    t = Tex(base, size); S = size; c = t.c
    rh = S / rows; w = S / 4
    for r in range(rows):
        y0 = r * rh
        off = (w / 2) if r % 2 else 0
        for i in range(-1, 5):
            x0 = i * w + off + rng.uniform(-4, 4)
            tone = _shade(c, rng.uniform(0.8, 1.18))
            hb = int(rng.uniform(118, 142))
            def shp(d, ox, oy, x0=x0, y0=y0, tone=tone, hb=hb, color=True):
                box = (x0 + 3 + ox, y0 + oy, x0 + w - 3 + ox, y0 + rh + oy)
                if color:
                    d.rectangle(box, fill=tone)
                    d.line((box[0], box[3] - 3, box[2], box[3] - 3), fill=_shade(tone, 0.55), width=max(4, S // 128))   # 아래 그늘
                    for _ in range(3):                                                                            # 나뭇결 줄
                        xx = rng.uniform(box[0] + 4, box[2] - 4)
                        d.line((xx, box[1], xx + rng.uniform(-3, 3), box[3]), fill=_shade(tone, rng.uniform(0.8, 0.95)), width=1)
                else:
                    d.rectangle(box, fill=hb)
                    d.line((box[0], box[3] - 2, box[2], box[3] - 2), fill=min(255, hb + 40), width=max(3, S // 170))   # 아래 끝 두께
                    d.line((box[0], box[1], box[0], box[3]), fill=max(0, hb - 60), width=max(2, S // 256))              # 옆 틈
            _wrap_draw(t.dc, lambda d, ox, oy: shp(d, ox, oy), S)
            _wrap_draw(t.dh, lambda d, ox, oy: shp(d, ox, oy, color=False), S)
    return t.finish(nrng, blotch=0.12, blotch_n=4, grain=0.05, h_blur=0.7, rough_base=0.8, rough_var=0.12, rough_gap=0.15, h_shade=0.3)


def plaster(base, seed=4, size=SIZE):
    """회벽: 흙손 자국과 고운 요철."""
    rng = random.Random(seed); nrng = np.random.default_rng(seed)
    t = Tex(base, size); S = size
    for _ in range(50):
        x, y = rng.uniform(0, S), rng.uniform(0, S)
        L, a = rng.uniform(S / 10, S / 3), rng.uniform(-0.35, 0.35)
        col = _shade(t.c, rng.uniform(0.95, 1.04)); hv = int(rng.uniform(120, 136)); w = int(rng.uniform(S / 80, S / 28))
        seg = (x, y, x + L * math.cos(a), y + L * math.sin(a))
        _wrap_draw(t.dc, lambda d, ox, oy: d.line((seg[0] + ox, seg[1] + oy, seg[2] + ox, seg[3] + oy), fill=col, width=w), S)
        _wrap_draw(t.dh, lambda d, ox, oy: d.line((seg[0] + ox, seg[1] + oy, seg[2] + ox, seg[3] + oy), fill=hv, width=w), S)
    img, h, r = t.finish(nrng, blotch=0.06, blotch_n=6, grain=0.035, h_blur=2.5, rough_base=0.92, rough_var=0.05, rough_gap=0.05, h_shade=0.12, c_blur=5.0)
    h = np.clip(h + (_fbm(nrng, S, 64, 3) - 0.5) * 0.12, 0, 1)        # 고운 모래알 요철
    return img, h, r


def stone(base, seed=5, size=SIZE):
    """돌담: 둥근 돌 + 낮은 줄눈. 돌마다 색이 조금 다르고 가운데가 불룩하다."""
    rng = random.Random(seed); nrng = np.random.default_rng(seed)
    t = Tex(base, size); S = size; c = t.c
    t.dc.rectangle((0, 0, S, S), fill=_shade(c, 0.62)); t.dh.rectangle((0, 0, S, S), fill=30)
    rows, cols = 6, 4
    rh, cw = S / rows, S / cols
    for r in range(rows):
        off = cw / 2 if r % 2 else 0
        for i in range(-1, cols + 1):
            x0, y0 = i * cw + off, r * rh
            pad = rng.uniform(S / 150, S / 80); rad = int(rng.uniform(S / 60, S / 24))
            tone = _shade(c, rng.uniform(0.82, 1.2))
            tone = (tone[0], tone[1], max(0, tone[2] - rng.randint(0, 10)))
            box = (x0 + pad, y0 + pad, x0 + cw - pad, y0 + rh - pad)
            cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
            hw, hh = (box[2] - box[0]) / 2, (box[3] - box[1]) / 2
            # 돌 윤곽: 모서리를 깎고 변을 흔든 12각형 (네모난 벽돌이 아니라 다듬은 돌)
            angs = [i * 2 * math.pi / 12 + rng.uniform(-0.12, 0.12) for i in range(12)]
            poly = [(cx + hw * math.cos(a) * rng.uniform(0.9, 1.12) / max(abs(math.cos(a)), abs(math.sin(a)) * hw / hh) if False else 0, 0) for a in angs]
            def pt(a, f=1.0):
                # 네모에 가까운 둥근 윤곽(초타원) + 흔들림
                c_, s_ = math.cos(a), math.sin(a)
                k = 1 / (abs(c_) ** 3 + abs(s_) ** 3) ** (1 / 3)
                return (cx + hw * c_ * k * f, cy + hh * s_ * k * f)
            jit = [rng.uniform(0.9, 1.04) for _ in angs]
            poly = [pt(a, j) for a, j in zip(angs, jit)]
            _wrap_draw(t.dc, lambda d, ox, oy: d.polygon([(x + ox, y + oy) for x, y in poly], fill=tone), S)
            for k in range(7):                                   # 높이: 가장자리에서 가운데로 여러 겹 — 불룩한 돌
                f = 1 - k / 7 * 0.5
                hv = int(110 + 90 * math.sin((1 - (f - 0.5) / 0.5) * math.pi / 2))
                pp = [pt(a, j * f) for a, j in zip(angs, jit)]
                _wrap_draw(t.dh, lambda d, ox, oy: d.polygon([(x + ox, y + oy) for x, y in pp], fill=hv), S)
    img, h, r = t.finish(nrng, blotch=0.1, blotch_n=5, grain=0.07, h_blur=2.0, rough_base=0.82, rough_var=0.1, rough_gap=0.15, h_shade=0.35)
    h = np.clip(h + (_fbm(nrng, S, 32, 4) - 0.5) * 0.1, 0, 1)         # 돌 표면 거친 요철
    return img, h, r


def grass(base, seed=6, size=SIZE):
    """풀밭: 포기(덩어리) 잡음 + 풀잎 획."""
    rng = random.Random(seed); nrng = np.random.default_rng(seed)
    t = Tex(base, size); S = size; c = t.c
    for _ in range(int(S * S / 100)):
        x, y = rng.uniform(0, S), rng.uniform(0, S)
        L = rng.uniform(S / 170, S / 64); dx = rng.uniform(-L * 0.4, L * 0.4)
        col = _shade(c, rng.uniform(0.75, 1.2)); col = (col[0] + rng.randint(-8, 8), col[1], col[2])
        col = tuple(max(0, min(255, v)) for v in col)
        _wrap_draw(t.dc, lambda d, ox, oy: d.line((x + ox, y + oy, x + dx + ox, y - L + oy), fill=col, width=1), S)
        _wrap_draw(t.dh, lambda d, ox, oy: d.line((x + ox, y + oy, x + dx + ox, y - L + oy), fill=int(rng.uniform(120, 200)), width=1), S)
    img, h, r = t.finish(nrng, blotch=0.14, blotch_n=4, grain=0.05, h_blur=1.2, rough_base=0.9, rough_var=0.06, rough_gap=0.05, h_shade=0.2)
    h = np.clip(0.5 + (h - 0.5) * 0.6 + (_fbm(nrng, S, 6, 5) - 0.5) * 0.5, 0, 1)   # 포기 덩어리
    return img, h, r


def normal_map(h, strength=2.0):
    """높이(0..1, 주기적) → 접선 공간 법선 지도 (OpenGL/glTF 규약: +Y 가 위)."""
    gx = np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)
    gy = np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)
    n = np.dstack((-gx * strength, gy * strength, np.ones_like(h)))
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8))


def orm_map(r):
    """glTF 의 occlusion-roughness-metallic: R=1(그늘은 정점색이 맡는다), G=거칠기, B=0"""
    a = np.dstack((np.ones_like(r), r, np.zeros_like(r)))
    return Image.fromarray((a * 255).astype(np.uint8))


# 재질 키 → (텍스처 함수, 타일/m, X·Y 벽면에서 u·v 를 바꿀지(세로 결), 법선 세기)
RECIPES = {
    'log':     (lambda c: wood(c, 3, False, True, 2), 0.72, False, 4.0),
    'log2':    (lambda c: wood(c, 3, False, True, 7), 0.72, False, 4.0),
    'plank':   (lambda c: wood(c, 5, True, True, 11), 0.8, True, 4.5),
    'plank2':  (lambda c: wood(c, 5, True, True, 12), 0.8, True, 4.5),
    'floor':   (lambda c: wood(c, 4, False, True, 13), 0.6, False, 3.5),
    'beam':    (lambda c: wood(c, 4, False, False, 14), 1.2, False, 3.5),
    'wood2':   (lambda c: wood(c, 4, False, False, 15), 1.2, False, 3.5),
    'plaster': (lambda c: plaster(c, 4), 0.5, False, 3.0),
    'cream':   (lambda c: plaster(c, 8), 0.5, False, 3.0),
    'shingle': (lambda c: shingles(c, 6, 3), 1.0, False, 5.0),
    'shingle2': (lambda c: shingles(c, 6, 9), 1.0, False, 5.0),
    'stone':   (lambda c: stone(c, 5), 1.0, False, 3.2),
    'stone2':  (lambda c: stone(c, 10), 1.0, False, 3.2),
    'grass':   (lambda c: grass(c, 6), 0.7, False, 4.0),
    'grass2':  (lambda c: grass(c, 16), 0.7, False, 4.0),
}
# 법선·거칠기 지도를 같이 쓰는 변형 (색만 다르다) — 파일 크기 절약
FAMILY = {'log2': 'log', 'plank2': 'plank', 'wood2': 'beam', 'cream': 'plaster', 'shingle2': 'shingle', 'stone2': 'stone', 'grass2': 'grass'}
# 색 지도 크기: 눈에 가까운 큰 면만 1024, 나머지는 512 (용량)
COLOR_SIZE = {'log': 1024, 'plank': 1024, 'floor': 1024, 'shingle': 1024, 'stone': 1024, 'grass': 1024, 'plaster': 1024}


def make_all(colors, out_dir):
    """colors: 키→'#rrggbb'. out_dir 에 <키>.png(색), <키>_n.png(법선), <키>_orm.png(거칠기) 를 쓰고
    {키: (색 경로, 타일/m, 세로결, 법선 경로, orm 경로)} 를 돌려준다. 변형(FAMILY)은 원본 키의 법선·orm 을 가리킨다."""
    import os
    out = {}; maps = {}
    for key, (fn, tiles, swap, nstr) in RECIPES.items():
        if key not in colors:
            continue
        img, h, r = fn(colors[key])
        cs = COLOR_SIZE.get(key, 512)
        if img.size[0] != cs:
            img = img.resize((cs, cs), Image.LANCZOS)
        path = os.path.join(out_dir, key + '.png'); img.save(path)
        fam = FAMILY.get(key, key)
        if fam == key:
            n = normal_map(h, nstr); o = orm_map(r)
            if n.size[0] != NSIZE:
                n = n.resize((NSIZE, NSIZE), Image.LANCZOS); o = o.resize((NSIZE, NSIZE), Image.LANCZOS)
            np_ = os.path.join(out_dir, key + '_n.png'); n.save(np_)
            op = os.path.join(out_dir, key + '_orm.png'); o.resize((512, 512), Image.LANCZOS).save(op)   # 거칠기는 거칠어도 된다
            maps[key] = (np_, op)
        out[key] = [path, tiles, swap, None, None]
    for key in out:
        fam = FAMILY.get(key, key)
        if fam in maps:
            out[key][3], out[key][4] = maps[fam]
        out[key] = tuple(out[key])
    return out


if __name__ == '__main__':
    import sys
    cols = {'log': '#8a6a4c', 'plank': '#9b7a58', 'floor': '#a8845e', 'plaster': '#e9e2d0', 'shingle': '#5a4636',
            'stone': '#8b877e', 'grass': '#9aa47a', 'beam': '#5e4633'}
    print(make_all(cols, sys.argv[1] if len(sys.argv) > 1 else '.'))
