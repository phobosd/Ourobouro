import { IEngine } from '../../ecs/IEngine';
import { CombatStats } from '../../components/CombatStats';
import { Position } from '../../components/Position';
import { NPC } from '../../components/NPC';
import { WorldQuery } from '../../utils/WorldQuery';
import { MessageService } from '../../services/MessageService';
import { EngagementTier } from '../../types/CombatTypes';
import { CombatUtils } from './CombatUtils';
import { HealthDescriptor } from '../../utils/HealthDescriptor';
import { Stats } from '../../components/Stats';
import { Server } from 'socket.io';

export type HitType = 'crushing' | 'solid' | 'marginal' | 'miss';

export interface AttackFlavor {
    hitLabel: string;
    playerAction: string;
    npcAction: string;
    obsLabel: string;
}

export class CombatLogger {
    static getAttackFlavor(category: string, hitType: HitType): AttackFlavor {
        const cat = category.toLowerCase();

        if (cat.includes('brawling')) {
            switch (hitType) {
                case 'crushing': return { hitLabel: "[KNOCKOUT]", playerAction: "land a devastating blow", npcAction: "lands a devastating blow", obsLabel: "[KNOCKOUT]" };
                case 'solid': return { hitLabel: "[SMACK]", playerAction: "connect solidly", npcAction: "connects solidly", obsLabel: "[SMACK]" };
                case 'marginal': return { hitLabel: "[GRAZE]", playerAction: "graze the target", npcAction: "grazes the target", obsLabel: "[GRAZE]" };
                case 'miss': return { hitLabel: "[MISS]", playerAction: "swing wild", npcAction: "swings wild", obsLabel: "The blow misses!" };
            }
        } else if (cat.includes('pistol') || cat.includes('rifle') || cat.includes('smg') || cat.includes('shotgun') || cat.includes('sweeper')) {
            switch (hitType) {
                case 'crushing': return { hitLabel: "[CRITICAL SHOT]", playerAction: "land a perfect shot", npcAction: "lands a perfect shot", obsLabel: "[CRITICAL SHOT]" };
                case 'solid': return { hitLabel: "[SOLID HIT]", playerAction: "hit the target", npcAction: "hits the target", obsLabel: "[SOLID HIT]" };
                case 'marginal': return { hitLabel: "[GRAZE]", playerAction: "graze the target", npcAction: "grazes the target", obsLabel: "[GRAZE]" };
                case 'miss': return { hitLabel: "[MISS]", playerAction: "shoot wide", npcAction: "shoots wide", obsLabel: "The shot goes wide!" };
            }
        } else if (cat.includes('knife') || cat.includes('blade') || cat.includes('sword') || cat.includes('katana') || cat.includes('machete')) {
            switch (hitType) {
                case 'crushing': return { hitLabel: "[DEEP SLASH]", playerAction: "carve a deep wound", npcAction: "carves a deep wound", obsLabel: "[DEEP SLASH]" };
                case 'solid': return { hitLabel: "[SLASH]", playerAction: "cut into the target", npcAction: "cuts into the target", obsLabel: "[SLASH]" };
                case 'marginal': return { hitLabel: "[NICK]", playerAction: "nick the target", npcAction: "nicks the target", obsLabel: "[NICK]" };
                case 'miss': return { hitLabel: "[MISS]", playerAction: "swing at air", npcAction: "swings at air", obsLabel: "The swing misses!" };
            }
        } else if (cat.includes('whip') || cat.includes('wire')) {
            switch (hitType) {
                case 'crushing': return { hitLabel: "[SEVER]", playerAction: "whip bites deep", npcAction: "whip bites deep", obsLabel: "[SEVER]" };
                case 'solid': return { hitLabel: "[LASH]", playerAction: "lash the target", npcAction: "lashes the target", obsLabel: "[LASH]" };
                case 'marginal': return { hitLabel: "[SNAG]", playerAction: "snag the target", npcAction: "snags the target", obsLabel: "[SNAG]" };
                case 'miss': return { hitLabel: "[MISS]", playerAction: "snap harmlessly", npcAction: "snaps harmlessly", obsLabel: "The wire snaps harmlessly!" };
            }
        } else if (cat.includes('prod') || cat.includes('bat') || cat.includes('club') || cat.includes('knuckles') || cat.includes('hammer')) {
            switch (hitType) {
                case 'crushing': return { hitLabel: "[SMASH]", playerAction: "land a bone-jarring blow", npcAction: "lands a bone-jarring blow", obsLabel: "[SMASH]" };
                case 'solid': return { hitLabel: "[THUMP]", playerAction: "strike the target", npcAction: "strikes the target", obsLabel: "[THUMP]" };
                case 'marginal': return { hitLabel: "[GLANCE]", playerAction: "glance off", npcAction: "glances off", obsLabel: "[GLANCE]" };
                case 'miss': return { hitLabel: "[MISS]", playerAction: "swing wild", npcAction: "swings wild", obsLabel: "The swing misses!" };
            }
        } else if (cat.includes('natural') || cat.includes('rat')) {
            switch (hitType) {
                case 'crushing': return { hitLabel: "[SAVAGE BITE]", playerAction: "tear a chunk of flesh", npcAction: "tears a chunk of flesh", obsLabel: "[SAVAGE BITE]" };
                case 'solid': return { hitLabel: "[BITE]", playerAction: "sink teeth in", npcAction: "sinks teeth in", obsLabel: "[BITE]" };
                case 'marginal': return { hitLabel: "[SCRATCH]", playerAction: "scratch the target", npcAction: "scratches the target", obsLabel: "[SCRATCH]" };
                case 'miss': return { hitLabel: "[MISS]", playerAction: "snap at air", npcAction: "snaps at air", obsLabel: "The attack misses!" };
            }
        }

        // Generic fallback
        switch (hitType) {
            case 'crushing': return { hitLabel: "[CRUSHING]", playerAction: "deal massive damage", npcAction: "deals massive damage", obsLabel: "[CRUSHING HIT]" };
            case 'solid': return { hitLabel: "[SOLID]", playerAction: "hit the target", npcAction: "hits the target", obsLabel: "[SOLID HIT]" };
            case 'marginal': return { hitLabel: "[MARGINAL]", playerAction: "graze the target", npcAction: "grazes the target", obsLabel: "[MARGINAL HIT]" };
            case 'miss': return { hitLabel: "[MISS]", playerAction: "miss", npcAction: "misses", obsLabel: "The attack misses!" };
        }
    }

    static getCriticalHitFlavor(category: string, targetName: string): string {
        const cat = category.toLowerCase();
        let variants: string[] = [];

        if (cat.includes('blade') || cat.includes('sword') || cat.includes('katana')) {
            variants = [
                `\n<combat-crit>*** CRITICAL SEVERANCE ***\nYour weapon flashes in a deadly arc, carving deep into ${targetName} with a spray of crimson mist! The wound is horrific!</combat-crit>`,
                `\n<combat-crit>*** ARTERY SEVERED ***\nA precise slash opens a fountain of blood! ${targetName} staggers as their life force spills onto the pavement!</combat-crit>`,
                `\n<combat-crit>*** SURGICAL PRECISION ***\nYou slip your weapon past their guard, piercing a vital organ! ${targetName} gasps in shock!</combat-crit>`,
                `\n<combat-crit>*** LIMB MAIMER ***\nYour blade bites deep into muscle and bone! ${targetName} screams as the limb hangs by a thread!</combat-crit>`,
                `\n<combat-crit>*** ELEGANT EXECUTION ***\nA blur of motion, a flash of steel. You strike with perfect form, leaving ${targetName} bleeding from a massive gash!</combat-crit>`
            ];
        } else if (cat.includes('blunt') || cat.includes('brawling')) {
            variants = [
                `\n<combat-crit>*** BONE SHATTERING IMPACT ***\nYou connect with sickening force! The sound of ${targetName}'s bones snapping echoes through the air as they are violently thrown back!</combat-crit>`,
                `\n<combat-crit>*** CONCUSSIVE FORCE ***\nYou slam into ${targetName} with the force of a freight train! Their eyes roll back as they crumble!</combat-crit>`,
                `\n<combat-crit>*** RIB CRACKER ***\nA thunderous blow to the chest! You hear the distinct crunch of ribs giving way as ${targetName} doubles over!</combat-crit>`,
                `\n<combat-crit>*** JAW BREAKER ***\nYou catch ${targetName} flush on the chin! Teeth fly and blood sprays as their head snaps back violently!</combat-crit>`,
                `\n<combat-crit>*** INTERNAL HEMORRHAGE ***\nThe impact ripples through ${targetName}'s body, rupturing organs! They cough up blood, stunned by the heavy blow!</combat-crit>`
            ];
        } else if (cat.includes('pistol') || cat.includes('rifle') || cat.includes('smg') || cat.includes('shotgun')) {
            variants = [
                `\n<combat-crit>*** HEADSHOT ***\nA perfect shot! The round obliterates matter and bone, exiting ${targetName} in a gruesome shower of debris!</combat-crit>`,
                `\n<combat-crit>*** CENTER MASS ***\nYou drill a round straight into ${targetName}'s chest! The impact knocks them off their feet, gasping for air!</combat-crit>`,
                `\n<combat-crit>*** VITAL ORGAN HIT ***\nThe shot pierces ${targetName}'s defenses, tearing through soft tissue! They clutch the wound in agony!</combat-crit>`,
                `\n<combat-crit>*** ARMOR PIERCING ***\nYour shot punches clean through armor and flesh alike! ${targetName} is thrown backward by the kinetic energy!</combat-crit>`,
                `\n<combat-crit>*** PRECISION STRIKE ***\nYou thread the needle, landing a shot in a chink in their armor! ${targetName} howls as the projectile finds its mark!</combat-crit>`
            ];
        } else {
            variants = [
                `\n<combat-crit>*** DEVASTATING BLOW ***\nYou unleash a strike of pure destruction! ${targetName} is mangled by the sheer force of the impact!</combat-crit>`,
                `\n<combat-crit>*** OVERWHELMING POWER ***\nYou strike with such ferocity that ${targetName} is lifted off their feet and slammed into the ground!</combat-crit>`,
                `\n<combat-crit>*** BRUTAL IMPACT ***\nA savage hit that leaves ${targetName} dazed and broken! The sound of the impact echoes in the room!</combat-crit>`,
                `\n<combat-crit>*** MERCILESS STRIKE ***\nYou exploit a weakness, driving your attack home with lethal intent! ${targetName} reels from the pain!</combat-crit>`,
                `\n<combat-crit>*** CATASTROPHIC HIT ***\nYour attack connects perfectly, dealing massive trauma! ${targetName} looks visibly shaken and battered!</combat-crit>`
            ];
        }
        return variants[Math.floor(Math.random() * variants.length)];
    }

    static getNPCCriticalHitFlavor(npcName: string): string {
        const variants = [
            `\n<combat-crit>*** SAVAGE MAULING ***\n${npcName} tears into you with primal fury! The pain is blinding as claws or weapons rend flesh!</combat-crit>`,
            `\n<combat-crit>*** CRUSHING ASSAULT ***\n${npcName} lands a heavy blow that knocks the wind out of you! You struggle to stay standing!</combat-crit>`,
            `\n<combat-crit>*** LETHAL PRECISION ***\n${npcName} strikes a vital spot! You feel a sharp, burning pain as your health plummets!</combat-crit>`,
            `\n<combat-crit>*** BRUTAL TAKEDOWN ***\n${npcName} sweeps your defenses aside and slams you with a devastating attack! The world spins!</combat-crit>`,
            `\n<combat-crit>*** VICIOUS GORE ***\n${npcName} unleashes a gruesome attack, leaving you bleeding and battered! The sight is horrifying!</combat-crit>`
        ];
        return variants[Math.floor(Math.random() * variants.length)];
    }

    static getBalanceDescription(balance: number): string {
        if (balance >= 0.9) return "solidly balanced";
        if (balance >= 0.7) return "balanced";
        if (balance >= 0.5) return "somewhat off balance";
        if (balance >= 0.3) return "badly balanced";
        return "very badly balanced";
    }

    static handleBalance(playerId: string, engine: IEngine, messageService: MessageService) {
        const player = WorldQuery.getEntityById(engine, playerId);
        const stats = player?.getComponent(CombatStats);

        if (!player || !stats) return;

        const balanceStr = this.getBalanceDescription(stats.balance);
        const percentage = Math.floor(stats.balance * 100);
        messageService.info(playerId, `You are ${balanceStr} (${percentage}%).`);
    }

    static handleAssess(playerId: string, engine: IEngine, messageService: MessageService) {
        const player = WorldQuery.getEntityById(engine, playerId);
        const stats = player?.getComponent(CombatStats);
        const pos = player?.getComponent(Position);

        if (!player || !stats || !pos) return;

        const balanceStr = this.getBalanceDescription(stats.balance);
        let output = `\nYou (${balanceStr}) are `;

        // Find all NPCs in the room
        const targets = WorldQuery.findNPCsAt(engine, pos.x, pos.y);

        if (targets.length === 0) {
            output += "standing alone.\n";
        } else {
            const engagedTarget = targets.find(t => {
                const tStats = t.getComponent(CombatStats);
                return tStats?.engagementTier === stats.engagementTier && stats.engagementTier !== EngagementTier.DISENGAGED;
            });

            if (engagedTarget) {
                const tStats = engagedTarget.getComponent(CombatStats);
                const npcComp = engagedTarget.getComponent(NPC);
                const name = npcComp?.typeName || "Unknown";
                const coloredName = tStats?.isHostile ? `<enemy id="${engagedTarget.id}">${name}</enemy>` : `<npc id="${engagedTarget.id}">${name}</npc>`;
                output += `facing a ${coloredName} at <range>${stats.engagementTier}</range> range.\n`;
            } else {
                output += "facing nothing in particular.\n";
            }

            if (targets.length > (engagedTarget ? 1 : 0)) {
                output += "Nearby combatants:\n";
                for (const npc of targets) {
                    if (npc === engagedTarget) continue;
                    const tStats = npc.getComponent(CombatStats);
                    const npcComp = npc.getComponent(NPC);
                    if (!tStats || !npcComp) continue;

                    const tName = tStats.isHostile ? `<enemy id="${npc.id}">${npcComp.typeName}</enemy>` : `<npc id="${npc.id}">${npcComp.typeName}</npc>`;
                    const tBalance = this.getBalanceDescription(tStats.balance);
                    const hostileTag = tStats.isHostile ? " <error>[HOSTILE]</error>" : "";

                    if (tStats.engagementTier === EngagementTier.DISENGAGED) {
                        output += `A ${tName}${hostileTag} (${tBalance}) is nearby.\n`;
                    } else {
                        output += `A ${tName}${hostileTag} (${tBalance}) is flanking you at <range>${tStats.engagementTier}</range> range.\n`;
                    }
                }
            }
        }

        messageService.info(playerId, output);
    }

    static handleAppraise(playerId: string, targetName: string, engine: IEngine, messageService: MessageService) {
        const player = WorldQuery.getEntityById(engine, playerId);
        const pPos = player?.getComponent(Position);
        if (!pPos) return;

        const { name, ordinal } = CombatUtils.parseTargetName(targetName);
        const roomNPCs = engine.getEntitiesWithComponent(NPC).filter(e => {
            const npc = e.getComponent(NPC);
            const pos = e.getComponent(Position);
            return npc && pos && npc.typeName.toLowerCase().includes(name.toLowerCase()) &&
                pos.x === pPos.x && pos.y === pPos.y;
        });

        const target = roomNPCs[ordinal - 1];
        if (!target) {
            messageService.info(playerId, `You don't see "${targetName}" here.`);
            return;
        }

        const tStats = target.getComponent(CombatStats);
        const npc = target.getComponent(NPC);
        const statsComp = target.getComponent(Stats);
        const maxFatigue = statsComp ? (statsComp.attributes.get('CON')?.value || 10) * 10 : 100;

        if (tStats && npc) {
            const detailedStatus = HealthDescriptor.getDetailedStatus(tStats, maxFatigue);
            const balanceDesc = this.getBalanceDescription(tStats.balance);
            messageService.info(playerId, `\n[APPRAISAL: ${npc.typeName}]\n${detailedStatus}\nBalance: ${balanceDesc}\n`);
        }
    }

    static sendCombatState(playerId: string, engine: IEngine, io: Server) {
        const player = WorldQuery.getEntityById(engine, playerId);
        const stats = player?.getComponent(CombatStats);
        const pos = player?.getComponent(Position);
        const playerStats = player?.getComponent(Stats);

        if (!player || !stats || !pos) return;

        // Determine if in combat (hostile target or engaged)
        const inCombat = stats.isHostile || stats.engagementTier !== EngagementTier.DISENGAGED;

        if (!inCombat) {
            io.to(playerId).emit('combat-state', { inCombat: false });
            return;
        }

        const maxFatigue = playerStats ? (playerStats.attributes.get('CON')?.value || 10) * 10 : 100;

        const state: any = {
            inCombat: true,
            player: {
                balance: stats.balance,
                balanceDesc: this.getBalanceDescription(stats.balance),
                fatigue: stats.fatigue,
                maxFatigue: maxFatigue,
                engagementTier: stats.engagementTier
            },
            target: null,
            nearby: []
        };

        // Find all NPCs in the room
        const targets = WorldQuery.findNPCsAt(engine, pos.x, pos.y);

        // Identify primary target
        let engagedTarget = targets.find(t => {
            const tStats = t.getComponent(CombatStats);
            return tStats?.targetId === playerId || (tStats?.engagementTier === stats.engagementTier && stats.engagementTier !== EngagementTier.DISENGAGED);
        });

        // If no engaged target, but we have a targetId, try to find that
        if (!engagedTarget && stats.targetId) {
            engagedTarget = targets.find(t => t.id === stats.targetId);
        }

        if (engagedTarget) {
            const tStats = engagedTarget.getComponent(CombatStats);
            const npcComp = engagedTarget.getComponent(NPC);
            if (tStats && npcComp) {
                state.target = {
                    id: engagedTarget.id,
                    name: npcComp.typeName,
                    hp: tStats.hp,
                    maxHp: tStats.maxHp,
                    status: HealthDescriptor.getStatusDescriptor(tStats.hp, tStats.maxHp),
                    balance: tStats.balance,
                    balanceDesc: this.getBalanceDescription(tStats.balance),
                    range: tStats.engagementTier
                };
            }
        }

        // Populate nearby
        for (const npc of targets) {
            if (engagedTarget && npc.id === engagedTarget.id) continue;
            const tStats = npc.getComponent(CombatStats);
            const npcComp = npc.getComponent(NPC);
            if (!tStats || !npcComp) continue;

            state.nearby.push({
                id: npc.id,
                name: npcComp.typeName,
                isHostile: tStats.isHostile,
                balanceDesc: this.getBalanceDescription(tStats.balance),
                range: tStats.engagementTier
            });
        }

        io.to(playerId).emit('combat-state', state);
    }
}
