# 앱 아이콘 PNG 생성 (icons/icon.svg와 같은 모양). 실행: python tools/make_icons.py
from PIL import Image, ImageDraw
S = 1024
DARK = (23, 23, 23)          # #171717 (style.css의 --primary)
img = Image.new('RGB', (S, S), DARK)
d = ImageDraw.Draw(img)
k = S / 512
d.polygon([(256*k,116*k),(396*k,232*k),(396*k,408*k),(116*k,408*k),(116*k,232*k)], fill='white')
d.line([(196*k,300*k),(240*k,344*k),(320*k,256*k)], fill=DARK, width=int(30*k))
for size in (192, 512):
    img.resize((size, size), Image.LANCZOS).save(f'icons/icon-{size}.png')
