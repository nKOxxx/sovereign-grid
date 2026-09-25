// @vitest-environment happy-dom
// src/components/select.test.jsx
// Interactive behaviour of the popover-based custom Select. Runs under
// happy-dom (a test-only devDependency — never bundled) so open / select /
// close and keyboard navigation can be exercised against a real element tree.
// The component drives visibility with React state (.sg-select--open) so it is
// fully testable even though happy-dom does not implement the native Popover
// API; real browsers additionally get top-layer behaviour via showPopover().
import { describe, it, expect, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import Select from './Select.jsx'

// React 19 requires this flag to run act() outside the jest-like global.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

function mount(ui) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(ui)
  })
  return { host, root }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('Select — opens / selects / closes', () => {
  it('opens on trigger click (panel gains sg-select--open + aria-expanded)', () => {
    const { host } = mount(
      <Select value="All regions" onChange={() => {}} options={['All regions', 'EU', 'US']} label="Region" />,
    )
    const trigger = host.querySelector('.sg-select__trigger')
    const panel = host.querySelector('.sg-select')
    expect(panel.classList.contains('sg-select--open')).toBe(false)
    act(() => {
      trigger.click()
    })
    expect(panel.classList.contains('sg-select--open')).toBe(true)
    expect(host.querySelector('[role="combobox"]').getAttribute('aria-expanded')).toBe('true')
  })

  it('selects an option on click, calls onChange(value), and closes', () => {
    let value = 'All regions'
    const onChange = (v) => {
      value = v
    }
    const { host } = mount(
      <Select value={value} onChange={onChange} options={['All regions', 'EU', 'US']} label="Region" />,
    )
    const trigger = host.querySelector('.sg-select__trigger')
    const panel = host.querySelector('.sg-select')
    act(() => {
      trigger.click()
    })
    const option = host.querySelector('[role="option"][data-value="US"]')
    act(() => {
      option.click()
    })
    expect(value).toBe('US')
    expect(panel.classList.contains('sg-select--open')).toBe(false)
  })

  it('closes on Escape', () => {
    const { host } = mount(
      <Select value="All regions" onChange={() => {}} options={['All regions', 'EU', 'US']} label="Region" />,
    )
    const trigger = host.querySelector('.sg-select__trigger')
    const panel = host.querySelector('.sg-select')
    act(() => {
      trigger.click()
    })
    expect(panel.classList.contains('sg-select--open')).toBe(true)
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(panel.classList.contains('sg-select--open')).toBe(false)
  })

  it('closes on an outside click', () => {
    const { host } = mount(
      <Select value="All regions" onChange={() => {}} options={['All regions', 'EU', 'US']} label="Region" />,
    )
    const trigger = host.querySelector('.sg-select__trigger')
    const panel = host.querySelector('.sg-select')
    act(() => {
      trigger.click()
    })
    expect(panel.classList.contains('sg-select--open')).toBe(true)
    act(() => {
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(panel.classList.contains('sg-select--open')).toBe(false)
  })

  it('Enter selects the highlighted option after ArrowDown navigation', () => {
    let value = 'All regions'
    const onChange = (v) => {
      value = v
    }
    const { host } = mount(
      <Select value={value} onChange={onChange} options={['All regions', 'EU', 'US']} label="Region" />,
    )
    const trigger = host.querySelector('.sg-select__trigger')
    act(() => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })
    act(() => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })
    act(() => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(value).toBe('US')
  })

  it('exposes the ARIA combobox / listbox / option roles with the selected flag', () => {
    const { host } = mount(
      <Select value="EU" onChange={() => {}} options={['All regions', 'EU', 'US']} label="Region" />,
    )
    expect(host.querySelector('[role="combobox"]')).toBeTruthy()
    expect(host.querySelector('[role="listbox"]')).toBeTruthy()
    expect(host.querySelectorAll('[role="option"]').length).toBe(3)
    const selected = host.querySelector('[role="option"][aria-selected="true"]')
    expect(selected.getAttribute('data-value')).toBe('EU')
  })
})
