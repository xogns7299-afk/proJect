import { uploadPhoto } from './api.js'
import { $ } from './dom.js'

// 사진 첨부 줄. 파일을 고르면 바로 올리고, 실패해도 다시 고를 수 있다.
export const photoRowHtml = (label, key, url) => `
  <div class="photo-row" data-photo="${key}">
    <span class="thumb">${url ? `<img src="${url}" alt="">` : '＋'}</span>
    <span class="grow"><b class="block">${label} <span class="pill">선택</span></b><span class="sub" data-status>${url ? '첨부됨' : '나중에 올려도 됩니다'}</span></span>
    <label class="btn filebtn">${url ? '바꾸기' : '사진 선택'}<input type="file" accept="image/*"></label>
  </div>`

export function bindPhotoRow(root, kind, recordId) {
  const row = $(`[data-photo="${kind}"]`, root)
  if (!row) return
  $('input', row).onchange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const status = $('[data-status]', row)
    status.textContent = '올리는 중…'
    try {
      const { url } = await uploadPhoto(recordId, kind, file)
      $('.thumb', row).innerHTML = `<img src="${url}" alt="">`
      status.textContent = '첨부됨'
      $('.filebtn', row).firstChild.textContent = '바꾸기'
    } catch (err) {
      status.textContent = err.message + ' — 다시 선택해 주세요'
    }
  }
}
