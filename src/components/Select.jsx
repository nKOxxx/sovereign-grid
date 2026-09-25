// src/components/Select.jsx
// Custom dropdown built on the NATIVE Popover API: the panel carries the
// `popover` attribute and is opened/closed with showPopover()/hidePopover()
// in real browsers (native top layer, native Esc + outside-click dismissal).
//
// Because the popover API may be unavailable (jsdom/happy-dom tests, old
// browsers), visibility is ALSO driven by React state via a .sg-select--open
// class, and Esc / outside-click are handled manually — so open/select/close
// behaviour is identical everywhere and fully testable.
//
// Keyboard: Esc closes (native + fallback), Enter selects the highlighted
// option, ArrowUp/ArrowDown navigate, Home/End jump to ends.
// A11y: role=combobox / role=listbox / role=option + aria-expanded,
// aria-selected, aria-haspopup — per the design tokens (.sg-select__item).
// onChange(value) preserves the native <select> value contract.
import { useEffect, useId, useRef, useState } from 'react'
import './Select.css'

export default function Select({
  value,
  onChange,
  options = [],
  label,
  placeholder = 'Select…',
  className = '',
}) {
  const rawId = useId() || 'x'
  const uid = `sg-select-${String(rawId).replace(/[^a-zA-Z0-9_-]/g, '')}`
  const panelId = `${uid}-panel`

  const rootRef = useRef(null)
  const panelRef = useRef(null)
  const openRef = useRef(false)
  const highlightRef = useRef(0)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)

  const selectedIndex = options.indexOf(value)

  const openPanel = () => {
    if (openRef.current) return
    openRef.current = true
    const idx = selectedIndex >= 0 ? selectedIndex : 0
    highlightRef.current = idx
    setHighlight(idx)
    setOpen(true)
    const p = panelRef.current
    if (p && typeof p.showPopover === 'function') {
      try { p.showPopover() } catch (e) { /* not top-layer-capable */ }
    }
  }

  const closePanel = () => {
    if (!openRef.current) return
    openRef.current = false
    setOpen(false)
    const p = panelRef.current
    if (p && typeof p.hidePopover === 'function') {
      try { p.hidePopover() } catch (e) { /* noop */ }
    }
  }

  const toggle = () => (openRef.current ? closePanel() : openPanel())

  const choose = (opt) => {
    closePanel()
    if (typeof onChange === 'function') onChange(opt)
  }

  // Esc closes + outside-click closes, independent of native popover support.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e && (e.key === 'Escape' || e.key === 'Esc')) closePanel()
    }
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) closePanel()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const onTriggerKeyDown = (e) => {
    if (!options.length) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      openPanel()
      const dir = e.key === 'ArrowDown' ? 1 : -1
      const next = (highlightRef.current + dir + options.length) % options.length
      highlightRef.current = next
      setHighlight(next)
    } else if (e.key === 'Home') {
      e.preventDefault()
      highlightRef.current = 0
      setHighlight(0)
      openPanel()
    } else if (e.key === 'End') {
      e.preventDefault()
      highlightRef.current = options.length - 1
      setHighlight(options.length - 1)
      openPanel()
    } else if (e.key === 'Enter' && openRef.current && e.target === e.currentTarget) {
      e.preventDefault()
      const opt = options[highlightRef.current] ?? options[selectedIndex] ?? options[0]
      choose(opt)
    }
  }

  return (
    <span ref={rootRef} className={`sg-select__root${className ? ` ${className}` : ''}`}>
      {label && (
        <span id={`${uid}-label`} className="sg-select__label">
          {label}
        </span>
      )}
      <button
        id={uid}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={panelId}
        aria-labelledby={label ? `${uid}-label` : undefined}
        className="sg-select__trigger"
        onKeyDown={onTriggerKeyDown}
        onClick={toggle}
      >
        <span className="sg-select__value">{value != null && value !== '' ? value : placeholder}</span>
        <svg
          className="sg-select__caret"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          aria-hidden="true"
        >
          <path
            d="M3 4.5 6 7.5 9 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div
        id={panelId}
        ref={panelRef}
        popover="auto"
        role="listbox"
        aria-label={label || 'options'}
        className={`sg-select${open ? ' sg-select--open' : ''}`}
      >
        {options.map((o, i) => {
          const selected = o === value
          return (
            <div
              key={o}
              role="option"
              aria-selected={selected ? 'true' : 'false'}
              data-value={o}
              className={`sg-select__item${selected ? ' sg-select__item--selected' : ''}`}
              onMouseEnter={() => {
                highlightRef.current = i
                setHighlight(i)
              }}
              onClick={() => choose(o)}
            >
              <span className="sg-select__item-label">{o}</span>
              {selected && (
                <svg
                  className="sg-select__check"
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  aria-hidden="true"
                >
                  <path
                    d="M2.5 6.2 5 8.6 9.5 3.6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
          )
        })}
      </div>
    </span>
  )
}
