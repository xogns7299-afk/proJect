// 서버 API 호출을 한곳에 모은다. 실패하면 서버가 준 한국어 메시지를 담은 Error를 던진다.
export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function request(method, path, data) {
  const res = await fetch('/api' + path, {
    method,
    headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('auth:expired'))
    throw new ApiError(res.status, json.error || '요청을 처리하지 못했습니다')
  }
  return json
}

// 사진을 긴 변 1280px JPEG로 줄인 뒤 올린다 (용량 절약). 실패하면 서버 메시지를 담은 Error를 던진다.
export async function uploadPhoto(recordId, kind, file) {
  const blob = await shrink(file).catch(() => file)
  const form = new FormData()
  form.append('kind', kind)
  form.append('file', blob, 'photo.jpg')
  const res = await fetch(`/api/records/${recordId}/photo`, { method: 'POST', body: form })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, json.error || '사진을 올리지 못했습니다')
  return json
}
function shrink(file, max = 1280) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(img.src)
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('변환 실패'))), 'image/jpeg', 0.85)
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, data = {}) => request('POST', path, data),
  put: (path, data) => request('PUT', path, data),
  patch: (path, data) => request('PATCH', path, data),
  del: (path) => request('DELETE', path),
}
