// 팀이 조정할 수 있는 수치를 한곳에 모은다. 현재 값은 docs/기능명세.md 7번의 [확정 9/26]이다.
export const XP_PER_MINUTE = 1
export const XP_SESSION_CAP = 240
export const XP_GOAL_ITEM = 30
export const MIN_SESSION_SEC = 60
// 타이머를 켠 채 방치하는 것을 막기 위해 한 번의 기록은 8시간까지만 인정한다
export const MAX_SESSION_SEC = 8 * 60 * 60

// 레벨 N → N+1에 100×N XP
export function levelOf(xp: number) {
  let level = 1
  let rest = Math.max(0, xp)
  while (rest >= 100 * level) {
    rest -= 100 * level
    level++
  }
  return { level, current: rest, needed: 100 * level }
}
