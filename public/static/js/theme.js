// 처음에는 기기 설정(다크/라이트)을 따르고, 버튼으로 바꾸면 그 선택을 기억한다.
// 첫 적용은 화면이 그려지기 전에 src/renderer.tsx의 인라인 스크립트가 한다.
export const currentTheme = () => document.documentElement.dataset.theme || 'light'

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = next
  try {
    localStorage.setItem('theme', next)
  } catch {}
  return next
}

export const themeIcon = () => (currentTheme() === 'dark' ? '☀️' : '🌙')
