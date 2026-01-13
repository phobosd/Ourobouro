import { System } from '../ecs/System';
import { Entity } from '../ecs/Entity';
import { Position } from '../components/Position';
import { Description } from '../components/Description';
import { Inventory } from '../components/Inventory';
import { Item } from '../components/Item';
import { Container } from '../components/Container';
import { Server } from 'socket.io';
import { WorldQuery } from '../utils/WorldQuery';
import { IEngine } from '../ecs/IEngine';
import { DescriptionService } from '../services/DescriptionService';
import { MessageService } from '../services/MessageService';
import { AutocompleteAggregator } from '../services/AutocompleteAggregator';
import { ParserUtils } from '../utils/ParserUtils';

export class ObservationSystem extends System {
    private messageService: MessageService;

    constructor(private io: Server) {
        super();
        this.messageService = new MessageService(io);
    }

    update(engine: IEngine, deltaTime: number): void {
        // Passive observation logic could go here
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

        this.refreshAutocomplete(entityId, engine);
    }

    handleLookInContainer(entityId: string, containerName: string, engine: IEngine) {
        const player = WorldQuery.getEntityById(engine, entityId);
        if (!player) return;

        const inventory = player.getComponent(Inventory);
        if (!inventory) return;

        const { index, name: targetName } = ParserUtils.parseOrdinal(containerName);
        const matches: Entity[] = [];

        // Search for the container in hands first
        // Check left hand
        if (inventory.leftHand) {
            const item = WorldQuery.getEntityById(engine, inventory.leftHand);
            const itemComp = item?.getComponent(Item);
            if (itemComp && itemComp.name.toLowerCase().includes(targetName)) {
                matches.push(item!);
            }
        }

        // Check right hand
        if (inventory.rightHand) {
            const item = WorldQuery.getEntityById(engine, inventory.rightHand);
            const itemComp = item?.getComponent(Item);
            if (itemComp && itemComp.name.toLowerCase().includes(targetName)) {
                matches.push(item!);
            }
        }

        // Search for the container in equipped items
        for (const itemId of inventory.equipment.values()) {
            const item = WorldQuery.getEntityById(engine, itemId);
            const itemComp = item?.getComponent(Item);
            if (itemComp && itemComp.name.toLowerCase().includes(targetName)) {
                matches.push(item!);
            }
        }

        const targetContainer = matches[index];

        if (!targetContainer) {
            const ordinalStr = index > 0 ? `${ParserUtils.ORDINAL_NAMES[index] || (index + 1) + 'th'} ` : '';
            this.messageService.info(entityId, `You don't have a ${ordinalStr}${targetName}.`);
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

    handleMap(entityId: string, engine: IEngine) {
        const player = WorldQuery.getEntityById(engine, entityId);
        if (!player) return;

        const playerPos = player.getComponent(Position);
        if (!playerPos) return;

        const mapData = DescriptionService.generateMapData(playerPos, engine);
        this.messageService.map(entityId, '', mapData);
    }

    handleGlance(entityId: string, engine: IEngine) {
        const player = WorldQuery.getEntityById(engine, entityId);
        if (!player) return;

        const inventory = player.getComponent(Inventory);
        if (!inventory) return;

        const getHandContent = (handId: string | null) => {
            if (!handId) return "nothing";
            const item = WorldQuery.getEntityById(engine, handId);
            return item?.getComponent(Item)?.name || "something unknown";
        };

        const leftHand = getHandContent(inventory.leftHand);
        const rightHand = getHandContent(inventory.rightHand);

        let message = "";
        if (leftHand === "nothing" && rightHand === "nothing") {
            message = "You glance down at your empty hands.";
        } else {
            message = `You glance down and see you are holding ${leftHand === "nothing" ? "nothing" : `a ${leftHand}`} in your left hand and ${rightHand === "nothing" ? "nothing" : `a ${rightHand}`} in your right hand.`;
        }

        this.messageService.info(entityId, message);
    }

    public refreshAutocomplete(entityId: string, engine: IEngine) {
        const player = WorldQuery.getEntityById(engine, entityId);
        if (!player) return;

        const playerPos = player.getComponent(Position);
        if (!playerPos) return;

        const autocompleteData = AutocompleteAggregator.getRoomAutocomplete(playerPos, engine);
        this.io.to(entityId).emit('autocomplete-update', autocompleteData);
    }
}
