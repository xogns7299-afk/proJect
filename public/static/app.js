fetch('/api/health')
  .then((res) => res.json())
  .then((data) => {
    document.getElementById('status').textContent = data.ok ? '서버 연결 정상' : '서버 응답 이상'
  })
  .catch(() => {
    document.getElementById('status').textContent = '서버에 연결할 수 없습니다'
  })
