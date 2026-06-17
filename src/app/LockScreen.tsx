'use client'

import { useState, useEffect, useRef } from 'react'

export function SetupLock({ onSet }: { onSet: (pw: string) => void }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    if (pw.length < 4) { setError('비밀번호는 4자 이상이어야 합니다'); return }
    if (pw !== pw2) { setError('비밀번호가 일치하지 않습니다'); return }
    onSet(pw)
  }

  return (
    <div className="lock-wrap">
      <div className="lock-card">
        <div className="lock-icon">🔒</div>
        <h1 className="lock-title">비밀번호 설정</h1>
        <p className="lock-desc">공용 기기에서도 안전하게 사용할 수 있도록<br />앱 잠금 비밀번호를 설정하세요.</p>
        <input
          type="password"
          value={pw}
          onChange={e => { setPw(e.target.value); setError('') }}
          placeholder="비밀번호 입력 (4자 이상)"
          className="lock-input"
          autoFocus
        />
        <input
          type="password"
          value={pw2}
          onChange={e => { setPw2(e.target.value); setError('') }}
          placeholder="비밀번호 확인"
          className="lock-input"
          onKeyDown={e => e.key === 'Enter' && submit()}
        />
        {error && <div className="lock-error">{error}</div>}
        <button className="lock-btn" onClick={submit}>설정 완료</button>
        <p className="lock-note">⚠️ 비밀번호를 잊으면 데이터를 복구할 수 없습니다.</p>
      </div>
    </div>
  )
}

export function Unlock({ onUnlock, onForgot }: { onUnlock: (pw: string) => Promise<boolean>; onForgot: () => void }) {
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const submit = async () => {
    if (!pw) return
    setChecking(true)
    const ok = await onUnlock(pw)
    setChecking(false)
    if (!ok) { setError('비밀번호가 올바르지 않습니다'); setPw('') }
  }

  return (
    <div className="lock-wrap">
      <div className="lock-card">
        <div className="lock-icon">🔒</div>
        <h1 className="lock-title">잠금 해제</h1>
        <p className="lock-desc">비밀번호를 입력하세요</p>
        <input
          ref={inputRef}
          type="password"
          value={pw}
          onChange={e => { setPw(e.target.value); setError('') }}
          placeholder="비밀번호"
          className="lock-input"
          onKeyDown={e => e.key === 'Enter' && submit()}
        />
        {error && <div className="lock-error">{error}</div>}
        <button className="lock-btn" onClick={submit} disabled={checking}>
          {checking ? '확인 중...' : '잠금 해제'}
        </button>

        {!confirmReset ? (
          <button className="lock-link" onClick={() => setConfirmReset(true)}>비밀번호를 잊으셨나요?</button>
        ) : (
          <div className="lock-reset-confirm">
            <p>비밀번호를 재설정하면<br /><b>기존 데이터가 모두 삭제</b>됩니다.</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="lock-btn-danger" onClick={onForgot}>모두 삭제하고 재설정</button>
              <button className="lock-link" onClick={() => setConfirmReset(false)}>취소</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
