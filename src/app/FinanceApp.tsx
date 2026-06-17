'use client'

import { useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js'
import { Doughnut, Bar } from 'react-chartjs-2'
import { encryptData, decryptData, type EncryptedPayload } from './crypto'
import { SetupLock, Unlock } from './LockScreen'

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

// ── 스토리지 키 ────────────────────────────────────────────────
const SK = 'finance_v5_enc'
const AUTO_LOCK_MS = 30 * 60 * 1000

// ── 결제수단 타입 ──────────────────────────────────────────────
interface PaymentMethod {
  useTransfer: boolean   // 계좌이체 사용 여부
  bankName: string       // 은행명
  accountAlias: string   // 계좌명/별칭
  useCard: boolean       // 카드 사용 여부
  cardName: string       // 카드사명
  payDay: string         // 결제일
}
const EMPTY_PAYMENT: PaymentMethod = { useTransfer: false, bankName: '', accountAlias: '', useCard: false, cardName: '', payDay: '' }

// ── 타입 ──────────────────────────────────────────────────────
type Tags = string[]

interface Asset {
  id: number; name: string; itype: string; value: number
  updatedAt: string; note: string; tags: Tags
  rate: number | null; maturity: string; interestType: string
}
interface Transaction {
  id: number; assetId: number; side: 'buy' | 'sell'
  date: string; qty: number; price: number; fee: number; memo: string; total: number
}
interface Insurance {
  id: number; name: string; company: string; itype: string
  amount: number; expire: string; tags: Tags; payment: PaymentMethod
}
interface Subscription {
  id: number; name: string; stype: string; amount: number; next: string; tags: Tags; payment: PaymentMethod
}
interface Education {
  id: number; name: string; etype: string; amount: number; period: string; tags: Tags; payment: PaymentMethod
}
interface Loan {
  id: number; name: string; bank: string; balance: number
  rate: number; monthly: number; expire: string; tags: Tags
}
interface Expense {
  id: number; name: string; etype: string; amount: number; day: string; tags: Tags
}
interface EventItem {
  id: number; date: string; kind: string; rel: string
  name: string; amount: number; memo: string
}
interface AppData {
  assets: Asset[]; transactions: Transaction[]
  insurance: Insurance[]; subscription: Subscription[]
  education: Education[]; loan: Loan[]
  expenses: Expense[]; events: EventItem[]
}

const EMPTY: AppData = {
  assets: [], transactions: [], insurance: [],
  subscription: [], education: [], loan: [], expenses: [], events: [],
}

const RATE_TYPES = ['예금/적금', '채권']
const INSURANCE_TYPES = ['생명보험','실손보험','자동차보험','암보험','연금보험','기타']
const SUBSCRIPTION_TYPES = ['OTT/영상','음악','소프트웨어','클라우드','뉴스/정보','멤버십','기타']
const EDUCATION_TYPES = ['어학','자격증','대학원','자녀교육','온라인강의','기타']
const EXPENSE_TYPES = ['관리비/공과금','월세/임대료','차량 유지비','의료비','생활비 예산','경조사비 예산','곗돈','기타 정기지출']
const EVENT_KINDS = ['결혼 축의금','장례 조의금','돌잔치','생일 선물','출산 선물','기타']
const RELATIONS = ['가족','친척','친구','직장 동료','지인','기타']
const ASSET_TYPES = ['국내주식','해외주식','ETF','펀드','예금/적금','채권','암호화폐','기타']
const INTEREST_TYPES = ['만기일시','월이자','분기','연이자']

const BDG: Record<string, string> = {
  '생명보험': 'b-blue', '실손보험': 'b-green', '자동차보험': 'b-amber',
  '암보험': 'b-red', '연금보험': 'b-purple', '기타': 'b-teal',
  'OTT/영상': 'b-blue', '음악': 'b-purple', '소프트웨어': 'b-amber',
  '클라우드': 'b-blue', '뉴스/정보': 'b-teal', '멤버십': 'b-pink',
  '어학': 'b-green', '자격증': 'b-blue', '대학원': 'b-purple',
  '자녀교육': 'b-amber', '온라인강의': 'b-teal',
  '국내주식': 'b-blue', '해외주식': 'b-purple', 'ETF': 'b-green',
  '펀드': 'b-amber', '예금/적금': 'b-teal', '채권': 'b-green', '암호화폐': 'b-red',
  '관리비/공과금': 'b-blue', '월세/임대료': 'b-amber', '차량 유지비': 'b-teal',
  '의료비': 'b-red', '생활비 예산': 'b-green', '경조사비 예산': 'b-pink', '곗돈': 'b-purple', '기타 정기지출': 'b-purple',
  '결혼 축의금': 'b-pink', '장례 조의금': 'b-purple', '돌잔치': 'b-blue',
  '생일 선물': 'b-amber', '출산 선물': 'b-green',
  '매수': 'b-buy', '매도': 'b-sell',
}

// ── 유틸 ──────────────────────────────────────────────────────
const fmt  = (n: number) => Math.round(n).toLocaleString('ko-KR')
const fmtW = (n: number) => fmt(n) + '원'
const todayStr = () => new Date().toISOString().slice(0, 10)
const daysSince = (d: string) =>
  d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 999
const parseTags = (s: string): Tags =>
  s ? s.split(',').map(t => t.trim()).filter(Boolean) : []
const tagsToStr = (t: Tags) => t.join(', ')

function paymentSummary(p: PaymentMethod): string {
  const parts: string[] = []
  if (p.useTransfer) parts.push(`계좌이체 · ${p.bankName || '은행미입력'}${p.accountAlias ? ' ' + p.accountAlias : ''}`)
  if (p.useCard) parts.push(`카드 · ${p.cardName || '카드사미입력'}`)
  if (p.payDay) parts.push(`결제일 ${p.payDay}`)
  return parts.join(' · ')
}

function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(r =>
    r.map(v => {
      const s = String(v ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s
    }).join(',')
  ).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}

// ── 공통 컴포넌트 ─────────────────────────────────────────────
function Badge({ t }: { t: string }) {
  return <span className={`badge ${BDG[t] ?? 'b-blue'}`}>{t}</span>
}
function TagList({ tags }: { tags?: Tags }) {
  if (!tags?.length) return null
  return <>{tags.map(t => <span key={t} className="tag">{t}</span>)}</>
}
function FormBox({ open, children }: { open: boolean; children: ReactNode }) {
  if (!open) return null
  return <div className="form-box">{children}</div>
}

// ── 결제수단 입력 서브폼 ───────────────────────────────────────
function PaymentFields({ value, onChange }: { value: PaymentMethod; onChange: (p: PaymentMethod) => void }) {
  return (
    <div className="payment-fields">
      <div className="payment-method-row">
        <label className="checkbox-label">
          <input type="checkbox" checked={value.useTransfer} onChange={e => onChange({ ...value, useTransfer: e.target.checked })} />
          계좌이체
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={value.useCard} onChange={e => onChange({ ...value, useCard: e.target.checked })} />
          카드
        </label>
      </div>
      {value.useTransfer && (
        <div className="form-grid g2">
          <div className="form-field"><label>은행명</label><input value={value.bankName} onChange={e => onChange({ ...value, bankName: e.target.value })} placeholder="예: 국민은행" /></div>
          <div className="form-field"><label>계좌명/별칭</label><input value={value.accountAlias} onChange={e => onChange({ ...value, accountAlias: e.target.value })} placeholder="예: 생활비통장" /></div>
        </div>
      )}
      {value.useCard && (
        <div className="form-grid g1">
          <div className="form-field"><label>카드사명</label><input value={value.cardName} onChange={e => onChange({ ...value, cardName: e.target.value })} placeholder="예: 신한카드" /></div>
        </div>
      )}
      <div className="form-grid g1">
        <div className="form-field"><label>결제일</label><input value={value.payDay} onChange={e => onChange({ ...value, payDay: e.target.value })} placeholder="예: 매월 15일" /></div>
      </div>
    </div>
  )
}

// ── 루트: 잠금 상태 관리 ───────────────────────────────────────
type LockState = 'loading' | 'needs-setup' | 'locked' | 'unlocked'

export default function FinanceApp() {
  const [lockState, setLockState] = useState<LockState>('loading')
  const [password, setPassword] = useState<string | null>(null)
  const [data, setData] = useState<AppData>(EMPTY)
  const lastActivityRef = useRef<number>(Date.now())

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SK)
      setLockState(raw ? 'locked' : 'needs-setup')
    } catch {
      setLockState('needs-setup')
    }
  }, [])

  const save = useCallback(async (d: AppData) => {
    setData(d)
    if (!password) return
    try {
      const payload = await encryptData(JSON.stringify(d), password)
      localStorage.setItem(SK, JSON.stringify(payload))
    } catch { /* ignore */ }
  }, [password])

  const handleSetup = async (pw: string) => {
    setPassword(pw)
    const payload = await encryptData(JSON.stringify(EMPTY), pw)
    localStorage.setItem(SK, JSON.stringify(payload))
    setData(EMPTY)
    setLockState('unlocked')
    lastActivityRef.current = Date.now()
  }

  const handleUnlock = async (pw: string): Promise<boolean> => {
    try {
      const raw = localStorage.getItem(SK)
      if (!raw) return false
      const payload: EncryptedPayload = JSON.parse(raw)
      const plain = await decryptData(payload, pw)
      const parsed = { ...EMPTY, ...JSON.parse(plain) }
      setData(parsed)
      setPassword(pw)
      setLockState('unlocked')
      lastActivityRef.current = Date.now()
      return true
    } catch {
      return false
    }
  }

  const handleForgot = () => {
    localStorage.removeItem(SK)
    setData(EMPTY)
    setPassword(null)
    setLockState('needs-setup')
  }

  const lockNow = () => {
    setPassword(null)
    setData(EMPTY)
    setLockState('locked')
  }

  useEffect(() => {
    if (lockState !== 'unlocked') return
    const markActivity = () => { lastActivityRef.current = Date.now() }
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach(ev => window.addEventListener(ev, markActivity))
    const interval = setInterval(() => {
      if (Date.now() - lastActivityRef.current > AUTO_LOCK_MS) lockNow()
    }, 10000)
    return () => {
      events.forEach(ev => window.removeEventListener(ev, markActivity))
      clearInterval(interval)
    }
  }, [lockState])

  if (lockState === 'loading') return <div className="lock-wrap" />
  if (lockState === 'needs-setup') return <SetupLock onSet={handleSetup} />
  if (lockState === 'locked') return <Unlock onUnlock={handleUnlock} onForgot={handleForgot} />

  return <MainApp data={data} save={save} onLock={lockNow} />
}

// ── 메인 앱 ───────────────────────────────────────────────────
function MainApp({ data, save, onLock }: { data: AppData; save: (d: AppData) => void; onLock: () => void }) {
  const [tab, setTab] = useState('overview')
  const [searchOpen, setSearchOpen] = useState(false)

  const TABS = [
    { id: 'overview',     label: '요약' },
    { id: 'investment',   label: '투자' },
    { id: 'insurance',    label: '보험' },
    { id: 'subscription', label: '구독' },
    { id: 'education',    label: '교육' },
    { id: 'loan',         label: '대출' },
    { id: 'expenses',     label: '생활비' },
  ]

  return (
    <div className="app-wrap">
      <div className="app-header">
        <h1 className="app-title">우리집 재정 관리</h1>
        <button className="lock-toggle-btn" onClick={onLock}>🔒 잠금</button>
      </div>
      <div className="tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab${tab === t.id && !searchOpen ? ' active' : ''}`}
            onClick={() => { setTab(t.id); setSearchOpen(false) }}
          >
            {t.label}
          </button>
        ))}
        <button
          className={`tab tab-search${searchOpen ? ' active' : ''}`}
          onClick={() => setSearchOpen(true)}
          aria-label="검색"
        >
          🔍
        </button>
      </div>

      {searchOpen ? (
        <SearchTab data={data} />
      ) : (
        <>
          {tab === 'overview'     && <OverviewTab     data={data} />}
          {tab === 'investment'   && <InvestmentTab   data={data} save={save} />}
          {tab === 'insurance'    && <InsuranceTab    data={data} save={save} />}
          {tab === 'subscription' && <SubscriptionTab data={data} save={save} />}
          {tab === 'education'    && <EducationTab    data={data} save={save} />}
          {tab === 'loan'         && <LoanTab         data={data} save={save} />}
          {tab === 'expenses'     && <ExpensesTab     data={data} save={save} />}
        </>
      )}
    </div>
  )
}

// ── 요약 탭 ───────────────────────────────────────────────────
function OverviewTab({ data }: { data: AppData }) {
  const insM  = data.insurance.reduce((s, i) => s + i.amount, 0)
  const subM  = data.subscription.reduce((s, i) => s + i.amount, 0)
  const eduM  = data.education.reduce((s, i) => s + i.amount, 0)
  const loanM = data.loan.reduce((s, i) => s + i.monthly, 0)
  const expM  = data.expenses.reduce((s, i) => s + i.amount, 0)
  const totalM    = insM + subM + eduM + loanM + expM
  const totalDebt = data.loan.reduce((s, i) => s + i.balance, 0)
  const totalInv  = data.assets.reduce((s, a) => s + a.value, 0)
  const buySum    = data.transactions.filter(t => t.side === 'buy').reduce((s, t) => s + t.total, 0)
  const sellSum   = data.transactions.filter(t => t.side === 'sell').reduce((s, t) => s + t.total, 0)
  const pnl = totalInv - (buySum - sellSum)

  const now = new Date()
  const mLabels: string[] = []
  const trendVals: number[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    mLabels.push(`${d.getMonth() + 1}월`)
    const evAmt = data.events.filter(e => e.date?.startsWith(key)).reduce((s, e) => s + e.amount, 0)
    trendVals.push(totalM + evAmt)
  }

  const invByType: Record<string, number> = {}
  data.assets.forEach(a => { invByType[a.itype] = (invByType[a.itype] ?? 0) + a.value })
  const invColors = ['#185fa5','#3c3489','#0f6e56','#ba7517','#1d9e75','#888780','#a32d2d']

  return (
    <>
      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">월 고정 지출</div>
          <div className="metric-value">{Math.round(totalM / 10000)}만원</div>
          <div className="metric-sub">5개 항목 합계</div>
        </div>
        <div className="metric">
          <div className="metric-label">총 대출 잔액</div>
          <div className="metric-value">{Math.round(totalDebt / 10000)}만원</div>
          <div className="metric-sub">{data.loan.length}건</div>
        </div>
        <div className="metric">
          <div className="metric-label">투자 평가액</div>
          <div className="metric-value">{Math.round(totalInv / 10000)}만원</div>
          <div className="metric-sub" style={{ color: pnl >= 0 ? '#178a6a' : '#c0392b' }}>
            {pnl >= 0 ? '+' : ''}{Math.round(pnl / 10000)}만원
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">구독 서비스</div>
          <div className="metric-value">{data.subscription.length}개</div>
          <div className="metric-sub">{Math.round(subM / 10000 * 10) / 10}만원/월</div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="card">
          <div className="card-header"><span className="card-title">월 지출 추이 (최근 6개월)</span></div>
          <div className="chart-wrap">
            <Bar
              data={{ labels: mLabels, datasets: [{ label: '월 지출', data: trendVals, backgroundColor: '#378add', borderRadius: 3, borderWidth: 0 }] }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + fmtW(c.raw as number) } } }, scales: { x: { ticks: { font: { size: 11 } } }, y: { ticks: { font: { size: 11 }, callback: v => Math.round(+v / 10000) + '만' } } } }}
            />
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">투자 자산 배분</span></div>
          <div className="chart-wrap">
            {Object.keys(invByType).length > 0 ? (
              <Doughnut
                data={{ labels: Object.keys(invByType), datasets: [{ data: Object.values(invByType), backgroundColor: invColors.slice(0, Object.keys(invByType).length), borderWidth: 0 }] }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 9, padding: 6 } }, tooltip: { callbacks: { label: c => ' ' + fmtW(c.raw as number) } } } }}
              />
            ) : <div className="empty">투자 종목을 추가하세요</div>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">월 지출 구성</span></div>
        <div className="chart-wrap" style={{ height: 170 }}>
          <Doughnut
            data={{ labels: ['보험','구독','교육','대출','생활비'], datasets: [{ data: [insM,subM,eduM,loanM,expM], backgroundColor: ['#185fa5','#3c3489','#0f6e56','#a32d2d','#ba7517'], borderWidth: 0 }] }}
            options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 9, padding: 6 } }, tooltip: { callbacks: { label: c => ' ' + fmtW(c.raw as number) } } } }}
          />
        </div>
      </div>
    </>
  )
}

// ── 투자 탭 ───────────────────────────────────────────────────
const EMPTY_ASSET_FORM = { name: '', itype: '국내주식', value: '', note: '', tags: '', rate: '', maturity: '', interestType: '만기일시' }
type AssetFormState = typeof EMPTY_ASSET_FORM

function AssetForm({ form, setForm, onSave, onCancel, saveLabel }: {
  form: AssetFormState; setForm: (f: AssetFormState) => void
  onSave: () => void; onCancel: () => void; saveLabel: string
}) {
  const isRate = RATE_TYPES.includes(form.itype)
  return (
    <>
      <div className="form-grid g2">
        <div className="form-field"><label>종목/펀드명</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="예: QQQ" /></div>
        <div className="form-field"><label>종류</label>
          <select value={form.itype} onChange={e => setForm({ ...form, itype: e.target.value })}>
            {ASSET_TYPES.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
      </div>
      {isRate && (
        <div className="form-grid g3">
          <div className="form-field"><label>이율 (%)</label><input type="number" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} placeholder="3.50" /></div>
          <div className="form-field"><label>만기일</label><input value={form.maturity} onChange={e => setForm({ ...form, maturity: e.target.value })} placeholder="2027-06-30" /></div>
          <div className="form-field"><label>이자 방식</label>
            <select value={form.interestType} onChange={e => setForm({ ...form, interestType: e.target.value })}>
              {INTEREST_TYPES.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
        </div>
      )}
      <div className="form-grid g2">
        <div className="form-field"><label>현재 평가액 (원)</label><input type="number" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} placeholder="0" /></div>
        <div className="form-field"><label>태그 (쉼표 구분)</label><input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="예: 미국,성장주" /></div>
      </div>
      <div className="form-grid g1">
        <div className="form-field"><label>메모</label><input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="선택 사항" /></div>
      </div>
      <div className="form-actions">
        <button className="save-btn" onClick={onSave}>{saveLabel}</button>
        <button className="cancel-btn" onClick={onCancel}>취소</button>
      </div>
    </>
  )
}

function InvestmentTab({ data, save }: { data: AppData; save: (d: AppData) => void }) {
  const [showAF, setShowAF] = useState(false)
  const [showTF, setShowTF] = useState(false)
  const [editingAssetId, setEditingAssetId] = useState<number | null>(null)
  const [af, setAf] = useState<AssetFormState>(EMPTY_ASSET_FORM)
  const [editForm, setEditForm] = useState<AssetFormState>(EMPTY_ASSET_FORM)
  const [tf, setTf] = useState({ assetId: '', side: 'buy', date: todayStr(), qty: '', price: '', fee: '', memo: '' })
  const [fAsset, setFAsset] = useState('')
  const [fSide,  setFSide]  = useState('')
  const [fFrom,  setFFrom]  = useState('')
  const [fTo,    setFTo]    = useState('')

  const buildAssetFromForm = (form: AssetFormState, base: Partial<Asset> = {}): Asset => {
    const isRate = RATE_TYPES.includes(form.itype)
    return {
      id: base.id ?? Date.now(),
      name: form.name.trim() || '미입력',
      itype: form.itype,
      value: +form.value || 0,
      updatedAt: base.updatedAt ?? todayStr(),
      note: form.note,
      tags: parseTags(form.tags),
      rate: isRate ? (+form.rate || 0) : null,
      maturity: isRate ? form.maturity : '',
      interestType: isRate ? form.interestType : '',
    }
  }

  const addAsset = () => {
    if (!af.name.trim()) return
    save({ ...data, assets: [...data.assets, buildAssetFromForm(af)] })
    setAf(EMPTY_ASSET_FORM)
    setShowAF(false)
  }

  const startEdit = (a: Asset) => {
    setEditingAssetId(a.id)
    setEditForm({
      name: a.name, itype: a.itype, value: String(a.value), note: a.note,
      tags: tagsToStr(a.tags), rate: a.rate != null ? String(a.rate) : '',
      maturity: a.maturity, interestType: a.interestType || '만기일시',
    })
  }
  const saveEdit = (id: number) => {
    const orig = data.assets.find(a => a.id === id)
    const updated = buildAssetFromForm(editForm, { id, updatedAt: orig?.updatedAt })
    save({ ...data, assets: data.assets.map(a => a.id === id ? updated : a) })
    setEditingAssetId(null)
  }

  const addTx = () => {
    const qty = +tf.qty, price = +tf.price
    if (!tf.assetId || !qty || !price) return
    const tx: Transaction = {
      id: Date.now(), assetId: +tf.assetId,
      side: tf.side as 'buy' | 'sell',
      date: tf.date, qty, price,
      fee: +tf.fee || 0, memo: tf.memo, total: qty * price,
    }
    const txs = [...data.transactions, tx].sort((a, b) => b.date.localeCompare(a.date))
    save({ ...data, transactions: txs })
    setTf({ assetId: '', side: 'buy', date: todayStr(), qty: '', price: '', fee: '', memo: '' })
    setShowTF(false)
  }

  const updateValue = (id: number) => {
    const a = data.assets.find(x => x.id === id)
    if (!a) return
    const v = prompt(`${a.name} 현재 평가액 입력 (원)\n현재: ${fmt(a.value)}원`)
    if (v === null) return
    save({ ...data, assets: data.assets.map(x => x.id === id ? { ...x, value: +v.replace(/,/g, '') || x.value, updatedAt: todayStr() } : x) })
  }

  const delAsset = (id: number) => save({ ...data, assets: data.assets.filter(a => a.id !== id) })
  const delTx    = (id: number) => save({ ...data, transactions: data.transactions.filter(t => t.id !== id) })

  const aMap: Record<string, string> = Object.fromEntries(data.assets.map(a => [String(a.id), a.name]))

  const [editingTxId, setEditingTxId] = useState<number | null>(null)
  const [txEditForm, setTxEditForm] = useState({ assetId: '', side: 'buy', date: '', qty: '', price: '', fee: '', memo: '' })
  const startTxEdit = (t: Transaction) => {
    setEditingTxId(t.id)
    setTxEditForm({ assetId: String(t.assetId), side: t.side, date: t.date, qty: String(t.qty), price: String(t.price), fee: String(t.fee), memo: t.memo })
  }
  const saveTxEdit = (id: number) => {
    const qty = +txEditForm.qty, price = +txEditForm.price
    if (!txEditForm.assetId || !qty || !price) return
    const updated: Transaction = {
      id, assetId: +txEditForm.assetId, side: txEditForm.side as 'buy' | 'sell',
      date: txEditForm.date, qty, price, fee: +txEditForm.fee || 0, memo: txEditForm.memo, total: qty * price,
    }
    const txs = data.transactions.map(t => t.id === id ? updated : t).sort((a, b) => b.date.localeCompare(a.date))
    save({ ...data, transactions: txs })
    setEditingTxId(null)
  }

  const filteredTx = data.transactions.filter(t => {
    if (fAsset && String(t.assetId) !== fAsset) return false
    if (fSide  && t.side !== fSide)  return false
    if (fFrom  && t.date < fFrom)    return false
    if (fTo    && t.date > fTo)      return false
    return true
  })
  const buyTotal  = filteredTx.filter(t => t.side === 'buy').reduce((s, t) => s + t.total, 0)
  const sellTotal = filteredTx.filter(t => t.side === 'sell').reduce((s, t) => s + t.total, 0)

  return (
    <>
      <div className="toolbar">
        <button className="add-btn" onClick={() => setShowAF(v => !v)}>+ 종목 추가</button>
        <button className="add-btn" onClick={() => setShowTF(v => !v)}>+ 거래 추가</button>
        <button className="icon-btn" onClick={() => {
          const rows: (string | number)[][] = [
            ['날짜','구분','종목','수량','단가','총금액','수수료','메모'],
            ...data.transactions.map(t => [t.date, t.side === 'buy' ? '매수' : '매도', aMap[String(t.assetId)] ?? '', t.qty, t.price, t.total, t.fee || 0, t.memo || '']),
          ]
          downloadCSV(`거래기록_${todayStr()}.csv`, rows)
        }}>↓ 거래 CSV</button>
      </div>

      <FormBox open={showAF}>
        <AssetForm form={af} setForm={setAf} onSave={addAsset} onCancel={() => setShowAF(false)} saveLabel="저장" />
      </FormBox>

      <FormBox open={showTF}>
        <div className="form-grid g3">
          <div className="form-field"><label>종목</label>
            <select value={tf.assetId} onChange={e => setTf(p => ({ ...p, assetId: e.target.value }))}>
              <option value="">선택</option>
              {data.assets.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
            </select>
          </div>
          <div className="form-field"><label>구분</label>
            <select value={tf.side} onChange={e => setTf(p => ({ ...p, side: e.target.value }))}>
              <option value="buy">매수</option><option value="sell">매도</option>
            </select>
          </div>
          <div className="form-field"><label>날짜</label><input type="date" value={tf.date} onChange={e => setTf(p => ({ ...p, date: e.target.value }))} /></div>
        </div>
        <div className="form-grid g3">
          <div className="form-field"><label>수량/좌수</label><input type="number" value={tf.qty} onChange={e => setTf(p => ({ ...p, qty: e.target.value }))} placeholder="0" /></div>
          <div className="form-field"><label>단가 (원)</label><input type="number" value={tf.price} onChange={e => setTf(p => ({ ...p, price: e.target.value }))} placeholder="0" /></div>
          <div className="form-field"><label>수수료 (원)</label><input type="number" value={tf.fee} onChange={e => setTf(p => ({ ...p, fee: e.target.value }))} placeholder="0" /></div>
        </div>
        <div className="form-grid g1">
          <div className="form-field"><label>메모</label><input value={tf.memo} onChange={e => setTf(p => ({ ...p, memo: e.target.value }))} placeholder="예: 분할매수 1차" /></div>
        </div>
        <div className="form-actions">
          <button className="save-btn" onClick={addTx}>저장</button>
          <button className="cancel-btn" onClick={() => setShowTF(false)}>취소</button>
        </div>
      </FormBox>

      {data.assets.length === 0 && <div className="empty">등록된 종목이 없습니다</div>}
      {data.assets.map(a => {
        if (editingAssetId === a.id) {
          return (
            <div key={a.id} className="asset-card edit-mode">
              <AssetForm form={editForm} setForm={setEditForm} onSave={() => saveEdit(a.id)} onCancel={() => setEditingAssetId(null)} saveLabel="수정 완료" />
            </div>
          )
        }
        const txs  = data.transactions.filter(t => t.assetId === a.id)
        const cost = txs.filter(t => t.side === 'buy').reduce((s, t) => s + t.total, 0)
                   - txs.filter(t => t.side === 'sell').reduce((s, t) => s + t.total, 0)
        const pnl  = a.value - cost
        const pct  = cost ? ((pnl / cost) * 100).toFixed(1) : '—'
        const sign = pnl >= 0 ? '+' : ''
        const ds   = daysSince(a.updatedAt)
        return (
          <div key={a.id} className="asset-card">
            <div className="asset-header">
              <div>
                <div className="asset-name">{a.name} <Badge t={a.itype} /></div>
                <div style={{ marginTop: 4 }}>
                  <TagList tags={a.tags} />
                  {a.note && <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{a.note}</span>}
                </div>
              </div>
              <div className="asset-header-right">
                <span className={`upd-badge${ds > 30 ? ' stale' : ''}`}>
                  {a.updatedAt ? `${ds}일 전` : '업데이트 필요'}
                </span>
                <button className="update-btn" onClick={() => updateValue(a.id)}>✎ 갱신</button>
                <button className="edit-btn" onClick={() => startEdit(a)} aria-label="수정">✏️</button>
                <button className="del-btn" onClick={() => delAsset(a.id)}>✕</button>
              </div>
            </div>
            <div className="asset-body">
              <div className="asset-stat">평가액<span>{fmtW(a.value)}</span></div>
              <div className="asset-stat">투자원금<span>{fmtW(cost)}</span></div>
              <div className="asset-stat">수익
                <span className={pnl >= 0 ? 'col-asset' : 'col-expense'}>
                  {sign}{fmtW(pnl)} ({sign}{pct}%)
                </span>
              </div>
              {a.rate != null && <div className="asset-stat">이율<span>{a.rate}%{a.interestType ? ' · ' + a.interestType : ''}</span></div>}
              {a.maturity && <div className="asset-stat">만기<span>{a.maturity}</span></div>}
            </div>
          </div>
        )
      })}

      <div className="card" style={{ marginTop: 6 }}>
        <div className="card-header"><span className="card-title">거래 기록</span></div>
        <div className="filter-bar">
          <select value={fAsset} onChange={e => setFAsset(e.target.value)} style={{ width: 110 }}>
            <option value="">전체 종목</option>
            {data.assets.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
          </select>
          <select value={fSide} onChange={e => setFSide(e.target.value)}>
            <option value="">매수+매도</option><option value="buy">매수</option><option value="sell">매도</option>
          </select>
          <input value={fFrom} onChange={e => setFFrom(e.target.value)} placeholder="시작 YYYY-MM-DD" style={{ width: 140 }} />
          <input value={fTo}   onChange={e => setFTo(e.target.value)}   placeholder="종료 YYYY-MM-DD" style={{ width: 140 }} />
        </div>
        <div className="tx-head"><span>날짜</span><span>구분</span><span>종목</span><span>수량×단가</span><span>금액/메모</span><span></span></div>
        {filteredTx.length === 0
          ? <div className="empty">거래 기록이 없습니다</div>
          : filteredTx.map(t => {
            if (editingTxId === t.id) {
              return (
                <div key={t.id} className="edit-row-box">
                  <div className="form-grid g3">
                    <div className="form-field"><label>종목</label>
                      <select value={txEditForm.assetId} onChange={e => setTxEditForm(p => ({ ...p, assetId: e.target.value }))}>
                        {data.assets.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
                      </select>
                    </div>
                    <div className="form-field"><label>구분</label>
                      <select value={txEditForm.side} onChange={e => setTxEditForm(p => ({ ...p, side: e.target.value }))}>
                        <option value="buy">매수</option><option value="sell">매도</option>
                      </select>
                    </div>
                    <div className="form-field"><label>날짜</label><input type="date" value={txEditForm.date} onChange={e => setTxEditForm(p => ({ ...p, date: e.target.value }))} /></div>
                  </div>
                  <div className="form-grid g3">
                    <div className="form-field"><label>수량</label><input type="number" value={txEditForm.qty} onChange={e => setTxEditForm(p => ({ ...p, qty: e.target.value }))} /></div>
                    <div className="form-field"><label>단가</label><input type="number" value={txEditForm.price} onChange={e => setTxEditForm(p => ({ ...p, price: e.target.value }))} /></div>
                    <div className="form-field"><label>수수료</label><input type="number" value={txEditForm.fee} onChange={e => setTxEditForm(p => ({ ...p, fee: e.target.value }))} /></div>
                  </div>
                  <div className="form-grid g1"><div className="form-field"><label>메모</label><input value={txEditForm.memo} onChange={e => setTxEditForm(p => ({ ...p, memo: e.target.value }))} /></div></div>
                  <div className="form-actions">
                    <button className="save-btn" onClick={() => saveTxEdit(t.id)}>수정 완료</button>
                    <button className="cancel-btn" onClick={() => setEditingTxId(null)}>취소</button>
                  </div>
                </div>
              )
            }
            return (
              <div key={t.id} className="tx-row">
                <span style={{ color: 'var(--text-secondary)' }}>{t.date || '—'}</span>
                <span><Badge t={t.side === 'buy' ? '매수' : '매도'} /></span>
                <span style={{ fontWeight: 600 }}>{aMap[String(t.assetId)] ?? '삭제됨'}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{(+t.qty).toFixed(3).replace(/\.?0+$/, '')}×{fmt(t.price)}</span>
                <span>
                  <span style={{ fontWeight: 600 }}>{fmtW(t.total)}</span>
                  {t.memo && <span style={{ color: 'var(--text-tertiary)', fontSize: 12.5 }}> · {t.memo}</span>}
                </span>
                <span className="row-actions">
                  <button className="edit-btn" onClick={() => startTxEdit(t)} aria-label="수정">✏️</button>
                  <button className="del-btn" style={{ opacity: 1 }} onClick={() => delTx(t.id)}>✕</button>
                </span>
              </div>
            )
          })
        }
        {filteredTx.length > 0 && (
          <div className="tx-sum">총 {filteredTx.length}건 · 매수 {fmtW(buyTotal)} · 매도 {fmtW(sellTotal)}</div>
        )}
      </div>
    </>
  )
}

// ── 보험/구독/교육 공용: 결제수단 포함 항목 탭 ─────────────────
function buildEmptyForm(typeDefault: string) {
  return { name: '', type: typeDefault, amount: '', extra: '', tags: '', payment: { ...EMPTY_PAYMENT } as PaymentMethod }
}
type PayFormState = ReturnType<typeof buildEmptyForm>

function PayItemForm({ form, setForm, config, onSave, onCancel, saveLabel }: {
  form: PayFormState; setForm: (f: PayFormState) => void
  config: { typeOptions: string[]; nameLabel: string; namePlaceholder: string; amountLabel: string; extraLabel: string; extraPlaceholder: string }
  onSave: () => void; onCancel: () => void; saveLabel: string
}) {
  return (
    <>
      <div className="form-grid g2">
        <div className="form-field"><label>{config.nameLabel}</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={config.namePlaceholder} /></div>
        <div className="form-field"><label>카테고리</label>
          <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            {config.typeOptions.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
      </div>
      <div className="form-grid g2">
        <div className="form-field"><label>{config.amountLabel}</label><input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0" /></div>
        <div className="form-field"><label>{config.extraLabel}</label><input value={form.extra} onChange={e => setForm({ ...form, extra: e.target.value })} placeholder={config.extraPlaceholder} /></div>
      </div>
      <div className="divider-label" style={{ marginTop: 4 }}>결제수단</div>
      <PaymentFields value={form.payment} onChange={p => setForm({ ...form, payment: p })} />
      <div className="form-grid g1" style={{ marginTop: 9 }}>
        <div className="form-field"><label>태그 (쉼표 구분)</label><input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="예: 가족,필수" /></div>
      </div>
      <div className="form-actions">
        <button className="save-btn" onClick={onSave}>{saveLabel}</button>
        <button className="cancel-btn" onClick={onCancel}>취소</button>
      </div>
    </>
  )
}

// ── 보험 탭 ───────────────────────────────────────────────────
function InsuranceTab({ data, save }: { data: AppData; save: (d: AppData) => void }) {
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<PayFormState>(buildEmptyForm('생명보험'))
  const [editForm, setEditForm] = useState<PayFormState>(buildEmptyForm('생명보험'))

  const cfg = { typeOptions: INSURANCE_TYPES, nameLabel: '보험명', namePlaceholder: '예: 실손의료보험', amountLabel: '월 보험료 (원)', extraLabel: '보험사', extraPlaceholder: '예: 삼성생명' }

  const add = () => {
    const item: Insurance = { id: Date.now(), name: form.name || '미입력', company: form.extra, itype: form.type, amount: +form.amount || 0, expire: '', tags: parseTags(form.tags), payment: form.payment }
    save({ ...data, insurance: [...data.insurance, item] })
    setForm(buildEmptyForm('생명보험'))
    setOpen(false)
  }
  const startEdit = (ins: Insurance) => {
    setEditId(ins.id)
    setEditForm({ name: ins.name, type: ins.itype, amount: String(ins.amount), extra: ins.company, tags: tagsToStr(ins.tags), payment: ins.payment ?? { ...EMPTY_PAYMENT } })
  }
  const saveEdit = (id: number) => {
    const orig = data.insurance.find(i => i.id === id)
    const updated: Insurance = { id, name: editForm.name || '미입력', company: editForm.extra, itype: editForm.type, amount: +editForm.amount || 0, expire: orig?.expire ?? '', tags: parseTags(editForm.tags), payment: editForm.payment }
    save({ ...data, insurance: data.insurance.map(i => i.id === id ? updated : i) })
    setEditId(null)
  }
  const del = (id: number) => save({ ...data, insurance: data.insurance.filter(i => i.id !== id) })

  return (
    <>
      <div className="toolbar">
        <button className="add-btn" onClick={() => setOpen(v => !v)}>+ 추가</button>
        <button className="icon-btn" onClick={() => downloadCSV(`보험_${todayStr()}.csv`, [['보험명','보험사','종류','월보험료','결제수단','결제일','태그'], ...data.insurance.map(i => [i.name, i.company, i.itype, i.amount, paymentSummary(i.payment ?? EMPTY_PAYMENT), i.payment?.payDay ?? '', i.tags.join(';')])])}>↓ CSV</button>
      </div>
      <FormBox open={open}>
        <PayItemForm form={form} setForm={setForm} config={cfg} onSave={add} onCancel={() => setOpen(false)} saveLabel="저장" />
      </FormBox>
      <div className="card">
        {data.insurance.length === 0
          ? <div className="empty">등록된 항목이 없습니다</div>
          : <>
              {data.insurance.map(ins => {
                if (editId === ins.id) {
                  return <div key={ins.id} className="edit-row-box"><PayItemForm form={editForm} setForm={setEditForm} config={cfg} onSave={() => saveEdit(ins.id)} onCancel={() => setEditId(null)} saveLabel="수정 완료" /></div>
                }
                const pay = ins.payment ?? EMPTY_PAYMENT
                return (
                  <div key={ins.id} className="row">
                    <div>
                      <div className="row-name">{ins.name} <Badge t={ins.itype} /></div>
                      <div className="row-meta">{ins.company}{paymentSummary(pay) ? ' · ' + paymentSummary(pay) : ''} <TagList tags={ins.tags} /></div>
                    </div>
                    <div className="row-actions">
                      <span className="row-amount col-expense">{fmtW(ins.amount)}/월</span>
                      <button className="edit-btn" onClick={() => startEdit(ins)} aria-label="수정">✏️</button>
                      <button className="del-btn" onClick={() => del(ins.id)}>✕</button>
                    </div>
                  </div>
                )
              })}
              <div className="total-row"><span>월 합계</span><span style={{ fontWeight: 600 }}>{fmtW(data.insurance.reduce((s, i) => s + i.amount, 0))}</span></div>
            </>
        }
      </div>
    </>
  )
}

// ── 구독 탭 ───────────────────────────────────────────────────
function SubscriptionTab({ data, save }: { data: AppData; save: (d: AppData) => void }) {
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<PayFormState>(buildEmptyForm('OTT/영상'))
  const [editForm, setEditForm] = useState<PayFormState>(buildEmptyForm('OTT/영상'))

  const cfg = { typeOptions: SUBSCRIPTION_TYPES, nameLabel: '서비스명', namePlaceholder: '예: Netflix', amountLabel: '월 구독료 (원)', extraLabel: '다음 결제일', extraPlaceholder: '2025-07-15' }

  const add = () => {
    const item: Subscription = { id: Date.now(), name: form.name || '미입력', stype: form.type, amount: +form.amount || 0, next: form.extra, tags: parseTags(form.tags), payment: form.payment }
    save({ ...data, subscription: [...data.subscription, item] })
    setForm(buildEmptyForm('OTT/영상'))
    setOpen(false)
  }
  const startEdit = (sub: Subscription) => {
    setEditId(sub.id)
    setEditForm({ name: sub.name, type: sub.stype, amount: String(sub.amount), extra: sub.next, tags: tagsToStr(sub.tags), payment: sub.payment ?? { ...EMPTY_PAYMENT } })
  }
  const saveEdit = (id: number) => {
    const updated: Subscription = { id, name: editForm.name || '미입력', stype: editForm.type, amount: +editForm.amount || 0, next: editForm.extra, tags: parseTags(editForm.tags), payment: editForm.payment }
    save({ ...data, subscription: data.subscription.map(i => i.id === id ? updated : i) })
    setEditId(null)
  }
  const del = (id: number) => save({ ...data, subscription: data.subscription.filter(i => i.id !== id) })

  return (
    <>
      <div className="toolbar">
        <button className="add-btn" onClick={() => setOpen(v => !v)}>+ 추가</button>
        <button className="icon-btn" onClick={() => downloadCSV(`구독_${todayStr()}.csv`, [['서비스명','카테고리','월구독료','다음결제일','결제수단','태그'], ...data.subscription.map(i => [i.name, i.stype, i.amount, i.next, paymentSummary(i.payment ?? EMPTY_PAYMENT), i.tags.join(';')])])}>↓ CSV</button>
      </div>
      <FormBox open={open}>
        <PayItemForm form={form} setForm={setForm} config={cfg} onSave={add} onCancel={() => setOpen(false)} saveLabel="저장" />
      </FormBox>
      <div className="card">
        {data.subscription.length === 0
          ? <div className="empty">등록된 항목이 없습니다</div>
          : <>
              {data.subscription.map(sub => {
                if (editId === sub.id) {
                  return <div key={sub.id} className="edit-row-box"><PayItemForm form={editForm} setForm={setEditForm} config={cfg} onSave={() => saveEdit(sub.id)} onCancel={() => setEditId(null)} saveLabel="수정 완료" /></div>
                }
                const pay = sub.payment ?? EMPTY_PAYMENT
                return (
                  <div key={sub.id} className="row">
                    <div>
                      <div className="row-name">{sub.name} <Badge t={sub.stype} /></div>
                      <div className="row-meta">{sub.next ? '다음 결제 ' + sub.next : ''}{paymentSummary(pay) ? ' · ' + paymentSummary(pay) : ''} <TagList tags={sub.tags} /></div>
                    </div>
                    <div className="row-actions">
                      <span className="row-amount col-expense">{fmtW(sub.amount)}/월</span>
                      <button className="edit-btn" onClick={() => startEdit(sub)} aria-label="수정">✏️</button>
                      <button className="del-btn" onClick={() => del(sub.id)}>✕</button>
                    </div>
                  </div>
                )
              })}
              <div className="total-row"><span>월 합계</span><span style={{ fontWeight: 600 }}>{fmtW(data.subscription.reduce((s, i) => s + i.amount, 0))}</span></div>
            </>
        }
      </div>
    </>
  )
}

// ── 교육 탭 ───────────────────────────────────────────────────
function EducationTab({ data, save }: { data: AppData; save: (d: AppData) => void }) {
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<PayFormState>(buildEmptyForm('어학'))
  const [editForm, setEditForm] = useState<PayFormState>(buildEmptyForm('어학'))

  const cfg = { typeOptions: EDUCATION_TYPES, nameLabel: '과정/기관명', namePlaceholder: '예: 영어회화 학원', amountLabel: '월 비용 (원)', extraLabel: '수강 기간', extraPlaceholder: '2025-06 ~ 2025-12' }

  const add = () => {
    const item: Education = { id: Date.now(), name: form.name || '미입력', etype: form.type, amount: +form.amount || 0, period: form.extra, tags: parseTags(form.tags), payment: form.payment }
    save({ ...data, education: [...data.education, item] })
    setForm(buildEmptyForm('어학'))
    setOpen(false)
  }
  const startEdit = (edu: Education) => {
    setEditId(edu.id)
    setEditForm({ name: edu.name, type: edu.etype, amount: String(edu.amount), extra: edu.period, tags: tagsToStr(edu.tags), payment: edu.payment ?? { ...EMPTY_PAYMENT } })
  }
  const saveEdit = (id: number) => {
    const updated: Education = { id, name: editForm.name || '미입력', etype: editForm.type, amount: +editForm.amount || 0, period: editForm.extra, tags: parseTags(editForm.tags), payment: editForm.payment }
    save({ ...data, education: data.education.map(i => i.id === id ? updated : i) })
    setEditId(null)
  }
  const del = (id: number) => save({ ...data, education: data.education.filter(i => i.id !== id) })

  return (
    <>
      <div className="toolbar">
        <button className="add-btn" onClick={() => setOpen(v => !v)}>+ 추가</button>
        <button className="icon-btn" onClick={() => downloadCSV(`교육비_${todayStr()}.csv`, [['과정명','카테고리','월비용','수강기간','결제수단','태그'], ...data.education.map(i => [i.name, i.etype, i.amount, i.period, paymentSummary(i.payment ?? EMPTY_PAYMENT), i.tags.join(';')])])}>↓ CSV</button>
      </div>
      <FormBox open={open}>
        <PayItemForm form={form} setForm={setForm} config={cfg} onSave={add} onCancel={() => setOpen(false)} saveLabel="저장" />
      </FormBox>
      <div className="card">
        {data.education.length === 0
          ? <div className="empty">등록된 항목이 없습니다</div>
          : <>
              {data.education.map(edu => {
                if (editId === edu.id) {
                  return <div key={edu.id} className="edit-row-box"><PayItemForm form={editForm} setForm={setEditForm} config={cfg} onSave={() => saveEdit(edu.id)} onCancel={() => setEditId(null)} saveLabel="수정 완료" /></div>
                }
                const pay = edu.payment ?? EMPTY_PAYMENT
                return (
                  <div key={edu.id} className="row">
                    <div>
                      <div className="row-name">{edu.name} <Badge t={edu.etype} /></div>
                      <div className="row-meta">{edu.period || ''}{paymentSummary(pay) ? ' · ' + paymentSummary(pay) : ''} <TagList tags={edu.tags} /></div>
                    </div>
                    <div className="row-actions">
                      <span className="row-amount col-expense">{fmtW(edu.amount)}/월</span>
                      <button className="edit-btn" onClick={() => startEdit(edu)} aria-label="수정">✏️</button>
                      <button className="del-btn" onClick={() => del(edu.id)}>✕</button>
                    </div>
                  </div>
                )
              })}
              <div className="total-row"><span>월 합계</span><span style={{ fontWeight: 600 }}>{fmtW(data.education.reduce((s, i) => s + i.amount, 0))}</span></div>
            </>
        }
      </div>
    </>
  )
}

// ── 대출 탭 ───────────────────────────────────────────────────
const EMPTY_LOAN_FORM = { name: '', bank: '', balance: '', rate: '', monthly: '', expire: '', tags: '' }
type LoanFormState = typeof EMPTY_LOAN_FORM

function LoanForm({ form, setForm, onSave, onCancel, saveLabel }: {
  form: LoanFormState; setForm: (f: LoanFormState) => void
  onSave: () => void; onCancel: () => void; saveLabel: string
}) {
  return (
    <>
      <div className="form-grid g2">
        <div className="form-field"><label>대출명</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="예: 주택담보대출" /></div>
        <div className="form-field"><label>은행/기관</label><input value={form.bank} onChange={e => setForm({ ...form, bank: e.target.value })} placeholder="예: 국민은행" /></div>
      </div>
      <div className="form-grid g3">
        <div className="form-field"><label>잔여 원금 (원)</label><input type="number" value={form.balance} onChange={e => setForm({ ...form, balance: e.target.value })} placeholder="0" /></div>
        <div className="form-field"><label>금리 (%)</label><input type="number" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} placeholder="3.5" /></div>
        <div className="form-field"><label>월 상환액 (원)</label><input type="number" value={form.monthly} onChange={e => setForm({ ...form, monthly: e.target.value })} placeholder="0" /></div>
      </div>
      <div className="form-grid g2">
        <div className="form-field"><label>만기일</label><input value={form.expire} onChange={e => setForm({ ...form, expire: e.target.value })} placeholder="2040-06" /></div>
        <div className="form-field"><label>태그 (쉼표 구분)</label><input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="예: 주택,변동금리" /></div>
      </div>
      <div className="form-actions">
        <button className="save-btn" onClick={onSave}>{saveLabel}</button>
        <button className="cancel-btn" onClick={onCancel}>취소</button>
      </div>
    </>
  )
}

function LoanTab({ data, save }: { data: AppData; save: (d: AppData) => void }) {
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [f, setF] = useState<LoanFormState>(EMPTY_LOAN_FORM)
  const [editForm, setEditForm] = useState<LoanFormState>(EMPTY_LOAN_FORM)

  const add = () => {
    save({ ...data, loan: [...data.loan, { id: Date.now(), name: f.name || '미입력', bank: f.bank, balance: +f.balance || 0, rate: +f.rate || 0, monthly: +f.monthly || 0, expire: f.expire, tags: parseTags(f.tags) }] })
    setF(EMPTY_LOAN_FORM); setOpen(false)
  }
  const startEdit = (l: Loan) => {
    setEditId(l.id)
    setEditForm({ name: l.name, bank: l.bank, balance: String(l.balance), rate: String(l.rate), monthly: String(l.monthly), expire: l.expire, tags: tagsToStr(l.tags) })
  }
  const saveEdit = (id: number) => {
    const updated: Loan = { id, name: editForm.name || '미입력', bank: editForm.bank, balance: +editForm.balance || 0, rate: +editForm.rate || 0, monthly: +editForm.monthly || 0, expire: editForm.expire, tags: parseTags(editForm.tags) }
    save({ ...data, loan: data.loan.map(l => l.id === id ? updated : l) })
    setEditId(null)
  }

  return (
    <>
      <div className="toolbar">
        <button className="add-btn" onClick={() => setOpen(v => !v)}>+ 추가</button>
        <button className="icon-btn" onClick={() => downloadCSV(`대출_${todayStr()}.csv`, [['대출명','은행','잔여원금','금리','월상환액','만기','태그'], ...data.loan.map(i => [i.name, i.bank, i.balance, i.rate, i.monthly, i.expire, i.tags.join(';')])])}>↓ CSV</button>
      </div>
      <FormBox open={open}>
        <LoanForm form={f} setForm={setF} onSave={add} onCancel={() => setOpen(false)} saveLabel="저장" />
      </FormBox>
      <div className="card">
        {data.loan.length === 0
          ? <div className="empty">등록된 대출이 없습니다</div>
          : data.loan.map(i => {
            if (editId === i.id) {
              return <div key={i.id} className="edit-row-box"><LoanForm form={editForm} setForm={setEditForm} onSave={() => saveEdit(i.id)} onCancel={() => setEditId(null)} saveLabel="수정 완료" /></div>
            }
            return (
              <div key={i.id} className="row">
                <div>
                  <div className="row-name">{i.name}</div>
                  <div className="row-meta">{i.bank}{i.rate ? ' · ' + i.rate + '%' : ''}{i.expire ? ' · 만기 ' + i.expire : ''} <TagList tags={i.tags} /></div>
                </div>
                <div className="row-actions">
                  <div>
                    <div className="row-amount col-expense">{fmtW(i.monthly)}/월</div>
                    <div className="row-meta" style={{ textAlign: 'right' }}>잔여 {fmtW(i.balance)}</div>
                  </div>
                  <button className="edit-btn" onClick={() => startEdit(i)} aria-label="수정">✏️</button>
                  <button className="del-btn" onClick={() => save({ ...data, loan: data.loan.filter(x => x.id !== i.id) })}>✕</button>
                </div>
              </div>
            )
          })
        }
      </div>
    </>
  )
}

// ── 생활비 탭 ─────────────────────────────────────────────────
const EMPTY_EXP_FORM = { name: '', etype: '관리비/공과금', amount: '', day: '', tags: '' }
type ExpFormState = typeof EMPTY_EXP_FORM
const EMPTY_EV_FORM = { date: todayStr(), kind: '결혼 축의금', rel: '가족', name: '', amount: '', memo: '' }
type EvFormState = typeof EMPTY_EV_FORM

function ExpForm({ form, setForm, onSave, onCancel, saveLabel }: {
  form: ExpFormState; setForm: (f: ExpFormState) => void
  onSave: () => void; onCancel: () => void; saveLabel: string
}) {
  return (
    <>
      <div className="form-grid g2">
        <div className="form-field"><label>항목명</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="예: 아파트 관리비" /></div>
        <div className="form-field"><label>카테고리</label>
          <select value={form.etype} onChange={e => setForm({ ...form, etype: e.target.value })}>
            {EXPENSE_TYPES.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
      </div>
      <div className="form-grid g3">
        <div className="form-field"><label>월 금액 (원)</label><input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0" /></div>
        <div className="form-field"><label>결제일</label><input value={form.day} onChange={e => setForm({ ...form, day: e.target.value })} placeholder="매월 25일" /></div>
        <div className="form-field"><label>태그 (쉼표 구분)</label><input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="예: 아파트" /></div>
      </div>
      <div className="form-actions">
        <button className="save-btn" onClick={onSave}>{saveLabel}</button>
        <button className="cancel-btn" onClick={onCancel}>취소</button>
      </div>
    </>
  )
}

function EvForm({ form, setForm, onSave, onCancel, saveLabel }: {
  form: EvFormState; setForm: (f: EvFormState) => void
  onSave: () => void; onCancel: () => void; saveLabel: string
}) {
  return (
    <>
      <div className="form-grid g3">
        <div className="form-field"><label>날짜</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
        <div className="form-field"><label>종류</label>
          <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
            {EVENT_KINDS.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div className="form-field"><label>관계</label>
          <select value={form.rel} onChange={e => setForm({ ...form, rel: e.target.value })}>
            {RELATIONS.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
      </div>
      <div className="form-grid g3">
        <div className="form-field"><label>대상자 이름</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="예: 홍길동" /></div>
        <div className="form-field"><label>금액 (원)</label><input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0" /></div>
        <div className="form-field"><label>메모</label><input value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} placeholder="예: 대학교 친구" /></div>
      </div>
      <div className="form-actions">
        <button className="save-btn" onClick={onSave}>{saveLabel}</button>
        <button className="cancel-btn" onClick={onCancel}>취소</button>
      </div>
    </>
  )
}

function ExpensesTab({ data, save }: { data: AppData; save: (d: AppData) => void }) {
  const [openExp, setOpenExp] = useState(false)
  const [openEv,  setOpenEv]  = useState(false)
  const [editExpId, setEditExpId] = useState<number | null>(null)
  const [editEvId,  setEditEvId]  = useState<number | null>(null)
  const [ef,  setEf]  = useState<ExpFormState>(EMPTY_EXP_FORM)
  const [editExpForm, setEditExpForm] = useState<ExpFormState>(EMPTY_EXP_FORM)
  const [evf, setEvf] = useState<EvFormState>(EMPTY_EV_FORM)
  const [editEvForm, setEditEvForm] = useState<EvFormState>(EMPTY_EV_FORM)
  const [evYear, setEvYear] = useState(String(new Date().getFullYear()))

  const addExp = () => {
    save({ ...data, expenses: [...data.expenses, { id: Date.now(), name: ef.name || '미입력', etype: ef.etype, amount: +ef.amount || 0, day: ef.day, tags: parseTags(ef.tags) }] })
    setEf(EMPTY_EXP_FORM); setOpenExp(false)
  }
  const startExpEdit = (exp: Expense) => {
    setEditExpId(exp.id)
    setEditExpForm({ name: exp.name, etype: exp.etype, amount: String(exp.amount), day: exp.day, tags: tagsToStr(exp.tags) })
  }
  const saveExpEdit = (id: number) => {
    const updated: Expense = { id, name: editExpForm.name || '미입력', etype: editExpForm.etype, amount: +editExpForm.amount || 0, day: editExpForm.day, tags: parseTags(editExpForm.tags) }
    save({ ...data, expenses: data.expenses.map(e => e.id === id ? updated : e) })
    setEditExpId(null)
  }

  const addEv = () => {
    const evs = [...data.events, { id: Date.now(), date: evf.date, kind: evf.kind, rel: evf.rel, name: evf.name || '미입력', amount: +evf.amount || 0, memo: evf.memo }]
      .sort((a, b) => b.date.localeCompare(a.date))
    save({ ...data, events: evs })
    setEvf(EMPTY_EV_FORM); setOpenEv(false)
  }
  const startEvEdit = (ev: EventItem) => {
    setEditEvId(ev.id)
    setEditEvForm({ date: ev.date, kind: ev.kind, rel: ev.rel, name: ev.name, amount: String(ev.amount), memo: ev.memo })
  }
  const saveEvEdit = (id: number) => {
    const updated: EventItem = { id, date: editEvForm.date, kind: editEvForm.kind, rel: editEvForm.rel, name: editEvForm.name || '미입력', amount: +editEvForm.amount || 0, memo: editEvForm.memo }
    const evs = data.events.map(e => e.id === id ? updated : e).sort((a, b) => b.date.localeCompare(a.date))
    save({ ...data, events: evs })
    setEditEvId(null)
  }

  const curYear = new Date().getFullYear()
  const years = [...new Set([
    ...data.events.map(e => e.date?.slice(0, 4)).filter((y): y is string => !!y),
    String(curYear), String(curYear - 1),
  ])].sort((a, b) => +b - +a)

  const filteredEvs = data.events.filter(e => e.date?.startsWith(evYear))
  const evTotal = filteredEvs.reduce((s, e) => s + e.amount, 0)
  const budgetM = (data.expenses.find(i => i.etype === '경조사비 예산') ?? { amount: 0 }).amount
  const budgetY = budgetM * 12

  return (
    <>
      <div className="toolbar">
        <button className="add-btn" onClick={() => setOpenExp(v => !v)}>+ 고정 지출 추가</button>
        <button className="add-btn" onClick={() => setOpenEv(v => !v)}>+ 경조사비 추가</button>
        <button className="icon-btn" onClick={() => downloadCSV(`생활비_${todayStr()}.csv`, [['항목명','카테고리','월금액','결제일','태그'], ...data.expenses.map(i => [i.name, i.etype, i.amount, i.day, i.tags.join(';')])])}>↓ CSV</button>
      </div>

      <FormBox open={openExp}>
        <ExpForm form={ef} setForm={setEf} onSave={addExp} onCancel={() => setOpenExp(false)} saveLabel="저장" />
      </FormBox>

      <FormBox open={openEv}>
        <EvForm form={evf} setForm={setEvf} onSave={addEv} onCancel={() => setOpenEv(false)} saveLabel="저장" />
      </FormBox>

      <div className="card">
        <div className="divider-label">고정 지출</div>
        {data.expenses.length === 0
          ? <div className="empty">등록된 항목이 없습니다</div>
          : <>
              {data.expenses.map(i => {
                if (editExpId === i.id) {
                  return <div key={i.id} className="edit-row-box"><ExpForm form={editExpForm} setForm={setEditExpForm} onSave={() => saveExpEdit(i.id)} onCancel={() => setEditExpId(null)} saveLabel="수정 완료" /></div>
                }
                return (
                  <div key={i.id} className="row">
                    <div><div className="row-name">{i.name} <Badge t={i.etype} /></div><div className="row-meta">{i.day} <TagList tags={i.tags} /></div></div>
                    <div className="row-actions">
                      <span className="row-amount col-expense">{fmtW(i.amount)}/월</span>
                      <button className="edit-btn" onClick={() => startExpEdit(i)} aria-label="수정">✏️</button>
                      <button className="del-btn" onClick={() => save({ ...data, expenses: data.expenses.filter(x => x.id !== i.id) })}>✕</button>
                    </div>
                  </div>
                )
              })}
              <div className="total-row"><span>월 합계</span><span style={{ fontWeight: 600 }}>{fmtW(data.expenses.reduce((s, i) => s + i.amount, 0))}</span></div>
            </>
        }
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">경조사비 기록</span>
          <select value={evYear} onChange={e => setEvYear(e.target.value)} style={{ width: 'auto', fontSize: 13, padding: '4px 8px' }}>
            {years.map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
        </div>
        <div className="metric-grid">
          <div className="metric"><div className="metric-label">{evYear}년 총액</div><div className="metric-value">{Math.round(evTotal / 10000)}만원</div><div className="metric-sub">{filteredEvs.length}건</div></div>
          <div className="metric"><div className="metric-label">연간 예산</div><div className="metric-value" style={{ color: budgetY ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{budgetY ? Math.round(budgetY / 10000) + '만원' : '미설정'}</div><div className="metric-sub" style={{ color: budgetY && evTotal > budgetY ? '#c0392b' : 'var(--text-tertiary)' }}>{budgetY ? Math.round(evTotal / budgetY * 100) + '% 사용' : ''}</div></div>
          <div className="metric"><div className="metric-label">건당 평균</div><div className="metric-value">{filteredEvs.length ? Math.round(evTotal / filteredEvs.length / 10000) + '만원' : '—'}</div><div className="metric-sub">&nbsp;</div></div>
        </div>
        <div className="ev-head"><span>날짜</span><span>대상자/메모</span><span>종류</span><span style={{ textAlign: 'right' }}>금액</span><span></span></div>
        {filteredEvs.length === 0
          ? <div className="empty">기록이 없습니다</div>
          : filteredEvs.map(e => {
            if (editEvId === e.id) {
              return <div key={e.id} className="edit-row-box"><EvForm form={editEvForm} setForm={setEditEvForm} onSave={() => saveEvEdit(e.id)} onCancel={() => setEditEvId(null)} saveLabel="수정 완료" /></div>
            }
            return (
              <div key={e.id} className="ev-row">
                <span style={{ color: 'var(--text-secondary)' }}>{e.date || '—'}</span>
                <span><span style={{ fontWeight: 600 }}>{e.name}</span>{e.memo && <span style={{ color: 'var(--text-tertiary)', fontSize: 12.5 }}> · {e.memo}</span>}<span style={{ color: 'var(--text-tertiary)', fontSize: 12.5 }}> · {e.rel}</span></span>
                <span><Badge t={e.kind} /></span>
                <span style={{ fontWeight: 600, textAlign: 'right', color: '#c0392b' }}>{fmtW(e.amount)}</span>
                <span className="row-actions" style={{ justifyContent: 'flex-end' }}>
                  <button className="edit-btn" onClick={() => startEvEdit(e)} aria-label="수정">✏️</button>
                  <button className="del-btn" style={{ opacity: 1 }} onClick={() => save({ ...data, events: data.events.filter(x => x.id !== e.id) })}>✕</button>
                </span>
              </div>
            )
          })
        }
      </div>
    </>
  )
}

// ── 검색 탭 ───────────────────────────────────────────────────
function SearchTab({ data }: { data: AppData }) {
  const [q,   setQ]   = useState('')
  const [cat, setCat] = useState('')

  const aMap: Record<string, string> = Object.fromEntries(data.assets.map(a => [String(a.id), a.name]))

  const hl = (str: string): ReactNode => {
    if (!q) return str
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    const parts = str.split(re)
    return <>{parts.map((p, i) => re.test(p) ? <span key={i} className="highlight">{p}</span> : p)}</>
  }

  interface Result { type: string; label: string; detail: string; name: string; tags?: Tags }
  const results: Result[] = []
  const qL = q.toLowerCase()
  const TL: Record<string, string> = { assets: '투자종목', transactions: '거래', insurance: '보험', subscription: '구독', education: '교육', loan: '대출', expenses: '생활비', events: '경조사비' }

  if (q) {
    const hit = (s: string) => s.toLowerCase().includes(qL)
    if (!cat || cat === 'assets')       data.assets.filter(a => hit(`${a.name} ${a.itype} ${a.tags.join(' ')} ${a.note}`)).forEach(a => results.push({ type: 'assets', label: TL.assets, name: a.name, detail: `평가액 ${fmtW(a.value)}`, tags: a.tags }))
    if (!cat || cat === 'transactions') data.transactions.filter(t => hit(`${aMap[String(t.assetId)] ?? ''} ${t.memo ?? ''} ${t.date ?? ''}`)).forEach(t => results.push({ type: 'transactions', label: TL.transactions, name: t.memo || aMap[String(t.assetId)] || '거래', detail: `${aMap[String(t.assetId)] ?? '?'} ${t.side === 'buy' ? '매수' : '매도'} ${fmtW(t.total)} · ${t.date ?? ''}` }))
    if (!cat || cat === 'insurance')    data.insurance.filter(i => hit(`${i.name} ${i.company} ${i.itype} ${i.tags.join(' ')} ${paymentSummary(i.payment ?? EMPTY_PAYMENT)}`)).forEach(i => results.push({ type: 'insurance', label: TL.insurance, name: i.name, detail: `${fmtW(i.amount)}/월 · ${i.company}`, tags: i.tags }))
    if (!cat || cat === 'subscription') data.subscription.filter(i => hit(`${i.name} ${i.stype} ${i.tags.join(' ')} ${paymentSummary(i.payment ?? EMPTY_PAYMENT)}`)).forEach(i => results.push({ type: 'subscription', label: TL.subscription, name: i.name, detail: `${fmtW(i.amount)}/월`, tags: i.tags }))
    if (!cat || cat === 'education')    data.education.filter(i => hit(`${i.name} ${i.etype} ${i.tags.join(' ')} ${paymentSummary(i.payment ?? EMPTY_PAYMENT)}`)).forEach(i => results.push({ type: 'education', label: TL.education, name: i.name, detail: `${fmtW(i.amount)}/월 · ${i.period}`, tags: i.tags }))
    if (!cat || cat === 'loan')         data.loan.filter(i => hit(`${i.name} ${i.bank} ${i.tags.join(' ')}`)).forEach(i => results.push({ type: 'loan', label: TL.loan, name: i.name, detail: `잔여 ${fmtW(i.balance)} · ${i.rate}%`, tags: i.tags }))
    if (!cat || cat === 'expenses')     data.expenses.filter(i => hit(`${i.name} ${i.etype} ${i.tags.join(' ')}`)).forEach(i => results.push({ type: 'expenses', label: TL.expenses, name: i.name, detail: `${fmtW(i.amount)}/월`, tags: i.tags }))
    if (!cat || cat === 'events')       data.events.filter(e => hit(`${e.name} ${e.kind} ${e.rel} ${e.memo ?? ''}`)).forEach(e => results.push({ type: 'events', label: TL.events, name: e.name, detail: `${fmtW(e.amount)} · ${e.date ?? ''} · ${e.rel}` }))
  }

  return (
    <div className="card">
      <div className="filter-bar" style={{ marginBottom: 13 }}>
        <div className="search-wrap">
          <span className="search-icon">🔍</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="이름, 메모, 태그, 결제수단 검색..." autoFocus />
        </div>
        <select value={cat} onChange={e => setCat(e.target.value)} style={{ width: 120 }}>
          <option value="">전체 항목</option>
          {Object.entries(TL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {!q
        ? <div className="empty">검색어를 입력하세요</div>
        : results.length === 0
          ? <div className="empty">검색 결과가 없습니다</div>
          : results.map((r, idx) => (
            <div key={idx} className="row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                <div>
                  <span className="search-cat-badge">{r.label}</span>
                  <span className="row-name">{hl(r.name)}</span>
                  {r.tags?.map(t => <span key={t} className="tag">{hl(t)}</span>)}
                </div>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{r.detail}</span>
              </div>
            </div>
          ))
      }
    </div>
  )
}
