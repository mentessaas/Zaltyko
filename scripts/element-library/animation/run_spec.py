"""Turn an element animation spec (JSON) into frames, validate them, and render.

usage: python3 run_spec.py <spec.json>... [--render] [--out DIR]
Outputs per spec in DIR (default ./out): <key>.mp4 (preview), <key>.svg (static pictogram),
<key>-sheet.png (contact sheet for review), <key>-report.json (physics + validation).
"""
import json, math, os, subprocess, sys
from figure import Pose
from engine2 import Shape, Timeline, contact, flight, validate, com, FPS, PX_PER_M, joint_angles
from scenes import SCENES
import volumen as V

def pose_of(d):
    p = Pose(torso=d['torso'], arm_n=tuple(d['arm_n']), arm_f=tuple(d.get('arm_f', d['arm_n'])),
             leg_n=tuple(d['leg_n']), leg_f=tuple(d.get('leg_f', d['leg_n'])), head=d.get('head', 0), front=d.get('front', False))
    p.facing = d.get('facing', 1); return p

def shape_of(d):
    p = pose_of(d); s = Shape.of(p, p.facing); s.front = p.front; return s

def build(spec):
    sc = SCENES[spec['scene']](); tl = Timeline(); flights = []
    for ph in spec['timeline']:
        if 'contact' in ph:
            c = ph['contact']; pt = sc.at(c['at']) if isinstance(c['at'], str) else tuple(c['at'])
            keys = [(k.get('dt', 0), k['pose']['torso'], shape_of(k['pose'])) for k in c['keys']]
            if tl.frames and keys[0][0] == 0 and len(keys) > 1 and c.get('continue', True):
                pass
            contact(tl, keys, c['joint'], pt, surface=sc.floor_y)
            if c.get('front'):
                for i in range(len(tl.frames)): tl.frames[i][0].front = True
        else:
            f = ph['flight']; land = f['land']; pt = sc.at(land['at']) if isinstance(land['at'], str) else tuple(land['at'])
            p0, pel0, _ = tl.last; c0y = pel0[1] + com(p0)[1]
            apex = c0y - f['riseM'] * PX_PER_M if 'riseM' in f else None
            shapes = [(0.0, Shape.of(p0, getattr(p0, 'facing', 1)))] + [(s['u'], shape_of(s['pose'])) for s in f['shapes']]
            start = len(tl.frames)
            info = flight(tl, f.get('durationS'), shapes, f['rotation'], land['joint'], pt, p0.torso + f['rotation'],
                          surface=sc.floor_y, apex_y=apex)
            twist = f.get('twist', 0)
            if twist:
                w0, w1 = f.get('twistWindow', [0.15, 0.85]); n = len(tl.frames) - start
                for i in range(start, len(tl.frames)):
                    u = (i - start + 1) / n
                    done = max(0.0, min(1.0, (u - w0) / (w1 - w0))) * abs(twist)
                    tl.frames[i][2]['twist'] = 0 < done < abs(twist)
                    if round(done / 180) % 2 == 1:
                        p = tl.frames[i][0]; p.facing = -getattr(p, 'facing', 1)
            info['twist'] = twist; flights.append(info)
    return sc, tl, flights

def validate_spec(spec, sc, tl):
    front = spec.get('view') == 'front'
    return validate(tl, floor_y=sc.floor_y, bars=sc.bars, front=front)

def overlay(sc, p, pel, meta):
    o = ''
    if sc.kind == 'rings':
        j = p.joints(pel)
        tops = [(180 - 21, 6), (180 + 21, 6)] if p.front else [(j['han'][0], 6), (j['han'][0], 6)]
        for (tx, ty), h in zip(tops, (j['haf'], j['han']) if p.front else (j['han'], j['han'])):
            o += f'<line x1="{tx}" y1="{ty}" x2="{h[0]:.1f}" y2="{h[1]-9:.1f}" stroke="{V.APP_D}" stroke-width="2"/>'
            o += f'<circle cx="{h[0]:.1f}" cy="{h[1]:.1f}" r="8.5" fill="none" stroke="#7d8aab" stroke-width="4"/>'
    if meta.get('twist'):
        j = p.joints(pel); c = ((j['pelvis'][0] + j['neck'][0]) / 2, (j['pelvis'][1] + j['neck'][1]) / 2)
        o += f'<ellipse cx="{c[0]:.1f}" cy="{c[1]:.1f}" rx="26" ry="8" transform="rotate({p.torso:.1f} {c[0]:.1f} {c[1]:.1f})" fill="none" stroke="{V.BLUE}" stroke-width="3" opacity=".8"/>'
    return o

def headroom(tl, margin=22):
    """Pixels to shift the scene down so the highest point of any frame stays inside the canvas."""
    top = min(min(y for k, (x, y) in p.joints(pel).items()) - 12 for p, pel, _ in tl.frames)
    return max(0, round(margin - top))

def shifted(body, dy): return f'<g transform="translate(0,{dy})">{body}</g>' if dy else body

def frame_svg(sc, tl, i, trails=True, uid='a'):
    p, pel, meta = tl.frames[min(i, len(tl.frames) - 1)]
    body = sc.draw(uid)
    if trails and i < len(tl.frames):
        for lag, op in ((6, .06), (4, .09), (2, .13)):
            k = i - lag
            if k >= 0: q, qp, _ = tl.frames[k]; body += V.fig(uid, q, qp, False, op)
    body += overlay(sc, p, pel, meta) + V.fig(uid, p, pel)
    dy = headroom(tl)
    return V.frame(uid, shifted(body, dy), sc.h + dy)

def poster_svg(spec, sc, tl, uid):
    """Static pictogram: main frame solid, chosen ghost frames translucent."""
    n = len(tl.frames)
    ps = spec.get('poster', {})
    main = ps.get('main', n // 2); ghosts = ps.get('ghosts', [])
    body = sc.draw(uid)
    for g in ghosts:
        q, qp, _ = tl.frames[g]; body += overlay(sc, q, qp, {}) if sc.kind == 'rings' else ''
        body += V.fig(uid, q, qp, False, .16)
    p, pel, meta = tl.frames[main]
    body += overlay(sc, p, pel, meta) + V.fig(uid, p, pel)
    dy = headroom(tl)
    return V.frame(uid, shifted(body, dy), sc.h + dy)

def render(spec, sc, tl, out):
    key = spec['elementKey']; d = os.path.join(out, key + '_frames'); os.makedirs(d, exist_ok=True)
    hold = int(spec.get('holdS', 0.5) * FPS); n = len(tl.frames) + hold
    for i in range(n):
        open(f'{d}/f.svg', 'w').write(frame_svg(sc, tl, i, trails=i < len(tl.frames), uid='a'))
        subprocess.run(['rsvg-convert', '-w', '720', f'{d}/f.svg', '-o', f'{d}/f{i:03d}.png'], check=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', f'{d}/f%03d.png', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',
                    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', os.path.join(out, key + '.mp4')], check=True)
    picks = [round(k * (len(tl.frames) - 1) / 9) for k in range(10)]
    subprocess.run(['magick'] + [f'{d}/f{k:03d}.png' for k in picks] + ['-resize', '240x', '+append', os.path.join(out, key + '-sheet.png')], check=True)
    for f in os.listdir(d): os.remove(os.path.join(d, f))
    os.rmdir(d)
    open(os.path.join(out, key + '.svg'), 'w').write(poster_svg(spec, sc, tl, key[:10]))

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else 'out'
    if '--out' in sys.argv: args.remove(out)
    os.makedirs(out, exist_ok=True); bad = 0
    for path in args:
        spec = json.load(open(path))
        sc, tl, flights = build(spec)
        probs = validate_spec(spec, sc, tl)
        rep = dict(elementKey=spec['elementKey'], frames=len(tl.frames), seconds=round(len(tl.frames) / FPS, 2), flights=flights, problems=probs)
        json.dump(rep, open(os.path.join(out, spec['elementKey'] + '-report.json'), 'w'), indent=1, ensure_ascii=False)
        print(f"{spec['elementKey']}: {len(tl.frames)} frames, flights={flights}, problems={len(probs)}")
        for pr in probs[:8]: print('   ', pr)
        bad += bool(probs)
        if '--render' in sys.argv: render(spec, sc, tl, out)
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main()
