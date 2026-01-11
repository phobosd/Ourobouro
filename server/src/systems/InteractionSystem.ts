import { System } from '../ecs/System';
import { Entity } from '../ecs/Entity';
import { Position } from '../components/Position';
import { Description } from '../components/Description';
import { Item } from '../components/Item';
import { Inventory } from '../components/Inventory';
import { Container } from '../components/Container';
import { Stats } from '../components/Stats';
import { CombatStats } from '../components/CombatStats';
import { Stance, StanceType } from '../components/Stance';
import { Terminal } from '../components/Terminal';
import { Server } from 'socket.io';
import * as fs from 'fs';
import * as path from 'path';
import { WorldQuery } from '../utils/WorldQuery';
import { IEngine } from '../commands/CommandRegistry';
import { DescriptionService } from '../services/DescriptionService';
import { MessageFormatter } from '../utils/MessageFormatter';
import { AutocompleteAggregator } from '../services/AutocompleteAggregator';

import { InventoryHandler } from '../handlers/InventoryHandler';
import { PuzzleManager } from '../services/PuzzleManager';
import { CommerceSystem } from '../services/CommerceSystem';

import { MessageService } from '../services/MessageService';

export class InteractionSystem extends System {
    private io: Server;
    private messageService: MessageService;
    private inventoryHandler: InventoryHandler;
    private puzzleManager: PuzzleManager;
    private commerceSystem: CommerceSystem;

    constructor(io: Server) {
        super();
        this.io = io;
        this.messageService = new MessageService(io);
        this.inventoryHandler = new InventoryHandler(io, this.messageService);
        this.puzzleManager = new PuzzleManager(io, this.messageService);
        this.commerceSystem = new CommerceSystem(io, this.messageService);
    }


    update(engine: IEngine, deltaTime: number): void {
        // This system is mostly event-driven for now, but could handle timed interactions later
    }

    handleStanceChange(entityId: string, newStance: StanceType, engine: IEngine) {
        const player = WorldQuery.getEntityById(engine, entityId);
        if (!player) return;

        const stance = player.getComponent(Stance);
        if (!stance) return;

        if (stance.current === newStance) {
            this.messageService.info(entityId, `You are already ${newStance}.`);
            return;
        }

        stance.current = newStance;
        let msg = "";
        switch (newStance) {
            case StanceType.Standing: msg = MessageFormatter.system("You stand up."); break;
            case StanceType.Sitting: msg = MessageFormatter.system("You sit down."); break;
            case StanceType.Lying: msg = MessageFormatter.system("You lie down."); break;
        }

        this.messageService.system(entityId, msg);
    }

    handleLook(entityId: string, engine: IEngine, targetName?: string) {
        const player = WorldQuery.getEntityById(engine, entityId);
        if (!player) return;

        const playerPos = player.getComponent(Position);
        if (!playerPos) return;

        if (targetName) {
            // Check if this is "look in <container>"
            if (targetName.startsWith('in ')) {
                const containerName = targetName.substring(3).trim();
                return this.handleLookInContainer(entityId, containerName, engine);
            }

            const description = DescriptionService.describeTargetAt(player, engine, playerPos, targetName);
            if (description) {
                this.messageService.info(entityId, description);
            } else {
                this.messageService.info(entityId, `You don't see ${targetName} here.`);
            }
            return;
        }

        // Default Look (Room)
        const fullDescription = DescriptionService.describeRoom(playerPos, engine);
        this.messageService.roomDesc(entityId, fullDescription);

        const autocompleteData = AutocompleteAggregator.getRoomAutocomplete(playerPos, engine);
        this.io.to(entityId).emit('autocomplete-update', autocompleteData);
    }

    handleMap(entityId: string, engine: IEngine) {
        const player = WorldQuery.getEntityById(engine, entityId);
        if (!player) return;

        const playerPos = player.getComponent(Position);
        if (!playerPos) return;

        const mapData = DescriptionService.generateMapData(playerPos, engine);
        this.messageService.map(entityId, '', mapData);
    }


    handleLookInContainer(entityId: string, containerName: string, engine: IEngine) {
        const player = WorldQuery.getEntityById(engine, entityId);
        if (!player) return;

        const inventory = player.getComponent(Inventory);
        if (!inventory) return;

        // Search for the container in equipped items
        let targetContainer: Entity | undefined = undefined;
        for (const itemId of inventory.equipment.values()) {
            const item = WorldQuery.getEntityById(engine, itemId);
            const itemComp = item?.getComponent(Item);
            if (itemComp && itemComp.name.toLowerCase().includes(containerName.toLowerCase())) {
                targetContainer = item;
                break;
            }
        }

        if (!targetContainer) {
            this.messageService.info(entityId, `You don't have a ${containerName}.`);
            return;
        }

        const container = targetContainer.getComponent(Container);
        if (!container) {
            this.messageService.info(entityId, `The ${containerName} is not a container.`);
            return;
        }

        const itemComp = targetContainer.getComponent(Item);
        const containerDisplayName = itemComp?.name || containerName;

        const output = DescriptionService.describeContainer(containerDisplayName, container, engine);
        this.messageService.info(entityId, output);
    }

    handleGet(entityId: string, itemName: string, engine: IEngine) {
        this.inventoryHandler.handleGet(entityId, itemName, engine);
    }

    handleDrop(entityId: string, itemName: string, engine: IEngine) {
        this.inventoryHandler.handleDrop(entityId, itemName, engine);
    }

    handleInventory(entityId: string, engine: IEngine) {
        this.inventoryHandler.handleInventory(entityId, engine);
    }


    handleGlance(entityId: string, engine: IEngine) {
        this.inventoryHandler.handleGlance(entityId, engine);
    }

    handleStow(entityId: string, itemName: string, engine: IEngine) {
        this.inventoryHandler.handleStow(entityId, itemName, engine);
    }

    handleSwap(entityId: string, engine: IEngine) {
        this.inventoryHandler.handleSwap(entityId, engine);
    }

    handleSheet(entityId: string, engine: IEngine) {
        const player = WorldQuery.getEntityById(engine, entityId);
        if (!player) return;

        const stats = player.getComponent(Stats);
        const combatStats = player.getComponent(CombatStats);
        if (!stats || !combatStats) {
            this.messageService.info(entityId, "You don't have a character sheet.");
            return;
        }

        const attributes = [];
        for (const [key, attr] of stats.attributes) {
            let fullName = attr.name;
            if (attr.name === 'STR') fullName = 'Strength';
            if (attr.name === 'CON') fullName = 'Constitution';
            if (attr.name === 'AGI') fullName = 'Agility';
            if (attr.name === 'CHA') fullName = 'Charisma';
            attributes.push({ name: fullName, value: attr.value });
        }

        const sheetData = {
            attributes: attributes,
            combat: {
                hp: combatStats.hp,
                maxHp: combatStats.maxHp,
                defense: combatStats.defense,
                damage: combatStats.attack
            }
        };

        this.io.to(entityId).emit('sheet-data', sheetData);
    }

    handleScore(entityId: string, engine: IEngine) {
        const player = WorldQuery.getEntityById(engine, entityId);
        if (!player) return;

        const stats = player.getComponent(Stats);
        if (!stats) {
            this.messageService.info(entityId, "You don't have a character sheet.");
            return;
        }

        const skills = [];
        for (const [key, skill] of stats.skills) {
            const percent = Math.floor((skill.uses / skill.maxUses) * 100);
            skills.push({
                name: skill.name,
                level: skill.level,
                progress: percent
            });
        }

        this.io.to(entityId).emit('score-data', { skills });
    }



    handleRead(entityId: string, engine: IEngine, targetName: string) {
        if (targetName.toLowerCase() === 'guide') {
            try {
                const guidePath = path.join(process.cwd(), '../docs/USERS_GUIDE.md');
                const guideContent = fs.readFileSync(guidePath, 'utf-8');
                this.io.to(entityId).emit('open-guide', { content: guideContent });
                this.messageService.system(entityId, "Opening User's Guide...");
            } catch (err) {
                console.error("Error reading guide:", err);
                this.messageService.error(entityId, "Failed to load User's Guide.");
            }
            return;
        }

        const player = WorldQuery.getEntityById(engine, entityId);
        if (!player) return;

        const playerPos = player.getComponent(Position);
        if (!playerPos) return;

        // Find items/objects at player position
        const targetEntity = engine.getEntitiesWithComponent(Description).find(e => {
            const pos = e.getComponent(Position);
            const desc = e.getComponent(Description);
            return pos && desc && pos.x === playerPos.x && pos.y === playerPos.y &&
                desc.title.toLowerCase().includes(targetName.toLowerCase());
        });

        if (!targetEntity) {
            this.messageService.info(entityId, `You don't see '${targetName}' here.`);
            return;
        }

        const terminal = targetEntity.getComponent(Terminal);
        if (terminal) {
            this.commerceSystem.handleTerminalRead(entityId, engine, targetEntity);
        } else {
            // If it's not a terminal, just show the description (e.g. for the table)
            const desc = targetEntity.getComponent(Description);
            if (desc) {
                this.messageService.info(entityId, desc.description);
            } else {
                this.messageService.info(entityId, "There's nothing to read on that.");
            }
        }
    }

    handleTerminalBuy(entityId: string, engine: IEngine, itemName: string, cost: number) {
        return this.commerceSystem.handleTerminalBuy(entityId, engine, itemName, cost);
    }

    handleTurn(entityId: string, engine: IEngine, targetName: string, direction: string) {
        this.puzzleManager.handleTurn(entityId, engine, targetName, direction);
    }
}


