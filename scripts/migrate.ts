import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { config } from 'dotenv'
import postgres from 'postgres'

config({ path: '.env.local' })

const url = process.env.DATABASE_URL_DIRECT
if (!url) {
  console.error('DATABASE_URL_DIRECT is not set')
  process.exit(1)
}

async function main() {
  const client = postgres(url, { max: 1, prepare: false })
  const db = drizzle(client)
  await migrate(db, { migrationsFolder: './drizzle' })
  await client.end()
}

main().catch(err => { console.error(err); process.exit(1) })
