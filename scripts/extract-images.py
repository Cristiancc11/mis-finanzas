#!/usr/bin/env python3
"""Script de una sola vez: saca las imágenes base64 de los HTML/CSS a archivos reales.
Ya se ejecutó sobre este repo; se deja por si vuelves a pegar imágenes en base64."""
import re, base64, hashlib, io, os
from PIL import Image, ImageDraw, ImageFont

OUT = 'assets/img'
os.makedirs(OUT, exist_ok=True)
URI = re.compile(r'data:(image/[a-z+.-]+);base64,([A-Za-z0-9+/=]+)')

def load(m): return base64.b64decode(m.group(2))

def save_webp(im, path, q=82):
    im.save(path, 'WEBP', quality=q, method=6)
    return os.path.getsize(path)

# ---- 1) Logo (296x300 PNG con transparencia) --------------------------------
logo_raw = None
for f in ['index.html']:
    m = URI.search(open(f, encoding='utf-8').read())
    logo_raw = load(m)
logo = Image.open(io.BytesIO(logo_raw)).convert('RGBA')
logo.save(f'{OUT}/logo.png', optimize=True)
print('logo.png', os.path.getsize(f'{OUT}/logo.png') // 1024, 'KB')
print('logo.webp', save_webp(logo, f'{OUT}/logo.webp', 90) // 1024, 'KB')
for size, name in [(32, 'favicon-32.png'), (192, 'icon-192.png'), (512, 'icon-512.png'), (180, 'apple-touch-icon.png')]:
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    r = logo.copy(); r.thumbnail((size, size), Image.LANCZOS)
    canvas.paste(r, ((size - r.width) // 2, (size - r.height) // 2), r)
    if name == 'apple-touch-icon.png':  # iOS no admite transparencia
        bg = Image.new('RGB', (size, size), (36, 67, 90)); bg.paste(canvas, (0, 0), canvas); bg.save(f'{OUT}/{name}', optimize=True)
    else:
        canvas.save(f'{OUT}/{name}', optimize=True)

# ---- 2) Capturas del landing -> WebP 800 y 1600 -----------------------------
land = open('index.html', encoding='utf-8').read()
shots = []
for m in re.finditer(r'<img src="(data:image/jpeg;base64,[A-Za-z0-9+/=]+)" alt="([^"]*)" />', land):
    shots.append((m.group(0), m.group(1), m.group(2)))
names = ['hero-resumen', 'feat-gastos', 'feat-bolsillos', 'feat-tarjetas', 'feat-analisis', 'feat-dolar']
for i, (full, uri, alt) in enumerate(shots):
    raw = base64.b64decode(uri.split(',', 1)[1])
    im = Image.open(io.BytesIO(raw)).convert('RGB'); w, h = im.size
    n = names[i]
    s16 = save_webp(im, f'{OUT}/{n}-1600.webp', 80)
    im8 = im.resize((800, round(h * 800 / w)), Image.LANCZOS); s8 = save_webp(im8, f'{OUT}/{n}-800.webp', 80)
    print(f'{n}: {len(raw)//1024} KB jpeg -> {s16//1024} KB (1600) / {s8//1024} KB (800)')
    first = (i == 0)
    attrs = (f'src="/assets/img/{n}-1600.webp" '
             f'srcset="/assets/img/{n}-800.webp 800w, /assets/img/{n}-1600.webp 1600w" '
             f'sizes="(max-width: 900px) 92vw, 640px" width="{w}" height="{h}" alt="{alt}" decoding="async" ' +
             ('fetchpriority="high"' if first else 'loading="lazy"'))
    land = land.replace(full, f'<img {attrs} />')

# ---- 3) Logo y favicon en landing y legales ---------------------------------
LOGO_URI = re.compile(r'data:image/png;base64,[A-Za-z0-9+/=]+')
def common(s, depth_prefix='/'):
    s = re.sub(r'<link rel="icon" type="image/png" href="data:image/png;base64,[A-Za-z0-9+/=]+">',
               '<link rel="icon" type="image/png" sizes="32x32" href="/assets/img/favicon-32.png">\n'
               '<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">', s)
    s = re.sub(r'<img src="data:image/png;base64,[A-Za-z0-9+/=]+" alt="([^"]*)"( id="brand-logo")? />',
               lambda m: f'<img src="/assets/img/logo.webp" alt="{m.group(1)}"{m.group(2) or ""} width="32" height="32" />', s)
    return s
land = common(land)
open('index.html', 'w', encoding='utf-8').write(land)
for f in ['contacto.html', 'privacidad.html', 'terminos.html']:
    s = common(open(f, encoding='utf-8').read())
    open(f, 'w', encoding='utf-8').write(s)

# ---- 4) App: favicons, og:image, ICON_B64 y CSS ------------------------------
a = open('app/index.html', encoding='utf-8').read()
a = re.sub(r'<link rel="icon" type="image/png" href="data:image/png;base64,[A-Za-z0-9+/=]+">',
           '<link rel="icon" type="image/png" sizes="32x32" href="/assets/img/favicon-32.png">', a)
a = re.sub(r'<link rel="apple-touch-icon" href="data:image/png;base64,[A-Za-z0-9+/=]+">',
           '<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">', a)
a = re.sub(r'<meta property="og:image" content="data:image/svg\+xml;base64,[A-Za-z0-9+/=]+">',
           '<meta property="og:image" content="https://finanzaspro.com.co/assets/img/og-image.png">\n'
           '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">\n'
           '<meta name="twitter:card" content="summary_large_image">\n'
           '<meta name="twitter:image" content="https://finanzaspro.com.co/assets/img/og-image.png">', a)
a = re.sub(r'var ICON_B64 = "data:image/png;base64,[A-Za-z0-9+/=]+";', 'var ICON_B64 = "/assets/img/logo.webp";', a)
a = re.sub(r'<img class="app-logo-icon', '<img src="/assets/img/logo.webp" class="app-logo-icon', a)
open('app/index.html', 'w', encoding='utf-8').write(a)

css = open('app/styles.css', encoding='utf-8').read()
css = re.sub(r"url\('data:image/png;base64,[A-Za-z0-9+/=]+'\)", "url('/assets/img/logo.webp')", css)
open('app/styles.css', 'w', encoding='utf-8').write(css)

# ---- 5) og-image 1200x630 real (los scrapers no leen SVG en data URI) --------
W, H = 1200, 630
g = Image.new('RGB', (W, H)); px = g.load()
c1, c2 = (36, 67, 90), (47, 117, 102)
for y in range(H):
    for x in range(W):
        t = (x / W + y / H) / 2
        px[x, y] = tuple(round(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
lg = logo.copy(); lg.thumbnail((190, 190), Image.LANCZOS)
g.paste(lg, (90, 110), lg)
d = ImageDraw.Draw(g)
fb = ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-Bold.otf', 96) if os.path.exists('/usr/share/fonts/opentype/inter/Inter-Bold.otf') else ImageFont.load_default()
fr = ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-Regular.otf', 40) if os.path.exists('/usr/share/fonts/opentype/inter/Inter-Regular.otf') else ImageFont.load_default()
d.text((90, 330), 'FinanzasPro', font=fb, fill='white')
d.text((92, 450), 'Tu plata, con la inteligencia', font=fr, fill=(214, 235, 228))
d.text((92, 500), 'que ningún banco te da.', font=fr, fill=(214, 235, 228))
g.save(f'{OUT}/og-image.png', optimize=True)
print('og-image.png', os.path.getsize(f'{OUT}/og-image.png') // 1024, 'KB')
