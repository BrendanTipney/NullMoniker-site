#!/usr/bin/env python3
"""Inline SVG diagrams for keyboard.html: the TPS43 wiring and three keymap layers.

Usage: python tools/build_diagrams.py keyboard-media/keymap.json keys.json out_dir
keys.json holds the real switch positions (Fusion mm) exported from the case model.
"""
import json, math, sys, html

ACCENT = '#a6ff6a'
WIRE = {'i2c': '#5ef2ff', 'ctl': '#ffb547', 'pwr': '#ff5ad9', 'gnd': '#9aa0a6'}
esc = lambda s: html.escape(str(s), quote=True)


# ---------------------------------------------------------------- wiring
def wiring_svg():
    W, H = 800, 604
    bx0, by0, bw, bh = 120, 78, 230, 430          # nice!nano outline (18 x 33 mm, to scale)
    pitch = 386 / 11 * (27.94 / 27.94)             # 12 pins over 27.94 mm
    pitch = bh * 27.94 / 33.3 / 11
    py0 = by0 + (bh - pitch * 11) / 2
    lx, rx = bx0 + 22, bx0 + bw - 22               # left and right pin columns
    # mounted components down, so the usual left column (P0.06 ...) sits on the right
    right = ['006', '008', 'GND', 'GND', '017', '020', '022', '024', '100', '011', '104', '106']
    left = ['B+', 'GND', 'RST', '3.3V', '031', '029', '002', '115', '113', '111', '010', '009']
    pin_y = lambda i: py0 + i * pitch
    tx0, ty0, tw, th = 548, 150, 210, 236          # TPS43 module
    fpc = ['SDA', 'SCL', '3V3', 'GND', 'RST', 'RDY']
    fy = lambda i: ty0 + 44 + i * 30
    fx = tx0 + 8
    o = [f'<svg class="kb-wiring" viewBox="0 0 {W} {H}" role="img" aria-labelledby="kbw-t kbw-d" xmlns="http://www.w3.org/2000/svg">',
         '<title id="kbw-t">TPS43 to nice!nano v2 wiring</title>',
         '<desc id="kbw-d">Six wire ribbon from the TPS43 to the right nice!nano. SDA to P0.06, SCL to P0.08, RST to P0.17 and '
         'RDY to P0.20 drop straight down the right edge; 3V3 and GND arc over the top to the 3.3V and GND pads on the other side.</desc>',
         '<defs><pattern id="kbw-grid" width="20" height="20" patternUnits="userSpaceOnUse">'
         '<path d="M20 0H0V20" fill="none" stroke="#ffffff" stroke-opacity="0.04" stroke-width="1"/></pattern>'
         '<filter id="kbw-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" result="b"/>'
         '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>',
         f'<rect width="{W}" height="{H}" fill="#0a0a0a"/><rect width="{W}" height="{H}" fill="url(#kbw-grid)"/>']
    # nice!nano board
    o.append(f'<rect x="{bx0}" y="{by0}" width="{bw}" height="{bh}" rx="10" fill="#111214" stroke="#3a3d42" stroke-width="1.5"/>')
    o.append(f'<rect x="{bx0 + bw/2 - 36}" y="{by0 - 14}" width="72" height="30" rx="7" fill="#1b1d20" stroke="#5a5f66" stroke-width="1.2"/>')
    o.append(f'<text x="{bx0 + bw/2}" y="{by0 + 4}" class="kbw-tiny" text-anchor="middle">USB-C</text>')
    cx, cy = bx0 + bw/2, by0 + bh/2 + 40
    o.append(f'<g transform="translate({cx} {cy}) rotate(-90)"><text x="0" y="-6" class="kbw-board" text-anchor="middle">nice!nano v2</text>'
             f'<text x="0" y="14" class="kbw-sub" text-anchor="middle">right half, components down</text></g>')
    used = {('R', 0): 'i2c', ('R', 1): 'i2c', ('R', 4): 'ctl', ('R', 5): 'ctl', ('L', 3): 'pwr', ('L', 1): 'gnd'}
    # wires first, pins on top
    def wire(path, kind, label=None):
        c = WIRE[kind]
        o.append(f'<path d="{path}" fill="none" stroke="#000" stroke-opacity="0.6" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>')
        o.append(f'<path d="{path}" fill="none" stroke="{c}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" filter="url(#kbw-glow)"/>')
    # signals: straight down the right edge of the nano
    for k, (fi, pi, kind) in enumerate(((0, 0, 'i2c'), (1, 1, 'i2c'), (4, 4, 'ctl'), (5, 5, 'ctl'))):
        x1, y1 = fx, fy(fi); x2, y2 = rx, pin_y(pi)
        bend = 470 - k * 14
        wire(f'M{x1},{y1} H{bend + 18} C{bend},{y1} {bend},{y2} {bend - 18},{y2} H{x2}', kind)
    # power and ground: arc over the top to the far column
    for k, (fi, pi, kind, top) in enumerate(((2, 3, 'pwr', 34), (3, 1, 'gnd', 50))):
        x1, y1 = fx, fy(fi); x2, y2 = lx, pin_y(pi)
        out = 516 - k * 16; side = 84 + k * 16  # outer loop starts furthest right so the two never cross
        wire(f'M{x1},{y1} H{out} Q{out + 22},{y1} {out + 22},{y1 - 22} V{top + 22} Q{out + 22},{top} {out},{top} '
             f'H{side + 22} Q{side},{top} {side},{top + 22} V{y2 - 18} Q{side},{y2} {side + 18},{y2} H{x2}', kind)
    for col, names, x, anchor, dx in (('L', left, lx, 'start', 14), ('R', right, rx, 'end', -14)):
        for i, n in enumerate(names):
            y = pin_y(i); kind = used.get((col, i))
            if kind:
                o.append(f'<circle cx="{x}" cy="{y}" r="7.5" fill="{WIRE[kind]}"/><circle cx="{x}" cy="{y}" r="3" fill="#111214"/>')
            else:
                o.append(f'<circle cx="{x}" cy="{y}" r="6" fill="none" stroke="#b8963c" stroke-width="2"/><circle cx="{x}" cy="{y}" r="2.6" fill="#050505"/>')
            o.append(f'<text x="{x + dx}" y="{y + 4}" class="{"kbw-pin-on" if kind else "kbw-pin"}" text-anchor="{anchor}">{esc(n)}</text>')
    # TPS43
    o.append(f'<rect x="{tx0}" y="{ty0}" width="{tw}" height="{th}" rx="12" fill="#0d2318" stroke="#2f6b47" stroke-width="1.5"/>')
    o.append(f'<rect x="{tx0 + 70}" y="{ty0 + 40}" width="{tw - 92}" height="{th - 80}" rx="6" fill="none" stroke="#2f6b47" stroke-dasharray="4 5"/>')
    o.append(f'<text x="{tx0 + 70 + (tw - 92)/2}" y="{ty0 + th/2 - 4}" class="kbw-board" text-anchor="middle">TPS43</text>')
    o.append(f'<text x="{tx0 + 70 + (tw - 92)/2}" y="{ty0 + th/2 + 16}" class="kbw-sub" text-anchor="middle">Azoteq IQS550</text>')
    o.append(f'<text x="{tx0 + 70 + (tw - 92)/2}" y="{ty0 + th/2 + 34}" class="kbw-sub" text-anchor="middle">I2C 0x74</text>')
    o.append(f'<rect x="{tx0 - 4}" y="{fy(0) - 16}" width="58" height="{30 * 5 + 32}" rx="4" fill="#1a1a1a" stroke="#4a4d52"/>')
    kinds = ['i2c', 'i2c', 'pwr', 'gnd', 'ctl', 'ctl']
    for i, n in enumerate(fpc):
        y = fy(i)
        o.append(f'<rect x="{fx - 4}" y="{y - 6}" width="12" height="12" rx="2" fill="{WIRE[kinds[i]]}"/>')
        o.append(f'<text x="{fx + 16}" y="{y + 4}" class="kbw-pin-on">{n}</text>')
    o.append(f'<text x="{tx0 + 24}" y="{ty0 + th + 22}" class="kbw-sub" text-anchor="middle">FPC</text>')
    # mapping table + legend
    rows = [('SDA', 'P0.06', 'i2c'), ('SCL', 'P0.08', 'i2c'), ('RST', 'P0.17', 'ctl'), ('RDY', 'P0.20', 'ctl'), ('3V3', '3.3V', 'pwr'), ('GND', 'GND', 'gnd')]
    for i, (a, b, k) in enumerate(rows):
        x = 420 + (i % 3) * 118; y = 452 + (i // 3) * 28
        o.append(f'<line x1="{x}" y1="{y - 4}" x2="{x + 18}" y2="{y - 4}" stroke="{WIRE[k]}" stroke-width="3.2" stroke-linecap="round"/>')
        o.append(f'<text x="{x + 26}" y="{y}" class="kbw-map"><tspan class="kbw-map-a">{a}</tspan> to {b}</text>')
    o.append(f'<text x="420" y="526" class="kbw-note">Six conductor ribbon, soldered at both ends</text>')
    o.append(f'<line x1="40" y1="548" x2="{W - 40}" y2="548" stroke="#ffffff" stroke-opacity="0.08"/>')
    l1 = 'TPS43  →  I2C, 400 kHz  →  right nice!nano: driver, tap and drag, Y invert, 0.9x'
    l2 = '→  Bluetooth split link  →  left nice!nano: sensitivity layers  →  computer'
    o.append(f'<text x="{W/2}" y="570" class="kbw-chain" text-anchor="middle">{esc(l1)}</text>')
    o.append(f'<text x="{W/2}" y="590" class="kbw-chain" text-anchor="middle">{esc(l2)}</text>')
    o.append('</svg>')
    return '\n'.join(o)


# ---------------------------------------------------------------- layers
def layer_svgs(keymap, keys):
    L = {l['id']: l for l in keymap['layers']}
    base = L['default_layer']['keys']
    pos = []
    for side, shift in (('L', 0.0), ('R', 20.0)):
        for (x, y, a), p in zip(keys[side], keys['pos'][side]):
            pos.append((p, x + shift, y, a, abs(a) > 25))
    xs = [x for _, x, _, _, _ in pos]; ys = [y for _, _, y, _, _ in pos]
    pad = 14; x0, x1 = min(xs) - pad, max(xs) + pad; y0, y1 = min(ys) - pad - 4, max(ys) + pad
    S = 3.2
    W, H = (x1 - x0) * S, (y1 - y0) * S
    def one(lid, chain, activators, caption, aria):
        lay = L[lid]['keys']
        o = [f'<svg class="kb-layer-svg" viewBox="0 0 {W:.0f} {H:.0f}" role="img" aria-label="{esc(aria)}" xmlns="http://www.w3.org/2000/svg">']
        for p, x, y, a, wide in pos:
            k = None; through = False
            if p in activators and lay[p]['kind'] in ('none', 'trans', 'layer'):
                k = base[p] if lay[p]['kind'] != 'layer' else lay[p]
            for li in ([] if k is not None else chain):
                kk = L[li]['keys'][p]
                if kk['kind'] != 'trans': k = kk; through = li != lid; break
            if k is None: k = base[p]; through = True
            cx, cy = (x - x0) * S, (y1 - y) * S
            w, h = (16.5, 26.5) if wide else (17.5, 16.5)
            act = p in activators
            fill = '#0f0f0f' if k['kind'] == 'none' else ('#121212' if through else '#1c1d1f')
            stroke = ACCENT if act else ('#232323' if through else '#3a3c40')
            o.append(f'<g transform="translate({cx:.1f} {cy:.1f}) rotate({-a:.2f})">')
            o.append(f'<rect x="{-w/2*S:.1f}" y="{-h/2*S:.1f}" width="{w*S:.1f}" height="{h*S:.1f}" rx="{2.2*S:.1f}" fill="{fill}" stroke="{stroke}" stroke-width="{2.2 if act else 1.2}"/>')
            tap = k.get('tap') or ''; hold = k.get('hold') if k['kind'] in ('mod-tap', 'layer-tap') else None
            if k['kind'] != 'none':
                size = 15 if len(tap) <= 2 else (11 if len(tap) <= 5 else 8.5)
                cls = 'kbl-dim' if through else 'kbl-tap'
                o.append(f'<text y="{(-4 if hold else 5):.0f}" class="{cls}" font-size="{size}" text-anchor="middle">{esc(tap)}</text>')
                if hold:
                    o.append(f'<text y="14" class="{"kbl-dim" if through else "kbl-hold"}" font-size="7.5" text-anchor="middle">{esc(hold.upper())}</text>')
            if act:
                o.append(f'<text y="{-h/2*S + 9:.0f}" class="kbl-act" font-size="7" text-anchor="middle">HOLD</text>')
            o.append('</g>')
        o.append('</svg>')
        return f'<figure class="kb-layer-fig"><figcaption><span>{esc(L[lid]["name"])}</span>{caption}</figcaption>' + '\n'.join(o) + '</figure>'
    return '\n'.join([
        one('NumSym', ['NumSym', 'default_layer'], {13}, 'Hold A. Numbers as a numpad under the left hand, brackets under the right.', 'Num / Sym layer: 7 8 9, 4 5 6, 1 2 3 on the left with period and zero on the thumbs; brackets and symbols on the right'),
        one('arrows', ['arrows', 'default_layer'], {25}, 'Hold Z. Arrows in an inverted T, with Home, End and page keys around them.', 'Arrows layer: up, left, down, right on W F P and R S T positions with Home, End, Page Up and Page Down'),
        one('Gaming', ['Gaming', 'default_layer'], {1}, 'Press A, S and T together. QWERTY one column in, so WASD sits under the fingers. Hold the outlined key for numbers.', 'Gaming layer: Q W E R, A S D F, Z X C V with Shift and Ctrl on the pinky column and T, G, Space on the thumbs'),
    ])


if __name__ == '__main__':
    keymap = json.load(open(sys.argv[1])); keys = json.load(open(sys.argv[2])); out = sys.argv[3]
    open(f'{out}/wiring.svg.html', 'w').write(wiring_svg())
    open(f'{out}/layers.svg.html', 'w').write(layer_svgs(keymap, keys))
    print('ok')
