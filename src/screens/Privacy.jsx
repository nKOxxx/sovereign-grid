// src/screens/Privacy.jsx — Privacy Policy (public, /privacy).
// Plain-English description of what data the marketplace stores and why.
// Links from the Login footer. Dark-token design, no native selects.
import { Link } from 'react-router-dom'

export default function Privacy() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-3">Privacy Policy</p>
      <h1 className="sg-display mt-1 text-3xl">Sovereign Grid Privacy</h1>
      <p className="mt-2 text-sm text-text-3">Last updated: September 2026</p>

      <div className="sg-card mt-6 space-y-6 p-6 text-sm leading-relaxed text-text-2">
        <Section title="1. The short version">
          <p>
            We store the data you give us that the platform needs to work — your email, your account, and the listings,
            requests, observations, and deal records you create. We do not sell your personal data, and we do not house
            contact lists, workloads, or proprietary code that you run on compute. This page explains what we hold and
            why.
          </p>
        </Section>

        <Section title="2. What we store">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-text-1">Account and contact data:</strong> your email address, role
              (buyer/seller/operator), display name, and a hashed password. We store your email to verify your account,
              let you reset your password, and reach you about your account.
            </li>
            <li>
              <strong className="text-text-1">Marketplace content:</strong> the demand requests you post, the listings
              you create, and the deals, offers, messages, and evidence items associated with them.
            </li>
            <li>
              <strong className="text-text-1">Observations and market data:</strong> hardware observations (from
              operators and public sources) that feed the market-intel and pricing screens. Where we can, we aggregate
              so figures are indicative rather than tied to a specific user.
            </li>
            <li>
              <strong className="text-text-1">Security and audit records:</strong> session tokens, verification tokens
              (expiring, single-use), and an audit log of sensitive actions (such as an operator revealing a
              verification token). These exist to keep the platform safe.
            </li>
          </ul>
        </Section>

        <Section title="3. What we do not store or handle">
          <p>
            We do <strong className="text-text-1">not</strong> store payment-card details, hold funds in escrow, or
            host the compute workloads you trade. Payment and delivery happen bilaterally between you and your
            counterparty, outside this platform, and are not subject to this policy.
          </p>
        </Section>

        <Section title="4. How we use your data">
          <p>
            We use your data to operate the platform: to authenticate you, to show your content to the right
            counterparties, to generate indicative pricing and match results, to prevent abuse, and to comply with the
            law. We do not sell your personal data. We may share aggregate, non-identifying statistics (for example,
            "total listed capacity by region") publicly.
          </p>
        </Section>

        <Section title="5. How long we keep it">
          <p>
            We keep account and marketplace content while you have an account, and we keep audit and security records
            as long as legally needed. You can stop using the platform at any time; email us to request deletion of your
            account and the content tied to it, subject to records we are legally required to retain.
          </p>
        </Section>

        <Section title="6. Email verification and one-time tokens">
          <p>
            We do not currently send transactional email (no live SMTP is configured). Verification and password-reset
            tokens are generated, expire quickly, and are used once. Until email delivery is enabled, a human operator
            may complete your verification manually by sharing the one-time token with you directly; each token is
            single-use and audited. See our operational guides for details.
          </p>
        </Section>

        <Section title="7. Your choices and contact">
          <p>
            You can sign out and stop using the platform at any time. For questions about this policy, or to request
            access, correction, or deletion of your data, email contact@sovereign-grid.example.
          </p>
          {/* TODO(M): replace placeholder contact with the real privacy inbox once it exists. */}
        </Section>
      </div>

      <p className="mt-6 text-sm text-text-3">
        Back to <Link className="text-accent hover:text-text-1" to="/login">Sign in</Link> ·{' '}
        <Link className="text-accent hover:text-text-1" to="/terms">Terms of Service</Link>
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
