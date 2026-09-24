// server/src/index.js
// HTTP entrypoint: build the app and listen on PORT (default 8787).
//
// server/.env is gitignored and supplies DATABASE_URL / PORT / SESSION_TTL_DAYS
// for manual runs. It is loaded by ./env.js, which must be imported BEFORE
// app.js so the default DB pool (built eagerly in pool.js) sees DATABASE_URL.

import './env.js'
import { createApp } from './app.js'

const PORT = Number(process.env.PORT || 8787)
const app = createApp()

app.listen(PORT, () => {
  console.log(`sovereign-grid server listening on ${PORT}`)
})
