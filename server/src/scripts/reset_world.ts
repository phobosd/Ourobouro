import { DatabaseService } from '../services/DatabaseService';
import { Logger } from '../utils/Logger';

const db = DatabaseService.getInstance().getDb();

try {
    Logger.info('Script', 'Clearing world_entities table...');
    db.prepare('DELETE FROM world_entities').run();
    Logger.info('Script', 'World entities cleared. The world will be repopulated on next server start.');
} catch (error) {
    Logger.error('Script', `Failed to clear world entities: ${error}`);
}
