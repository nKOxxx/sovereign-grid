// server/src/db/keepalive.js
// Fly.io stops machines it considers idle (~5 min with no connections). For a
// free-tier Postgres cluster that means the database goes down silently and —
// because Flycast on the private network has no proxy to wake stopped machines
// — every later app connection dies mid-handshake (observed 2026-09-25:
// "Connection terminated unexpectedly" ~35s into boot migrations).
//
// Fix: a periodic SELECT 1 through the serving pool. The database is then
// never idle, so the platform never stops it. Cheap (one query per interval),
// self-healing in combination with the boot retry wrapper, and dev/test never
// import this module.
export function startDbKeepalive(pool, { intervalMs = 60_000, log = console.log } = {}) {
  const ping = async () => {
    try {
      await pool.query('SELECT 1')
    } catch (err) {
      log(`[keepalive] ping failed: ${err.message}`)
    }
  }
  const timer = setInterval(ping, intervalMs)
  timer.unref?.()
  // Warm the private-network path immediately instead of waiting one interval.
  void ping()
  return () => clearInterval(timer)
}
