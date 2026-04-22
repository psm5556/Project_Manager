import { useState, useRef, useEffect } from 'react'
import { Calendar } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  value: string          // "YYYY-MM-DD" or ""
  onChange: (v: string) => void
  minDate?: string
  maxDate?: string
  className?: string
  inputCls?: string      // class applied to each segment input
  iconSize?: number
  disabled?: boolean
  autoFocus?: boolean
}

function parse(v: string): [string, string, string] {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? [m[1], m[2], m[3]] : ['', '', '']
}

export function SmartDateInput({
  value, onChange, minDate, maxDate,
  className, inputCls = '', iconSize = 13, disabled, autoFocus,
}: Props) {
  const init = parse(value)
  const [y,  setY]  = useState(init[0])
  const [mo, setMo] = useState(init[1])
  const [d,  setD]  = useState(init[2])

  const yRef   = useRef<HTMLInputElement>(null)
  const mRef   = useRef<HTMLInputElement>(null)
  const dRef   = useRef<HTMLInputElement>(null)
  const calRef = useRef<HTMLInputElement>(null)

  // Track what we last emitted so parent-driven updates still sync
  const lastEmitted = useRef(value)

  useEffect(() => {
    if (value !== lastEmitted.current) {
      const p = parse(value)
      setY(p[0]); setMo(p[1]); setD(p[2])
      lastEmitted.current = value
    }
  }, [value])

  const tryEmit = (ny: string, nm: string, nd: string) => {
    if (!ny && !nm && !nd) {
      lastEmitted.current = ''
      onChange('')
      return
    }
    if (ny.length === 4 && nm.length === 2 && nd.length === 2) {
      const date = new Date(`${ny}-${nm}-${nd}`)
      if (isNaN(date.getTime())) {
        toast.error('유효하지 않은 날짜입니다')
        return
      }
      const v = `${ny}-${nm}-${nd}`
      lastEmitted.current = v
      onChange(v)
    }
  }

  const handleY = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 4)
    setY(v)
    if (v.length === 4) {
      const yr = parseInt(v)
      if (yr < 1999 || yr > 9999) {
        toast.error('년도는 1999~9999 사이여야 합니다')
        return
      }
      mRef.current?.focus()
      tryEmit(v, mo, d)
    } else if (!v && !mo && !d) {
      lastEmitted.current = ''
      onChange('')
    }
  }

  const handleYPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const raw = e.clipboardData.getData('text').replace(/\D/g, '')
    if (raw.length >= 8) {
      e.preventDefault()
      const ny = raw.slice(0, 4); const nm = raw.slice(4, 6); const nd = raw.slice(6, 8)
      setY(ny); setMo(nm); setD(nd)
      tryEmit(ny, nm, nd)
    }
  }

  const handleMo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 2)
    setMo(v)
    if (v.length === 2) {
      const n = parseInt(v)
      if (n < 1 || n > 12) { toast.error('월은 01~12 사이여야 합니다'); return }
      dRef.current?.focus()
      tryEmit(y, v, d)
    }
  }

  const handleMoKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !mo) yRef.current?.focus()
  }

  const handleD = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 2)
    setD(v)
    if (v.length === 2) {
      const n = parseInt(v)
      if (n < 1 || n > 31) { toast.error('일은 01~31 사이여야 합니다'); return }
      tryEmit(y, mo, v)
    }
  }

  const handleDKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !d) mRef.current?.focus()
  }

  const handleCal = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    if (!v) { setY(''); setMo(''); setD(''); lastEmitted.current = ''; onChange(''); return }
    const p = parse(v)
    setY(p[0]); setMo(p[1]); setD(p[2])
    lastEmitted.current = v
    onChange(v)
  }

  const openPicker = () => {
    try { (calRef.current as any)?.showPicker() } catch { calRef.current?.click() }
  }

  const seg = `bg-transparent border-none outline-none text-center p-0 ${inputCls}`

  return (
    <div className={`flex items-center ${className ?? ''}`}>
      <input ref={yRef} autoFocus={autoFocus} disabled={disabled}
        className={`${seg} w-[3.4ch]`} placeholder="YYYY"
        value={y} onChange={handleY} onPaste={handleYPaste} inputMode="numeric" />
      <span className="text-slate-400 select-none">-</span>
      <input ref={mRef} disabled={disabled}
        className={`${seg} w-[2.4ch]`} placeholder="MM"
        value={mo} onChange={handleMo} onKeyDown={handleMoKey} inputMode="numeric" />
      <span className="text-slate-400 select-none">-</span>
      <input ref={dRef} disabled={disabled}
        className={`${seg} w-[2.4ch]`} placeholder="DD"
        value={d} onChange={handleD} onKeyDown={handleDKey} inputMode="numeric" />
      <div className="relative ml-1 flex-shrink-0">
        <button type="button" tabIndex={-1} onClick={openPicker}
          className="text-slate-400 hover:text-brand-500 transition-colors flex items-center">
          <Calendar size={iconSize} />
        </button>
        <input ref={calRef} type="date" tabIndex={-1}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0, top: 0, left: 0 }}
          value={value || ''} min={minDate} max={maxDate}
          onChange={handleCal} />
      </div>
    </div>
  )
}
