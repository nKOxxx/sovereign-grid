// src/screens/Terms.jsx — Terms of Service (public, /terms).
// Plain-English marketplace terms for real (not demo) counterparties.
// Links from the Login footer. Dark-token design, no native selects.
import { Link } from 'react-router-dom'

export default function Terms() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-3">Terms of Service</p>
      <h1 className="sg-display mt-1 text-3xl">Sovereign Grid Terms</h1>
      <p className="mt-2 text-sm text-text-3">Last updated: September 2026</p>

      <div className="sg-card mt-6 space-y-6 p-6 text-sm leading-relaxed text-text-2">
        <Section title="1. What this platform is">
          <p>
            Sovereign Grid is a marketplace where buyers post compute demand and sellers list compute capacity
            (GPU/accelerator hardware) they are willing to provide. We connect counterparties and help them match.
            We are a venue for discovering and structuring deals — not a cloud provider, not a reseller of compute,
            and not a participant in the trades that happen on it.
          </p>
        </Section>

        <Section title="2. Indicative pricing, not a live market">
          <p>
            Figures shown on Sovereign Grid — including the fee engine, match scores, and any price or cost displays —
            are <strong className="text-text-1">indicative estimates only</strong>. They are derived from our own models
            and from observations of public listings, and they are <strong className="text-text-1">never a live,
            transactable market price</strong>. Quoted figures are for planning and comparison; the binding terms of any
            deal are whatever you and the other party explicitly negotiate and record in the deal, not what any screen
            predicted.
          </p>
        </Section>

        <Section title="3. Your account">
          <p>
            You are responsible for keeping your credentials confidential, for the accuracy of the information you
            provide (including your email address and any listings or observations you submit), and for all activity
            that happens under your account. Email verification is required before you can create listings or accept
            deals. You must not create accounts to impersonate someone else, evade a suspension, or misrepresent your
            hardware or identity.
          </p>
        </Section>

        <Section title="4. Listings, demand, and observations are not guarantees">
          <p>
            A listing that a seller posts describes capacity they intend to make available; a demand post describes a
            buyer's need. Neither is a binding commitment to transact, and a match or high score does not guarantee
            performance, availability, or delivery. Where we allow sellers to submit evidence or observations, we present
            them as-reported and reviewed where possible; they are still claims, not warranties.
          </p>
        </Section>

        <Section title="5. No escrow; deals are bilateral">
          <p>
            <strong className="text-text-1">Sovereign Grid is not a party to any deal and does not hold, escrow, or
            guarantee payment.</strong> When you accept an offer or form a deal, you are contracting directly and
            bilaterally with the other participant. Both sides are responsible for performing their own due diligence,
            agreeing on payment and delivery outside the platform as appropriate, and resolving any disputes with one
            another. We do not mediate, insure, or refund.
          </p>
        </Section>

        <Section title="6. Acceptable use">
          <p>
            You may not use the platform to break the law, to misrepresent hardware or availability, to attempt to
            compromise the platform or other users' accounts, to scrape or abuse it, or to transact in anything
            prohibited. We may restrict, suspend, or terminate accounts that violate these terms.
          </p>
        </Section>

        <Section title="7. Availability and liability">
          <p>
            The platform is provided "as is" and without warranty. To the maximum extent permitted by law, Sovereign
            Grid is not liable for indirect, incidental, or consequential damages, or for any loss arising from a deal
            or dispute between users. Our aggregate liability is limited to the amount, if any, you paid us in the three
            months before the claim.
          </p>
        </Section>

        <Section title="8. Changes and contact">
          <p>
            We may update these terms and will surface material changes here. Questions: contact
            contact@sovereign-grid.example.
          </p>
          {/* TODO(M): replace placeholder contact with the real support inbox once it exists. */}
        </Section>
      </div>

      <p className="mt-6 text-sm text-text-3">
        Back to <Link className="text-accent hover:text-text-1" to="/login">Sign in</Link> ·{' '}
        <Link className="text-accent hover:text-text-1" to="/privacy">Privacy Policy</Link>
      </p>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold text-text-1">{title}</h2>
      {children}
    </section>
  )
}
