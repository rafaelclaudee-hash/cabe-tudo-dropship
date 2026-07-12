/**
 * Migrador minimalista: aplica os .sql de /migrations em ordem
 * alfabética, registrando os já aplicados na tabela _migrations.
 * Suficiente para o MVP; troque por Prisma/Drizzle quando crescer.
 *
 * Uso: npm run migrate
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS _migrations (
         name TEXT PRIMARY KEY,
         applied_at TIMESTAMPTZ DEFAULT now()
       )`
    );

    const dir = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      const { rowCount } = await client.query('SELECT 1 FROM _migrations WHERE name = $1', [file]);
      if (rowCount > 0) {
        console.log(`— ${file} (já aplicada)`);
        continue;
      }
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`✓ ${file} aplicada`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Falha em ${file}: ${err.message}`);
      }
    }
    console.log('Migrations concluídas.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
