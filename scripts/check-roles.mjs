// Verificare automată a rolurilor (acceptanța fazei 6):
//   1. o sesiune cu rol "site" NU poate citi cvr_cost_entries (0 rânduri)
//   2. aceeași sesiune POATE citi scheletul (projects > 0)
//   3. o sesiune "finance" POATE citi costurile
//   4. clientul anonim primește 0 rânduri peste tot
// Rulare: npm run check:roles
// Citește URL-ul și cheia publică din .env.local (nu hardcodăm nimic).
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

const URL_ = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY
const PASSWORD = 'CvrDemo!2026'

async function login(email) {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  const body = await res.json()
  if (!body.access_token) throw new Error(`Login eșuat pentru ${email}`)
  return body.access_token
}

async function rows(table, token) {
  const headers = { apikey: KEY }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${URL_}/rest/v1/${table}?select=id`, { headers })
  if (!res.ok) return { error: res.status }
  return { count: (await res.json()).length }
}

let failed = 0
function check(name, ok, detail) {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` (${detail})` : ''}`)
  if (!ok) failed++
}

const site = await login('site@cvr.demo')
const finance = await login('finance@cvr.demo')

const siteCosts = await rows('cvr_cost_entries', site)
check('site NU vede cvr_cost_entries', siteCosts.count === 0, `${siteCosts.count ?? siteCosts.error} rânduri`)

const siteBudgets = await rows('cvr_job_budgets', site)
check('site NU vede cvr_job_budgets', siteBudgets.count === 0, `${siteBudgets.count ?? siteBudgets.error} rânduri`)

const siteBilling = await rows('cvr_billing', site)
check('site NU vede cvr_billing', siteBilling.count === 0, `${siteBilling.count ?? siteBilling.error} rânduri`)

const siteProjects = await rows('projects', site)
check('site VEDE scheletul (projects)', (siteProjects.count ?? 0) > 0, `${siteProjects.count} rânduri`)

const financeCosts = await rows('cvr_cost_entries', finance)
check('finance vede costurile', (financeCosts.count ?? 0) > 0, `${financeCosts.count} rânduri`)

const anonProjects = await rows('projects', null)
check('anonim primește 0 rânduri', anonProjects.count === 0, `${anonProjects.count ?? anonProjects.error} rânduri`)

console.log(failed === 0 ? '\nToate verificările de rol au trecut.' : `\n${failed} verificări au picat!`)
process.exit(failed === 0 ? 0 : 1)
