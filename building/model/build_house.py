# 시로의 집 — Blender 모델 생성 스크립트 (Blender 5.0, bpy)
# 콘셉트: /mnt/project-files/hub/concept/ (두호 2026-10-26, 나노바나나 초안)
# 실행:  python build_house.py <out.glb>      (pip 의 bpy 모듈) 또는
#        blender -b -P build_house.py -- <out.glb>
# 좌표: Blender X=가로(오른쪽 +), Y=깊이(정면 -Y), Z=위. glTF 로 내보내면 three.js 에서 정면이 +Z.
#
# 사이트가 읽는 약속 (building.js):
#  - 노드 extras: floor(1·2·3, 0=땅), cut('S','N','E','W' = 카메라가 그쪽에 있으면 걷어낼 면).
#  - 빈 객체 anchor_<id>: 방 라벨이 붙는 자리.
#  - 재질 이름 glow*: 불 켜진 창·전구 (조명 없이 그 색 그대로).
# 캐릭터(시로·카피바라씨·코알라씨)는 넣지 않는다. TODO(character-sheet).
import math
import sys

import bpy  # bpy 를 먼저 (pip bpy 모듈에서는 bmesh 가 bpy 뒤에 생긴다)
import bmesh
from mathutils import Matrix, Vector

# 시작 장면(기본 상자·카메라·조명)을 비운다
for _o in list(bpy.data.objects):
    bpy.data.objects.remove(_o, do_unlink=True)

# ---------------------------------------------------------------- 색 (사이트 팔레트 + 나무 계열)
COL = {
    'log': '#8a6a4c', 'log2': '#76583e', 'plank': '#9b7a58', 'plank2': '#8a6b4c',
    'floor': '#a8845e', 'beam': '#5e4633', 'wood2': '#4e3b2d', 'dark': '#33251c',
    'plaster': '#e9e2d0', 'paper': '#e2dbc8', 'rule': '#bfb39b', 'ink': '#3a2c22',
    'shingle': '#5a4636', 'shingle2': '#4c3a2c', 'stone': '#8b877e', 'stone2': '#77736b',
    'grass': '#9aa47a', 'grass2': '#8a9568', 'green': '#4a5e4f', 'sage': '#7f9378',
    'leaf': '#6f7f5c', 'pot': '#b07a5c', 'brass': '#a88a55', 'night': '#2b3240',
    'door': '#2f3640', 'rug': '#b89a7a', 'red': '#a85a48', 'cream': '#ece4d2',
    'blanket': '#8d98a0', 'jar': '#cfc8b4', 'coffee': '#5b4130',
    'glow': '#f0d394', 'glowbulb': '#f6e2b0',
}

def srgb_to_lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

MATS = {}
def mat(key):
    if key in MATS:
        return MATS[key]
    h = COL[key].lstrip('#')
    rgb = [srgb_to_lin(int(h[i:i + 2], 16)) for i in (0, 2, 4)]
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = 1.0
    m.diffuse_color = (*rgb, 1)
    MATS[key] = m
    return m

# ---------------------------------------------------------------- 그룹 (나중에 하나의 메시로 합침)
GROUPS = {}   # name -> {'objs': [], 'props': {}}
def group(name, floor, cut=None):
    if name not in GROUPS:
        GROUPS[name] = {'objs': [], 'props': {'floor': floor, **({'cut': cut} if cut else {})}}
    return name

def _obj_from_bm(bm, name, matkey, grp, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    me.materials.append(mat(matkey))
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    GROUPS[grp]['objs'].append(ob)
    return ob

def box(grp, matkey, center, size, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    M = Matrix.Translation(Vector(center)) @ _rot(rot) @ Matrix.Diagonal((*size, 1))
    bm.transform(M)
    return _obj_from_bm(bm, 'box', matkey, grp)

def cyl(grp, matkey, center, r, h, axis='Z', seg=10, r2=None, rot=None, smooth=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r,
                          radius2=r if r2 is None else r2, depth=h)
    R = _rot(rot) if rot else {'Z': Matrix(), 'X': Matrix.Rotation(math.pi / 2, 4, 'Y'),
                               'Y': Matrix.Rotation(math.pi / 2, 4, 'X')}[axis]
    bm.transform(Matrix.Translation(Vector(center)) @ R)
    return _obj_from_bm(bm, 'cyl', matkey, grp, smooth)

def sphere(grp, matkey, center, r, seg=12, scale=(1, 1, 1), half=False):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(6, seg // 2), radius=r)
    if half:
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-4], context='VERTS')
    bm.transform(Matrix.Translation(Vector(center)) @ Matrix.Diagonal((*scale, 1)))
    return _obj_from_bm(bm, 'sph', matkey, grp, True)

def prism(grp, matkey, pts2d, y0, y1, plane='XZ'):
    """평면 다각형(x,z) 을 y0..y1 로 뽑은 기둥 (박공 삼각형 등)."""
    bm = bmesh.new()
    a = [bm.verts.new((x, y0, z)) for x, z in pts2d]
    b = [bm.verts.new((x, y1, z)) for x, z in pts2d]
    bm.faces.new(a[::-1]); bm.faces.new(b)
    n = len(pts2d)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj_from_bm(bm, 'prism', matkey, grp)

def _rot(r):
    if r is None:
        return Matrix()
    return (Matrix.Rotation(r[2], 4, 'Z') @ Matrix.Rotation(r[1], 4, 'Y') @ Matrix.Rotation(r[0], 4, 'X'))

ANCHORS = []
def anchor(name, loc):
    e = bpy.data.objects.new('anchor_' + name, None)
    e.location = loc
    bpy.context.scene.collection.objects.link(e)
    ANCHORS.append(e)

# ---------------------------------------------------------------- 치수
W, D = 6.0, 5.0              # 가로 · 깊이
T = 0.26                     # 벽 두께 (통나무 지름)
H1 = 2.64                    # 1층 (통나무 11단)
BAND = 0.26                  # 층 사이 띠보
Z2 = H1 + BAND               # 2층 바닥 2.90
H2 = 2.5
Z3 = Z2 + H2 + 0.2           # 3층(다락·루프탑) 바닥 5.60
XA, XB = -0.6, W / 2         # 다락(박공지붕)이 덮는 가로 구간, 그 왼쪽은 루프탑
KNEE = 0.5                   # 다락 무릎벽
RIDGE = 2.2                  # 무릎벽 위 지붕 높이
XR = (XA + XB) / 2           # 용마루 x

# 벽 지역 좌표 (u: 벽을 따라, v: 위로, n: 바깥쪽 +) → 세계 좌표
def wpos(side, u, v, n):
    c = T / 2
    if side == 'S': return (u, -D / 2 + c - n, v)
    if side == 'N': return (u, D / 2 - c + n, v)
    if side == 'E': return (W / 2 - c + n, u, v)
    if side == 'W': return (-W / 2 + c - n, u, v)

def wsize(side, lu, lv, ln):
    return (lu, ln, lv) if side in 'SN' else (ln, lu, lv)

def wbox(grp, matkey, side, u, v, n, lu, lv, ln):
    return box(grp, matkey, wpos(side, u, v, n), wsize(side, lu, lv, ln))

def wlen(side):
    return W if side in 'SN' else D

def subtract(span, holes):
    """1차원 구간 span 에서 holes 를 뺀 조각들."""
    segs = [span]
    for h0, h1 in holes:
        out = []
        for s0, s1 in segs:
            if h1 <= s0 or h0 >= s1:
                out.append((s0, s1)); continue
            if h0 > s0: out.append((s0, h0))
            if h1 < s1: out.append((h1, s1))
        segs = out
    return [s for s in segs if s[1] - s[0] > 0.04]

def rect_minus(grp, matkey, side, u_span, v_span, n, ln, openings):
    """벽면 사각형에서 창·문 구멍을 뺀 판 (안쪽 회벽 등)."""
    cuts = sorted({u_span[0], u_span[1], *[o[0] for o in openings], *[o[1] for o in openings]})
    cuts = [c for c in cuts if u_span[0] <= c <= u_span[1]]
    for a, b in zip(cuts, cuts[1:]):
        mid = (a + b) / 2
        holes = [(o[2], o[3]) for o in openings if o[0] < mid < o[1]]
        for v0, v1 in subtract(v_span, holes):
            wbox(grp, matkey, side, mid, (v0 + v1) / 2, n, b - a, v1 - v0, ln)

def window(grp, side, u0, u1, v0, v1, cross=True, n=0.0, glow='glow'):
    fw, fd = 0.09, T + 0.08
    wbox(grp, 'wood2', side, (u0 + u1) / 2, v0 - fw / 2, n, u1 - u0 + 2 * fw, fw, fd + 0.04)   # 창턱
    wbox(grp, 'wood2', side, (u0 + u1) / 2, v1 + fw / 2, n, u1 - u0 + 2 * fw, fw, fd)
    wbox(grp, 'wood2', side, u0 - fw / 2, (v0 + v1) / 2, n, fw, v1 - v0, fd)
    wbox(grp, 'wood2', side, u1 + fw / 2, (v0 + v1) / 2, n, fw, v1 - v0, fd)
    wbox(grp, glow, side, (u0 + u1) / 2, (v0 + v1) / 2, n - 0.02, u1 - u0, v1 - v0, 0.03)
    if cross:
        wbox(grp, 'wood2', side, (u0 + u1) / 2, (v0 + v1) / 2, n + 0.01, 0.05, v1 - v0, 0.06)
        nrow = 2 if v1 - v0 > 0.9 else 1
        for k in range(1, nrow + 1):
            wbox(grp, 'wood2', side, (u0 + u1) / 2, v0 + (v1 - v0) * k / (nrow + 1), n + 0.01, u1 - u0, 0.05, 0.06)

# ---------------------------------------------------------------- 1층: 통나무 벽
OPEN1 = {
    'S': [(-2.3, -0.5, 0.75, 1.95, 'win'), (0.35, 1.25, 0.0, 2.1, 'door')],
    'N': [(-0.8, 0.0, 1.0, 1.8, 'win')],
    'E': [(-1.4, -0.6, 1.0, 1.8, 'win'), (0.7, 1.5, 1.0, 1.8, 'win')],
    'W': [(-0.4, 0.4, 1.0, 1.8, 'win')],
}
for side in 'SNEW':
    g = group(f'f1_wall_{side}', 1, side)
    L = wlen(side)
    ops = OPEN1[side]
    rows = 11
    for k in range(rows):
        v = 0.12 + k * 0.24
        holes = [(o[0], o[1]) for o in ops if o[2] - 0.1 < v < o[3] + 0.1]
        ext = 0.18 if (k % 2 == (0 if side in 'SN' else 1)) else 0.02    # 모서리에서 엇갈려 튀어나온 통나무 끝
        for s0, s1 in subtract((-L / 2 - ext, L / 2 + ext), holes):
            c = wpos(side, (s0 + s1) / 2, v, 0)
            cyl(g, 'log' if k % 3 else 'log2', c, 0.128, s1 - s0, axis='X' if side in 'SN' else 'Y', seg=8)
    rect_minus(g, 'plaster', side, (-L / 2 + T, L / 2 - T), (0.06, H1), -T / 2 - 0.02, 0.04, ops)
    for o in ops:
        if o[4] == 'win':
            window(g, side, o[0], o[1], o[2], o[3])
        else:   # 문
            u0, u1, v0, v1 = o[:4]
            wbox(g, 'door', side, (u0 + u1) / 2, (v0 + v1) / 2, 0.0, u1 - u0, v1 - v0, 0.1)
            for uu in (u0 - 0.05, u1 + 0.05):
                wbox(g, 'wood2', side, uu, (v0 + v1) / 2, 0.02, 0.1, v1 - v0, T + 0.1)
            wbox(g, 'wood2', side, (u0 + u1) / 2, v1 + 0.05, 0.02, u1 - u0 + 0.2, 0.1, T + 0.1)
            wbox(g, 'paper', side, (u0 + u1) / 2, 1.55, 0.1, 0.42, 0.2, 0.03)   # 문패 (글자는 코드로)
            cyl(g, 'brass', wpos(side, u0 + 0.16, 1.0, 0.09), 0.04, 0.08, axis='Y' if side in 'SN' else 'X', seg=8)

# 띠보 (층 사이) — 앞뒤 면에 붙여 같이 걷힌다
for side in 'SNEW':
    g = f'f1_wall_{side}'
    wbox(g, 'beam', side, 0, H1 + BAND / 2, 0.04, wlen(side) + 0.3, BAND, T + 0.08)

# 모서리 기둥 (앞·뒤 벽에 속함)
for sx in (-1, 1):
    for sy, side in ((-1, 'S'), (1, 'N')):
        x, y = sx * (W / 2 - 0.06), sy * (D / 2 - 0.06)
        cyl(f'f1_wall_{side}', 'log2', (x, y, (H1 + BAND) / 2), 0.17, H1 + BAND, seg=10)
        cyl(group(f'f2_wall_{side}', 2, side), 'log2', (x, y, Z2 + H2 / 2 + 0.1), 0.15, H2 + 0.2, seg=10)

# ---------------------------------------------------------------- 2층: 세로 널빤지 벽
OPEN2 = {
    'S': [(-2.25, -1.45, 0.55, 1.95, 'win'), (-0.95, 0.35, 0.55, 2.05, 'win'), (0.85, 1.65, 0.55, 1.95, 'win')],
    'N': [(1.2, 2.0, 0.7, 1.8, 'win')],
    'E': [(-1.6, -0.8, 0.55, 1.95, 'win'), (0.2, 1.0, 0.55, 1.95, 'win'), (1.4, 2.0, 0.7, 1.7, 'win')],
    'W': [(-0.5, 0.5, 0.7, 1.8, 'win')],
}
for side in 'SNEW':
    g = group(f'f2_wall_{side}', 2, side)
    L = wlen(side)
    ops = [(a, b, Z2 + c, Z2 + d, k) for a, b, c, d, k in OPEN2[side]]
    pw = 0.3
    n_pl = int(L / pw)
    for i in range(n_pl):
        u0 = -L / 2 + i * pw
        u1 = u0 + pw - 0.015
        mid = (u0 + u1) / 2
        holes = [(o[2], o[3]) for o in ops if o[0] - 0.02 < mid < o[1] + 0.02]
        for v0, v1 in subtract((Z2, Z2 + H2 + 0.2), holes):
            wbox(g, 'plank' if i % 3 else 'plank2', side, mid, (v0 + v1) / 2, 0.03, u1 - u0, v1 - v0, 0.07)
    rect_minus(g, 'plaster', side, (-L / 2 + T, L / 2 - T), (Z2, Z2 + H2 + 0.2), -T / 2 - 0.02, 0.04, ops)
    for o in ops:
        window(g, side, o[0], o[1], o[2], o[3])
    wbox(g, 'beam', side, 0, Z3 - 0.1, 0.06, L + 0.3, 0.2, T + 0.1)       # 처마 띠보

# ---------------------------------------------------------------- 바닥판
gf1 = group('f1_floor', 1)
box(gf1, 'floor', (0, 0, 0.04), (W - 0.1, D - 0.1, 0.08))
gf2 = group('f2_floor', 2)
box(gf2, 'beam', (0, 0, H1 + BAND / 2), (W - 0.2, D - 0.2, BAND - 0.02))
box(gf2, 'floor', (0, 0, Z2 - 0.02), (W - 0.3, D - 0.3, 0.04))
gf3 = group('f3_floor', 3)
box(gf3, 'beam', (0, 0, Z3 - 0.12), (W - 0.2, D - 0.2, 0.2))
box(gf3, 'floor', (0, 0, Z3 - 0.02), (W - 0.3, D - 0.3, 0.04))
for i in range(int((XA + W / 2) / 0.3)):        # 루프탑 데크 널
    x = -W / 2 + 0.15 + i * 0.3
    box(gf3, 'plank' if i % 2 else 'plank2', (x, 0, Z3 + 0.015), (0.27, D - 0.3, 0.03))

# ---------------------------------------------------------------- 땅
g0 = group('ground', 0)
box(g0, 'grass', (0, 0, -0.1), (W + 2.6, D + 2.4, 0.2))
box(g0, 'grass2', (0, -D / 2 - 0.9, -0.005), (1.2, 1.4, 0.02))           # 문 앞 흙길 자국
box(g0, 'stone2', (0, 0, 0.0), (W + 0.12, D + 0.12, 0.06))                # 주춧돌 띠

# ---------------------------------------------------------------- 3층: 다락(박공지붕) + 루프탑 + 돔
AW = XB - XA
ZK = Z3 + KNEE
def roof_z(x):
    return ZK + RIDGE * (1 - abs(x - XR) / (AW / 2))

# 무릎벽 (동·서) — 동쪽은 바깥벽 위, 서쪽은 루프탑과의 경계
gE = group('f3_roof_E', 3, 'E')
gW = group('f3_roof_W', 3, 'W')
for i in range(int(D / 0.3)):
    y = -D / 2 + 0.15 + i * 0.3
    box(gE, 'plank' if i % 3 else 'plank2', (XB - 0.1, y, Z3 + KNEE / 2), (0.07, 0.28, KNEE))
    box(gW, 'plank' if i % 3 else 'plank2', (XA + 0.1, y, Z3 + KNEE / 2), (0.07, 0.28, KNEE))
box(gE, 'plaster', (XB - 0.17, 0, Z3 + KNEE / 2), (0.04, D - 0.3, KNEE))
box(gW, 'plaster', (XA + 0.17, 0, Z3 + KNEE / 2), (0.04, D - 0.3, KNEE))

# 지붕 경사판 + 지붕널
ang = math.atan2(RIDGE, AW / 2)
slope_len = math.hypot(RIDGE, AW / 2) + 0.45
for side, g, sgn in (('E', gE, 1), ('W', gW, -1)):
    cx = XR + sgn * (AW / 4) + sgn * 0.12
    cz = ZK + RIDGE / 2 - 0.08
    rot = (0, sgn * ang, 0)          # Blender Y 회전: +각이면 x축이 아래로 기운다
    box(g, 'plank', (cx, 0, cz), (slope_len, D + 0.6, 0.1), rot=rot)
    rows = 10
    for k in range(rows):
        t = (k + 0.5) / rows - 0.5
        off = Vector((sgn * math.cos(ang), 0, -math.sin(ang))) * (t * slope_len)
        up = Vector((sgn * math.sin(ang), 0, math.cos(ang))) * 0.07
        p = Vector((cx, 0, cz)) + off + up
        box(g, 'shingle' if k % 2 else 'shingle2', tuple(p), (slope_len / rows + 0.04, D + 0.64, 0.05), rot=rot)
# 용마루
box(gW, 'dark', (XR, 0, ZK + RIDGE + 0.05), (0.26, D + 0.7, 0.22))

# 박공벽 (정면 S · 뒷면 N): 세로 널을 삼각형으로 자른다
for side, y in (('S', -D / 2 + 0.1), ('N', D / 2 - 0.1)):
    g = group(f'f3_gable_{side}', 3, side)
    win = (XR - 0.4, XR + 0.4, ZK + 0.5, ZK + 1.35) if side == 'S' else (XR - 0.3, XR + 0.3, ZK + 0.6, ZK + 1.2)
    pw = 0.3
    for i in range(int(AW / pw)):
        x0 = XA + i * pw
        x1 = x0 + pw - 0.015
        mid = (x0 + x1) / 2
        top = roof_z(mid) - 0.05
        holes = [(win[2], win[3])] if win[0] - 0.02 < mid < win[1] + 0.02 else []
        for v0, v1 in subtract((Z3, top), holes):
            box(g, 'plank' if i % 3 else 'plank2', (mid, y, (v0 + v1) / 2), (x1 - x0, 0.08, v1 - v0))
    # 안쪽 회벽 (오각형: 무릎벽 + 삼각형)
    yi = y + (0.06 if side == 'S' else -0.06)
    prism(g, 'plaster', [(XA + 0.2, Z3), (XB - 0.2, Z3), (XB - 0.2, roof_z(XB - 0.2) - 0.08),
                         (XR, ZK + RIDGE - 0.12), (XA + 0.2, roof_z(XA + 0.2) - 0.08)], yi - 0.02, yi + 0.02)
    sg = 'S' if side == 'S' else 'N'
    ww = (win[0], win[1], win[2], win[3])
    # 창틀 (박공은 y 고정이라 직접)
    fw = 0.09
    for (cx_, cz_, sx_, sz_) in (((ww[0] + ww[1]) / 2, ww[2] - fw / 2, ww[1] - ww[0] + 2 * fw, fw),
                                ((ww[0] + ww[1]) / 2, ww[3] + fw / 2, ww[1] - ww[0] + 2 * fw, fw),
                                (ww[0] - fw / 2, (ww[2] + ww[3]) / 2, fw, ww[3] - ww[2]),
                                (ww[1] + fw / 2, (ww[2] + ww[3]) / 2, fw, ww[3] - ww[2]),
                                ((ww[0] + ww[1]) / 2, (ww[2] + ww[3]) / 2, 0.05, ww[3] - ww[2]),
                                ((ww[0] + ww[1]) / 2, (ww[2] + ww[3]) / 2, ww[1] - ww[0], 0.05)):
        box(g, 'wood2', (cx_, y, cz_), (sx_, 0.18, sz_))
    box(g, 'glow', (XR, y, (ww[2] + ww[3]) / 2), (ww[1] - ww[0], 0.04, ww[3] - ww[2]))
    # 박공 테두리 판 (바지랑대)
    for sgn in (-1, 1):
        ex = XR + sgn * AW / 4
        box(g, 'wood2', (ex, y + (-0.1 if side == 'S' else 0.1), ZK + RIDGE / 2 + 0.02),
            (math.hypot(RIDGE, AW / 2) + 0.4, 0.08, 0.16), rot=(0, sgn * ang, 0))

# 루프탑 난간 (S·W·N 가장자리)
gT = group('f3_terrace', 3)
def rail(p0, p1, h=0.8):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    n = max(2, int(d.length / 0.45) + 1)
    for i in range(n):
        p = p0 + d * (i / (n - 1))
        box(gT, 'wood2', (p.x, p.y, Z3 + h / 2), (0.08, 0.08, h))
    mid = (p0 + p1) / 2
    ax = 0 if abs(d.x) > abs(d.y) else math.pi / 2
    box(gT, 'beam', (mid.x, mid.y, Z3 + h), (d.length + 0.1, 0.12, 0.08), rot=(0, 0, ax))
    box(gT, 'beam', (mid.x, mid.y, Z3 + h * 0.45), (d.length, 0.05, 0.05), rot=(0, 0, ax))
e = 0.08
rail((-W / 2 + e, -D / 2 + e), (XA, -D / 2 + e))
rail((-W / 2 + e, -D / 2 + e), (-W / 2 + e, D / 2 - e))
rail((-W / 2 + e, D / 2 - e), (XA, D / 2 - e))

def chair(g, x, y, z, face=0.0, col='plank'):
    R = Matrix.Rotation(face, 4, 'Z')
    def P(dx, dy, dz):
        v = R @ Vector((dx, dy, dz))
        return (x + v.x, y + v.y, z + v.z)
    box(g, col, P(0, 0, 0.42), (0.46, 0.46, 0.06), rot=(0, 0, face))
    for dx in (-0.19, 0.19):
        for dy in (-0.19, 0.19):
            box(g, 'wood2', P(dx, dy, 0.21), (0.05, 0.05, 0.42), rot=(0, 0, face))
    box(g, col, P(0, 0.21, 0.72), (0.46, 0.05, 0.58), rot=(0.12, 0, face))

chair(gT, -2.2, 1.1, Z3, math.pi * 0.15)
chair(gT, -1.2, 1.4, Z3, -math.pi * 0.1)
box(gT, 'blanket', (-2.15, 1.25, Z3 + 0.62), (0.5, 0.12, 0.42), rot=(0.25, 0, math.pi * 0.15))
cyl(gT, 'pot', (-2.6, -1.9, Z3 + 0.2), 0.2, 0.4, r2=0.16, seg=10)
sphere(gT, 'leaf', (-2.6, -1.9, Z3 + 0.6), 0.32, scale=(1, 1, 1.2))
box(gT, 'plank2', (-1.7, -1.2, Z3 + 0.25), (0.5, 0.5, 0.05))                # 작은 탁자
cyl(gT, 'cream', (-1.65, -1.15, Z3 + 0.32), 0.06, 0.1, seg=10)
# 줄 전구
for i in range(9):
    t = i / 8
    x = -W / 2 + 0.1 + t * (XA + W / 2 - 0.2)
    sphere(gT, 'glowbulb', (x, -D / 2 + 0.08, Z3 + 0.95 - 0.12 * math.sin(t * math.pi)), 0.045, seg=8)

# 굴뚝 (용마루 뒤쪽, 걷히지 않음)
gC = group('f3_chimney', 3)
cxh, cyh = XB - 0.9, D / 2 - 0.9
box(gC, 'stone', (cxh, cyh, (Z3 + ZK + RIDGE + 1.0) / 2 + 0.3), (0.6, 0.6, ZK + RIDGE + 0.4 - Z3))
for k in range(6):
    box(gC, 'stone2', (cxh, cyh, Z3 + 0.6 + k * 0.42), (0.62, 0.62, 0.05))
box(gC, 'stone2', (cxh, cyh, ZK + RIDGE + 0.75), (0.74, 0.74, 0.12))
box(gC, 'dark', (cxh, cyh, ZK + RIDGE + 0.8), (0.34, 0.34, 0.06))

# 돔 천문대 (동쪽 경사면 위, 걷히지 않음 — 집의 상징)
gD = group('f3_dome', 3)
dx, dy = XR + 0.95, -0.1
dz = roof_z(dx)
cyl(gD, 'plank', (dx, dy, dz - 0.05), 0.72, 0.9, seg=16)
for k in range(3):
    cyl(gD, 'beam', (dx, dy, dz - 0.35 + k * 0.3), 0.735, 0.04, seg=16)
cyl(gD, 'paper', (dx, dy, dz + 0.42), 0.8, 0.08, seg=16)
sphere(gD, 'cream', (dx, dy, dz + 0.45), 0.76, seg=16, half=True)
for k in range(-2, 3):          # 돔 판 이음선
    a = k * 0.5
    box(gD, 'rule', (dx, dy, dz + 0.45 + 0.38), (0.03, 1.52, 0.03), rot=(0, 0, a))
box(gD, 'night', (dx + 0.25, dy - 0.2, dz + 0.85), (0.5, 0.36, 0.5), rot=(0, 0.6, -0.6))   # 열린 틈
# 데포르메 망원경: 굵고 짧게, 오른쪽 앞 하늘로
tel_dir = Vector((0.75, -0.45, 0.62)).normalized()
base = Vector((dx + 0.05, dy - 0.05, dz + 0.55))
q = Vector((0, 0, 1)).rotation_difference(tel_dir)
Rt = q.to_euler()
L_t = 1.85
cyl(gD, 'sage', tuple(base + tel_dir * (L_t / 2)), 0.25, L_t, rot=Rt, seg=14)
cyl(gD, 'brass', tuple(base + tel_dir * (L_t - 0.05)), 0.32, 0.3, rot=Rt, seg=14)
cyl(gD, 'brass', tuple(base + tel_dir * (L_t * 0.45)), 0.275, 0.1, rot=Rt, seg=14)
cyl(gD, 'night', tuple(base + tel_dir * (L_t + 0.11)), 0.26, 0.02, rot=Rt, seg=14)
cyl(gD, 'brass', tuple(base + tel_dir * (0.1)), 0.13, 0.3, rot=Rt, seg=12)

# ---------------------------------------------------------------- 1층 찻집 소품
g1 = group('f1_props', 1)
Zf = 0.08
box(g1, 'rug', (-1.3, -0.5, Zf + 0.01), (2.3, 1.7, 0.02))
for k, x in enumerate([-2.2, -1.75, -1.3, -0.85, -0.4]):
    box(g1, 'rule', (x, -0.5, Zf + 0.022), (0.04, 1.6, 0.005))
# 카운터 (ㄱ자)
box(g1, 'beam', (1.75, 1.05, Zf + 0.5), (1.7, 0.6, 1.0))
box(g1, 'plank', (1.75, 1.05, Zf + 1.03), (1.8, 0.7, 0.06))
box(g1, 'beam', (2.35, 0.2, Zf + 0.5), (0.6, 1.2, 1.0))
box(g1, 'plank', (2.35, 0.2, Zf + 1.03), (0.7, 1.3, 0.06))
for i in range(6):
    box(g1, 'plank2', (0.95 + i * 0.32, 0.74, Zf + 0.5), (0.04, 0.02, 0.9))
# 카운터 위: 드립 주전자, 드리퍼, 원두 병
cyl(g1, 'dark', (1.3, 1.05, Zf + 1.17), 0.11, 0.22, r2=0.07, seg=12)
cyl(g1, 'dark', (1.15, 1.05, Zf + 1.2), 0.012, 0.25, rot=(0, -1.1, 0), seg=6)
cyl(g1, 'cream', (1.75, 1.0, Zf + 1.14), 0.08, 0.16, r2=0.04, seg=12)
cyl(g1, 'jar', (1.75, 1.0, Zf + 1.06), 0.07, 0.1, seg=12)
for i, x in enumerate([2.15, 2.35]):
    cyl(g1, 'jar', (x, 0.0, Zf + 1.16), 0.07, 0.2, seg=10)
    cyl(g1, 'coffee', (x, 0.0, Zf + 1.11), 0.065, 0.1, seg=10)
# 뒷벽 선반 + 병·머그
for k, z in enumerate([1.35, 1.75, 2.15]):
    box(g1, 'plank2', (-1.0, D / 2 - T - 0.15, z), (1.6, 0.26, 0.05))
    for i in range(5):
        x = -1.65 + i * 0.32
        if (i + k) % 2:
            cyl(g1, 'jar', (x, D / 2 - T - 0.15, z + 0.12), 0.07, 0.2, seg=10)
            cyl(g1, 'coffee', (x, D / 2 - T - 0.15, z + 0.08), 0.066, 0.1, seg=10)
        else:
            cyl(g1, 'cream' if i % 3 else 'green', (x, D / 2 - T - 0.15, z + 0.08), 0.06, 0.12, seg=10)
# 칠판 메뉴판
box(g1, 'wood2', (1.45, D / 2 - T - 0.05, 1.95), (1.4, 0.04, 0.9))
box(g1, 'night', (1.45, D / 2 - T - 0.075, 1.95), (1.28, 0.03, 0.78))
for i in range(4):
    box(g1, 'paper', (1.3, D / 2 - T - 0.095, 2.2 - i * 0.16), (0.7 - 0.12 * (i % 2), 0.01, 0.025))
# 둥근 탁자 + 의자 + 잔
def table(g, x, y, z, r=0.36):
    cyl(g, 'plank', (x, y, z + 0.74), r, 0.05, seg=16)
    cyl(g, 'beam', (x, y, z + 0.37), 0.05, 0.72, seg=8)
    cyl(g, 'beam', (x, y, z + 0.03), 0.22, 0.05, seg=10)
for (x, y) in [(-2.0, -1.0), (-0.6, -0.2), (-2.0, 0.8)]:
    table(g1, x, y, Zf)
    chair(g1, x - 0.6, y, Zf, math.pi / 2, 'plank2')
    chair(g1, x + 0.6, y, Zf, -math.pi / 2, 'plank2')
    cyl(g1, 'cream', (x + 0.12, y, Zf + 0.81), 0.06, 0.09, seg=10)
    cyl(g1, 'coffee', (x + 0.12, y, Zf + 0.853), 0.05, 0.005, seg=10)
# 펜던트 등
for x in (1.2, 2.0):
    cyl(g1, 'dark', (x, 0.95, H1 - 0.3), 0.01, 0.6, seg=4)
    cyl(g1, 'wood2', (x, 0.95, H1 - 0.62), 0.04, 0.12, r2=0.16, seg=10)
    sphere(g1, 'glowbulb', (x, 0.95, H1 - 0.72), 0.07, seg=8)
# 난로 (오른쪽 앞 구석)
box(g1, 'dark', (2.4, -1.8, Zf + 0.4), (0.6, 0.5, 0.8))
box(g1, 'glow', (2.4, -2.06, Zf + 0.35), (0.3, 0.02, 0.22))
cyl(g1, 'dark', (2.4, -1.8, (Zf + 0.8 + H1) / 2), 0.08, H1 - 0.8 - Zf, seg=8)
cyl(g1, 'brass', (2.35, -1.75, Zf + 0.9), 0.1, 0.16, r2=0.06, seg=10)
anchor('cafe', (-1.3, -0.4, 1.2))
anchor('counter', (1.9, 0.6, 1.5))
anchor('board', (1.45, D / 2 - 0.4, 2.2))

# 바깥 (땅 위): 벤치, 화분, 장작
gx = group('outside', 0)
box(gx, 'dark', (-1.4, -D / 2 - 0.55, 0.42), (1.3, 0.36, 0.06))
for dxx in (-0.55, 0.55):
    box(gx, 'dark', (-1.4 + dxx, -D / 2 - 0.55, 0.2), (0.06, 0.3, 0.4))
for (x, y, s) in [(-W / 2 - 0.45, -D / 2 - 0.35, 1.0), (-W / 2 - 0.2, -D / 2 - 0.8, 0.75),
                  (W / 2 + 0.45, -D / 2 - 0.35, 0.9), (W / 2 + 0.4, D / 2 + 0.3, 1.0),
                  (0.0, -D / 2 - 0.4, 0.6), (-W / 2 - 0.4, D / 2 + 0.2, 0.8)]:
    cyl(gx, 'pot', (x, y, 0.18 * s), 0.18 * s, 0.36 * s, r2=0.14 * s, seg=10)
    sphere(gx, 'leaf', (x, y, 0.5 * s), 0.26 * s, seg=10, scale=(1, 1, 1.25))
for row in range(3):
    for i in range(5 - row):
        y = -D / 2 + 0.4 + i * 0.27 + row * 0.135
        cyl(gx, 'log' if (i + row) % 2 else 'log2', (W / 2 + 0.38, y, 0.13 + row * 0.23), 0.13, 0.6, axis='X', seg=8)

# ---------------------------------------------------------------- 2층 갤러리 소품 (화실 왼쪽 · 공방 오른쪽)
g2 = group('f2_props', 2)
Zf2 = Z2
# 칸막이 (뒤쪽 절반, 문 하나)
box(g2, 'plaster', (0.3, 1.35, Zf2 + H2 / 2), (0.1, 2.3, H2))
box(g2, 'beam', (0.3, 0.15, Zf2 + H2 / 2), (0.16, 0.16, H2))
# 화실: 이젤 + 그림, 의자, 보조탁자, 기댄 캔버스, 왼쪽 벽 긴 두루마리(연표)
ex, ey = -1.5, -0.4
for a in (-0.25, 0.25):
    box(g2, 'plank', (ex + a, ey, Zf2 + 0.8), (0.05, 0.05, 1.6), rot=(0.12, a * 0.3, 0))
box(g2, 'plank', (ex, ey + 0.2, Zf2 + 0.75), (0.05, 0.05, 1.5), rot=(-0.3, 0, 0))
box(g2, 'cream', (ex, ey - 0.06, Zf2 + 1.25), (0.8, 0.04, 0.6), rot=(0.12, 0, 0))
box(g2, 'sage', (ex - 0.1, ey - 0.085, Zf2 + 1.2), (0.45, 0.01, 0.25), rot=(0.12, 0, 0))
box(g2, 'plank', (ex, ey - 0.04, Zf2 + 0.92), (0.9, 0.12, 0.04))
cyl(g2, 'plank2', (ex + 0.1, ey - 0.8, Zf2 + 0.3), 0.18, 0.04, seg=12)
cyl(g2, 'beam', (ex + 0.1, ey - 0.8, Zf2 + 0.15), 0.04, 0.3, seg=6)
box(g2, 'plank2', (-0.6, -1.3, Zf2 + 0.35), (0.6, 0.45, 0.04))
for i in range(4):
    box(g2, 'wood2', (-0.6 + (i - 1.5) * 0.12, -1.3, Zf2 + 0.18), (0.03, 0.4, 0.34))
for i, c in enumerate(['jar', 'night', 'jar']):
    cyl(g2, c, (-0.75 + i * 0.13, -1.3, Zf2 + 0.43), 0.045, 0.12, seg=8)
cyl(g2, 'jar', (-0.45, -1.2, Zf2 + 0.45), 0.06, 0.16, seg=8)
for i in range(3):
    box(g2, 'cream' if i % 2 else 'paper', (-W / 2 + T + 0.12, 1.6 - i * 0.12, Zf2 + 0.45), (0.04, 0.6 - i * 0.08, 0.8 - i * 0.12), rot=(0, -0.15, 0))
# 긴 두루마리 연표 (왼쪽 벽 안쪽)
xw = -W / 2 + T + 0.06
box(g2, 'paper', (xw, 0.2, Zf2 + 1.55), (0.02, 3.2, 0.62))
for i in range(9):
    box(g2, 'rule' if i % 2 else 'sage', (xw + 0.01, -1.2 + i * 0.35, Zf2 + 1.55), (0.01, 0.22, 0.05 + 0.04 * (i % 3)))
for z in (Zf2 + 1.87, Zf2 + 1.23):
    cyl(g2, 'beam', (xw + 0.02, 0.2, z), 0.03, 3.35, axis='Y', seg=6)
# 공방: 작업대 + 서랍, 타공판 + 공구, 스탠드, 상자
bx, by = 1.75, D / 2 - T - 0.45
box(g2, 'plank', (bx, by, Zf2 + 0.9), (1.9, 0.75, 0.08))
box(g2, 'beam', (bx + 0.55, by, Zf2 + 0.45), (0.7, 0.68, 0.86))
for k in range(3):
    box(g2, 'plank2', (bx + 0.55, by - 0.35, Zf2 + 0.2 + k * 0.27), (0.6, 0.02, 0.2))
for dxx in (-0.85,):
    for dyy in (-0.3, 0.3):
        box(g2, 'beam', (bx + dxx, by + dyy, Zf2 + 0.45), (0.08, 0.08, 0.86))
box(g2, 'rule', (bx, D / 2 - T - 0.05, Zf2 + 1.7), (1.7, 0.03, 0.9))
for i in range(7):
    box(g2, 'dark', (bx - 0.7 + i * 0.23, D / 2 - T - 0.08, Zf2 + 1.72 + 0.1 * (i % 2)), (0.04, 0.02, 0.35 + 0.1 * (i % 3)))
cyl(g2, 'dark', (bx - 0.6, by + 0.15, Zf2 + 1.15), 0.015, 0.45, rot=(0.4, 0, 0), seg=6)
cyl(g2, 'sage', (bx - 0.6, by - 0.05, Zf2 + 1.35), 0.06, 0.14, r2=0.13, rot=(2.4, 0, 0), seg=10)
box(g2, 'paper', (bx - 0.1, by - 0.1, Zf2 + 0.95), (0.5, 0.35, 0.02), rot=(0, 0, 0.1))
box(g2, 'plank2', (2.4, -0.2, Zf2 + 0.2), (0.5, 0.4, 0.4))
# 작업 노트 책상 (가운데 앞)
box(g2, 'plank', (1.4, -1.1, Zf2 + 0.74), (1.1, 0.6, 0.06))
for dxx in (-0.48, 0.48):
    for dyy in (-0.24, 0.24):
        box(g2, 'beam', (1.4 + dxx, -1.1 + dyy, Zf2 + 0.36), (0.06, 0.06, 0.72))
box(g2, 'cream', (1.35, -1.1, Zf2 + 0.785), (0.5, 0.34, 0.03))
box(g2, 'rule', (1.35, -1.1, Zf2 + 0.802), (0.01, 0.34, 0.005))
cyl(g2, 'plank2', (1.4, -1.65, Zf2 + 0.45), 0.17, 0.04, seg=12)
cyl(g2, 'beam', (1.4, -1.65, Zf2 + 0.22), 0.04, 0.44, seg=6)
anchor('atelier', (-1.6, 0.2, Zf2 + 1.6))
anchor('shop', (1.8, 1.4, Zf2 + 1.5))
anchor('desk', (1.4, -1.1, Zf2 + 1.2))

# ---------------------------------------------------------------- 3층 소품 (놀이방 · 천문대)
g3 = group('f3_props', 3)
Zf3 = Z3
# 체크 카펫
rx, ry, n_x, n_y, tsz = XR - 0.2, -1.0, 6, 5, 0.28
for i in range(n_x):
    for j in range(n_y):
        box(g3, 'red' if (i + j) % 2 else 'cream', (rx + (i - n_x / 2 + 0.5) * tsz, ry + (j - n_y / 2 + 0.5) * tsz, Zf3 + 0.01), (tsz, tsz, 0.02))
# 장난감 로켓
rkx, rky = rx - 0.2, ry + 0.1
cyl(g3, 'cream', (rkx, rky, Zf3 + 0.38), 0.13, 0.5, seg=12)
cyl(g3, 'red', (rkx, rky, Zf3 + 0.75), 0.13, 0.24, r2=0.0, seg=12)
for a in range(3):
    ang_ = a * 2 * math.pi / 3
    box(g3, 'red', (rkx + 0.14 * math.cos(ang_), rky + 0.14 * math.sin(ang_), Zf3 + 0.2), (0.16, 0.03, 0.26), rot=(0, 0, ang_))
cyl(g3, 'night', (rkx, rky - 0.125, Zf3 + 0.45), 0.05, 0.02, axis='Y', seg=10)
# 블록
for (bx_, by_, bz_, c) in [(0.25, -0.2, 0, 'sage'), (0.45, -0.25, 0, 'cream'), (0.35, -0.22, 0.2, 'red'), (0.7, 0.05, 0, 'night')]:
    box(g3, c, (rx + bx_, ry + by_, Zf3 + 0.1 + bz_), (0.18, 0.18, 0.18), rot=(0, 0, bx_))
# 텐트
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, segments=4, radius1=0.5, radius2=0.0, depth=1.0)
bm.transform(Matrix.Translation((XB - 0.75, -1.7, Zf3 + 0.5)) @ Matrix.Rotation(math.pi / 4, 4, 'Z'))
_obj_from_bm(bm, 'tent', 'paper', g3)
cyl(g3, 'beam', (XB - 0.75, -1.7, Zf3 + 1.05), 0.02, 0.3, seg=4)
# 낮은 책장 (동쪽 무릎벽 앞)
box(g3, 'beam', (XB - 0.35, 0.0, Zf3 + 0.35), (0.3, 0.9, 0.7))
for k in range(2):
    for i in range(6):
        box(g3, ['red', 'sage', 'night', 'cream', 'rug', 'green'][(i + k) % 6], (XB - 0.38, -0.33 + i * 0.13, Zf3 + 0.2 + k * 0.32), (0.2, 0.09, 0.24 - 0.03 * (i % 2)))
# 천문대 쪽: 삼각대, 지구본, 별지도
for a in range(3):
    ang_ = a * 2 * math.pi / 3
    box(g3, 'beam', (dx - 0.1 + 0.25 * math.cos(ang_), dy + 0.25 * math.sin(ang_), Zf3 + 0.55), (0.04, 0.04, 1.15),
        rot=(0.22 * math.sin(ang_), -0.22 * math.cos(ang_), 0))
box(g3, 'plank2', (XR - 0.5, D / 2 - 0.7, Zf3 + 0.4), (0.5, 0.4, 0.04))
cyl(g3, 'beam', (XR - 0.5, D / 2 - 0.7, Zf3 + 0.2), 0.04, 0.4, seg=6)
cyl(g3, 'brass', (XR - 0.5, D / 2 - 0.7, Zf3 + 0.47), 0.06, 0.1, seg=8)
sphere(g3, 'sage', (XR - 0.5, D / 2 - 0.7, Zf3 + 0.68), 0.17, seg=12)
for i, (x, z) in enumerate([(XR - 0.7, ZK + 0.6), (XR + 0.3, ZK + 0.9)]):
    box(g3, 'night', (x, D / 2 - 0.2, z), (0.55, 0.02, 0.42))
    for s in range(5):
        box(g3, 'paper', (x - 0.18 + s * 0.09, D / 2 - 0.215, z - 0.1 + 0.07 * ((s * 7 + i) % 4)), (0.03, 0.01, 0.03))
# 다락 펜던트 등
cyl(g3, 'dark', (XR, -0.6, ZK + RIDGE - 0.5), 0.01, 0.9, seg=4)
sphere(g3, 'glowbulb', (XR, -0.6, ZK + RIDGE - 0.98), 0.08, seg=8)
anchor('dome', (dx + 0.2, dy, dz + 1.3))
anchor('play', (rx, ry, Zf3 + 0.9))
anchor('roof', (-1.8, 0.6, Zf3 + 1.1))

# ---------------------------------------------------------------- 합치기 + 내보내기
root = bpy.data.objects.new('house', None)
bpy.context.scene.collection.objects.link(root)
for name, g in GROUPS.items():
    objs = g['objs']
    if not objs:
        continue
    if len(objs) > 1:
        with bpy.context.temp_override(active_object=objs[0], selected_editable_objects=objs, selected_objects=objs):
            bpy.ops.object.join()
    ob = objs[0]
    ob.name = name
    ob.data.name = name
    for k, v in g['props'].items():
        ob[k] = v
    ob.parent = root
for a in ANCHORS:
    a.parent = root

out = sys.argv[-1] if sys.argv[-1].endswith('.glb') else 'house.glb'
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_extras=True, export_apply=True,
                          export_yup=True, export_materials='EXPORT', export_normals=True,
                          use_selection=False)
tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
print('EXPORTED', out, 'groups', len(GROUPS), 'faces', tris)
