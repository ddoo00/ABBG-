/* ════════════════════════════════════════
   ABBG 관리 화면 로직
   데이터는 전부 shared.js의 api를 통해서만 읽고 써요.
   ════════════════════════════════════════ */

let data = null;          // 화면에 쓰는 전체 데이터 사본
let current = 'clients';  // 현재 페이지
const PAGE_NAMES = { clients: '클라이언트', team: '팀원 명단', offdays: '휴무일', settings: '설정' };
let clTab = 'active'; // 운영중 / 보관
const MUTE_KEY = 'abbg-notif-muted'; // 이 기기에서 알림 끈 클라이언트 id 목록

const $ = id => document.getElementById(id);
const clientUrl = c => `${location.origin}/c/${c.code}`;

// ── 기기별 알림 설정 ──
function mutedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(MUTE_KEY) || '[]')); } catch (e) { return new Set(); }
}
function toggleMute(id) {
  const s = mutedSet();
  s.has(id) ? s.delete(id) : s.add(id);
  try { localStorage.setItem(MUTE_KEY, JSON.stringify([...s])); } catch (e) {}
  return !s.has(id);
}

// ── 토스트 ──
let toastT;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2200);
}

async function copy(text, msg = '링크를 복사했어요') {
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch (e) { prompt('아래 링크를 복사하세요', text); }
}

// ════════════ 로그인 ════════════

async function tryLogin() {
  const pw = $('lock-pw').value.trim();
  if (!/^\d{6}$/.test(pw)) { $('lock-err').textContent = '6자리 숫자로 입력해주세요.'; $('lock-err').classList.add('show'); return; }
  if (await api.login(pw)) {
    $('lock-err').classList.remove('show');
    $('lock-pw').value = '';
    await boot();
  } else {
    $('lock-err').textContent = '비밀번호가 틀렸어요.';
    $('lock-err').classList.add('show');
  }
}

function showLock() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  $('page-lock').classList.add('active');
  document.querySelector('.sidebar').style.visibility = 'hidden';
  document.querySelector('.mob-tb').style.visibility = 'hidden';
  setTimeout(() => $('lock-pw').focus(), 50);
}

// ════════════ 페이지 전환 ════════════
function go(page) {
  current = page;
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
  document.querySelectorAll('[data-page]').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  $('mpg').textContent = PAGE_NAMES[page];
  closePop();
  render();
  window.scrollTo(0, 0);
}

async function reload() { data = await api.loadAll(); render(); }

function render() {
  if (!data) return;
  renderBadges();
  if (current === 'clients') renderClients();
  if (current === 'team') renderTeam();
  if (current === 'offdays') renderOffDays();
}

// ════════════ 클라이언트 목록 (표) ════════════
function renderClients() {
  const q = ($('cl-search').value || '').trim().toLowerCase();
  const all = data.clients;
  const active = all.filter(c => !c.archived), archived = all.filter(c => c.archived);
  $('cnt-active').textContent = active.length;
  $('cnt-archived').textContent = archived.length;
  $('cl-count').textContent = `총 ${all.length}개`;
  document.querySelectorAll('.cl-tab').forEach(t => { const on = t.dataset.tab === clTab; t.classList.toggle('active', on); t.setAttribute('aria-selected', on); });
  const match = c => !q || c.name.toLowerCase().includes(q);
  const muted = mutedSet();

  if (clTab === 'archived') {
    const rows = archived.filter(match);
    $('cl-table').innerHTML = `<thead><tr><th>클라이언트</th><th>보관일</th><th>업무</th><th></th></tr></thead><tbody>${
      rows.length ? rows.map(c => {
        const n = data.tasks.filter(t => t.client_id === c.id).length;
        return `<tr data-id="${c.id}">
          <td class="c-name">${esc(c.name)}<span class="mt">링크 접속 차단 중</span></td>
          <td>${c.archived_at ? fmtDate(c.archived_at) : '-'}</td>
          <td><span class="n">${n}</span>건</td>
          <td class="acts"><span class="acts-in">
            <button class="pill-btn" data-act="restore" type="button">복원</button>
            <button class="pill-btn danger" data-act="delete" type="button">삭제</button>
          </span></td></tr>`;
      }).join('') : `<tr><td colspan="4" class="cl-empty">${q ? '검색 결과가 없어요' : '보관된 클라이언트가 없어요'}</td></tr>`
    }</tbody>`;
    return;
  }

  const rows = active.filter(match)
    .map(c => ({ c, s: clientStats(data, c.id) }))
    .sort((a, b) => b.s.pending - a.s.pending || b.s.late - a.s.late || a.c.name.localeCompare(b.c.name, 'ko'));
  $('cl-table').innerHTML = `<thead><tr>
      <th>클라이언트</th><th>검토 대기</th><th>진행 중</th><th>지연</th><th>이번 달 완료</th><th>마지막 요청</th><th>급건 비율</th><th>구독 · 담당</th><th></th>
    </tr></thead><tbody>${
    rows.length ? rows.map(({ c, s }) => {
      const on = !muted.has(c.id);
      const subs = s.subs.map(sub => {
        const m = data.team.find(t => t.id === sub.team_id);
        return m ? `<span class="sub-chip">${sub.no} <b>${esc(m.name)}</b></span>` : `<span class="sub-chip empty">${sub.no} 미연결</span>`;
      }).join('');
      return `<tr data-id="${c.id}">
        <td class="c-name">${esc(c.name)}${s.unseen && on ? `<span class="new-tag">새 요청 ${s.unseen}</span>` : ''}</td>
        <td><span class="pend-badge ${s.pending ? '' : 'zero'}">${s.pending}</span></td>
        <td><span class="n ${s.open ? '' : 'dim'}">${s.open}</span></td>
        <td><span class="n ${s.late ? 'bad' : 'dim'}">${s.late || '—'}</span></td>
        <td><span class="n">${s.doneThisMonth}</span>건</td>
        <td>${relDate(s.lastReq)}</td>
        <td>${s.urgentRate == null ? '-' : s.urgentRate + '%'}</td>
        <td><div class="subs">${subs}</div></td>
        <td class="acts"><span class="acts-in">
          <button class="icon-btn ${on ? '' : 'muted'}" data-act="mute" type="button" aria-pressed="${on}" aria-label="${on ? '이 기기에서 알림 끄기' : '이 기기에서 알림 켜기'}" title="${on ? '이 기기에서 알림 받는 중' : '이 기기에서 알림 꺼짐'}"><i class="ti ${on ? 'ti-bell' : 'ti-bell-off'}"></i></button>
          <button class="pill-btn" data-act="copy" type="button">링크 복사</button>
          <button class="pill-btn dark" data-act="open" type="button">페이지 열기</button>
          <button class="icon-btn" data-act="more" type="button" aria-label="더보기"><i class="ti ti-dots"></i></button>
        </span></td>
      </tr>`;
    }).join('') : `<tr><td colspan="9" class="cl-empty">${q ? '검색 결과가 없어요' : "아직 클라이언트가 없어요. '+ 추가'로 첫 페이지를 만들어 보세요."}</td></tr>`
  }</tbody>`;
}

document.querySelectorAll('.cl-tab').forEach(t => t.onclick = () => { clTab = t.dataset.tab; renderClients(); });
$('cl-search').addEventListener('input', () => renderClients());

// 표 버튼 처리 (이벤트 위임)
$('cl-table').addEventListener('click', e => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.closest('tr').dataset.id;
  const c = data.clients.find(x => x.id === id);
  const act = btn.dataset.act;
  if (act === 'open') openClient(c);
  if (act === 'copy') copy(clientUrl(c));
  if (act === 'restore') modalRestore(id);
  if (act === 'delete') modalDelete(id);
  if (act === 'mute') { const on = toggleMute(id); toast(on ? `${c.name} 알림을 이 기기에서 받아요` : `${c.name} 알림을 이 기기에서 껐어요`); render(); }
  if (act === 'more') openPop(btn, [
    { icon: 'ti-users', label: '구독·담당자', fn: () => modalSubs(id) },
    { icon: 'ti-list-details', label: '작업유형', fn: () => modalTypes(id) },
    { icon: 'ti-refresh', label: '링크 재발급', fn: () => modalReissue(id) },
    { icon: 'ti-pencil', label: '이름 변경', fn: () => modalRename(id) },
    { icon: 'ti-archive', label: '보관', fn: () => modalArchive(id), danger: true }
  ]);
});

async function openClient(c) {
  await api.markSeen(c.id, data.pending);
  await reload();
  window.open(clientUrl(c) + '#review', '_blank', 'noopener');
}

// ════════════ 더보기 팝오버 ════════════
function openPop(anchor, items) {
  const pop = $('pop');
  pop.innerHTML = items.map((it, i) => `<button type="button" data-i="${i}" class="${it.danger ? 'danger' : ''}"><i class="ti ${it.icon}"></i>${it.label}</button>`).join('');
  pop.onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; closePop(); items[b.dataset.i].fn(); };
  const r = anchor.getBoundingClientRect();
  pop.classList.add('show');
  const w = pop.offsetWidth;
  pop.style.top = (r.bottom + window.scrollY + 4) + 'px';
  pop.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + window.scrollX + 'px';
  setTimeout(() => document.addEventListener('click', closePopOutside), 0);
}
function closePop() { $('pop').classList.remove('show'); document.removeEventListener('click', closePopOutside); }
function closePopOutside(e) { if (!$('pop').contains(e.target)) closePop(); }

// ════════════ 모달 공통 ════════════
function openModal(html, { wide = false } = {}) {
  const m = $('modal');
  m.className = 'modal' + (wide ? ' wide' : '');
  m.innerHTML = html;
  $('modal-bg').classList.add('show');
  m.querySelectorAll('[data-close]').forEach(b => b.onclick = closeModal);
  const first = m.querySelector('input,select,button:not(.modal-close)');
  if (first) setTimeout(() => first.focus(), 30);
}
function closeModal() { $('modal-bg').classList.remove('show'); $('modal').innerHTML = ''; }
$('modal-bg').addEventListener('mousedown', e => { if (e.target.id === 'modal-bg') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closePop(); $('notif-drop').classList.remove('show'); } });

const mHead = t => `<div class="modal-hd"><div class="modal-title">${t}</div><button class="modal-close" data-close type="button" aria-label="닫기">×</button></div>`;

// ── 새 클라이언트 ──
$('btn-new-client').onclick = () => {
  openModal(`${mHead('새 클라이언트')}
    <div class="modal-bd">
      <div class="modal-field"><label class="modal-fl" for="nc-name">클라이언트 이름</label><input type="text" id="nc-name" placeholder="예: 모아베이커리"></div>
      <div class="modal-field"><label class="modal-fl" for="nc-subs">구독 개수</label><input type="text" inputmode="numeric" id="nc-subs" value="1" style="max-width:100px"></div>
      <p class="m-note">만들면 전용 링크가 바로 발급되고, ABBG 기본 작업유형이 복사돼요. 담당 팀원은 다음 화면에서 연결해요.</p>
      <div class="m-err" id="nc-err"></div>
    </div>
    <div class="modal-ft"><div class="modal-ft-inner"><button class="modal-btn-pri" id="nc-ok" type="button">만들기</button><button class="modal-btn-sec" data-close type="button">취소</button></div></div>`);
  $('nc-ok').onclick = async () => {
    const name = $('nc-name').value.trim();
    const n = parseInt($('nc-subs').value, 10);
    if (!name) { $('nc-err').textContent = '클라이언트 이름을 입력해주세요.'; return; }
    if (data.clients.some(c => c.name === name)) { $('nc-err').textContent = '같은 이름의 클라이언트가 이미 있어요.'; return; }
    if (!(n >= 1 && n <= 20)) { $('nc-err').textContent = '구독 개수는 1~20 사이 숫자로 입력해주세요.'; return; }
    const c = await api.createClient(name, n);
    await reload();
    modalSubs(c.id, true);
  };
};

// ── 구독·담당자 ──
function modalSubs(clientId, justCreated = false) {
  const c = data.clients.find(x => x.id === clientId);
  const subs = data.subscriptions.filter(s => s.client_id === clientId).sort((a, b) => a.no - b.no);
  const rows = subs.map(s => {
    const takenByOther = new Set(subs.filter(o => o.id !== s.id && o.team_id).map(o => o.team_id));
    const opts = data.team.map(m => `<option value="${m.id}" ${m.id === s.team_id ? 'selected' : ''} ${takenByOther.has(m.id) ? 'disabled' : ''}>${esc(m.name)}${takenByOther.has(m.id) ? ' (다른 구독 담당)' : ''}</option>`).join('');
    const open = data.tasks.filter(t => t.sub_id === s.id && !t.done).length;
    return `<div class="sub-row" data-sub="${s.id}">
      <span class="no">구독 ${s.no}</span>
      <select aria-label="구독 ${s.no} 담당 팀원"><option value="">연결 안 함</option>${opts}</select>
      <span class="bd-line" style="width:64px;text-align:right">${open ? `진행 ${open}건` : ''}</span>
      <button class="icon-btn" data-rm type="button" aria-label="구독 ${s.no} 삭제" ${subs.length <= 1 ? 'disabled' : ''}><i class="ti ti-trash"></i></button>
    </div>`;
  }).join('');
  openModal(`${mHead(`${esc(c.name)} · 구독·담당자`)}
    <div class="modal-bd">
      ${justCreated ? `<div class="modal-field"><span class="modal-fl">전용 링크가 발급됐어요</span><div class="link-box"><code>${esc(clientUrl(c))}</code><button class="a-btn sec" id="sub-copy" type="button">복사</button></div></div>` : ''}
      <p class="m-note">클라이언트에게는 구독 번호만 보이고 팀원 이름은 보이지 않아요. 한 팀원은 같은 클라이언트에서 구독 1개만 맡을 수 있어요.</p>
      <div>${rows}</div>
      <div><button class="a-btn sec" id="sub-add" type="button"><i class="ti ti-plus"></i>구독 추가</button></div>
      <div class="m-err" id="sub-err"></div>
    </div>
    <div class="modal-ft"><div class="modal-ft-inner"><button class="modal-btn-pri" data-close type="button">완료</button></div></div>`);
  if (justCreated) $('sub-copy').onclick = () => copy(clientUrl(c));
  $('sub-add').onclick = async () => { await api.addSubscription(clientId); await reload(); modalSubs(clientId); toast('구독을 추가했어요'); };
  document.querySelectorAll('.sub-row').forEach(row => {
    const subId = row.dataset.sub;
    row.querySelector('select').onchange = async e => {
      const r = await api.assignSubscription(subId, e.target.value);
      if (r.error) { $('sub-err').textContent = r.error; return; }
      await reload(); modalSubs(clientId, justCreated);
    };
    row.querySelector('[data-rm]').onclick = async () => {
      const r = await api.removeSubscription(subId);
      if (r.error) { $('sub-err').textContent = r.error; return; }
      await reload(); modalSubs(clientId, justCreated); toast('구독을 삭제했어요');
    };
  });
}

// ── 작업유형 (대분류 탭별로 보고 추가) ──
function modalTypes(clientId) {
  const c = data.clients.find(x => x.id === clientId);
  let list = data.work_types.filter(w => w.client_id === clientId).sort((a, b) => a.sort - b.sort).map(w => ({ ...w }));
  const cats = () => [...new Set(list.map(w => w.cat))];
  const catLabel = cat => cat || '분류 없음';
  let active = cats()[0] ?? '';
  let mode = null; // 'addCat' | 'renameCat'

  const rowHtml = (w, i) => `<tr data-i="${i}" class="${w.inquiry ? 'inq' : ''}">
      <td><input type="text" data-k="name" value="${esc(w.name)}" placeholder="세부 작업" style="min-width:170px"></td>
      <td><input type="text" data-k="qty" value="${esc(w.qty)}" placeholder="-" style="width:120px"></td>
      <td style="white-space:nowrap"><input type="text" inputmode="numeric" class="d" data-k="min" value="${w.min ?? ''}" aria-label="최소 영업일"> ~ <input type="text" inputmode="numeric" class="d" data-k="max" value="${w.max ?? ''}" aria-label="최대 영업일"></td>
      <td><select data-k="cap" aria-label="급건 캐파"><option value="simple" ${w.cap === 'simple' ? 'selected' : ''}>간단</option><option value="complex" ${w.cap !== 'simple' ? 'selected' : ''}>복잡</option></select></td>
      <td class="ck"><input type="checkbox" data-k="illust" ${w.illust ? 'checked' : ''} aria-label="일러스트 옵션"></td>
      <td class="ck"><input type="checkbox" data-k="inquiry" ${w.inquiry ? 'checked' : ''} aria-label="별도 문의"></td>
      <td><input type="text" data-k="note" value="${esc(w.note)}" placeholder="안내 문구" style="min-width:170px"></td>
      <td><button class="icon-btn" data-del type="button" aria-label="삭제"><i class="ti ti-x"></i></button></td>
    </tr>`;

  const draw = () => {
    const cs = cats();
    if (!cs.includes(active) && mode !== 'addCat') active = cs[0] ?? '';
    // 탭
    $('wt-tabs').innerHTML = cs.map(cat => {
      const n = list.filter(w => w.cat === cat).length;
      if (mode === 'renameCat' && cat === active) {
        return `<span class="wt-tab-edit"><input type="text" id="wt-cat-input" value="${esc(cat)}" aria-label="대분류 이름"><button class="a-btn" id="wt-cat-ok" type="button">변경</button><button class="a-btn sec" id="wt-cat-cancel" type="button">취소</button></span>`;
      }
      return `<button class="wt-tab ${cat === active ? 'active' : ''}" data-cat="${esc(cat)}" type="button" role="tab" aria-selected="${cat === active}">${esc(catLabel(cat))}<span>${n}</span></button>`;
    }).join('') + (mode === 'addCat'
      ? `<span class="wt-tab-edit"><input type="text" id="wt-cat-input" placeholder="새 대분류 이름" aria-label="새 대분류 이름"><button class="a-btn" id="wt-cat-ok" type="button">추가</button><button class="a-btn sec" id="wt-cat-cancel" type="button">취소</button></span>`
      : `<button class="wt-tab add" id="wt-cat-add" type="button"><i class="ti ti-plus"></i>대분류 추가</button>`);

    // 표: 현재 탭 항목만 (원래 목록의 위치 i를 유지)
    const rows = list.map((w, i) => [w, i]).filter(([w]) => w.cat === active);
    $('wt-body').innerHTML = rows.length ? rows.map(([w, i]) => rowHtml(w, i)).join('')
      : `<tr><td colspan="8" class="notif-empty">이 대분류에 항목이 없어요.</td></tr>`;
    $('wt-add').innerHTML = `<i class="ti ti-plus"></i>${esc(catLabel(active))}에 항목 추가`;
    $('wt-cat-tools').style.display = cs.length && mode === null ? '' : 'none';

    const inp = $('wt-cat-input');
    if (inp) {
      inp.focus();
      const submit = () => {
        const v = inp.value.trim();
        if (!v) { $('wt-err').textContent = '대분류 이름을 입력해주세요.'; return; }
        if (cats().includes(v) && !(mode === 'renameCat' && v === active)) { $('wt-err').textContent = '같은 이름의 대분류가 이미 있어요.'; return; }
        if (mode === 'addCat') list.push({ cat: v, name: '', qty: '', min: 1, max: 2, cap: 'complex', note: '', illust: false, inquiry: false });
        else list.forEach(w => { if (w.cat === active) w.cat = v; });
        active = v; mode = null; $('wt-err').textContent = ''; draw();
        const first = document.querySelector('#wt-body input[data-k=name]'); if (first && !first.value) first.focus();
      };
      $('wt-cat-ok').onclick = submit;
      inp.onkeydown = e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { e.stopPropagation(); mode = null; draw(); } };
      $('wt-cat-cancel').onclick = () => { mode = null; $('wt-err').textContent = ''; draw(); };
    }
    const add = $('wt-cat-add'); if (add) add.onclick = () => { mode = 'addCat'; draw(); };
  };

  openModal(`${mHead(`${esc(c.name)} · 작업유형`)}
    <div class="modal-bd">
      <p class="m-note">소요일은 영업일 기준이에요. 요청 폼의 납기는 최대 일수로 자동 입력되고, 최소 일수보다 짧으면 경고만 떠요(요청은 막지 않아요). 하나로 된 일수는 최소·최대를 같게, 당일은 0으로 적어요.</p>
      <div class="wt-tabs" id="wt-tabs" role="tablist"></div>
      <div class="wt-wrap"><table class="wt-table">
        <thead><tr><th>세부 작업</th><th>기준 분량</th><th>소요일</th><th>급건</th><th>일러스트</th><th>별도 문의</th><th>안내 문구</th><th></th></tr></thead>
        <tbody id="wt-body"></tbody>
      </table></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button class="a-btn sec" id="wt-add" type="button"></button>
        <span id="wt-cat-tools" style="display:flex;gap:8px">
          <button class="a-btn sec" id="wt-cat-rename" type="button"><i class="ti ti-pencil"></i>대분류 이름 변경</button>
          <button class="a-btn sec" id="wt-cat-del" type="button" style="color:#b91c1c"><i class="ti ti-trash"></i>대분류 삭제</button>
        </span>
        <span style="flex:1"></span>
        <button class="a-btn sec" id="wt-reset" type="button"><i class="ti ti-restore"></i>ABBG 기본값으로 바꾸기</button>
      </div>
      <div class="m-err" id="wt-err"></div>
    </div>
    <div class="modal-ft"><div class="modal-ft-inner"><button class="modal-btn-pri" id="wt-save" type="button">저장</button><button class="modal-btn-sec" data-close type="button">취소</button></div></div>`, { wide: true });
  draw();

  $('wt-tabs').addEventListener('click', e => {
    const t = e.target.closest('[data-cat]'); if (!t) return;
    active = t.dataset.cat; mode = null; draw();
  });
  // 입력하는 대로 list에 반영
  $('wt-body').addEventListener('input', e => {
    const tr = e.target.closest('tr'); const k = e.target.dataset.k;
    if (!tr || !k) return;
    const w = list[tr.dataset.i];
    if (e.target.type === 'checkbox') { w[k] = e.target.checked; if (k === 'inquiry') tr.classList.toggle('inq', w.inquiry); }
    else if (k === 'min' || k === 'max') w[k] = e.target.value.trim() === '' ? null : Number(e.target.value);
    else w[k] = e.target.value;
  });
  $('wt-body').addEventListener('change', e => {
    const tr = e.target.closest('tr');
    if (tr && e.target.dataset.k === 'cap') list[tr.dataset.i].cap = e.target.value;
  });
  $('wt-body').addEventListener('click', e => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    list.splice(Number(b.closest('tr').dataset.i), 1); draw();
  });
  $('wt-add').onclick = () => {
    // 같은 대분류의 마지막 항목 뒤에 넣어서 순서를 유지
    const last = list.map(w => w.cat).lastIndexOf(active);
    list.splice(last + 1, 0, { cat: active, name: '', qty: '', min: 1, max: 2, cap: 'complex', note: '', illust: false, inquiry: false });
    draw();
    const inputs = document.querySelectorAll('#wt-body input[data-k=name]'); if (inputs.length) inputs[inputs.length - 1].focus();
  };
  $('wt-cat-rename').onclick = () => { mode = 'renameCat'; draw(); };
  $('wt-cat-del').onclick = () => {
    const n = list.filter(w => w.cat === active).length;
    if (!confirm(`'${catLabel(active)}' 대분류와 항목 ${n}개를 삭제할까요? 저장을 눌러야 적용돼요.`)) return;
    list = list.filter(w => w.cat !== active); active = cats()[0] ?? ''; draw();
  };
  $('wt-reset').onclick = () => {
    if (!confirm('지금 목록을 ABBG 기본 작업유형으로 바꿀까요? 저장을 눌러야 적용돼요.')) return;
    list = DEFAULT_WORK_TYPES.map(t => ({ qty: '', note: '', illust: false, inquiry: false, ...t })); active = cats()[0]; mode = null; draw();
  };
  $('wt-save').onclick = async () => {
    if (mode) { $('wt-err').textContent = '대분류 이름 입력을 먼저 마쳐주세요.'; return; }
    const bad = list.find(w => !w.name.trim() || (!w.inquiry && (!Number.isInteger(w.min) || !Number.isInteger(w.max) || w.min < 0 || w.max < w.min)));
    if (bad) {
      active = bad.cat; draw();
      $('wt-err').textContent = `'${catLabel(bad.cat)}'의 ${bad.name ? `'${bad.name}'` : '이름 없는 항목'}을 확인해주세요. 세부 작업 이름이 있어야 하고, 소요일은 0 이상이며 최소가 최대보다 클 수 없어요.`;
      return;
    }
    await api.saveWorkTypes(clientId, list);
    await reload(); closeModal(); toast('작업유형을 저장했어요');
  };
}

// ── 링크 재발급 ──
function modalReissue(id) {
  const c = data.clients.find(x => x.id === id);
  openModal(`${mHead('링크 재발급')}
    <div class="modal-bd">
      <p class="m-warn">지금 링크는 바로 막히고, 이 링크로 접속해 있던 사람도 더 이상 볼 수 없어요. ${esc(c.name)} 담당자들에게 새 링크를 다시 전달해야 해요.</p>
    </div>
    <div class="modal-ft"><div class="modal-ft-inner"><button class="modal-btn-pri" id="ri-ok" type="button">재발급</button><button class="modal-btn-sec" data-close type="button">취소</button></div></div>`);
  $('ri-ok').onclick = async () => {
    await api.reissueLink(id); await reload();
    const nc = data.clients.find(x => x.id === id);
    openModal(`${mHead('새 링크가 발급됐어요')}
      <div class="modal-bd"><div class="link-box"><code>${esc(clientUrl(nc))}</code><button class="a-btn sec" id="ri-copy" type="button">복사</button></div></div>
      <div class="modal-ft"><div class="modal-ft-inner"><button class="modal-btn-pri" data-close type="button">완료</button></div></div>`);
    $('ri-copy').onclick = () => copy(clientUrl(nc));
  };
}

// ── 이름 변경 ──
function modalRename(id) {
  const c = data.clients.find(x => x.id === id);
  openModal(`${mHead('이름 변경')}
    <div class="modal-bd">
      <div class="modal-field"><label class="modal-fl" for="rn-name">클라이언트 이름</label><input type="text" id="rn-name" value="${esc(c.name)}"></div>
      <p class="m-note">클라이언트 페이지 상단의 "${esc(c.name)} × ABBG" 표시도 함께 바뀌어요. 링크는 그대로예요.</p>
      <div class="m-err" id="rn-err"></div>
    </div>
    <div class="modal-ft"><div class="modal-ft-inner"><button class="modal-btn-pri" id="rn-ok" type="button">저장</button><button class="modal-btn-sec" data-close type="button">취소</button></div></div>`);
  $('rn-ok').onclick = async () => {
    const name = $('rn-name').value.trim();
    if (!name) { $('rn-err').textContent = '이름을 입력해주세요.'; return; }
    await api.renameClient(id, name); await reload(); closeModal(); toast('이름을 바꿨어요');
  };
}

// ── 보관 ──
function modalArchive(id) {
  const c = data.clients.find(x => x.id === id);
  const s = clientStats(data, id);
  openModal(`${mHead(`${esc(c.name)} 보관`)}
    <div class="modal-bd">
      <p class="m-note">보관하면 링크 접속이 바로 막히고, 클라이언트 목록 아래 '보관된 클라이언트'로 옮겨져요. 데이터는 그대로 남아서 언제든 복원할 수 있어요.</p>
      ${s.pending || s.open ? `<p class="m-warn">검토 대기 ${s.pending}건, 진행 중 ${s.open}건이 남아 있어요.</p>` : ''}
    </div>
    <div class="modal-ft"><div class="modal-ft-inner"><button class="modal-btn-del" id="ar-ok" type="button">보관</button><button class="modal-btn-sec" data-close type="button">취소</button></div></div>`);
  $('ar-ok').onclick = async () => { await api.archiveClient(id); await reload(); closeModal(); toast(`${c.name}을(를) 보관했어요`); };
}

// ── 복원 ──
function modalRestore(id) {
  const c = data.clients.find(x => x.id === id);
  openModal(`${mHead(`${esc(c.name)} 복원`)}
    <div class="modal-bd">
      <div class="choice">
        <label><input type="radio" name="rs" value="keep" checked><div><b>기존 링크 다시 쓰기</b><span>예전에 전달한 링크로 바로 다시 들어올 수 있어요.</span></div></label>
        <label><input type="radio" name="rs" value="new"><div><b>새 링크 발급</b><span>예전 링크는 계속 막아두고 새 링크를 전달해요.</span></div></label>
      </div>
    </div>
    <div class="modal-ft"><div class="modal-ft-inner"><button class="modal-btn-pri" id="rs-ok" type="button">복원</button><button class="modal-btn-sec" data-close type="button">취소</button></div></div>`);
  $('rs-ok').onclick = async () => {
    const newLink = document.querySelector('input[name=rs]:checked').value === 'new';
    await api.restoreClient(id, newLink); await reload();
    const nc = data.clients.find(x => x.id === id);
    openModal(`${mHead(`${esc(nc.name)}을(를) 복원했어요`)}
      <div class="modal-bd"><div class="link-box"><code>${esc(clientUrl(nc))}</code><button class="a-btn sec" id="rs-copy" type="button">복사</button></div></div>
      <div class="modal-ft"><div class="modal-ft-inner"><button class="modal-btn-pri" data-close type="button">완료</button></div></div>`);
    $('rs-copy').onclick = () => copy(clientUrl(nc));
  };
}

// ── 영구 삭제 ──
function modalDelete(id) {
  const c = data.clients.find(x => x.id === id);
  openModal(`${mHead(`${esc(c.name)} 영구 삭제`)}
    <div class="modal-bd">
      <p class="m-warn">요청, 업무, 요청자, 구독, 작업유형, 휴지통까지 모두 지워지고 되돌릴 수 없어요.</p>
      <div><button class="a-btn sec" id="dl-csv" type="button"><i class="ti ti-download"></i>삭제 전 요청·업무 내역 CSV 받기</button></div>
      <div class="modal-field"><label class="modal-fl" for="dl-name">확인을 위해 <b>${esc(c.name)}</b>을(를) 그대로 입력해주세요</label><input type="text" id="dl-name" autocomplete="off"></div>
    </div>
    <div class="modal-ft"><div class="modal-ft-inner"><button class="a-btn danger" id="dl-ok" type="button" disabled>영구 삭제</button><button class="modal-btn-sec" data-close type="button">취소</button></div></div>`);
  $('dl-csv').onclick = () => exportClientCSV(data, id);
  $('dl-name').oninput = e => { $('dl-ok').disabled = e.target.value.trim() !== c.name; };
  $('dl-ok').onclick = async () => { await api.deleteClient(id); await reload(); closeModal(); toast(`${c.name}을(를) 삭제했어요`); };
}

// ════════════ 팀원 명단 ════════════
function renderTeam() {
  $('team-list').innerHTML = data.team.length ? data.team.map(m => {
    const subs = data.subscriptions.filter(s => s.team_id === m.id);
    const where = subs.map(s => { const c = data.clients.find(x => x.id === s.client_id); return `${c.name} 구독 ${s.no}${c.archived ? '(보관)' : ''}`; }).join(', ');
    return `<div class="tm-row" data-id="${m.id}">
      <div class="nm">${esc(m.name)}<div class="mt">${where ? esc(where) : '연결된 구독 없음'}</div></div>
      <button class="a-btn sec" data-act="rename" type="button">이름 수정</button>
      <button class="icon-btn" data-act="del" type="button" aria-label="${esc(m.name)} 삭제"><i class="ti ti-trash"></i></button>
    </div>`;
  }).join('') : `<div class="notif-empty">등록된 팀원이 없어요.</div>`;
}
$('team-add').onclick = async () => {
  const name = $('team-new').value.trim();
  if (!name) return;
  if (data.team.some(t => t.name === name)) { toast('같은 이름의 팀원이 이미 있어요'); return; }
  await api.addTeam(name); $('team-new').value = ''; await reload(); toast(`${name}님을 추가했어요`);
};
$('team-new').addEventListener('keydown', e => { if (e.key === 'Enter') $('team-add').click(); });
$('team-list').addEventListener('click', e => {
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  const id = btn.closest('.tm-row').dataset.id;
  const m = data.team.find(t => String(t.id) === id);
  if (btn.dataset.act === 'rename') {
    openModal(`${mHead('이름 수정')}
      <div class="modal-bd"><div class="modal-field"><label class="modal-fl" for="tm-name">팀원 이름</label><input type="text" id="tm-name" value="${esc(m.name)}"></div>
      <p class="m-note">연결된 모든 클라이언트에 함께 반영돼요.</p></div>
      <div class="modal-ft"><div class="modal-ft-inner"><button class="modal-btn-pri" id="tm-ok" type="button">저장</button><button class="modal-btn-sec" data-close type="button">취소</button></div></div>`);
    $('tm-ok').onclick = async () => { const n = $('tm-name').value.trim(); if (!n) return; await api.renameTeam(id, n); await reload(); closeModal(); toast('이름을 수정했어요'); };
  }
  if (btn.dataset.act === 'del') {
    const subs = data.subscriptions.filter(s => String(s.team_id) === id);
    openModal(`${mHead(`${esc(m.name)} 삭제`)}
      <div class="modal-bd">
        ${subs.length ? `<p class="m-warn">연결된 구독 ${subs.length}개가 '미연결'로 바뀌어요. 진행 중인 업무는 구독에 그대로 남아 있으니, 삭제 후 다른 팀원을 연결해주세요.</p>` : ''}
        <p class="m-note">이미 완료된 업무 기록은 그대로 남아요.</p>
      </div>
      <div class="modal-ft"><div class="modal-ft-inner"><button class="modal-btn-del" id="tmd-ok" type="button">삭제</button><button class="modal-btn-sec" data-close type="button">취소</button></div></div>`);
    $('tmd-ok').onclick = async () => { await api.deleteTeam(id); await reload(); closeModal(); toast('팀원을 삭제했어요'); };
  }
});

// ════════════ 휴무일 ════════════
function renderOffDays() {
  const list = data.off_days.slice().sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = list.filter(o => o.date >= TODAY);
  const past = list.filter(o => o.date < TODAY);
  const row = o => `<div class="tm-row" data-date="${o.date}"><div class="nm">${fmtDate(o.date)}<div class="mt">${o.date}</div></div><button class="icon-btn" data-act="del" type="button" aria-label="${o.date} 삭제"><i class="ti ti-trash"></i></button></div>`;
  $('off-list').innerHTML = (upcoming.length ? upcoming.map(row).join('') : `<div class="notif-empty">예정된 휴무일이 없어요.</div>`)
    + (past.length ? `<div class="tm-row" style="background:var(--surface-sub)"><div class="mt">지난 휴무일 ${past.length}개</div></div>` + past.map(row).join('') : '');
}
$('off-add').onclick = async () => { const d = $('off-new').value; if (!d) return; await api.addOffDay(d); $('off-new').value = ''; await reload(); toast(`${fmtDate(d)}을 휴무일로 추가했어요`); };
$('off-list').addEventListener('click', async e => {
  const btn = e.target.closest('[data-act=del]'); if (!btn) return;
  const d = btn.closest('.tm-row').dataset.date;
  await api.removeOffDay(d); await reload(); toast('휴무일을 삭제했어요');
});

// ════════════ 설정 ════════════
$('pw-save').onclick = async () => {
  const cur = $('pw-cur').value, nw = $('pw-new').value, cf = $('pw-cf').value, msg = $('pw-msg');
  msg.style.color = '';
  if (![cur, nw, cf].every(v => /^\d{6}$/.test(v))) { msg.textContent = '모두 6자리 숫자로 입력해주세요.'; return; }
  if (nw !== cf) { msg.textContent = '새 비밀번호가 서로 달라요.'; return; }
  const r = await api.changePassword(cur, nw);
  if (r.error) { msg.textContent = r.error; return; }
  ['pw-cur', 'pw-new', 'pw-cf'].forEach(i => $(i).value = '');
  msg.style.color = 'var(--c1d)'; msg.textContent = '비밀번호를 바꿨어요.';
};

// ════════════ 알림 ════════════
function unseenForMe() {
  const muted = mutedSet();
  const active = new Set(data.clients.filter(c => !c.archived).map(c => c.id));
  return data.pending.filter(p => !p.seen && active.has(p.client_id) && !muted.has(p.client_id))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}
function renderBadges() {
  const n = unseenForMe().length;
  ['notif-badge', 'mob-notif-badge'].forEach(i => $(i).classList.toggle('show', n > 0));
  const totalPend = data.pending.filter(p => data.clients.some(c => c.id === p.client_id && !c.archived)).length;
  [['nb-clients', 'show'], ['mb-clients', 'show']].forEach(([i, cls]) => { $(i).textContent = totalPend; $(i).classList.toggle(cls, totalPend > 0); });
  renderNotifList();
}
function renderNotifList() {
  const items = unseenForMe();
  $('notif-list').innerHTML = items.length ? items.map(p => {
    const c = data.clients.find(x => x.id === p.client_id);
    return `<div class="notif-item unread" data-client="${c.id}" tabindex="0">
      <span class="notif-dot"></span>
      <div class="notif-body"><div class="notif-msg"><span class="notif-client">[${esc(c.name)}]</span> ${esc(p.name)}</div>
      <div class="notif-time">${relDate(p.created_at)}${p.priority === 'urgent' ? ' · 급건' : ''}</div></div>
    </div>`;
  }).join('') : `<div class="notif-empty">새 요청이 없어요<br><span style="font-size:var(--fs-xs)">알림은 카드의 종 버튼으로 이 기기에서 켜고 끌 수 있어요.</span></div>`;
}
function toggleNotif(e) { e.stopPropagation(); $('notif-drop').classList.toggle('show'); }
$('notif-btn').onclick = toggleNotif;
$('mob-notif-btn').onclick = toggleNotif;
document.addEventListener('click', e => { if (!$('notif-drop').contains(e.target)) $('notif-drop').classList.remove('show'); });
$('notif-list').addEventListener('click', e => {
  const it = e.target.closest('[data-client]'); if (!it) return;
  $('notif-drop').classList.remove('show');
  openClient(data.clients.find(c => c.id === it.dataset.client));
});
$('notif-clear').onclick = async () => {
  const ids = new Set(unseenForMe().map(p => p.client_id));
  for (const id of ids) await api.markSeen(id, data.pending);
  await reload(); toast('알림을 모두 확인했어요');
};

// ════════════ 이벤트 연결 & 시작 ════════════
document.querySelectorAll('[data-page]').forEach(n => {
  n.addEventListener('click', () => go(n.dataset.page));
  n.addEventListener('keydown', e => { if (e.key === 'Enter') go(n.dataset.page); });
});
$('lock-submit').onclick = tryLogin;
$('lock-pw').addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
$('nav-logout').onclick = async () => { await api.logout(); data = null; showLock(); };

if (DEMO) {
  $('demo-bar').hidden = false;
  $('demo-reset').onclick = async () => { if (!confirm('지금까지 바꾼 내용을 지우고 예시 데이터로 되돌릴까요?')) return; resetDemo(); await reload(); toast('예시 데이터로 되돌렸어요'); };
  $('demo-incoming').onclick = async () => {
    const actives = data.clients.filter(c => !c.archived);
    const c = actives[Math.floor(Math.random() * actives.length)];
    const names = ['신제품 상세페이지', '11월 프로모션 배너', '리플렛 문구 수정', 'SNS 카드뉴스 5P', '단상자 컬러 베리에이션'];
    await api.demoIncoming(c.id, names[Math.floor(Math.random() * names.length)]);
    await reload();
    toast(mutedSet().has(c.id) ? `${c.name}에 새 요청 (이 기기는 알림 꺼짐)` : `[${c.name}] 새 요청이 들어왔어요`);
  };
}

// 오류는 화면 아래 알림으로
window.addEventListener('unhandledrejection', e => { toast(e.reason?.message || '처리 중 오류가 났어요. 새로고침 후 다시 시도해주세요.'); });

let listening = false;
async function boot() {
  document.querySelector('.sidebar').style.visibility = '';
  document.querySelector('.mob-tb').style.visibility = '';
  data = await api.loadAll();
  go('clients');
  if (!listening) {
    listening = true;
    // 새 요청이 들어오면 목록·알림 갱신
    api.onNewPending(async p => {
      if (!data) return;
      await reload();
      const c = data.clients.find(x => x.id === p.client_id);
      if (c && !c.archived && !mutedSet().has(c.id)) toast(`[${c.name}] 새 요청이 들어왔어요`);
    });
  }
}

api.isLoggedIn().then(ok => ok ? boot() : showLock());
