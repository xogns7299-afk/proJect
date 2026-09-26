// 캐릭터 그림은 public/static/img/characters/ 에 있다 (팀원 1 디자인, scripts/prepare_characters.py 로 손질).
// 파일 이름은 {id}.png(얼굴) 과 {id}_{칸}.png. has 에는 실제로 파일이 있는 칸만 적는다.
// 새 그림이 오면 스크립트로 처리한 뒤 has 에 칸 이름을 추가하면 된다. 없는 칸은 FALLBACK 순서로 대신한다.
// id는 DB에 저장되므로 바꾸지 않는다.
const IMG = '/static/img/characters/'
export const CHARACTERS = [
  {
    id: 'retriever',
    name: '리트리버',
    has: ['idle', 'walk1', 'walk2', 'walk3', 'react', 'bark', 'timer1', 'stage1', 'stage2', 'stage3'],
  },
  { id: 'calico', name: '삼색냥이', has: ['idle', 'walk1', 'walk2', 'timer1', 'timer2', 'timer3'] },
  { id: 'black_cat', name: '검정냥이', has: ['timer1'] },
  { id: 'dalmatian', name: '달마시안', has: ['timer1'] },
]

// 칸 → 그 칸이 없을 때 대신 쓸 칸 (null = 얼굴 그림)
const FALLBACK = {
  idle: null,
  stage1: 'idle',
  stage2: 'stage1',
  stage3: 'stage2',
  walk1: 'idle',
  walk2: 'walk1',
  walk3: 'walk1',
  react: 'idle',
  bark: 'react',
  timer1: null,
  timer2: 'timer1',
  timer3: 'timer2',
  rest: 'timer1',
}

// 예전 임시 id(chick 등)로 가입한 계정은 첫 캐릭터로 보여준다
const find = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0]

export const has = (characterId, slot) => find(characterId).has.includes(slot)

// 그 칸의 그림 주소. 없으면 대신할 칸을 따라가다가 마지막에는 얼굴 그림.
export function srcOf(characterId, slot) {
  const c = find(characterId)
  while (slot && !c.has.includes(slot)) slot = FALLBACK[slot]
  return IMG + (slot ? `${c.id}_${slot}.png` : `${c.id}.png`)
}

// 레벨 구간별 전신 모습: Lv1~4 / Lv5~9 / Lv10+
export const stageOf = (level) => (level >= 10 ? 'stage3' : level >= 5 ? 'stage2' : 'stage1')

export const imgOf = (characterId, slot, cls = '') =>
  `<img src="${srcOf(characterId, slot)}" alt="${find(characterId).name}"${cls ? ` class="${cls}"` : ''} loading="lazy">`

// 원형 아바타에는 얼굴 그림을 쓴다 (전신 그림은 원 안에서 잘린다)
export const avatarOf = (characterId) => imgOf(characterId, null)
export const bodyOf = (characterId, level = 1, cls = '') => imgOf(characterId, stageOf(level), cls)
