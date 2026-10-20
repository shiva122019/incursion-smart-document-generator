import { runMigrations, getMigrationStatus } from './migrator.js';
import { runSeeds } from './seeds/index.js';
import { testConnection, closePool } from './connection.js';

const command = process.argv[2] || 'help';

async function main() {
  try {
    switch (command) {
      case 'migrate': {
        console.log('Running database migrations...');
        const applied = await runMigrations();
        console.log(`Migrations complete. Applied: ${applied.length}`);
        break;
      }

      case 'status': {
        const statuses = await getMigrationStatus();
        console.log('\n--- Database Migration Status ---');
        for (const item of statuses) {
          const badge = item.applied ? '[APPLIED]' : '[PENDING]';
          console.log(`  ${badge.padEnd(10)} ${item.name}`);
        }
        console.log('---------------------------------\n');
        break;
      }

      case 'seed': {
        console.log('Running development seeds...');
        await runSeeds();
        console.log('Development seeding finished successfully.');
        break;
      }

      case 'test-connection': {
        console.log('Testing PostgreSQL connection...');
        const res = await testConnection();
        if (res.healthy) {
          console.log('Connection successful!');
          console.log(`Database Time: ${res.timestamp}`);
          if (res.serverVersion) {
            console.log(`Server Version: ${res.serverVersion}`);
          }
        } else {
          console.error(`Connection failed: ${res.error}`);
          process.exitCode = 1;
        }
        break;
      }

      case 'help':
      default: {
        console.log(`
Smart Document Generator Database CLI

Usage: node src/database/cli.js <command>

Available commands:
  migrate           Run all pending numbered migrations
  status            Show status of applied and pending migrations
  seed              Run development seed scripts
  test-connection   Test database pool connection health
  help              Show this help message
        `);
        break;
      }
    }
  } catch (error) {
    console.error('Command failed with error:', error);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

main();
