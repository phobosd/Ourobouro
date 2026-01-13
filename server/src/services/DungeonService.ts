import { IEngine } from '../ecs/IEngine';
import { Entity } from '../ecs/Entity';
import { Position } from '../components/Position';
import { Description } from '../components/Description';
import { IsRoom } from '../components/IsRoom';
import { Portal } from '../components/Portal';
import { Atmosphere } from '../components/Atmosphere';
import { NPC } from '../components/NPC';
import { CombatStats } from '../components/CombatStats';
import { Stats } from '../components/Stats';
import { Visuals } from '../components/Visuals';
import { MessageService } from './MessageService';
import { WorldQuery } from '../utils/WorldQuery';
import * as fs from 'fs';
import * as path from 'path';

interface EnemyDef {
    id: string;
    name: string;
    tier: number;
    stats: { atk: number, def: number, spd: number, hp: number };
    visuals: { char: string, color: string, glitch_rate: number };
    special: { id: string, trigger: string, effect: string };
    description: string;
}

export class DungeonService {
    private static instance: DungeonService;
    private engine: IEngine;
    private messageService: MessageService;
    private enemies: EnemyDef[] = [];

    private visitedRooms: Map<string, Set<string>> = new Map();

    private readonly DUNGEON_OFFSET_X = 2000;
    private readonly DUNGEON_OFFSET_Y = 2000;
    private readonly DUNGEON_SIZE = 60;

    constructor(engine: IEngine, messageService: MessageService) {
        this.engine = engine;
        this.messageService = messageService;
        this.loadEnemies();
    }

    static getInstance(engine?: IEngine, messageService?: MessageService): DungeonService | undefined {
        if (!DungeonService.instance && engine && messageService) {
            DungeonService.instance = new DungeonService(engine, messageService);
        }
        return DungeonService.instance;
    }

    private loadEnemies() {
        try {
            const filePath = path.join(process.cwd(), 'data/enemies.json');
            const data = fs.readFileSync(filePath, 'utf-8');
            const json = JSON.parse(data);
            this.enemies = json.enemies;
            console.log(`[DungeonService] Loaded ${this.enemies.length} enemies.`);
        } catch (err) {
            console.error("[DungeonService] Failed to load enemies:", err);
        }
    }

    public enterDungeon(playerId: string) {
        // TEMPORARY: Always regenerate to clear corrupted state from Redis
        console.log("[DungeonService] Regenerating dungeon (forced)...");
        this.clearDungeon();
        this.generateDungeon();

        const player = WorldQuery.getEntityById(this.engine, playerId);
        if (player) {
            const pos = player.getComponent(Position);
            if (pos) {
                // Verify there's actually a room at the spawn point
                const spawnRoom = this.engine.getEntitiesAt(this.DUNGEON_OFFSET_X, this.DUNGEON_OFFSET_Y)
                    .find(e => e.hasComponent(IsRoom));

                if (spawnRoom) {
                    pos.x = this.DUNGEON_OFFSET_X;
                    pos.y = this.DUNGEON_OFFSET_Y;
                    console.log(`[DungeonService] Teleported player ${playerId} to ${pos.x}, ${pos.y}`);
                } else {
                    // Emergency: Find ANY dungeon room
                    console.error(`[DungeonService] No room at dungeon spawn (${this.DUNGEON_OFFSET_X}, ${this.DUNGEON_OFFSET_Y})!`);
                    const anyDungeonRoom = Array.from(this.engine.getEntities().values()).find(e => {
                        const p = e.getComponent(Position);
                        return e.hasComponent(IsRoom) && p &&
                            p.x >= this.DUNGEON_OFFSET_X &&
                            p.x < this.DUNGEON_OFFSET_X + this.DUNGEON_SIZE;
                    });

                    if (anyDungeonRoom) {
                        const dungeonPos = anyDungeonRoom.getComponent(Position)!;
                        pos.x = dungeonPos.x;
                        pos.y = dungeonPos.y;
                        console.log(`[DungeonService] Emergency spawn at dungeon room (${dungeonPos.x}, ${dungeonPos.y})`);
                    } else {
                        console.error(`[DungeonService] CRITICAL: No dungeon rooms found after generation!`);
                        this.messageService.error(playerId, "ERROR: Dungeon generation failed. Aborting entry.");
                        return;
                    }
                }
            }

            if (pos) {
                this.visitedRooms.set(playerId, new Set([`${pos.x},${pos.y}`]));
            }

            this.messageService.system(playerId, "\n[SYSTEM] WARNING: UNSTABLE REALITY DETECTED.");
            this.messageService.system(playerId, "[SYSTEM] CONNECTING TO GLITCH ZONE...");
            this.messageService.info(playerId, "\nThe world dissolves into static. You step through the threshold and find yourself in a shifting, neon-lit void.");
        } else {
            console.error(`[DungeonService] Failed to find player ${playerId} or position component.`);
        }
    }

    public leaveDungeon(playerId: string) {
        const player = WorldQuery.getEntityById(this.engine, playerId);
        if (player) {
            const pos = player.getComponent(Position);
            if (pos) {
                // Try to find a safe spawn location
                const safeX = 10;
                const safeY = 10;

                // Verify there's a room at the destination
                const destRoom = this.engine.getEntitiesAt(safeX, safeY).find(e => e.hasComponent(IsRoom));

                if (destRoom) {
                    pos.x = safeX;
                    pos.y = safeY;
                    this.messageService.system(playerId, "[SYSTEM] DISCONNECTING...");
                    this.messageService.info(playerId, "The glitch zone fades. You are back in the stability of the Sprawl.");
                    console.log(`[DungeonService] Player ${playerId} left dungeon to (${safeX}, ${safeY})`);
                } else {
                    // Emergency fallback - find ANY room
                    console.error(`[DungeonService] No room at (${safeX}, ${safeY})! Finding emergency spawn...`);
                    const anyRoom = Array.from(this.engine.getEntities().values()).find(e => {
                        const p = e.getComponent(Position);
                        return e.hasComponent(IsRoom) && p && p.x < 1000; // Not in dungeon or matrix
                    });

                    if (anyRoom) {
                        const anyPos = anyRoom.getComponent(Position)!;
                        pos.x = anyPos.x;
                        pos.y = anyPos.y;
                        this.messageService.system(playerId, "[SYSTEM] EMERGENCY RELOCATION");
                        this.messageService.info(playerId, "Reality stabilizes around you...");
                        console.log(`[DungeonService] Emergency spawn at (${anyPos.x}, ${anyPos.y})`);
                    } else {
                        console.error(`[DungeonService] CRITICAL: No valid rooms found in world!`);
                        this.messageService.error(playerId, "ERROR: Unable to find safe location. Contact administrator.");
                    }
                }
            }
        }
    }

    private clearDungeon() {
        const entities = this.engine.getEntities();
        const toRemove: string[] = [];

        for (const [id, entity] of entities) {
            const pos = entity.getComponent(Position);
            if (pos && pos.x >= this.DUNGEON_OFFSET_X) {
                // Only remove NPCs and Portals, keep rooms
                if (entity.hasComponent(NPC) || entity.hasComponent(Portal)) {
                    toRemove.push(id);
                }
            }
        }

        toRemove.forEach(id => this.engine.removeEntity(id));
        console.log(`[DungeonService] Cleared ${toRemove.length} entities from dungeon`);
    }

    private generateDungeon() {
        const targetRooms = 60 + Math.floor(Math.random() * 30);
        const visited = new Set<string>();
        const nodes: { x: number, y: number }[] = [{ x: this.DUNGEON_OFFSET_X, y: this.DUNGEON_OFFSET_Y }];

        this.createRoom(this.DUNGEON_OFFSET_X, this.DUNGEON_OFFSET_Y, true);
        visited.add(`${this.DUNGEON_OFFSET_X},${this.DUNGEON_OFFSET_Y}`);
        console.log(`[DungeonService] Created entry room at (${this.DUNGEON_OFFSET_X}, ${this.DUNGEON_OFFSET_Y})`);

        let created = 1;
        let attempts = 0;
        const maxAttempts = 1000;

        while (created < targetRooms && attempts < maxAttempts) {
            attempts++;
            const useRecent = Math.random() > 0.3;
            const idx = useRecent ? nodes.length - 1 - Math.floor(Math.random() * Math.min(5, nodes.length)) : Math.floor(Math.random() * nodes.length);
            const curr = nodes[idx];

            const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
            const dir = dirs[Math.floor(Math.random() * dirs.length)];
            const segmentLen = 2 + Math.floor(Math.random() * 5);

            let cx = curr.x;
            let cy = curr.y;

            for (let i = 0; i < segmentLen; i++) {
                if (created >= targetRooms) break;

                const nx = cx + dir[0];
                const ny = cy + dir[1];
                const key = `${nx},${ny}`;

                if (nx < this.DUNGEON_OFFSET_X || nx > this.DUNGEON_OFFSET_X + this.DUNGEON_SIZE ||
                    ny < this.DUNGEON_OFFSET_Y || ny > this.DUNGEON_OFFSET_Y + this.DUNGEON_SIZE) {
                    break;
                }

                if (!visited.has(key)) {
                    let neighborCount = 0;
                    const checkDirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
                    for (const d of checkDirs) {
                        if (visited.has(`${nx + d[0]},${ny + d[1]}`)) neighborCount++;
                    }

                    if (neighborCount > 1 && Math.random() > 0.3) {
                        break;
                    }

                    this.createRoom(nx, ny, false);
                    visited.add(key);
                    nodes.push({ x: nx, y: ny });
                    cx = nx;
                    cy = ny;
                    created++;
                } else {
                    cx = nx;
                    cy = ny;
                    break;
                }
            }
        }

        let furthestNode = nodes[0];
        let maxDist = 0;

        for (const node of nodes) {
            const dist = Math.abs(node.x - this.DUNGEON_OFFSET_X) + Math.abs(node.y - this.DUNGEON_OFFSET_Y);
            if (dist > maxDist) {
                maxDist = dist;
                furthestNode = node;
            }
        }

        console.log(`[DungeonService] Generated ${created} rooms. Furthest node at ${furthestNode.x}, ${furthestNode.y} (dist: ${maxDist})`);

        const portal = new Entity();
        portal.addComponent(new Position(furthestNode.x, furthestNode.y));
        portal.addComponent(new Description("Reality Rift", "<terminal>A BLINDING TEAR IN REALITY</terminal> revealing the stable world beyond."));
        portal.addComponent(new Portal('room', 'plaza'));
        this.engine.addEntity(portal);
        console.log(`[DungeonService] Reality Rift spawned at ${furthestNode.x}, ${furthestNode.y}`);
    }

    private createRoom(x: number, y: number, isEntry: boolean) {
        const room = new Entity();
        room.addComponent(new IsRoom());
        room.addComponent(new Position(x, y));

        const flavor = this.generateRoomFlavor(isEntry);
        room.addComponent(new Description(flavor.title, flavor.desc));
        room.addComponent(new Atmosphere("Glitch-Fog", "Strobe", "Erratic"));

        this.engine.addEntity(room);
        console.log(`[DungeonService] Added room entity ${room.id} at (${x}, ${y}), isEntry: ${isEntry}`);

        if (!isEntry) {
            if (Math.random() < 0.6) {
                this.spawnEnemy(x, y);
            }
        }
    }

    private generateRoomFlavor(isEntry: boolean): { title: string, desc: string } {
        if (isEntry) {
            return {
                title: "Glitch Zone Entry",
                desc: "The floor here is a wireframe grid floating in a void. Code fragments drift like snow."
            };
        }

        const prefixes = ["Corrupted", "Fragmented", "Null", "Static", "Neon", "Digital"];
        const nouns = ["Sector", "Cache", "Node", "Buffer", "Archive", "Nexus"];
        const title = `${prefixes[Math.floor(Math.random() * prefixes.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;

        const descs = [
            "Walls of scrolling hex-code pulse with a sickly green light.",
            "The geometry here is non-Euclidean, shifting when you look away.",
            "Floating monoliths of black data block your path.",
            "The air tastes like copper and ozone. Static electricity crackles.",
            "Ghostly echoes of deleted files whisper from the shadows."
        ];

        return {
            title: title,
            desc: descs[Math.floor(Math.random() * descs.length)]
        };
    }

    private spawnEnemy(x: number, y: number) {
        if (this.enemies.length === 0) return;

        // Filter by tier based on distance
        const dist = Math.abs(x - this.DUNGEON_OFFSET_X) + Math.abs(y - this.DUNGEON_OFFSET_Y);
        const targetTier = Math.min(4, 1 + Math.floor(dist / 15));
        const eligibleEnemies = this.enemies.filter(e => e.tier <= targetTier);
        const enemyDef = eligibleEnemies.length > 0
            ? eligibleEnemies[Math.floor(Math.random() * eligibleEnemies.length)]
            : this.enemies[0];

        const entity = new Entity();
        entity.addComponent(new NPC(
            enemyDef.name,
            ["...buffer overflow...", "010101", "kill -9"],
            enemyDef.description,
            true, // canMove
            'glitch_enemy',
            true // isAggressive
        ));
        entity.addComponent(new Position(x, y));

        // Map Stats with scaling based on distance
        const scale = 1 + (dist / 30); // ~3% increase per unit distance

        const hp = Math.floor(enemyDef.stats.hp * scale);
        const atk = Math.floor(enemyDef.stats.atk * scale);
        const def = Math.floor(enemyDef.stats.def * scale);

        entity.addComponent(new CombatStats(hp, atk, def));
        entity.addComponent(new Stats()); // Base stats

        // Visuals
        entity.addComponent(new Visuals(
            enemyDef.visuals.char,
            enemyDef.visuals.color,
            enemyDef.visuals.glitch_rate
        ));

        this.engine.addEntity(entity);
    }

    public markVisited(playerId: string, x: number, y: number) {
        if (!this.visitedRooms.has(playerId)) {
            this.visitedRooms.set(playerId, new Set());
        }
        this.visitedRooms.get(playerId)!.add(`${x},${y}`);
    }

    public isVisited(playerId: string, x: number, y: number): boolean {
        if (x < this.DUNGEON_OFFSET_X || x >= 10000) return true;
        return this.visitedRooms.get(playerId)?.has(`${x},${y}`) || false;
    }

    public getRemainingEnemiesCount(): number {
        return Array.from(this.engine.getEntities().values()).filter(e => {
            const npc = e.getComponent(NPC);
            const pos = e.getComponent(Position);
            return npc && npc.tag === 'glitch_enemy' && pos && pos.x >= this.DUNGEON_OFFSET_X;
        }).length;
    }
}
