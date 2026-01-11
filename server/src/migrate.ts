import { PersistenceManager } from './persistence/PersistenceManager';
import { Logger } from './utils/Logger';

async function migrate() {
    Logger.info('Migration', 'Starting Gibsonian Migration...');

    const persistence = new PersistenceManager();
    await persistence.connect();

    // Purge all keys in Redis
    // In a production environment, we'd be more selective, but here we want a clean slate.
    const client = (persistence as any).client;
    if (client) {
        Logger.info('Migration', 'Purging WorldState database...');
        await client.flushAll();
        Logger.info('Migration', 'Database purged.');
    } else {
        Logger.error('Migration', 'Failed to connect to Redis client.');
    }

    Logger.info('Migration', 'Migration complete. Restart the server to repopulate the world.');
    process.exit(0);
}

migrate().catch(err => {
    Logger.error('Migration', 'Migration failed:', err);
    process.exit(1);
});
