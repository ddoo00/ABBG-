/* ════════════════════════════════════════
   ABBG 멀티 클라이언트 — 관리 화면 데이터 레이어 (Supabase)
   관리 화면(admin.js)은 아래 api 함수만 불러요.
   ════════════════════════════════════════ */

const DEMO = false;
const SUPABASE_URL = 'https://detrhxgthalaljrhbnmm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3NY7XQjAKjNg3QiMjw2N_g_HKKDFFRV';
const ABBG_EMAIL = 'abbg-team@abbg.local';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const SEEN_KEY = 'abbg-admin-seen-pending'; // 이 기기에서 확인한 요청 id

// ── 날짜 (항상 한국시간 기준) ──
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
const THIS_MONTH = TODAY.slice(0, 7);
function daysAgo(n) {
  const d = new Date(TODAY + 'T00:00:00');
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function daysLater(n) { return daysAgo(-n); }
function fmtDate(s) {
  if (!s) return '-';
  const [, m, d] = s.slice(0, 10).split('-');
  return `${Number(m)}월 ${Number(d)}일`;
}
function relDate(s) {
  if (!s) return '요청 없음';
  const diff = Math.round((new Date(TODAY) - new Date(s.slice(0, 10))) / 86400000);
  if (diff <= 0) return '오늘';
  if (diff === 1) return '어제';
  if (diff < 7) return `${diff}일 전`;
  return fmtDate(s);
}

// ── 추측할 수 없는 링크 코드 (소문자+숫자 12자리) ──
function newLinkCode() {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  return Array.from(buf, n => chars[n % chars.length]).join('');
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ── ABBG 기본 작업유형 (새 클라이언트에 복사됨) ──
// min/max = 소요 영업일. 하나로 된 일수는 min=max, 당일~1일은 0~1, 별도 문의는 inquiry:true
// cap: 'simple'(간단 — 하루 급건 3건까지) / 'complex'(복잡 — 1건부터 조율 필요)
// illust: true면 요청 폼에 '일러스트 작업 포함' 체크박스 (+1일)
const DEFAULT_WORK_TYPES = [
  { key: 'ci-logo', cat: 'CI·BI', name: '로고', qty: '2종', min: 4, max: 5, cap: 'complex' },
  { key: 'ci-draft', cat: 'CI·BI', name: '시안 추가', qty: '1종', min: 1, max: 2, cap: 'complex' },
  { key: 'ci-system', cat: 'CI·BI', name: '시스템 구축', qty: '베이직 1종 / 어플리케이션 10종', min: 4, max: 5, cap: 'complex' },
  { key: 'pkg-label', cat: '패키지', name: '라벨', qty: '2종', min: 2, max: 3, cap: 'complex', illust: true, note: '일러스트 작업 시 +1일' },
  { key: 'pkg-pouch', cat: '패키지', name: '파우치', qty: '2종', min: 2, max: 3, cap: 'complex', illust: true, note: '일러스트 작업 시 +1일' },
  { key: 'pkg-box', cat: '패키지', name: '단상자', qty: '2종', min: 3, max: 4, cap: 'complex', illust: true, note: '일러스트 작업 시 +1일' },
  { key: 'pkg-bottle', cat: '패키지', name: '용기', qty: '2종', min: 3, max: 4, cap: 'complex', illust: true, note: '일러스트 작업 시 +1일' },
  { key: 'detail', cat: '콘텐츠', name: '상세페이지', qty: '~30,000px', min: 3, max: 4, cap: 'complex' },
  { key: 'ct-keyvisual', cat: '콘텐츠', name: '상세페이지 키비주얼', qty: '2종', min: 1, max: 2, cap: 'complex', note: '인트로 부분 키비주얼 확정용으로 작업' },
  { key: 'banner', cat: '콘텐츠', name: '배너/광고소재/SNS/썸네일', qty: '2P', min: 1, max: 2, cap: 'simple', note: '분량에 따라 상이할 수 있음' },
  { key: 'ct-size', cat: '콘텐츠', name: '사이즈 베리에이션', qty: '5종', min: 1, max: 2, cap: 'simple' },
  { key: 'pr-leaflet', cat: '편집·인쇄', name: '리플렛/브로셔', qty: '6P 양면 ~ 표지+12P', min: 3, max: 4, cap: 'complex' },
  { key: 'pr-catalog', cat: '편집·인쇄', name: '카탈로그/디지털 시각자료', qty: '표지+~12P', min: 4, max: 5, cap: 'complex' },
  { key: 'pr-poster', cat: '편집·인쇄', name: '포스터/X배너', qty: '1종', min: 1, max: 2, cap: 'complex' },
  { key: 'pr-card', cat: '편집·인쇄', name: '명함', qty: '2종', min: 1, max: 2, cap: 'complex' },
  { key: 'pr-banner', cat: '편집·인쇄', name: '현수막/간판/POP/전단지', qty: '1종', min: 2, max: 3, cap: 'complex' },
  { key: 'pr-signage', cat: '편집·인쇄', name: '사이니지 (외부/내부 픽토그램)', qty: '외부 1종 / 내부 5종', min: 2, max: 3, cap: 'complex' },
  { key: 'web-main', cat: '웹·앱', name: '메인페이지 디자인', qty: '', min: 5, max: 5, cap: 'complex' },
  { key: 'web-sub', cat: '웹·앱', name: '서브페이지 디자인', qty: '', min: 5, max: 5, cap: 'complex' },
  { key: 'web-etc', cat: '웹·앱', name: '기타 디자인 (파비콘·메타이미지 등)', qty: '', min: 3, max: 3, cap: 'complex' },
  { key: 'web-guide', cat: '웹·앱', name: '스타일 가이드', qty: '', min: 3, max: 3, cap: 'complex' },
  { key: 'web-feedback', cat: '웹·앱', name: '피드백 반영', qty: '1회', min: 5, max: 5, cap: 'complex' },
  { key: 'web-build', cat: '웹·앱', name: '홈페이지 구축 (코딩 없이, PC·MO)', qty: '', min: 20, max: 20, cap: 'complex' },
  { key: 'edit', cat: '수정/보완', name: '수정/보완', qty: '', min: 0, max: 1, cap: 'simple', note: '간단한 수정 기준, 분량에 따라 상이할 수 있음' },
  { key: 'brand', cat: '브랜딩', name: '별도 문의', qty: '', min: null, max: null, cap: 'complex', inquiry: true },
  { key: 'etc', cat: '기타', name: '별도 문의', qty: '', min: null, max: null, cap: 'complex', inquiry: true }
];

// 그레인온 = ABBG 기본 유형 + [수출] 패키지 (패키지 대분류의 '용기' 바로 뒤)
const EXPORT_PACKAGE_TYPE = { key: 'exportpkg', cat: '패키지', name: '[수출] 패키지', qty: '2종', min: 2, max: 4, cap: 'complex', illust: true, note: '국가별 표기 규정 확인 후 착수해요. 일러스트 작업 시 +1일' };
function grainonWorkTypes() {
  const list = DEFAULT_WORK_TYPES.map(t => ({ ...t }));
  const at = list.findIndex(t => t.cat === '패키지' && t.name === '용기');
  list.splice(at + 1, 0, { ...EXPORT_PACKAGE_TYPE });
  return list;
}

function fmtDays(t) {
  if (t.inquiry || t.min == null) return '확인 후 안내';
  const lo = t.min === 0 ? '당일' : `${t.min}일`;
  if (t.min === t.max) return lo;
  return `${t.min === 0 ? '당일' : t.min}~${t.max}일`;
}

// ── 이 기기에서 확인한 요청 ──
function seenSet(){ try { const v = localStorage.getItem(SEEN_KEY); return v ? new Set(JSON.parse(v)) : null; } catch(e){ return new Set(); } }
function saveSeen(set){ try { localStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-2000))); } catch(e){} }

const fail = (error, fallback) => ({ error: error ? (error.message || fallback) : fallback });
function must(res, what){ if(res.error) throw new Error(`${what} 실패: ${res.error.message}`); return res.data; }
const typeRow = (clientId, w, i) => ({
  client_id: clientId, key: w.key || ('u-' + uid()), cat: w.cat || '', name: w.name, qty: w.qty || '',
  min_days: w.inquiry ? null : w.min, max_days: w.inquiry ? null : w.max, cap: w.cap === 'simple' ? 'simple' : 'complex',
  note: w.note || '', illust: !!w.illust, inquiry: !!w.inquiry, sort: i
});

/* ════════════════════════════════════════
   api — 관리 화면은 이 함수들만 불러요.
   ════════════════════════════════════════ */
const api = {
  // 인증 — ABBG 팀 계정만
  async isLoggedIn(){
    const { data } = await sb.auth.getSession();
    const u = data?.session?.user;
    return !!u && !u.is_anonymous && u.email === ABBG_EMAIL;
  },
  async login(pw){ const { error } = await sb.auth.signInWithPassword({ email: ABBG_EMAIL, password: pw }); return !error; },
  async logout(){ await sb.auth.signOut(); },
  async changePassword(cur, next){
    const re = await sb.auth.signInWithPassword({ email: ABBG_EMAIL, password: cur });
    if(re.error) return { error: '현재 비밀번호가 틀렸어요.' };
    const { error } = await sb.auth.updateUser({ password: next });
    return error ? fail(error) : { ok: true };
  },

  // 전체 불러오기
  async loadAll(){
    const [c, t, s, w, tk, pe, o] = await Promise.all([
      sb.from('clients').select('*').order('created_at'),
      sb.from('team').select('id,name').order('id'),
      sb.from('subscriptions').select('*').order('no'),
      sb.from('work_types').select('*').order('sort'),
      sb.from('tasks').select('id,client_id,sub_id,name,start_date,due,done,done_at,done_team_id,priority,created_at').is('deleted_at', null),
      sb.from('pending').select('id,client_id,name,due,priority,created_at').is('deleted_at', null),
      sb.from('off_days').select('date').order('date')
    ]);
    const pending = must(pe, '요청 불러오기');
    let seen = seenSet();
    if(!seen){ seen = new Set(pending.map(p => p.id)); saveSeen(seen); } // 이 기기 첫 방문: 기존 요청은 확인한 걸로
    return {
      clients: must(c, '클라이언트 불러오기'),
      team: must(t, '팀원 불러오기'),
      subscriptions: must(s, '구독 불러오기'),
      work_types: must(w, '작업유형 불러오기').map(r => ({ ...r, min: r.min_days, max: r.max_days })),
      tasks: must(tk, '업무 불러오기'),
      pending: pending.map(p => ({ ...p, seen: seen.has(p.id) })),
      off_days: must(o, '휴무일 불러오기')
    };
  },

  // 클라이언트
  async createClient(name, subCount){
    const { data: c, error } = await sb.from('clients').insert({ name, code: newLinkCode() }).select().single();
    if(error) throw new Error('클라이언트 만들기 실패: ' + error.message);
    const subs = Array.from({ length: subCount }, (_, i) => ({ client_id: c.id, no: i + 1 }));
    must(await sb.from('subscriptions').insert(subs), '구독 만들기');
    must(await sb.from('work_types').insert(DEFAULT_WORK_TYPES.map((w, i) => typeRow(c.id, w, i))), '작업유형 복사');
    return c;
  },
  async renameClient(id, name){ must(await sb.from('clients').update({ name }).eq('id', id), '이름 변경'); },
  async reissueLink(id){
    const { data: c } = await sb.from('clients').select('code').eq('id', id).single();
    const code = newLinkCode();
    must(await sb.from('clients').update({ prev_code: c?.code || null, code }).eq('id', id), '링크 재발급');
    must(await sb.from('client_sessions').delete().eq('client_id', id), '기존 접속 끊기');
    return code;
  },
  async archiveClient(id){ must(await sb.from('clients').update({ archived: true, archived_at: new Date().toISOString() }).eq('id', id), '보관'); },
  async restoreClient(id, newLink){
    const patch = { archived: false, archived_at: null };
    if(newLink){
      const { data: c } = await sb.from('clients').select('code').eq('id', id).single();
      patch.prev_code = c?.code || null; patch.code = newLinkCode();
    }
    must(await sb.from('clients').update(patch).eq('id', id), '복원');
    if(newLink) must(await sb.from('client_sessions').delete().eq('client_id', id), '기존 접속 끊기');
  },
  async deleteClient(id){ must(await sb.from('clients').delete().eq('id', id), '삭제'); },

  // 구독
  async addSubscription(clientId){
    const { data } = await sb.from('subscriptions').select('no').eq('client_id', clientId).order('no', { ascending: false }).limit(1);
    must(await sb.from('subscriptions').insert({ client_id: clientId, no: ((data && data[0]?.no) || 0) + 1 }), '구독 추가');
  },
  async removeSubscription(subId){
    const { count } = await sb.from('tasks').select('id', { count: 'exact', head: true }).eq('sub_id', subId).eq('done', false).is('deleted_at', null);
    if(count) return { error: `진행 중인 업무 ${count}건이 남아 있어요. 다른 구독으로 옮긴 뒤 정리해 주세요.` };
    const { error } = await sb.from('subscriptions').delete().eq('id', subId);
    return error ? fail(error) : { ok: true };
  },
  async assignSubscription(subId, teamId){
    const { error } = await sb.from('subscriptions').update({ team_id: teamId ? Number(teamId) : null }).eq('id', subId);
    if(error) return { error: error.code === '23505' ? '이 팀원은 이미 같은 클라이언트의 다른 구독을 맡고 있어요.' : error.message };
    return { ok: true };
  },

  // 팀원
  async addTeam(name){ return must(await sb.from('team').insert({ name }).select().single(), '팀원 추가'); },
  async renameTeam(id, name){ must(await sb.from('team').update({ name }).eq('id', id), '이름 수정'); },
  async deleteTeam(id){ must(await sb.from('team').delete().eq('id', id), '팀원 삭제'); },

  // 작업유형 — 통째로 교체
  async saveWorkTypes(clientId, list){
    must(await sb.from('work_types').delete().eq('client_id', clientId), '작업유형 정리');
    if(list.length) must(await sb.from('work_types').insert(list.map((w, i) => typeRow(clientId, w, i))), '작업유형 저장');
  },

  // 휴무일
  async addOffDay(date){
    const { data } = await sb.from('off_days').select('date').eq('date', date);
    if(!data?.length) must(await sb.from('off_days').insert({ date }), '휴무일 추가');
  },
  async removeOffDay(date){ must(await sb.from('off_days').delete().eq('date', date), '휴무일 삭제'); },

  // 이 기기에서 요청 확인 처리
  async markSeen(clientId, pending){
    const seen = seenSet() || new Set();
    pending.filter(p => !clientId || p.client_id === clientId).forEach(p => seen.add(p.id));
    saveSeen(seen);
  },

  // 새 요청이 들어오면 알려줌
  onNewPending(cb){
    sb.channel('admin-pending').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pending' }, p => cb(p.new)).subscribe();
  }
};

// ── 집계 (관리 화면·클라이언트 페이지 공용) ──
function clientStats(data, clientId) {
  const tasks = data.tasks.filter(t => t.client_id === clientId);
  const pending = data.pending.filter(p => p.client_id === clientId);
  const open = tasks.filter(t => !t.done);
  const late = open.filter(t => t.due < TODAY);
  const doneThisMonth = tasks.filter(t => t.done && (t.done_at || t.due || '').startsWith(THIS_MONTH));
  const since = daysAgo(90);
  const recent = [...tasks, ...pending].filter(x => (x.created_at || '') >= since);
  const urgentRate = recent.length ? Math.round(recent.filter(x => x.priority === 'urgent').length / recent.length * 100) : null;
  const lastReq = [...tasks, ...pending].map(x => x.created_at).filter(Boolean).sort().pop() || null;
  const subs = data.subscriptions.filter(s => s.client_id === clientId).sort((a, b) => a.no - b.no);
  return {
    pending: pending.length,
    unseen: pending.filter(p => !p.seen).length,
    open: open.length,
    late: late.length,
    doneThisMonth: doneThisMonth.length,
    urgentRate,
    lastReq,
    subs,
    unassigned: subs.filter(s => !s.team_id).length
  };
}

function teamStats(data) {
  const active = new Set(data.clients.filter(c => !c.archived).map(c => c.id));
  return data.team.map(m => {
    const mySubs = data.subscriptions.filter(s => s.team_id === m.id && active.has(s.client_id));
    const subIds = new Set(mySubs.map(s => s.id));
    const open = data.tasks.filter(t => !t.done && subIds.has(t.sub_id));
    const byClient = {};
    open.forEach(t => { byClient[t.client_id] = (byClient[t.client_id] || 0) + 1; });
    return {
      member: m,
      clients: mySubs.map(s => ({ client: data.clients.find(c => c.id === s.client_id), no: s.no })),
      open: open.length,
      byClient,
      late: open.filter(t => t.due < TODAY).length,
      doneThisMonth: data.tasks.filter(t => t.done && (t.done_team_id === m.id || (!t.done_team_id && subIds.has(t.sub_id))) && (t.done_at || t.due || '').startsWith(THIS_MONTH)).length
    };
  });
}

// CSV 다운로드 (삭제 전 백업용)
function exportClientCSV(data, clientId) {
  const c = data.clients.find(x => x.id === clientId);
  const subNo = id => (data.subscriptions.find(s => s.id === id) || {}).no;
  const rows = [['구분', '제목', '구독', '시작일', '납기', '우선순위', '상태', '완료일']];
  data.tasks.filter(t => t.client_id === clientId).forEach(t => rows.push(['업무', t.name, subNo(t.sub_id) ? `구독 ${subNo(t.sub_id)}` : '', t.start_date || '', t.due || '', t.priority === 'urgent' ? '급건' : '일반', t.done ? '완료' : '진행 중', t.done_at || '']));
  data.pending.filter(p => p.client_id === clientId).forEach(p => rows.push(['요청', p.name, '', '', p.due || '', p.priority === 'urgent' ? '급건' : '일반', '검토 대기', '']));
  const csv = '\uFEFF' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `${c.name}_요청내역_${TODAY}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
