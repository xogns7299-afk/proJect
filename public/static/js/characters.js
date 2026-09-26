// 캐릭터 그림은 public/static/img/characters/ 에 있다 (팀원 1 디자인).
// id는 DB에 저장되므로 바꾸지 않는다. stages = 레벨 구간별 모습 [Lv1~4, Lv5~9, Lv10+]. 성장 단계 그림은 리트리버만 있다.
const IMG = '/static/img/characters/'
export const CHARACTERS = [
  { id: 'retriever', name: '리트리버', profile: 'retriever.png', timer: 'retriever_timer.png', stages: ['retriever_stage1.png', 'retriever_stage2.png', 'retriever_stage3.png'] },
  { id: 'calico', name: '삼색냥이', profile: 'calico.png', timer: 'calico_timer.png' },
  { id: 'black_cat', name: '검정냥이', profile: 'black_cat.png', timer: 'black_cat_timer.png' },
  { id: 'dalmatian', name: '달마시안', profile: 'dalmatian.png', timer: 'dalmatian_timer.png' },
]
// 예전 임시 id(chick 등)로 가입한 계정은 첫 캐릭터로 보여준다
const find = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0]
const img = (file, alt) => `<img src="${IMG}${file}" alt="${alt}" loading="lazy">`

// 아바타(원형 프로필). 성장 단계 그림이 있으면 레벨에 맞는 모습을 쓴다.
export function avatarOf(characterId, level = 1) {
  const c = find(characterId)
  if (!c.stages) return img(c.profile, c.name)
  return img(c.stages[level >= 10 ? 2 : level >= 5 ? 1 : 0], c.name)
}
export const timerImageOf = (characterId) => img(find(characterId).timer, find(characterId).name)
export const profileImageOf = (characterId) => img(find(characterId).profile, find(characterId).name)
