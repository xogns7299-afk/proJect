# 팀원이 준 캐릭터 원본 그림을 앱에서 쓰는 크기·이름으로 바꿔 public/static/img/characters/ 에 저장한다.
# 사용법: python scripts/prepare_characters.py "<원본 폴더>"   (필요: pip install pillow)
# 원본 폴더의 "추가" 하위 폴더에 {캐릭터id}_{칸}.png 로 넣은 새 그림도 함께 처리한다.
# 처리한 뒤 public/static/js/characters.js 의 has 목록에 새 칸 이름을 추가해야 화면에 나온다.
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'static', 'img', 'characters')
SIZE = 512

# 기존 원본 폴더 구성 → 앱 파일 이름. 걷기처럼 여러 장이 한 동작인 것은 같은 배율로 맞춘다.
BODY = {
    'retriever_idle': '상호작용/리트리버 대기.png',
    'retriever_react': '상호작용/리트리버 반응.png',
    'retriever_bark': '상호작용/리트리버 짖기.png',
    'retriever_stage1': '레벨업/리트리버 (1).png',
    'retriever_stage2': '레벨업/리트리버 (2).png',
    'retriever_stage3': '레벨업/리트리버 (3).png',
    'calico_idle': '상호작용/고양이 대기.png',
}
WALK = {
    'retriever': ['걷기/리트리버 걷기 (1).png', '걷기/리트리버 걷기 (2).png', '걷기/리트리버.png'],
    'calico': ['걷기/삼색냥이 걷기.png', '걷기/삼색냥이 걷기 (2).png'],
}
SQUARE = {
    'retriever_timer1': '타이머/리트리버 타이머.png',
    'calico_timer1': '타이머/삼색냥이 타이머 (1).png',
    'calico_timer2': '타이머/삼색냥이 타이머 (2).png',
    'calico_timer3': '타이머/삼색냥이 타이머 (3).png',
    'dalmatian_timer1': '타이머/달마시안 타이머.png',
}
# 캔버스 구석에 작게 그려진 그림은 캐릭터 부분만 잘라 정사각형으로 만든다
CROP = {'black_cat_timer1': '타이머/검은냥이 타이머.png'}

BODY_SLOTS = {'idle', 'react', 'bark', 'stage1', 'stage2', 'stage3'}
SQUARE_SLOTS = {'timer1', 'timer2', 'timer3', 'rest'}


def load(path):
    return Image.open(path).convert('RGBA')


def bbox(im):
    return im.getchannel('A').point(lambda v: 255 if v > 16 else 0).getbbox()


def place(im, scale):
    """투명 배경 전신 그림: 가운데 정렬, 발바닥을 아래에서 16px 위에 맞춘다."""
    im = im.crop(bbox(im))
    im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    canvas = Image.new('RGBA', (SIZE, SIZE))
    canvas.alpha_composite(im, ((SIZE - im.width) // 2, SIZE - 16 - im.height))
    return canvas


def fit_scale(images):
    boxes = [bbox(im) for im in images]
    return min(min(480 / (b[2] - b[0]), 448 / (b[3] - b[1])) for b in boxes)


def square(im):
    return im.resize((SIZE, SIZE), Image.LANCZOS)


def crop_square(im):
    x0, y0, x1, y1 = bbox(im)
    side = round(max(x1 - x0, y1 - y0) * 1.1)
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    canvas = Image.new('RGBA', (side, side))
    canvas.alpha_composite(im.crop((cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)))
    return square(canvas)


def save(im, name):
    im.save(os.path.join(OUT, name + '.png'), optimize=True)
    print('  ', name)


def main(src):
    for name, rel in BODY.items():
        im = load(os.path.join(src, rel))
        save(place(im, fit_scale([im])), name)
    for cid, rels in WALK.items():
        frames = [load(os.path.join(src, r)) for r in rels]
        scale = fit_scale(frames)
        for i, im in enumerate(frames, 1):
            save(place(im, scale), f'{cid}_walk{i}')
    for name, rel in SQUARE.items():
        save(square(load(os.path.join(src, rel))), name)
    for name, rel in CROP.items():
        save(crop_square(load(os.path.join(src, rel))), name)

    extra = os.path.join(src, '추가')
    if not os.path.isdir(extra):
        return
    files = sorted(f for f in os.listdir(extra) if f.lower().endswith('.png'))
    walks = {}
    for f in files:
        name = f[:-4]
        cid, _, slot = name.rpartition('_')
        im = load(os.path.join(extra, f))
        if slot.startswith('walk'):
            walks.setdefault(cid, []).append((name, im))
        elif slot in BODY_SLOTS:
            save(place(im, fit_scale([im])), name)
        elif slot in SQUARE_SLOTS:
            x0, y0, x1, y1 = bbox(im)
            full = (x1 - x0) > im.width * 0.9 and (y1 - y0) > im.height * 0.9
            save(square(im) if full else crop_square(im), name)
        else:
            print('   (건너뜀: 알 수 없는 칸)', f)
    for cid, items in walks.items():
        scale = fit_scale([im for _, im in items])
        for name, im in items:
            save(place(im, scale), name)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('사용법: python scripts/prepare_characters.py "<원본 폴더>"')
    main(sys.argv[1])
