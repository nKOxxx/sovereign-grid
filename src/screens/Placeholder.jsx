// src/screens/Placeholder.jsx
export default function Placeholder({ title }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">DEMO DATA</span>
      <h1 className="mt-3 text-2xl font-semibold text-slate-800">{title}</h1>
      <p className="mt-2 text-slate-500">
        Coming in a later wave. Wave 1 delivers the two-sided marketplace, demand/supply posting, and normalized match
        results for Project Falcon.
      </p>
    </div>
  )
}
