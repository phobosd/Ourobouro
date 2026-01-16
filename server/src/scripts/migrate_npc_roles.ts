import fs from 'fs';
import path from 'path';

const generatedDir = path.join(process.cwd(), 'data', 'generated', 'npcs');

if (fs.existsSync(generatedDir)) {
    const files = fs.readdirSync(generatedDir).filter(f => f.endsWith('.json'));
    console.log(`Found ${files.length} generated NPCs.`);

    files.forEach(file => {
        const filePath = path.join(generatedDir, file);
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const npc = JSON.parse(content);

            // Force update or set if missing
            let role = npc.role;

            // If role is missing or invalid, try to deduce it
            if (!role || !['vendor', 'guard', 'civilian', 'mob', 'boss'].includes(role)) {
                const name = npc.name.toLowerCase();
                const tags = (npc.tags || []).map((t: string) => t.toLowerCase());
                const behavior = (npc.behavior || '').toLowerCase();

                if (name.includes('boss') || name.includes('leader') || name.includes('alpha') || name.includes('avatar') || tags.includes('boss')) {
                    role = 'boss';
                } else if (name.includes('rat') || name.includes('thug') || name.includes('gang') || name.includes('mob') || name.includes('vermin') || name.includes('glitch') || name.includes('drone') || name.includes('mutant') || name.includes('monster') || name.includes('crawler') || name.includes('volatile') || behavior === 'aggressive') {
                    role = 'mob';
                } else if (name.includes('guard') || name.includes('police') || name.includes('security') || name.includes('ice') || tags.includes('security')) {
                    role = 'guard';
                } else if (name.includes('vendor') || name.includes('merchant') || name.includes('doc') || name.includes('shop') || tags.includes('merchant')) {
                    role = 'vendor';
                } else {
                    role = 'civilian'; // Default fallback
                }

                npc.role = role;
                fs.writeFileSync(filePath, JSON.stringify(npc, null, 2));
                console.log(`Updated ${npc.name} (${file}) -> ${role}`);
            }
        } catch (err) {
            console.error(`Failed to process ${file}:`, err);
        }
    });
} else {
    console.log('No generated NPCs directory found.');
}
