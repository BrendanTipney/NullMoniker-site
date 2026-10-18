#!/usr/bin/env python3
"""Turn a ZMK corne.keymap into keyboard-media/keymap.json for the layout explorer.

Usage: python tools/build_keymap_json.py path/to/zmk-config/config/corne.keymap keyboard-media/keymap.json
"""
import json, re, sys

KEYS = {
 'SEMICOLON':';','SEMI':';','COMMA':',','DOT':'.','PERIOD':'.','FSLH':'/','SLASH':'/','BACKSLASH':'\\',
 'MINUS':'-','EQUAL':'=','SINGLE_QUOTE':"'",'SQT':"'",'TILDE':'~','GRAVE':'`',
 'LEFT_PARENTHESIS':'(','RIGHT_PARENTHESIS':')','LEFT_BRACE':'{','RIGHT_BRACE':'}',
 'LEFT_BRACKET':'[','RIGHT_BRACKET':']','LESS_THAN':'<','GREATER_THAN':'>',
 'LEFT':'←','LEFT_ARROW':'←','RIGHT':'→','RIGHT_ARROW':'→','UP':'↑','UP_ARROW':'↑','DOWN':'↓','DOWN_ARROW':'↓',
 'HOME':'Home','END':'End','PAGE_UP':'PgUp','PAGE_DOWN':'PgDn',
 'ENTER':'Enter','RET':'Enter','SPACE':'Space','TAB':'Tab','ESC':'Esc','BACKSPACE':'Bksp','BSPC':'Bksp','DELETE':'Del','DEL':'Del',
 'LEFT_SHIFT':'Shift','LSHFT':'Shift','RIGHT_SHIFT':'Shift','RSHFT':'Shift',
 'LEFT_CONTROL':'Ctrl','LCTRL':'Ctrl','RCTRL':'Ctrl','RIGHT_CONTROL':'Ctrl',
 'LEFT_ALT':'Alt','LALT':'Alt','RIGHT_ALT':'Alt','RALT':'Alt','LEFT_WIN':'Win','LGUI':'Win','RIGHT_WIN':'Win',
 'C_VOLUME_UP':'Vol +','C_VOL_UP':'Vol +','C_VOLUME_DOWN':'Vol −','C_VOL_DN':'Vol −','C_PLAY_PAUSE':'Play',
 'C_PREV':'Prev','C_NEXT':'Next','C_MUTE':'Mute','C_REPEAT':'Repeat',
}
MODS = {'LG':'Win','LS':'Shift','LC':'Ctrl','LA':'Alt','RG':'Win','RS':'Shift','RC':'Ctrl','RA':'Alt'}
MOUSE = {'MB4':'Back','MB5':'Fwd','LCLK':'L click','RCLK':'R click','MCLK':'M click',
 'MOVE_UP':'Move ↑','MOVE_DOWN':'Move ↓','MOVE_LEFT':'Move ←','MOVE_RIGHT':'Move →',
 'SCRL_UP':'Scroll ↑','SCRL_DOWN':'Scroll ↓','SCRL_LEFT':'Scroll ←','SCRL_RIGHT':'Scroll →'}

def key(k):
    m = re.fullmatch(r'(L[GSCA]|R[GSCA])\((.*)\)', k)
    if m:
        inner = key(m.group(2)); mods = [MODS[m.group(1)]]
        while '+' in inner and inner.split('+')[0] in MODS.values():
            mods.append(inner.split('+')[0]); inner = inner.split('+', 1)[1]
        order = ['Ctrl','Shift','Alt','Win']
        return '+'.join(sorted(set(mods), key=order.index) + [inner])
    if k in KEYS: return KEYS[k]
    m = re.fullmatch(r'N(?:UMBER_)?(\d)', k)
    if m: return m.group(1)
    if re.fullmatch(r'F\d{1,2}', k) or re.fullmatch(r'[A-Z]', k): return k
    return k.replace('_', ' ').title()

def strip_comments(s):
    s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
    return re.sub(r'//[^\n]*', '', s)

def block(src, name):
    i = src.index(name + ' {'); depth = 0
    for j in range(i, len(src)):
        if src[j] == '{': depth += 1
        elif src[j] == '}':
            depth -= 1
            if depth == 0: return src[i:j+1]

def split_bindings(text):
    toks = text.split(); out = []
    for t in toks:
        if t.startswith('&'): out.append([t])
        else: out[-1].append(t)
    return out

def describe(b, layer_names):
    n, args = b[0], b[1:]
    raw = ' '.join(b)
    if n == '&trans': return dict(kind='trans', raw=raw)
    if n == '&none': return dict(kind='none', raw=raw)
    if n == '&kp': return dict(kind='key', tap=key(args[0]), raw=raw)
    if n == '&lt': return dict(kind='layer-tap', tap=key(args[1]), hold=layer_names[int(args[0])], layer=int(args[0]), raw=raw)
    if n == '&mt': return dict(kind='mod-tap', tap=key(args[1]), hold=key(args[0]), raw=raw)
    if n == '&mo': return dict(kind='layer', tap=layer_names[int(args[0])], hold=None, layer=int(args[0]), note='Held', raw=raw)
    if n == '&tog': return dict(kind='layer', tap=layer_names[int(args[0])], layer=int(args[0]), note='Toggle', raw=raw)
    if n == '&bt':
        if args[0] == 'BT_SEL': return dict(kind='system', tap=f'BT {int(args[1])+1}', raw=raw, note=f'Bluetooth profile {int(args[1])+1}')
        if args[0] == 'BT_CLR': return dict(kind='system', tap='BT clear', raw=raw, note='Clear the current Bluetooth pairing')
    if n in ('&mkp', '&mmv', '&msc'): return dict(kind='mouse', tap=MOUSE.get(args[0], args[0]), raw=raw)
    if n == '&key_repeat': return dict(kind='key', tap='Repeat', raw=raw, note='Repeat the last key')
    if n == '&StickyWinKey': return dict(kind='tap-dance', tap='Alt', hold=None, raw=raw, note='Tap once for Alt, twice for a sticky Win key')
    if n == '&Shut_Down': return dict(kind='macro', tap='Shut down', raw=raw, note='Win+X, U, U')
    return dict(kind='other', tap=n.lstrip('&'), raw=raw)

PRETTY = {'default_layer':'Base','NumSym':'Num / Sym','arrows':'Arrows','Hand_Swap':'Hand Swap','Gaming':'Gaming',
 'GamingNum':'Gaming Num','Media':'Media','Function':'Function','BlueTooth':'Bluetooth','VSCode':'VS Code',
 'QWERTY':'QWERTY','Mouse':'Mouse','HighSens':'High Sens','LowSens':'Low Sens'}

def main(src_path, out_path):
    src = strip_comments(open(src_path).read())
    km = block(src, 'keymap')
    layers = re.findall(r'(\w+)\s*\{\s*(?:label\s*=\s*"[^"]*";\s*)?bindings\s*=\s*<(.*?)>;', km, flags=re.S)
    names = [PRETTY.get(n, n) for n, _ in layers]
    out_layers = []
    for (ident, body) in layers:
        bs = split_bindings(body)
        assert len(bs) == 42, (ident, len(bs))
        out_layers.append(dict(id=ident, name=PRETTY.get(ident, ident), keys=[describe(b, names) for b in bs]))
    combos = []
    for name, body in re.findall(r'(\w+)\s*\{([^{}]*?key-positions[^{}]*?)\}', block(src, 'combos')):
        b = re.search(r'bindings\s*=\s*<(.*?)>', body).group(1).split()
        pos = [int(x) for x in re.search(r'key-positions\s*=\s*<(.*?)>', body).group(1).split()]
        lay = re.search(r'layers\s*=\s*<(.*?)>', body)
        combos.append(dict(name=re.sub(r'(?<=[a-z])(?=[A-Z])|_', ' ', name).strip(), positions=sorted(pos),
                           layers=sorted(set(int(x) for x in lay.group(1).split())) if lay else None,
                           action=describe(b, names)))
    json.dump(dict(source='corne.keymap', layers=out_layers, combos=combos), open(out_path, 'w'), ensure_ascii=False, indent=1)
    print(len(out_layers), 'layers,', len(combos), 'combos ->', out_path)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
