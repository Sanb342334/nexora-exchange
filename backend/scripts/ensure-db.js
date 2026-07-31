const { Client } = require('pg');

async function main() {
  const c = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/postgres' });
  await c.connect();
  const u = await c.query("SELECT 1 FROM pg_roles WHERE rolname='p2p'");
  if (!u.rowCount) {
    await c.query("CREATE USER p2p WITH PASSWORD 'p2p_secret' SUPERUSER");
    console.log('user created');
  } else {
    await c.query("ALTER USER p2p WITH PASSWORD 'p2p_secret'");
    console.log('user exists');
  }
  const d = await c.query("SELECT 1 FROM pg_database WHERE datname='p2p_exchange'");
  if (!d.rowCount) {
    await c.query('CREATE DATABASE p2p_exchange OWNER p2p');
    console.log('db created');
  } else {
    console.log('db exists');
  }
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
