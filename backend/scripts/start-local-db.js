/* eslint-disable @typescript-eslint/no-require-imports */
const EmbeddedPostgres = require('embedded-postgres').default;
const path = require('path');

const DB_DIR = path.join(__dirname, '..', '.pgdata5433');

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: DB_DIR,
    user: 'p2p',
    password: 'p2p_secret',
    port: 5433,
    persistent: true,
  });

  console.log('Initialising embedded PostgreSQL...');
  try {
    await pg.initialise();
  } catch {
    // already initialised
  }

  console.log('Starting PostgreSQL on port 5433...');
  await pg.start();

  try {
    await pg.createDatabase('p2p_exchange');
    console.log('Database p2p_exchange created.');
  } catch {
    console.log('Database p2p_exchange already exists.');
  }

  console.log('PostgreSQL is ready. Press Ctrl+C to stop.');
  process.on('SIGINT', async () => {
    await pg.stop();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
