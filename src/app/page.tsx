'use client'
import { useState, useEffect, useCallback, ReactNode } from 'react'
import {
  Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale,
  Tooltip, Legend
} from 'chart.js'
import { Doughnut, Bar } from 'react-chartjs-2'

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const SK = 'finance_v3'

type Tags = string[]
interface Asset { id: number; name: string; itype: string; value: number; updatedAt: string; note: string; tags: Tags; rate: number | null; maturity: string; interestType: string }
interface Transaction { id: number; assetId: number; side: 'buy' | 'sell'; date: string; qty: number; price: number; fee: number; memo: string; total: number }
interface Insurance { id: number; name: string; company: string; itype: string; amount: number; expire: string; tags: Tags }
interface Subscription { id: number; name: string; stype: string; amount: number; next: string; tags: Tags }
interface Education { id: number; name: string; etype: string; amount: number; period: string; tags: Tags }
interface Loan { id: number; name: string; bank: string; balance: number; rate: number; monthly: number; expire: string; tags: Tags }
interface Expense { id: number; name: string; etype: string; amount: number; day: string; tags: Tags }
interface EventItem { id: number; date: string; kind: string; rel: string; name: string; amount: number; memo: string }

interface AppData {
  assets: Asset[]; transactions: Transaction[]; insurance: Insurance[]
  subscription: Subscription[]; education: Education[]; loan: Loan[]
  expenses: Expense[]; events: EventItem[]
}

const EMPTY: AppData = { assets: [], transactions: [], insurance: [], subscription: [], education: [], loan: [], expenses: [], events: [] }
const RATE_TYPES = ['예금/적금', '채권']

const BDG: Record<string, string> = {
  '생명보험':'b-blue','실손보험':'b-green','자동차보험':'b-amber','암보험':'b-red','연금보험':'b-purple','기타':'b-teal',
  'OTT/영상':'b-blue','음악':'b-purple','소프트웨어':'b-amber','클라우드':'b-blue','뉴스/정보':'b-teal',
  '어학':'b-green','자격증':'b-blue','대학원':'b-purple','자녀교육':'b-amber','온라인강의':'b-teal',
  '국내주식':'b-blue','해외주식':'b-purple','ETF':'b-green','펀드':'b-amber','예금/적금':'b-teal','채권':'b-green','암호화폐':'b-red',
  '관리비/공과금':'b-blue','월세/임대료':'b-amber','차량 유지비':'b-teal','의료비':'b-red','생활비 예산':'b-green','경조사비 예산':'b-pink','기타 정기지출':'b-purple',
  '결혼 축의금':'b-pink','장례 조의금':'b-purple','돌잔치':'b-blue','생일 선물':'b-amber','출산 선물':'b-green',
  '매수':'b-buy','매도':'b-sell',
}

function fmt(n: number) { return Math.round(n).toLocaleString('ko-KR') }
function fmtW(n: number) { return fmt(n) + '원' }
function today() { return new Date().toISOString().slice(0, 10) }
function daysSince(d: string) { return d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 999 }
function parseTags(s: string): Tags { return s ? s.split(',').map(t => t.trim()).filter(Boolean) : [] }

function Badge({ t }: { t: string }) {
  return <span className={`badge ${BDG[t] || 'b-blue'}`}>{t}</span>
}
function TagList({ tags }: { tags?: Tags }) {
  if (!tags?.length) return null
  return <>{tags.map(t => <span key={t} className="tag">{t}</span>)}</>
}

export default function Home() {
  const [tab, setTab] = useState('overview')
  const [data, setData] = useState<AppData>(EMPTY)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SK)
      if (raw) setData({ ...EMPTY, ...JSON.parse(raw) })
    } catch {}
    setLoaded(true)
  }, [])

  const save = useCallback((d: AppData) => {
    setData(d)
    try { localStorage.setItem(SK, JSON.stringify(d)) } catch {}
  }, [])

  if (!loaded) return <div className="app-wrap"><p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>불러오는 중...</p></div>

  const TABS = [
    { id: 'overview', label: '요약' }, { id: 'investment', label: '투자' },
    { id: 'insurance', label: '보험' }, { id: 'subscription', label: '구독' },
    { id: 'education', label: '교육' }, { id: 'loan', label: '대출' },
    { id: 'expenses', label: '생활비' }, { id: 'search', label: '검색' },
  ]

  return (
    <div className="app-wrap">
      <h1 className="app-title">우리집 재정관리💰</h1>
      <div className="tabs">
        {TABS.map(t => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab data={data} />}
      {tab === 'investment' && <InvestmentTab data={data} save={save} />}
      {tab === 'insurance' && <InsuranceTab data={data} save={save} />}
      {tab === 'subscription' && <SubscriptionTab data={data} save={save} />}
      {tab === 'education' && <EducationTab data={data} save={save} />}
      {tab === 'loan' && <LoanTab data={data} save={save} />}
      {tab === 'expenses' && <ExpensesTab data={data} save={save} />}
      {tab === 'search' && <SearchTab data={data} />}
    </div>
  )
}

function OverviewTab({ data }: { data: AppData }) {
  const insM = data.insurance.reduce((s, i) => s + i.amount, 0)
  const subM = data.subscription.reduce((s, i) => s + i.amount, 0)
  const eduM = data.education.reduce((s, i) => s + i.amount, 0)
  const loanM = data.loan.reduce((s, i) => s + i.monthly, 0)
  const expM = data.expenses.reduce((s, i) => s + i.amount, 0)
  const totalM = insM + subM + eduM + loanM + expM
  const totalDebt = data.loan.reduce((s, i) => s + i.balance, 0)
  const totalInv = data.assets.reduce((s, a) => s + a.value, 0)
  const txCost = data.transactions.filter(t => t.side === 'buy').reduce((s, t) => s + t.total, 0)
    - data.transactions.filter(t => t.side === 'sell').reduce((s, t) => s + t.total, 0)
  const pnl = totalInv - txCost

  const now = new Date()
  const months: string[] = []
  const mLabels: string[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    mLabels.push(`${d.getMonth() + 1}월`)
  }
  const trendVals = months.map(m => {
    const evAmt = data.events.filter(e => e.date?.startsWith(m)).reduce((s, e) => s + e.amount, 0)
    return totalM + evAmt
  })

  const invByType: Record<string, number> = {}
  data.assets.forEach(a => { invByType[a.itype] = (invByType[a.itype] || 0) + a.value })
  const invColors = ['#185fa5', '#3c3489', '#0f6e56', '#ba7517', '#1d9e75', '#888780', '#a32d2d']

  return (
    <>
      <div className="metric-grid">
        <div className="metric"><div className="metric-label">월 고정 지출</div><div className="metric-value">{Math.round(totalM / 10000)}만원</div><div className="metric-sub">5개 항목 합계</div></div>
        <div className="metric"><div className="metric-label">총 대출 잔액</div><div className="metric-value">{Math.round(totalDebt / 10000)}만원</div><div className="metric-sub">{data.loan.length}건</div></div>
        <div className="metric"><div className="metric-label">투자 평가액</div><div className="metric-value">{Math.round(totalInv / 10000)}만원</div><div className="metric-sub" style={{ color: pnl >= 0 ? '#0f6e56' : '#a32d2d' }}>{pnl >= 0 ? '+' : ''}{Math.round(pnl / 10000)}만원</div></div>
        <div className="metric"><div className="metric-label">구독 서비스</div><div className="metric-value">{data.subscription.length}개</div><div className="metric-sub">{Math.round(subM / 10000 * 10) / 10}만원/월</div></div>
      </div>
      <div className="chart-grid">
        <div className="card">
          <div className="card-header"><span className="card-title">월 지출 추이 (최근 6개월)</span></div>
          <div className="chart-wrap">
            <Bar data={{ labels: mLabels, datasets: [{ label: '월 지출', data: trendVals, backgroundColor: '#378add', borderRadius: 3, borderWidth: 0 }] }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' ' + fmtW(c.raw as number) } } }, scales: { x: { ticks: { autoSkip: false, font: { size: 10 } } }, y: { ticks: { font: { size: 10 }, callback: (v) => Math.round(+v / 10000) + '만' } } } }} />
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">투자 자산 배분</span></div>
          <div className="chart-wrap">
            {Object.keys(invByType).length > 0
              ? <Doughnut data={{ labels: Object.keys(invByType), datasets: [{ data: Object.values(invByType), backgroundColor: invColors.slice(0, Object.keys(invByType).length), borderWidth: 0 }] }}
                  options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 8, padding: 5 } }, tooltip: { callbacks: { label: (c) => ' ' + fmtW(c.raw as number) } } } }} />
              : <div className="empty">투자 종목을 추가하세요</div>}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-header"><span className="card-title">월 지출 구성</span></div>
        <div className="chart-wrap" style={{ height: 160 }}>
          <Doughnut data={{ labels: ['보험', '구독', '교육', '대출', '생활비'], datasets: [{ data: [insM, subM, eduM, loanM, expM], backgroundColor: ['#185fa5', '#3c3489', '#0f6e56', '#a32d2d', '#ba7517'], borderWidth: 0 }] }}
            options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { size: 10 }, boxWidth: 8, padding: 5 } }, tooltip: { callbacks: { label: (c) => ' ' + fmtW(c.raw as number) } } } }} />
        </div>
      </div>
    </>
  )
}

function FormBox({ id, open, children }: { id: string; open: boolean; children: ReactNode }) {
  if (!open) return null
  return <div className="form-box" id={id}>{children}</div>
}

function InvestmentTab({ data, save }: { data: AppData; save: (d: AppData) => void }) {
  const [showAssetForm, setShowAssetForm] = useState(false)
  const [showTxForm, setShowTxForm] = useState(false)
  const [assetForm, setAssetForm] = useState({ name: '', itype: '국내주식', value: '', note: '', tags: '', rate: '', maturity: '', interestType: '만기일시' })
  const [txForm, setTxForm] = useState({ assetId: '', side: 'buy', date: today(), qty: '', price: '', fee: '', memo: '' })
  const [fAsset, setFAsset] = useState('')
  const [fSide, setFSide] = useState('')
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')
  const isRate = RATE_TYPES.includes(assetForm.itype)

  const addAsset = () => {
    if (!assetForm.name.trim()) return
    const a: Asset = { id: Date.now(), name: assetForm.name.trim(), itype: assetForm.itype, value: +assetForm.value || 0, updatedAt: today(), note: assetForm.note, tags: parseTags(assetForm.tags), rate: isRate ? +assetForm.rate : null, maturity: isRate ? assetForm.maturity : '', interestType: isRate ? assetForm.interestType : '' }
    save({ ...data, assets: [...data.assets, a] })
    setAssetForm({ name: '', itype: '국내주식', value: '', note: '', tags: '', rate: '', maturity: '', interestType: '만기일시' })
    setShowAssetForm(false)
  }

  const addTx = () => {
    const qty = +txForm.qty, price = +txForm.price
    if (!txForm.assetId || !qty || !price) return
    const tx: Transaction = { id: Date.now(), assetId: +txForm.assetId, side: txForm.side as 'buy' | 'sell', date: txForm.date, qty, price, fee: +txForm.fee || 0, memo: txForm.memo, total: qty * price }
    const txs = [...data.transactions, tx].sort((a, b) => b.date.localeCompare(a.date))
    save({ ...data, transactions: txs })
    setTxForm({ assetId: '', side: 'buy', date: today(), qty: '', price: '', fee: '', memo: '' })
    setShowTxForm(false)
  }

  const updateValue = (id: number) => {
    const a = data.assets.find(x => x.id === id)
    if (!a) return
    const v = prompt(`${a.name} 현재 평가액 입력 (원)\n현재: ${fmt(a.value)}원`)
    if (v === null) return
    save({ ...data, assets: data.assets.map(x => x.id === id ? { ...x, value: +v.replace(/,/g, '') || x.value, updatedAt: today() } : x) })
  }

  const delAsset = (id: number) => save({ ...data, assets: data.assets.filter(a => a.id !== id) })
  const delTx = (id: number) => save({ ...data, transactions: data.transactions.filter(t => t.id !== id) })

  const aMap: Record<string, string> = Object.fromEntries(data.assets.map(a => [String(a.id), a.name]))
  const filteredTx = data.transactions.filter(t => {
    if (fAsset && t.assetId !== +fAsset) return false
    if (fSide && t.side !== fSide) return false
    if (fFrom && t.date < fFrom) return false
    if (fTo && t.date > fTo) return false
    return true
  })
  const buyTotal = filteredTx.filter(t => t.side === 'buy').reduce((s, t) => s + t.total, 0)
  const sellTotal = filteredTx.filter(t => t.side === 'sell').reduce((s, t) => s + t.total, 0)

  const exportCSV = () => {
    const rows = [['날짜', '구분', '종목', '수량', '단가', '총금액', '수수료', '메모'], ...data.transactions.map(t => [t.date, t.side === 'buy' ? '매수' : '매도', aMap[String(t.assetId)] || '', t.qty, t.price, t.total, t.fee || 0, t.memo || ''])]
    downloadCSV(`거래기록_${today()}.csv`, rows)
  }

  return (
    <>
      <div className="toolbar">
        <button className="add-btn" onClick={() => setShowAssetForm(v => !v)}>+ 종목 추가</button>
        <button className="add-btn" onClick={() => setShowTxForm(v => !v)}>+ 거래 추가</button>
        <button className="icon-btn" onClick={exportCSV}>↓ 거래 CSV</button>
      </div>

      <FormBox id="inv-f" open={showAssetForm}>
        <div className="form-grid g2">
          <div className="form-field"><label>종목/펀드명</label><input value={assetForm.name} onChange={e => setAssetForm(p => ({ ...p, name: e.target.value }))} placeholder="예: QQQ" /></div>
          <div className="form-field"><label>종류</label>
            <select value={assetForm.itype} onChange={e => setAssetForm(p => ({ ...p, itype: e.target.value }))}>
              {['국내주식','해외주식','ETF','펀드','예금/적금','채권','암호화폐','기타'].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
        </div>
        {isRate && (
          <div className="form-grid g3">
            <div className="form-field"><label>이율 (%)</label><input type="number" value={assetForm.rate} onChange={e => setAssetForm(p => ({ ...p, rate: e.target.value }))} placeholder="3.50" /></div>
            <div className="form-field"><label>만기일</label><input value={assetForm.maturity} onChange={e => setAssetForm(p => ({ ...p, maturity: e.target.value }))} placeholder="2027-06-30" /></div>
            <div className="form-field"><label>이자 방식</label>
              <select value={assetForm.interestType} onChange={e => setAssetForm(p => ({ ...p, interestType: e.target.value }))}>
                {['만기일시','월이자','분기','연이자'].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
        )}
        <div className="form-grid g2">
          <div className="form-field"><label>현재 평가액 (원)</label><input type="number" value={assetForm.value} onChange={e => setAssetForm(p => ({ ...p, value: e.target.value }))} placeholder="0" /></div>
          <div className="form-field"><label>태그 (쉼표 구분)</label><input value={assetForm.tags} onChange={e => setAssetForm(p => ({ ...p, tags: e.target.value }))} placeholder="예: 미국,성장주" /></div>
        </div>
        <div className="form-grid g1">
          <div className="form-field"><label>메모</label><input value={assetForm.note} onChange={e => setAssetForm(p => ({ ...p, note: e.target.value }))} placeholder="선택 사항" /></div>
        </div>
        <div className="form-actions">
          <button className="save-btn" onClick={addAsset}>저장</button>
          <button className="cancel-btn" onClick={() => setShowAssetForm(false)}>취소</button>
        </div>
      </FormBox>

      <FormBox id="tx-f" open={showTxForm}>
        <div className="form-grid g3">
          <div className="form-field"><label>종목</label>
            <select value={txForm.assetId} onChange={e => setTxForm(p => ({ ...p, assetId: e.target.value }))}>
              <option value="">선택</option>
              {data.assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="form-field"><label>구분</label>
            <select value={txForm.side} onChange={e => setTxForm(p => ({ ...p, side: e.target.value }))}>
              <option value="buy">매수</option><option value="sell">매도</option>
            </select>
          </div>
          <div className="form-field"><label>날짜</label><input type="date" value={txForm.date} onChange={e => setTxForm(p => ({ ...p, date: e.target.value }))} /></div>
        </div>
        <div className="form-grid g3">
          <div className="form-field"><label>수량/좌수</label><input type="number" value={txForm.qty} onChange={e => setTxForm(p => ({ ...p, qty: e.target.value }))} placeholder="0" /></div>
          <div className="form-field"><label>단가 (원)</label><input type="number" value={txForm.price} onChange={e => setTxForm(p => ({ ...p, price: e.target.value }))} placeholder="0" /></div>
          <div className="form-field"><label>수수료 (원)</label><input type="number" value={txForm.fee} onChange={e => setTxForm(p => ({ ...p, fee: e.target.value }))} placeholder="0" /></div>
        </div>
        <div className="form-grid g1">
          <div className="form-field"><label>메모</label><input value={txForm.memo} onChange={e => setTxForm(p => ({ ...p, memo: e.target.value }))} placeholder="예: 분할매수 1차" /></div>
        </div>
        <div className="form-actions">
          <button className="save-btn" onClick={addTx}>저장</button>
          <button className="cancel-btn" onClick={() => setShowTxForm(false)}>취소</button>
        </div>
      </FormBox>

      {data.assets.length === 0 && <div className="empty">등록된 종목이 없습니다</div>}
      {data.assets.map(a => {
        const txs = data.transactions.filter(t => t.assetId === a.id)
        const cost = txs.filter(t => t.side === 'buy').reduce((s, t) => s + t.total, 0) - txs.filter(t => t.side === 'sell').reduce((s, t) => s + t.total, 0)
        const pnl = a.value - cost
        const pct = cost ? ((pnl / cost) * 100).toFixed(1) : '—'
        const sign = pnl >= 0 ? '+' : ''
        const ds = daysSince(a.updatedAt)
        return (
          <div key={a.id} className="asset-card">
            <div className="asset-header">
              <div>
                <div className="asset-name">{a.name} <Badge t={a.itype} /></div>
                <div style={{ marginTop: 3 }}><TagList tags={a.tags} />{a.note && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{a.note}</span>}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={`upd-badge${ds > 30 ? ' stale' : ''}`}>{a.updatedAt ? `${ds}일 전` : '업데이트 필요'}</span>
                <button className="update-btn" onClick={() => updateValue(a.id)}>✎ 갱신</button>
                <button className="del-btn" onClick={() => delAsset(a.id)}>✕</button>
              </div>
            </div>
            <div className="asset-body">
              <div className="asset-stat">평가액<span>{fmtW(a.value)}</span></div>
              <div className="asset-stat">투자원금<span>{fmtW(cost)}</span></div>
              <div className="asset-stat">수익<span className={pnl >= 0 ? 'asset' : 'expense'}>{sign}{fmtW(pnl)} ({sign}{pct}%)</span></div>
              {a.rate != null && <div className="asset-stat">이율<span>{a.rate}%{a.interestType ? ' · ' + a.interestType : ''}</span></div>}
              {a.maturity && <div className="asset-stat">만기<span>{a.maturity}</span></div>}
            </div>
          </div>
        )
      })}

      <div className="card" style={{ marginTop: 4 }}>
        <div className="card-header"><span className="card-title">거래 기록</span></div>
        <div className="filter-bar">
          <select value={fAsset} onChange={e => setFAsset(e.target.value)} style={{ width: 100 }}>
            <option value="">전체 종목</option>
            {data.assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={fSide} onChange={e => setFSide(e.target.value)}>
            <option value="">매수+매도</option><option value="buy">매수</option><option value="sell">매도</option>
          </select>
          <input value={fFrom} onChange={e => setFFrom(e.target.value)} placeholder="시작 YYYY-MM-DD" style={{ width: 130 }} />
          <input value={fTo} onChange={e => setFTo(e.target.value)} placeholder="종료 YYYY-MM-DD" style={{ width: 130 }} />
        </div>
        <div className="tx-head"><span>날짜</span><span>구분</span><span>종목</span><span>수량×단가</span><span>금액/메모</span><span></span></div>
        {filteredTx.length === 0
          ? <div className="empty">거래 기록이 없습니다</div>
          : filteredTx.map(t => (
            <div key={t.id} className="tx-row">
              <span style={{ color: 'var(--text-secondary)' }}>{t.date || '—'}</span>
              <span><Badge t={t.side === 'buy' ? '매수' : '매도'} /></span>
              <span style={{ fontWeight: 500 }}>{aMap[String(t.assetId)] || '삭제됨'}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{(+t.qty).toFixed(3).replace(/0+$/, '')}×{fmt(t.price)}</span>
              <span><span style={{ fontWeight: 500 }}>{fmtW(t.total)}</span>{t.memo && <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}> · {t.memo}</span>}</span>
              <button className="del-btn" style={{ opacity: 1 }} onClick={() => delTx(t.id)}>✕</button>
            </div>
          ))}
        {filteredTx.length > 0 && <div className="tx-sum">총 {filteredTx.length}건 · 매수 {fmtW(buyTotal)} · 매도 {fmtW(sellTotal)}</div>}
      </div>
    </>
  )
}

interface SimpleItem { id: number; name: string; amount: number; tags?: Tags }

function SimpleTab({
  items, onDelete, formContent, csvFn, renderMeta
}: {
  items: SimpleItem[]
  onDelete: (id: number) => void
  formContent: (open: boolean, setOpen: (v: boolean) => void) => ReactNode
  csvFn: () => void
  renderMeta: (item: SimpleItem) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="toolbar">
        <button className="add-btn" onClick={() => setOpen(v => !v)}>+ 추가</button>
        <button className="icon-btn" onClick={csvFn}>↓ CSV</button>
      </div>
      {formContent(open, setOpen)}
      <div className="card">
        {items.length === 0
          ? <div className="empty">등록된 항목이 없습니다</div>
          : <>
              {items.map(i => (
                <div key={i.id} className="row">
                  <div>{renderMeta(i)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="row-amount expense">{fmtW(i.amount)}/월</span>
                    <button className="del-btn" onClick={() => onDelete(i.id)}>✕</button>
                  </div>
                </div>
              ))}
              <div className="total-row"><span>월 합계</span><span style={{ fontWeight: 500 }}>{fmtW(items.reduce((s, i) => s + i.amount, 0))}</span></div>
            </>}
      </div>
    </>
  )
}

function InsuranceTab({ data, save }: { data: AppData; save: (d: AppData) => void }) {
  const [f, setF] = useState({ name: '', company: '', itype: '생명보험', amount: '', expire: '', tags: '' })
  const add = (setOpen: (v: boolean) => void) => {
    save({ ...data, insurance: [...data.insurance, { id: Date.now(), name: f.name || '미입력', company: f.company, itype: f.itype, amount: +f.amount || 0, expire: f.expire, tags: parseTags(f.tags) }] })
    setF({ name: '', company: '', itype: '생명보험', amount: '', expire: '', tags: '' }); setOpen(false)
  }
  return (
    <SimpleTab
      items={data.insurance}
      onDelete={id => save({ ...data, insurance: data.insurance.filter(i => i.id !== id) })}
      csvFn={() => downloadCSV(`보험_${today()}.csv`, [['보험명','보험사','종류','월보험료','만기','태그'], ...data.insurance.map(i => [i.name, i.company, i.itype, i.amount, i.expire, (i.tags||[]).join(';')])])}
      renderMeta={item => {
        const ins = data.insurance.find(i => i.id === item.id)
        if (!ins) return null
        return <><div className="row-name">{ins.name} <Badge t={ins.itype} /></div><div className="row-meta">{ins.company}{ins.expire ? ' · 만기 ' + ins.expire : ''} <TagList tags={ins.tags} /></div></>
      }}
      formContent={(open, setOpen) => (
        <FormBox id="ins-f" open={open}>
          <div className="form-grid g2">
            <div className="form-field"><label>보험명</label><input value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} placeholder="예: 실손의료보험" /></div>
            <div className="form-field"><label>보험사</label><input value={f.company} onChange={e => setF(p => ({ ...p, company: e.target.value }))} placeholder="예: 삼성생명" /></div>
          </div>
          <div className="form-grid g3">
            <div className="form-field"><label>종류</label><select value={f.itype} onChange={e => setF(p => ({ ...p, itype: e.target.value }))}>{['생명보험','실손보험','자동차보험','암보험','연금보험','기타'].map(o => <option key={o}>{o}</option>)}</select></div>
            <div className="form-field"><label>월 보험료 (원)</label><input type="number" value={f.amount} onChange={e => setF(p => ({ ...p, amount: e.target.value }))} placeholder="0" /></div>
            <div className="form-field"><label>만기</label><input value={f.expire} onChange={e => setF(p => ({ ...p, expire: e.target.value }))} placeholder="2040-06" /></div>
          </div>
          <div className="form-grid g1"><div className="form-field"><label>태그</label><input value={f.tags} onChange={e => setF(p => ({ ...p, tags: e.target.value }))} placeholder="예: 가족,암" /></div></div>
          <div className="form-actions"><button className="save-btn" onClick={() => add(setOpen)}>저장</button><button className="cancel-btn" onClick={() => setOpen(false)}>취소</button></div>
        </FormBox>
      )} />
  )
}

function SubscriptionTab({ data, save }: { data: AppData; save: (d: AppData) => void }) {
  const [f, setF] = useState({ name: '', stype: 'OTT/영상', amount: '', next: '', tags: '' })
  const add = (setOpen: (v: boolean) => void) => {
    save({ ...data, subscription: [...data.subscription, { id: Date.now(), name: f.name || '미입력', stype: f.stype, amount: +f.amount || 0, next: f.next, tags: parseTags(f.tags) }] })
    setF({ name: '', stype: 'OTT/영상', amount: '', next: '', tags: '' }); setOpen(false)
  }
  return (
    <SimpleTab
      items={data.subscription}
      onDelete={id => save({ ...data, subscription: data.subscription.filter(i => i.id !== id) })}
      csvFn={() => downloadCSV(`구독_${today()}.csv`, [['서비스명','카테고리','월구독료','다음결제일','태그'], ...data.subscription.map(i => [i.name, i.stype, i.amount, i.next, (i.tags||[]).join(';')])])}
      renderMeta={item => {
        const sub = data.subscription.find(i => i.id === item.id)
        if (!sub) return null
        return <><div className="row-name">{sub.name} <Badge t={sub.stype} /></div><div className="row-meta">{sub.next ? '다음 결제 ' + sub.next : ''} <TagList tags={sub.tags} /></div></>
      }}
      formContent={(open, setOpen) => (
        <FormBox id="sub-f" open={open}>
          <div className="form-grid g2">
            <div className="form-field"><label>서비스명</label><input value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} placeholder="예: Netflix" /></div>
            <div className="form-field"><label>카테고리</label><select value={f.stype} onChange={e => setF(p => ({ ...p, stype: e.target.value }))}>{['OTT/영상','음악','소프트웨어','클라우드','뉴스/정보','기타'].map(o => <option key={o}>{o}</option>)}</select></div>
          </div>
          <div className="form-grid g2">
            <div className="form-field"><label>월 구독료 (원)</label><input type="number" value={f.amount} onChange={e => setF(p => ({ ...p, amount: e.target.value }))} placeholder="0" /></div>
            <div className="form-field"><label>다음 결제일</label><input value={f.next} onChange={e => setF(p => ({ ...p, next: e.target.value }))} placeholder="2025-07-15" /></div>
          </div>
          <div className="form-grid g1"><div className="form-field"><label>태그</label><input value={f.tags} onChange={e => setF(p => ({ ...p, tags: e.target.value }))} placeholder="예: 엔터,가족공유" /></div></div>
          <div className="form-actions"><button className="save-btn" onClick={() => add(setOpen)}>저장</button><button className="cancel-btn" onClick={() => setOpen(false)}>취소</button></div>
        </FormBox>
      )} />
  )
}

function EducationTab({ data, save }: { data: AppData; save: (d: AppData) => void }) {
  const [f, setF] = useState({ name: '', etype: '어학', amount: '', period: '', tags: '' })
  const add = (setOpen: (v: boolean) => void) => {
    save({ ...data, education: [...data.education, { id: Date.now(), name: f.name || '미입력', etype: f.etype, amount: +f.amount || 0, period: f.period, tags: parseTags(f.tags) }] })
    setF({ name: '', etype: '어학', amount: '', period: '', tags: '' }); setOpen(false)
  }
  return (
    <SimpleTab
      items={data.education}
      onDelete={id => save({ ...data, education: data.education.filter(i => i.id !== id) })}
      csvFn={() => downloadCSV(`교육비_${today()}.csv`, [['과정명','카테고리','월비용','수강기간','태그'], ...data.education.map(i => [i.name, i.etype, i.amount, i.period, (i.tags||[]).join(';')])])}
      renderMeta={item => {
        const edu = data.education.find(i => i.id === item.id)
        if (!edu) return null
        return <><div className="row-name">{edu.name} <Badge t={edu.etype} /></div><div className="row-meta">{edu.period || ''} <TagList tags={edu.tags} /></div></>
      }}
      formContent={(open, setOpen) => (
        <FormBox id="edu-f" open={open}>
          <div className="form-grid g2">
            <div className="form-field"><label>과정/기관명</label><input value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} placeholder="예: 영어회화 학원" /></div>
            <div className="form-field"><label>카테고리</label><select value={f.etype} onChange={e => setF(p => ({ ...p, etype: e.target.value }))}>{['어학','자격증','대학원','자녀교육','온라인강의','기타'].map(o => <option key={o}>{o}</option>)}</select></div>
          </div>
          <div className="form-grid g2">
            <div className="form-field"><label>월 비용 (원)</label><input type="number" value={f.amount} onChange={e => setF(p => ({ ...p, amount: e.target.value }))} placeholder="0" /></div>
            <div className="form-field"><label>수강 기간</label><input value={f.period} onChange={e => setF(p => ({ ...p, period: e.target.value }))} placeholder="2025-06 ~ 2025-12" /></div>
          </div>
          <div className="form-grid g1"><div className="form-field"><label>태그</label><input value={f.tags} onChange={e => setF(p => ({ ...p, tags: e.target.value }))} placeholder="예: 본인,자격증" /></div></div>
          <div className="form-actions"><button className="save-btn" onClick={() => add(setOpen)}>저장</button><button className="cancel-btn" onClick={() => setOpen(false)}>취소</button></div>
        </FormBox>
      )} />
  )
}

function LoanTab({ data, save }: { data: AppData; save: (d: AppData) => void }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ name: '', bank: '', balance: '', rate: '', monthly: '', expire: '', tags: '' })
  const add = () => {
    save({ ...data, loan: [...data.loan, { id: Date.now(), name: f.name || '미입력', bank: f.bank, balance: +f.balance || 0, rate: +f.rate || 0, monthly: +f.monthly || 0, expire: f.expire, tags: parseTags(f.tags) }] })
    setF({ name: '', bank: '', balance: '', rate: '', monthly: '', expire: '', tags: '' }); setOpen(false)
  }
  const del = (id: number) => save({ ...data, loan: data.loan.filter(i => i.id !== id) })
  return (
    <>
      <div className="toolbar">
        <button className="add-btn" onClick={() => setOpen(v => !v)}>+ 추가</button>
        <button className="icon-btn" onClick={() => downloadCSV(`대출_${today()}.csv`, [['대출명','은행','잔여원금','금리','월상환액','만기','태그'], ...data.loan.map(i => [i.name, i.bank, i.balance, i.rate, i.monthly, i.expire, (i.tags||[]).join(';')])])}>↓ CSV</button>
      </div>
      <FormBox id="loan-f" open={open}>
        <div className="form-grid g2">
          <div className="form-field"><label>대출명</label><input value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} placeholder="예: 주택담보대출" /></div>
          <div className="form-field"><label>은행/기관</label><input value={f.bank} onChange={e => setF(p => ({ ...p, bank: e.target.value }))} placeholder="예: 국민은행" /></div>
        </div>
        <div className="form-grid g3">
          <div className="form-field"><label>잔여 원금 (원)</label><input type="number" value={f.balance} onChange={e => setF(p => ({ ...p, balance: e.target.value }))} placeholder="0" /></div>
          <div className="form-field"><label>금리 (%)</label><input type="number" value={f.rate} onChange={e => setF(p => ({ ...p, rate: e.target.value }))} placeholder="3.5" /></div>
          <div className="form-field"><label>월 상환액 (원)</label><input type="number" value={f.monthly} onChange={e => setF(p => ({ ...p, monthly: e.target.value }))} placeholder="0" /></div>
        </div>
        <div className="form-grid g2">
          <div className="form-field"><label>만기일</label><input value={f.expire} onChange={e => setF(p => ({ ...p, expire: e.target.value }))} placeholder="2040-06" /></div>
          <div className="form-field"><label>태그</label><input value={f.tags} onChange={e => setF(p => ({ ...p, tags: e.target.value }))} placeholder="예: 주택,변동금리" /></div>
        </div>
        <div className="form-actions"><button className="save-btn" onClick={add}>저장</button><button className="cancel-btn" onClick={() => setOpen(false)}>취소</button></div>
      </FormBox>
      <div className="card">
        {data.loan.length === 0
          ? <div className="empty">등록된 대출이 없습니다</div>
          : data.loan.map(i => (
            <div key={i.id} className="row">
              <div><div className="row-name">{i.name}</div><div className="row-meta">{i.bank}{i.rate ? ' · ' + i.rate + '%' : ''}{i.expire ? ' · 만기 ' + i.expire : ''} <TagList tags={i.tags} /></div></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div><div className="row-amount expense">{fmtW(i.monthly)}/월</div><div className="row-meta" style={{ textAlign: 'right' }}>잔여 {fmtW(i.balance)}</div></div>
                <button className="del-btn" onClick={() => del(i.id)}>✕</button>
              </div>
            </div>
          ))}
      </div>
    </>
  )
}

function ExpensesTab({ data, save }: { data: AppData; save: (d: AppData) => void }) {
  const [openExp, setOpenExp] = useState(false)
  const [openEv, setOpenEv] = useState(false)
  const [ef, setEf] = useState({ name: '', etype: '관리비/공과금', amount: '', day: '', tags: '' })
  const [evf, setEvf] = useState({ date: today(), kind: '결혼 축의금', rel: '가족', name: '', amount: '', memo: '' })
  const [evYear, setEvYear] = useState(String(new Date().getFullYear()))

  const addExp = () => {
    save({ ...data, expenses: [...data.expenses, { id: Date.now(), name: ef.name || '미입력', etype: ef.etype, amount: +ef.amount || 0, day: ef.day, tags: parseTags(ef.tags) }] })
    setEf({ name: '', etype: '관리비/공과금', amount: '', day: '', tags: '' }); setOpenExp(false)
  }
  const addEv = () => {
    const evs = [...data.events, { id: Date.now(), date: evf.date, kind: evf.kind, rel: evf.rel, name: evf.name || '미입력', amount: +evf.amount || 0, memo: evf.memo }].sort((a, b) => b.date.localeCompare(a.date))
    save({ ...data, events: evs })
    setEvf({ date: today(), kind: '결혼 축의금', rel: '가족', name: '', amount: '', memo: '' }); setOpenEv(false)
  }
  const delExp = (id: number) => save({ ...data, expenses: data.expenses.filter(i => i.id !== id) })
  const delEv = (id: number) => save({ ...data, events: data.events.filter(i => i.id !== id) })

  const years = [...new Set([...data.events.map(e => e.date?.slice(0, 4)).filter(Boolean), String(new Date().getFullYear()), String(new Date().getFullYear() - 1)])].sort((a, b) => +b - +a)
  const filteredEvs = data.events.filter(e => e.date?.startsWith(evYear))
  const evTotal = filteredEvs.reduce((s, e) => s + e.amount, 0)
  const budgetM = (data.expenses.find(i => i.etype === '경조사비 예산') || { amount: 0 }).amount
  const budgetY = budgetM * 12

  return (
    <>
      <div className="toolbar">
        <button className="add-btn" onClick={() => setOpenExp(v => !v)}>+ 고정 지출 추가</button>
        <button className="add-btn" onClick={() => setOpenEv(v => !v)}>+ 경조사비 추가</button>
        <button className="icon-btn" onClick={() => downloadCSV(`생활비_${today()}.csv`, [['항목명','카테고리','월금액','결제일','태그'], ...data.expenses.map(i => [i.name, i.etype, i.amount, i.day, (i.tags||[]).join(';')])])}>↓ CSV</button>
      </div>

      <FormBox id="exp-f" open={openExp}>
        <div className="form-grid g2">
          <div className="form-field"><label>항목명</label><input value={ef.name} onChange={e => setEf(p => ({ ...p, name: e.target.value }))} placeholder="예: 아파트 관리비" /></div>
          <div className="form-field"><label>카테고리</label><select value={ef.etype} onChange={e => setEf(p => ({ ...p, etype: e.target.value }))}>{['관리비/공과금','월세/임대료','차량 유지비','의료비','생활비 예산','경조사비 예산','기타 정기지출'].map(o => <option key={o}>{o}</option>)}</select></div>
        </div>
        <div className="form-grid g3">
          <div className="form-field"><label>월 금액 (원)</label><input type="number" value={ef.amount} onChange={e => setEf(p => ({ ...p, amount: e.target.value }))} placeholder="0" /></div>
          <div className="form-field"><label>결제일</label><input value={ef.day} onChange={e => setEf(p => ({ ...p, day: e.target.value }))} placeholder="매월 25일" /></div>
          <div className="form-field"><label>태그</label><input value={ef.tags} onChange={e => setEf(p => ({ ...p, tags: e.target.value }))} placeholder="예: 아파트" /></div>
        </div>
        <div className="form-actions"><button className="save-btn" onClick={addExp}>저장</button><button className="cancel-btn" onClick={() => setOpenExp(false)}>취소</button></div>
      </FormBox>

      <FormBox id="ev-f" open={openEv}>
        <div className="form-grid g3">
          <div className="form-field"><label>날짜</label><input type="date" value={evf.date} onChange={e => setEvf(p => ({ ...p, date: e.target.value }))} /></div>
          <div className="form-field"><label>종류</label><select value={evf.kind} onChange={e => setEvf(p => ({ ...p, kind: e.target.value }))}>{['결혼 축의금','장례 조의금','돌잔치','생일 선물','출산 선물','기타'].map(o => <option key={o}>{o}</option>)}</select></div>
          <div className="form-field"><label>관계</label><select value={evf.rel} onChange={e => setEvf(p => ({ ...p, rel: e.target.value }))}>{['가족','친척','친구','직장 동료','지인','기타'].map(o => <option key={o}>{o}</option>)}</select></div>
        </div>
        <div className="form-grid g3">
          <div className="form-field"><label>대상자 이름</label><input value={evf.name} onChange={e => setEvf(p => ({ ...p, name: e.target.value }))} placeholder="예: 홍길동" /></div>
          <div className="form-field"><label>금액 (원)</label><input type="number" value={evf.amount} onChange={e => setEvf(p => ({ ...p, amount: e.target.value }))} placeholder="0" /></div>
          <div className="form-field"><label>메모</label><input value={evf.memo} onChange={e => setEvf(p => ({ ...p, memo: e.target.value }))} placeholder="예: 대학교 친구" /></div>
        </div>
        <div className="form-actions"><button className="save-btn" onClick={addEv}>저장</button><button className="cancel-btn" onClick={() => setOpenEv(false)}>취소</button></div>
      </FormBox>

      <div className="card">
        <div className="divider-label">고정 지출</div>
        {data.expenses.length === 0
          ? <div className="empty">등록된 항목이 없습니다</div>
          : <>
              {data.expenses.map(i => (
                <div key={i.id} className="row">
                  <div><div className="row-name">{i.name} <Badge t={i.etype} /></div><div className="row-meta">{i.day} <TagList tags={i.tags} /></div></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="row-amount expense">{fmtW(i.amount)}/월</span>
                    <button className="del-btn" onClick={() => delExp(i.id)}>✕</button>
                  </div>
                </div>
              ))}
              <div className="total-row"><span>월 합계</span><span style={{ fontWeight: 500 }}>{fmtW(data.expenses.reduce((s, i) => s + i.amount, 0))}</span></div>
            </>}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">경조사비 기록</span>
          <select value={evYear} onChange={e => setEvYear(e.target.value)} style={{ width: 'auto', fontSize: 12, padding: '3px 7px' }}>
            {years.map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
        </div>
        <div className="metric-grid">
          <div className="metric"><div className="metric-label">{evYear}년 총액</div><div className="metric-value">{Math.round(evTotal / 10000)}만원</div><div className="metric-sub">{filteredEvs.length}건</div></div>
          <div className="metric"><div className="metric-label">연간 예산</div><div className="metric-value" style={{ color: budgetY ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{budgetY ? Math.round(budgetY / 10000) + '만원' : '미설정'}</div><div className="metric-sub" style={{ color: budgetY && evTotal > budgetY ? '#a32d2d' : 'var(--text-tertiary)' }}>{budgetY ? Math.round(evTotal / budgetY * 100) + '% 사용' : ''}</div></div>
          <div className="metric"><div className="metric-label">건당 평균</div><div className="metric-value">{filteredEvs.length ? Math.round(evTotal / filteredEvs.length / 10000) + '만원' : '—'}</div><div className="metric-sub"> </div></div>
        </div>
        <div className="ev-head"><span>날짜</span><span>대상자/메모</span><span>종류</span><span style={{ textAlign: 'right' }}>금액</span><span></span></div>
        {filteredEvs.length === 0
          ? <div className="empty">기록이 없습니다</div>
          : filteredEvs.map(e => (
            <div key={e.id} className="ev-row">
              <span style={{ color: 'var(--text-secondary)' }}>{e.date || '—'}</span>
              <span><span style={{ fontWeight: 500 }}>{e.name}</span>{e.memo && <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}> · {e.memo}</span>}<span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}> · {e.rel}</span></span>
              <span><Badge t={e.kind} /></span>
              <span style={{ fontWeight: 500, textAlign: 'right', color: '#a32d2d' }}>{fmtW(e.amount)}</span>
              <button className="del-btn" style={{ opacity: 1 }} onClick={() => delEv(e.id)}>✕</button>
            </div>
          ))}
      </div>
    </>
  )
}

function SearchTab({ data }: { data: AppData }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')

  const aMap: Record<string, string> = Object.fromEntries(data.assets.map(a => [String(a.id), a.name]))

  const hl = (str: string): ReactNode => {
    if (!q) return str
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    const parts = str.split(re)
    return <>{parts.map((p, i) => re.test(p) ? <span key={i} className="highlight">{p}</span> : p)}</>
  }

  type Result = { type: string; label: string; detail: string; name: string; tags?: Tags }
  const results: Result[] = []
  const qL = q.toLowerCase()

  if (q) {
    const check = (text: string) => text.toLowerCase().includes(qL)
    const typeLabel: Record<string, string> = { assets: '투자종목', transactions: '거래', insurance: '보험', subscription: '구독', education: '교육', loan: '대출', expenses: '생활비', events: '경조사비' }

    if (!cat || cat === 'assets') data.assets.filter(a => check(`${a.name} ${a.itype} ${(a.tags || []).join(' ')} ${a.note || ''}`)).forEach(a => results.push({ type: 'assets', label: typeLabel.assets, name: a.name, detail: `평가액 ${fmtW(a.value)}`, tags: a.tags }))
    if (!cat || cat === 'transactions') data.transactions.filter(t => check(`${aMap[String(t.assetId)] || ''} ${t.memo || ''} ${t.date || ''}`)).forEach(t => results.push({ type: 'transactions', label: typeLabel.transactions, name: t.memo || aMap[String(t.assetId)] || '거래', detail: `${aMap[String(t.assetId)] || '?'} ${t.side === 'buy' ? '매수' : '매도'} ${fmtW(t.total)} · ${t.date || ''}` }))
    if (!cat || cat === 'insurance') data.insurance.filter(i => check(`${i.name} ${i.company || ''} ${i.itype} ${(i.tags || []).join(' ')}`)).forEach(i => results.push({ type: 'insurance', label: typeLabel.insurance, name: i.name, detail: `${fmtW(i.amount)}/월 · ${i.company || ''}`, tags: i.tags }))
    if (!cat || cat === 'subscription') data.subscription.filter(i => check(`${i.name} ${i.stype} ${(i.tags || []).join(' ')}`)).forEach(i => results.push({ type: 'subscription', label: typeLabel.subscription, name: i.name, detail: `${fmtW(i.amount)}/월`, tags: i.tags }))
    if (!cat || cat === 'education') data.education.filter(i => check(`${i.name} ${i.etype} ${(i.tags || []).join(' ')}`)).forEach(i => results.push({ type: 'education', label: typeLabel.education, name: i.name, detail: `${fmtW(i.amount)}/월 · ${i.period || ''}`, tags: i.tags }))
    if (!cat || cat === 'loan') data.loan.filter(i => check(`${i.name} ${i.bank || ''} ${(i.tags || []).join(' ')}`)).forEach(i => results.push({ type: 'loan', label: typeLabel.loan, name: i.name, detail: `잔여 ${fmtW(i.balance)} · ${i.rate}%`, tags: i.tags }))
    if (!cat || cat === 'expenses') data.expenses.filter(i => check(`${i.name} ${i.etype} ${(i.tags || []).join(' ')}`)).forEach(i => results.push({ type: 'expenses', label: typeLabel.expenses, name: i.name, detail: `${fmtW(i.amount)}/월`, tags: i.tags }))
    if (!cat || cat === 'events') data.events.filter(e => check(`${e.name} ${e.kind} ${e.rel} ${e.memo || ''}`)).forEach(e => results.push({ type: 'events', label: typeLabel.events, name: e.name, detail: `${fmtW(e.amount)} · ${e.date || ''} · ${e.rel}` }))
  }

  return (
    <div className="card">
      <div className="filter-bar" style={{ marginBottom: 12 }}>
        <div className="search-wrap">
          <span className="search-icon">🔍</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="이름, 메모, 태그 검색..." style={{ width: '100%' }} />
        </div>
        <select value={cat} onChange={e => setCat(e.target.value)} style={{ width: 110 }}>
          <option value="">전체 항목</option>
          {[['assets','투자종목'],['transactions','거래'],['insurance','보험'],['subscription','구독'],['education','교육'],['loan','대출'],['expenses','생활비'],['events','경조사비']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {!q
        ? <div className="empty">검색어를 입력하세요</div>
        : results.length === 0
          ? <div className="empty">검색 결과가 없습니다</div>
          : results.map((r, i) => (
            <div key={i} className="row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span className="search-cat-badge">{r.label}</span>
                  <span className="row-name">{hl(r.name)}</span>
                  {r.tags?.map(t => <span key={t} className="tag">{hl(t)}</span>)}
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.detail}</span>
              </div>
            </div>
          ))}
    </div>
  )
}

function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(v => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}
