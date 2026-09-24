// Ensure a default DATABASE_URL exists before pool.js constructs its eager
// module-level pool. Tests never use that pool (they pass explicit pools bound
// to their scratch database), but pool.js requires a value to build a Pool.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://sg_app@/sovereign_grid?host=/tmp'
}
