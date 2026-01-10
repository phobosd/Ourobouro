import { createClient } from 'redis';

export class PersistenceManager {
    private client;

    constructor() {
        this.client = createClient({
            url: 'redis://localhost:6379'
        });

        this.client.on('error', (err) => console.log('Redis Client Error', err));
    }

    async connect() {
        await this.client.connect();
        console.log('Connected to Redis');
    }

    async saveEntity(entityId: string, data: any) {
        await this.client.set(`entity:${entityId}`, JSON.stringify(data));
    }

    async getEntity(entityId: string) {
        const data = await this.client.get(`entity:${entityId}`);
        return data ? JSON.parse(data) : null;
    }

    async saveWorldState(entities: any[]) {
        // Save all entities in a transaction
        const multi = this.client.multi();
        entities.forEach(entity => {
            multi.set(`entity:${entity.id}`, JSON.stringify(entity));
        });
        await multi.exec();
    }
}
