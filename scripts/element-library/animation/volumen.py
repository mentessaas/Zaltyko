"""Volumen style for the 10 pilot elements."""
import math
from figure3 import *
from figure import place

W, H = 360, 270
NAVY, BLUE, SKY = '#13235f', '#1e3fa8', '#8fb4ff'
APP_D, APP_L = '#6f7da0', '#c7d0e3'
FONT = 'font-family="Avenir Next,Segoe UI,system-ui,sans-serif"'

def defs(uid):
    return (f'<linearGradient id="{uid}b" gradientUnits="userSpaceOnUse" x1="60" y1="10" x2="300" y2="260">'
            f'<stop offset="0" stop-color="#5a7bea"/><stop offset=".5" stop-color="{BLUE}"/><stop offset="1" stop-color="{NAVY}"/></linearGradient>'
            f'<linearGradient id="{uid}n" gradientUnits="userSpaceOnUse" x1="60" y1="10" x2="300" y2="260"><stop offset="0" stop-color="#8aa3f5"/><stop offset=".5" stop-color="#4565d2"/><stop offset="1" stop-color="#22388f"/></linearGradient>'
            f'<linearGradient id="{uid}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbfcff"/><stop offset="1" stop-color="#e5ebf8"/></linearGradient>'
            f'<linearGradient id="{uid}m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a97b6"/><stop offset="1" stop-color="#5d6a8c"/></linearGradient>'
            f'<linearGradient id="{uid}t" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="{W}" y2="0"><stop offset="0" stop-color="{SKY}" stop-opacity="0"/><stop offset=".5" stop-color="{SKY}" stop-opacity=".55"/><stop offset="1" stop-color="{BLUE}" stop-opacity=".6"/></linearGradient>'
            f'<linearGradient id="{uid}tr" gradientUnits="userSpaceOnUse" x1="{W}" y1="0" x2="0" y2="0"><stop offset="0" stop-color="{SKY}" stop-opacity="0"/><stop offset=".5" stop-color="{SKY}" stop-opacity=".55"/><stop offset="1" stop-color="{BLUE}" stop-opacity=".6"/></linearGradient>'
            f'<filter id="{uid}s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="7" stdDeviation="6" flood-color="{NAVY}" flood-opacity=".24"/></filter>'
            f'<filter id="{uid}f" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>')

def metal(uid): return f'url(#{uid}m)'

# ---------- apparatus ----------
def floor(y): return f'<line x1="26" y1="{y}" x2="{W-26}" y2="{y}" stroke="{APP_L}" stroke-width="2" stroke-linecap="round"/>'
def ground_shadow(uid, x, y, rx): return f'<ellipse cx="{x}" cy="{y+3}" rx="{rx}" ry="5" fill="{NAVY}" opacity=".2" filter="url(#{uid}f)"/>'
def rings(uid, hands, top=8):
    o = ''
    for h in hands:
        o += f'<line x1="{h[0]:.1f}" y1="{top}" x2="{h[0]:.1f}" y2="{h[1]-10:.1f}" stroke="{APP_D}" stroke-width="2.2"/>'
        o += f'<circle cx="{h[0]:.1f}" cy="{h[1]:.1f}" r="9.5" fill="none" stroke="{metal(uid)}" stroke-width="4.5"/>'
    return o
def pbars(uid, y=134):
    return (f'<line x1="82" y1="{y-8}" x2="300" y2="{y-8}" stroke="{APP_L}" stroke-width="6" stroke-linecap="round"/>'
            f'<rect x="96" y="{y}" width="5" height="{232-y}" fill="{APP_L}"/><rect x="260" y="{y}" width="5" height="{232-y}" fill="{APP_L}"/>'
            f'<rect x="66" y="{y-3.5}" width="228" height="7" rx="3.5" fill="{metal(uid)}"/>' + floor(232))
def beam(uid, y=200):
    return (f'<rect x="96" y="{y+11}" width="6" height="44" fill="{APP_L}"/><rect x="258" y="{y+11}" width="6" height="44" fill="{APP_L}"/>'
            f'<rect x="24" y="{y}" width="312" height="12" rx="4" fill="{metal(uid)}"/>')
def hbar(uid, c, floor_y):
    return (f'<rect x="{c[0]-2}" y="{c[1]}" width="4" height="{floor_y-c[1]}" fill="{APP_L}"/>' + floor(floor_y) +
            f'<circle cx="{c[0]}" cy="{c[1]}" r="6.5" fill="{metal(uid)}"/>')
def vault(uid, gy=214):
    return (floor(gy) + f'<polygon points="58,{gy} 114,{gy} 114,{gy-12}" fill="{metal(uid)}"/>'
            f'<path d="M214 {gy} l4 -72 h8 l4 72 z" fill="{APP_L}"/><rect x="184" y="128" width="76" height="16" rx="8" fill="{metal(uid)}"/>'
            f'<rect x="276" y="{gy-6}" width="70" height="7" rx="3" fill="{APP_L}"/>')
def horse(uid):
    return (floor(230) + f'<rect x="114" y="184" width="9" height="46" fill="{APP_L}"/><rect x="238" y="184" width="9" height="46" fill="{APP_L}"/>'
            f'<rect x="80" y="150" width="200" height="35" rx="17" fill="{metal(uid)}"/>'
            f'<path d="M141 151 v-13 a3 3 0 0 1 3 -3 h20 a3 3 0 0 1 3 3 v13" fill="none" stroke="{APP_D}" stroke-width="6"/>'
            f'<path d="M193 151 v-13 a3 3 0 0 1 3 -3 h20 a3 3 0 0 1 3 3 v13" fill="none" stroke="{APP_D}" stroke-width="6"/>')

# ---------- marks ----------
def fig(uid, p, x, main=True, op=.15):
    if main:
        return f'<g filter="url(#{uid}s)">' + silhouette(p, x, f'url(#{uid}b)', far_fill='#1a2c78', near_fill=f'url(#{uid}n)') + '</g>'
    return silhouette(p, x, f'url(#{uid}b)', op=op)
def trail(uid, d, rev=False, w=7):
    return f'<path d="{d}" fill="none" stroke="url(#{uid}{"tr" if rev else "t"})" stroke-width="{w}" stroke-linecap="round"/>'
def tip(x, y, ang, s=8):
    a = math.radians(ang)
    r = lambda px, py: (x + px*math.cos(a) - py*math.sin(a), y + px*math.sin(a) + py*math.cos(a))
    pts = [r(-s, -s*.75), r(0, 0), r(-s, s*.75)]
    return f'<polyline points="{" ".join(f"{px:.1f},{py:.1f}" for px, py in pts)}" fill="none" stroke="{BLUE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".8"/>'
def pill(uid, x, y, text):
    w = 8.2 * len(text) + 22
    return (f'<rect x="{x - w/2:.1f}" y="{y-14}" width="{w:.1f}" height="27" rx="13.5" fill="#ffffff" filter="url(#{uid}s)"/>'
            f'<text x="{x}" y="{y+4.5}" text-anchor="middle" {FONT} font-size="13" font-weight="700" fill="{BLUE}">{text}</text>')
def note(x, y, text):
    return f'<text x="{x}" y="{y}" text-anchor="middle" {FONT} font-size="12" font-weight="500" fill="#66708d">{text}</text>'
def frame(uid, body, h=H, w=None):
    w = w or W
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img">'
            f'<defs>{defs(uid)}</defs><rect width="{w}" height="{h}" rx="22" fill="url(#{uid}bg)"/>{body}</svg>')

# ---------- the 10 elements ----------
def planche(u):
    p = Pose(torso=88, arm_n=(202, 202), arm_f=(204, 204), leg_n=(268, 268), leg_f=(269, 269), head=2)
    pel = place(p, 'han', (206, 200))
    return frame(u, floor(200) + ground_shadow(u, 178, 200, 78) + fig(u, p, pel) + pill(u, 300, 44, '2 s'))

def cross(u):
    p = Pose(torso=0, arm_n=(90, 90), arm_f=(270, 270), leg_n=(181, 181), leg_f=(179, 179), front=True)
    pel = (180, 158); j = p.joints(pel)
    return frame(u, rings(u, [j['han'], j['haf']]) + fig(u, p, pel) + pill(u, 304, 44, '2 s'))

def swallow(u):
    p = Pose(torso=270, arm_n=(102, 102), arm_f=(105, 105), leg_n=(90, 90), leg_f=(89, 89), head=-4)
    pel = place(p, 'han', (194, 132)); j = p.joints(pel)
    return frame(u, rings(u, [j['han']]) + fig(u, p, pel) + note(180, 200, 'Brazos abiertos a los lados, a la altura de las anillas') + pill(u, 304, 44, '2 s'))

def l_sit(u):
    p = Pose(torso=-6, arm_n=(170, 170), arm_f=(173, 173), leg_n=(90, 90), leg_f=(88, 88))
    pel = place(p, 'han', (178, 125))
    return frame(u, pbars(u) + fig(u, p, pel) + pill(u, 304, 44, '2 s'))

def split_leap(u):
    take = Pose(torso=-6, arm_n=(320, 315), arm_f=(330, 325), leg_n=(180, 178), leg_f=(232, 232))
    mid = Pose(torso=-6, arm_n=(290, 285), arm_f=(30, 40), leg_n=(272, 268), leg_f=(92, 88))
    land = Pose(torso=4, arm_n=(300, 310), arm_f=(40, 50), leg_n=(180, 178), leg_f=(120, 118))
    b = beam(u) + fig(u, take, place(take, 'ton', (296, 200)), False) + fig(u, land, place(land, 'ton', (64, 200)), False)
    b += trail(u, 'M 280 150 Q 180 70 76 150', True) + tip(76, 150, 128)
    b += ground_shadow(u, 180, 200, 44) + fig(u, mid, (180, 118)) + pill(u, 306, 40, '180°')
    return frame(u, b)

def round_off(u):
    g = 222
    p1 = Pose(torso=30, arm_n=(30, 30), arm_f=(34, 34), leg_n=(125, 180), leg_f=(226, 226))
    p2 = Pose(torso=150, arm_n=(152, 152), arm_f=(154, 154), leg_n=(330, 330), leg_f=(240, 240))
    p3 = Pose(torso=180, arm_n=(180, 180), arm_f=(181, 181), leg_n=(358, 0), leg_f=(2, 2))
    p4 = Pose(torso=-6, arm_n=(-4, -4), arm_f=(0, 0), leg_n=(168, 188), leg_f=(170, 190))
    b = floor(g) + fig(u, p2, place(p2, 'han', (110, g)), False, .2)
    b += trail(u, 'M 70 92 Q 190 0 292 96') + tip(292, 96, 60)
    b += ground_shadow(u, 196, g, 20) + fig(u, p3, place(p3, 'han', (196, g)))
    fl = Pose(torso=330, arm_n=(330, 330), arm_f=(334, 334), leg_n=(150, 150), leg_f=(152, 152))
    b += fig(u, fl, (250, 150), False, .2)
    b += fig(u, p4, place(p4, 'ton', (306, g)), False, .38)
    b += note(110, 254, '¼ de giro') + note(258, 254, '¼ de giro, cae de espaldas')
    return frame(u, b)

def layout_full(u):
    st = lambda t, arms=None: Pose(torso=t, arm_n=arms or (t + 180, t + 180), arm_f=arms or (t + 177, t + 177), leg_n=(t + 180, t + 180), leg_f=(t + 179, t + 179))
    a = Pose(torso=2, arm_n=(4, 4), arm_f=(8, 8), leg_n=(180, 180))
    z = Pose(torso=-8, arm_n=(40, 40), arm_f=(36, 36), leg_n=(172, 186), leg_f=(174, 188))
    b = floor(236) + fig(u, a, place(a, 'ton', (304, 236)), False, .18)
    b += fig(u, st(-60), (266, 150), False) + fig(u, st(-240), (94, 150), False)
    b += trail(u, 'M 306 140 C 304 56 246 30 212 38', True) + trail(u, 'M 150 38 C 116 30 58 56 58 142', True) + tip(58, 142, 92)
    b += fig(u, st(-180), (180, 104))
    b += f'<ellipse cx="180" cy="128" rx="27" ry="8" fill="none" stroke="{BLUE}" stroke-width="3" opacity=".85"/>' + tip(207, 130, -16, 6)
    b += fig(u, z, place(z, 'ton', (58, 236)), False, .32)
    b += pill(u, 180, 206, 'pirueta 360°')
    return frame(u, b)

def yurchenko(u):
    g = 236
    p0 = Pose(torso=180, arm_n=(180, 180), arm_f=(182, 182), leg_n=(340, 340), leg_f=(30, 30))
    p1 = Pose(torso=12, arm_n=(14, 14), arm_f=(18, 18), leg_n=(178, 182))
    p2 = Pose(torso=185, arm_n=(182, 182), arm_f=(184, 184), leg_n=(347, 347), leg_f=(350, 350))
    p3 = Pose(torso=275, arm_n=(95, 95), leg_n=(95, 95), leg_f=(93, 93))
    p4 = Pose(torso=-6, arm_n=(272, 272), arm_f=(268, 268), leg_n=(170, 188), leg_f=(172, 190))
    b = vault(u, g).replace('128"', '150"').replace('l4 -72', 'l4 -80')
    b += fig(u, p0, place(p0, 'han', (30, g)), False, .14) + fig(u, p1, place(p1, 'ton', (92, g - 7)), False, .22) + fig(u, p3, (292, 46), False, .18)
    b += trail(u, 'M 106 172 Q 140 48 196 68') + trail(u, 'M 240 40 Q 312 -6 326 114') + tip(324, 114, 74)
    b += fig(u, p2, place(p2, 'han', (212, 150)))
    b += fig(u, p4, place(p4, 'ton', (318, g - 6)), False, .38)
    b += note(64, 262, 'Rondada') + note(222, 262, 'Flic-flac') + note(314, 262, 'Mortal')
    return frame(u, f'<g transform="translate(0,34)">{b}</g>', h=312)

def tkatchev(u):
    bar = (180, 100)
    tap = Pose(torso=12, arm_n=(12, 12), arm_f=(14, 14), leg_n=(192, 192), leg_f=(193, 193))
    rel = Pose(torso=235, arm_n=(235, 235), arm_f=(237, 237), leg_n=(55, 55), leg_f=(56, 56))
    top = Pose(torso=-4, arm_n=(138, 138), arm_f=(150, 150), leg_n=(66, 70), leg_f=(112, 108))
    hang = Pose(torso=24, arm_n=(24, 24), arm_f=(26, 26), leg_n=(204, 204), leg_f=(205, 205))
    b = hbar(u, bar, 292)
    b += fig(u, rel, place(rel, 'han', (188, 104)), False, .2)
    b += fig(u, hang, place(hang, 'han', bar), False, .2)
    b += trail(u, 'M 300 70 C 300 10 230 -8 200 4', True) + trail(u, 'M 140 18 C 104 30 92 66 98 96', True) + tip(98, 96, 96)
    b += fig(u, top, (168, 58))
    b += note(312, 140, 'Suelta') + note(70, 150, 'Recoge')
    return frame(u, f'<g transform="translate(0,30)">{b}</g>', h=320)

def circle_ph(u):
    p = Pose(torso=84, arm_n=(180, 180), arm_f=(214, 200), leg_n=(266, 266), leg_f=(265, 265))
    ell = f'<ellipse cx="170" cy="106" rx="140" ry="22" fill="none" stroke="url(#{u}t)" stroke-width="7"/>'
    b = ell + horse(u) + fig(u, p, place(p, 'han', (206, 138))) + tip(240, 126, 168)
    b += note(180, 40, 'Suelta un instante el arco para que pasen las piernas')
    return frame(u, b)

SCENES = {
 'mfx_planche_hold': planche, 'mrg_cross_any_or_v_cross': cross, 'mrg_swallow': swallow,
 'mpb_sp_l_sit_hold': l_sit, 'bb_split_leap_fwd': split_leap, 'fx_round_off': round_off,
 'mfx_salto_bwd_stretched_full_twist': layout_full, 'vt_ro_bwd_layout': yurchenko,
 'mhb_fl_tkatchev_straddle': tkatchev, 'mph_circle_or_flair_side_support': circle_ph,
}
