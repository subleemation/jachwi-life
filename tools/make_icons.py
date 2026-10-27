# 앱 아이콘 PNG 생성 (icons/icon.svg와 같은 모양). 실행: python tools/make_icons.py
from PIL import Image, ImageDraw
S = 1024
img = Image.new('RGB', (S, S))
px = img.load()
for y in range(S):
    for x in range(S):
        t = (x + y) / (2 * S)
        px[x, y] = (int(0x4f + (0x7b - 0x4f) * t), int(0x6b + (0x5c - 0x6b) * t), int(0xed + (0xf0 - 0xed) * t))
d = ImageDraw.Draw(img)
k = S / 512
d.polygon([(256*k,116*k),(396*k,232*k),(396*k,408*k),(116*k,408*k),(116*k,232*k)], fill='white')
d.line([(196*k,300*k),(240*k,344*k),(320*k,256*k)], fill=(90,102,238), width=int(30*k), joint='curve')
for size in (192, 512):
    img.resize((size, size), Image.LANCZOS).save(f'icons/icon-{size}.png')
