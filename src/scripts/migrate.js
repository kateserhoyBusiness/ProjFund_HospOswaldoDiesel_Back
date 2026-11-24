import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { databaseConfigured, pool } from '../runtime/database.js';

async function main() {
  if (!databaseConfigured) {
    throw new Error('Configure DATABASE_URL ou DB_HOST, DB_USER e DB_PASSWORD antes de migrar.');
  }

  const migrationsDirectory = resolve(process.cwd(), 'database/migrations');
  const migrations = (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
  if (!migrations.length) throw new Error('Nenhuma migração encontrada.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const migration of migrations) {
      const sql = await readFile(resolve(migrationsDirectory, migration), 'utf8');
      await client.query(sql);
      console.log('Migração aplicada:', migration);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Falha ao preparar migrações:', error);
  process.exit(1);
});
