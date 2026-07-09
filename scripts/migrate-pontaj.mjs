// Migrare unică: assignments + timesheets din vechiul proiect Pontaj
// (aqsctetggdghzqnvuxca) în proiectul Supabase partajat, cu ID-urile păstrate.
// Rulare: node scripts/migrate-pontaj.mjs
// Idempotent: rândurile deja copiate sunt ignorate (on_conflict=id).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => l.split('=').map((s) => s.trim()))
)

const OLD_URL = 'https://aqsctetggdghzqnvuxca.supabase.co'
const OLD_KEY = 'sb_publishable_wvlQowf1Ekz4e3H6r3qg6w_77CN6t-e'
const NEW_URL = env.VITE_SUPABASE_URL
const NEW_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY
const ADMIN_EMAIL = 'admin@cvr.demo'
const ADMIN_PASSWORD = process.env.CVR_ADMIN_PASSWORD ?? 'CvrDemo!2026'

async function login() {
  const res = await fetch(`${NEW_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: NEW_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  })
  const body = await res.json()
  if (!body.access_token) throw new Error('Login eșuat în proiectul nou')
  return body.access_token
}

async function readPage(table, from, to) {
  const res = await fetch(`${OLD_URL}/rest/v1/${table}?select=*&order=id.asc`, {
    headers: { apikey: OLD_KEY, Range: `${from}-${to}`, 'Range-Unit': 'items', Prefer: 'count=exact' },
  })
  if (!res.ok) throw new Error(`Citire ${table} ${from}-${to}: HTTP ${res.status}`)
  const total = Number((res.headers.get('content-range') ?? '/0').split('/')[1])
  return { rows: await res.json(), total }
}

async function writeChunk(table, rows, token) {
  // în proiectul partajat tabelele Pontaj au prefixul pontaj_
  const res = await fetch(`${NEW_URL}/rest/v1/pontaj_${table}?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: NEW_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error(`Scriere ${table} (${rows.length} rânduri): HTTP ${res.status} ${await res.text()}`)
}

const token = await login()
for (const table of ['assignments', 'timesheets']) {
  let from = 0
  let copied = 0
  let total = Infinity
  while (from < total) {
    const { rows, total: t } = await readPage(table, from, from + 499)
    total = t
    if (rows.length === 0) break
    await writeChunk(table, rows, token)
    copied += rows.length
    from += rows.length
    console.log(`${table}: ${copied}/${total}`)
  }
}
console.log('Gata.')
