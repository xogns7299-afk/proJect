# 캐릭터 그림 묶음(1024×1024 PNG)을 앱에서 쓰는 크기·형식으로 바꿔 public/static/img/characters/ 에 저장한다.
# 사용법: python scripts/prepare_characters.py "<묶음 폴더>"   (필요: pip install pillow)
#   묶음 폴더 = assets/, preview-assets/ 가 들어 있는 폴더. 파일 이름은 {캐릭터id}_{칸}.png
# 묶음은 모든 그림의 발 위치·크기가 같게 맞춰져 있으므로 잘라내지 않고 줄이기만 한다 (애니메이션 프레임이 튀지 않게).
# 처리한 뒤 public/static/js/characters.js 의 has 목록에 새 칸 이름을 추가해야 화면에 나온다.
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'static', 'img', 'characters')
SIZE = 512
CHARACTERS = ('retriever', 'calico', 'black_cat', 'dalmatian')


def save(im, name):
    # WebP: PNG보다 훨씬 작고(약 1/4), 투명 배경도 유지된다
    im.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=85, method=6)
    print('  ', name)


def main(src):
    for sub in ('preview-assets', 'assets'):  # assets(새 그림)가 나중이라 같은 이름이면 새 그림이 쓰인다
        folder = os.path.join(src, sub)
        for f in sorted(os.listdir(folder)) if os.path.isdir(folder) else []:
            name = f[:-4]
            if not f.endswith('.png') or not name.startswith(CHARACTERS):
                continue
            im = Image.open(os.path.join(folder, f))
            im = im.convert('RGBA' if im.mode in ('RGBA', 'LA', 'P') else 'RGB')
            save(im.resize((SIZE, SIZE), Image.LANCZOS), name)
    # 얼굴(아바타) 그림: 이전 PNG가 남아 있으면 같은 크기의 WebP로 바꾼다
    for cid in CHARACTERS:
        png = os.path.join(OUT, cid + '.png')
        if os.path.exists(png):
            save(Image.open(png).convert('RGBA'), cid)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('사용법: python scripts/prepare_characters.py "<묶음 폴더>"')
    main(sys.argv[1])
