import { api } from '../api.js'
import { $, $$, esc } from '../dom.js'
import { onSubmit } from '../ui.js'

const FILTERS = [
  { key: 'all', label: '전체', test: () => true, empty: '할 일을 추가해 보세요' },
  { key: 'open', label: '진행중', test: (t) => !t.done, empty: '진행중인 항목이 없습니다' },
  { key: 'done', label: '완료', test: (t) => t.done, empty: '완료한 항목이 없습니다' },
]

// 할 일 탭: 단순 체크리스트. 날짜·캘린더와 연결하지 않고 본인만 본다.
export async function renderTodo(main) {
  let filter = 'all'
  let todos = await api.get('/todos')
  if (!main.isConnected) return

  main.innerHTML = `
    <div class="card">
      <form class="add" data-form><input name="title" maxlength="80" placeholder="할 일을 입력하세요" required><button class="btn primary">추가</button></form>
      <div class="error" role="alert"></div>
      <div class="chips small" data-filters></div>
      <ul class="checklist" data-list></ul>
      <button class="btn text" data-clear hidden>완료 항목 지우기</button>
    </div>`

  function draw() {
    $('[data-filters]', main).innerHTML = FILTERS.map(
      (f) => `<button class="chip ${f.key === filter ? 'on' : ''}" data-filter="${f.key}">${f.label} ${todos.filter(f.test).length}</button>`
    ).join('')
    $$('[data-filter]', main).forEach((b) => (b.onclick = () => ((filter = b.dataset.filter), draw())))

    const current = FILTERS.find((f) => f.key === filter)
    const shown = todos.filter(current.test)
    $('[data-list]', main).innerHTML = shown.length
      ? shown
          .map(
            (t) => `<li><label class="check"><input type="checkbox" data-toggle="${t.id}" ${t.done ? 'checked' : ''}><span class="${t.done ? 'done' : ''}">${esc(t.title)}</span></label>
              <button class="btn icon" data-del="${t.id}" aria-label="삭제">×</button></li>`
          )
          .join('')
      : `<li class="sub">${current.empty}</li>`
    $('[data-clear]', main).hidden = !todos.some((t) => t.done)

    // 체크·삭제는 저장 버튼 없이 바로 반영한다. 서버 저장에 실패하면 원래대로 되돌린다.
    $$('[data-toggle]', main).forEach(
      (box) =>
        (box.onchange = async () => {
          const todo = todos.find((t) => t.id === Number(box.dataset.toggle))
          todo.done = box.checked ? 1 : 0
          draw()
          try {
            await api.patch(`/todos/${todo.id}`, { done: box.checked })
          } catch (err) {
            todo.done = todo.done ? 0 : 1
            draw()
            alert(err.message)
          }
        })
    )
    $$('[data-del]', main).forEach(
      (btn) =>
        (btn.onclick = async () => {
          const id = Number(btn.dataset.del)
          const before = todos
          todos = todos.filter((t) => t.id !== id)
          draw()
          try {
            await api.del(`/todos/${id}`)
          } catch (err) {
            todos = before
            draw()
            alert(err.message)
          }
        })
    )
  }

  onSubmit($('[data-form]', main), async (form) => {
    const created = await api.post('/todos', { title: form.get('title') })
    todos = [created, ...todos]
    $('[data-form] input', main).value = ''
    $('.error', main).textContent = ''
    draw()
  })
  $('[data-clear]', main).onclick = async () => {
    await api.del('/todos/done')
    todos = todos.filter((t) => !t.done)
    draw()
  }
  draw()
}
