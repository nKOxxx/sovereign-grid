// src/store/MarketContext.jsx
import { createContext, useContext, useState, useCallback } from 'react'
import {
  sellerListings as seedListings,
  buyerRequests as seedRequests,
  falconDeal as seedFalconDeal,
  falconCrm as seedFalconCrm,
  DEMO_NOTE,
} from '../data/seed.js'
import { applyMessageApproval } from '../lib/deal.js'

const MarketContext = createContext(null)

// Demo platform fee (buyer-side percentage). DEMO value — not a final commercial policy.
export const DEFAULT_PLATFORM_FEE = 0.08

export function MarketProvider({ children }) {
  const [listings, setListings] = useState(seedListings)
  const [requests, setRequests] = useState(seedRequests)
  const [platformFee, setPlatformFee] = useState(DEFAULT_PLATFORM_FEE)

  // Connection lifecycle (SPEC §16.4): none -> pending -> approved.
  const [connection, setConnection] = useState({
    status: 'none',
    sellerId: null,
    requestedAt: null,
    approvedAt: null,
  })

  // Deal room content (messages are interactive in the demo thread).
  const [deal, setDeal] = useState(seedFalconDeal)

  // CRM automation state (approval gating is interactive).
  const [crm, setCrm] = useState(seedFalconCrm)

  const addListing = useCallback((l) => setListings((prev) => [l, ...prev]), [])
  const addRequest = useCallback((r) => setRequests((prev) => [r, ...prev]), [])

  // --- Connection flow ---
  const requestConnection = useCallback(
    (sellerId) =>
      setConnection((prev) => ({
        status: 'pending',
        sellerId: sellerId ?? prev.sellerId,
        requestedAt: new Date().toISOString(),
        approvedAt: null,
      })),
    [],
  )
  const approveConnection = useCallback(
    () =>
      setConnection((prev) =>
        prev.status === 'pending' ? { ...prev, status: 'approved', approvedAt: new Date().toISOString() } : prev,
      ),
    [],
  )
  const resetConnection = useCallback(() => setConnection({ status: 'none', sellerId: null, requestedAt: null, approvedAt: null }), [])

  // --- Deal room thread (demo): post a message as the buyer/operator ---
  const sendDealMessage = useCallback(({ from = 'buyer', text }) => {
    if (!text || !text.trim()) return
    setDeal((prev) => ({
      ...prev,
      messages: [
        ...prev.messages,
        { id: `m-${Date.now()}`, from, at: new Date().toISOString(), text: text.trim() },
      ],
    }))
  }, [])

  // --- CRM approval gating (SPEC §13.3) ---
  const approveCrmMessage = useCallback((id) => {
    setCrm((prev) => ({ ...prev, emails: applyMessageApproval(prev.emails, id, 'approve') }))
  }, [])
  const rejectCrmMessage = useCallback((id) => {
    setCrm((prev) => ({ ...prev, emails: applyMessageApproval(prev.emails, id, 'reject') }))
  }, [])

  const value = {
    listings,
    requests,
    platformFee,
    setPlatformFee,
    addListing,
    addRequest,
    // connection + deal + crm
    connection,
    requestConnection,
    approveConnection,
    resetConnection,
    deal,
    sendDealMessage,
    crm,
    approveCrmMessage,
    rejectCrmMessage,
    demoNote: DEMO_NOTE,
  }
  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>
}

export function useMarket() {
  const ctx = useContext(MarketContext)
  if (!ctx) throw new Error('useMarket must be used within <MarketProvider>')
  return ctx
}
