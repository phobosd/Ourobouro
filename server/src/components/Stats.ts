import { Component } from '../ecs/Component';

export interface Attribute {
    name: string;
    value: number;
}

export interface Skill {
    name: string;
    level: number;
    uses: number;
    maxUses: number; // Calculated as level * 10 usually
}

export class Stats extends Component {
    static type = 'Stats';

    attributes: Map<string, Attribute> = new Map();
    skills: Map<string, Skill> = new Map();

    constructor() {
        super();
        // Initialize default attributes
        this.attributes.set('STR', { name: 'STR', value: 10 });
        this.attributes.set('CON', { name: 'CON', value: 10 });
        this.attributes.set('AGI', { name: 'AGI', value: 10 });
        this.attributes.set('CHA', { name: 'CHA', value: 10 });

        // Initialize default skills
        this.addSkill('Hacking');
        this.addSkill('Stealth');
        this.addSkill('Marksmanship (Light)');
        this.addSkill('Marksmanship (Medium)');
        this.addSkill('Marksmanship (Heavy)');
        this.addSkill('Kenjutsu');
        this.addSkill('Brawling');
    }

    addSkill(name: string, startLevel: number = 1) {
        this.skills.set(name, {
            name,
            level: startLevel,
            uses: 0,
            maxUses: startLevel * 10
        });
    }

    gainSkillUse(skillName: string, amount: number = 1): boolean {
        const skill = this.skills.get(skillName);
        if (skill) {
            skill.uses += amount;
            if (skill.uses >= skill.maxUses) {
                skill.level++;
                skill.uses -= skill.maxUses;
                skill.maxUses = skill.level * 10;
                return true; // Leveled up
            }
        }
        return false;
    }
}
