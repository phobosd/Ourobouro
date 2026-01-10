import { Server } from 'socket.io';

export interface CommandContext {
    socketId: string;
    args: string[];
    io: Server;
    engine: any; // Using any for now to access entities
    systems: {
        movement: any;
        interaction: any;
        npc: any;
        combat: any;
    }
}

export interface Command {
    name: string;
    aliases: string[];
    description: string;
    execute: (context: CommandContext) => void;
}

export class CommandRegistry {
    private commands: Map<string, Command> = new Map();

    register(command: Command) {
        this.commands.set(command.name, command);
        command.aliases.forEach(alias => this.commands.set(alias, command));
    }

    execute(input: string, context: CommandContext) {
        const parts = input.trim().split(' ');
        const commandName = parts[0].toLowerCase();
        const args = parts.slice(1);
        context.args = args; // Update args in context

        const command = this.commands.get(commandName);

        if (command) {
            command.execute(context);
        } else {
            context.io.to(context.socketId).emit('message', "Invalid command. Type '?' for a list of commands.");
        }
    }

    getHelp(): string {
        const uniqueCommands = Array.from(new Set(this.commands.values()));
        const helpLines = uniqueCommands.map(cmd => {
            const aliases = cmd.aliases.length > 0 ? ` (${cmd.aliases.join(', ')})` : '';
            return `<cmd>${cmd.name}${aliases}</cmd>: ${cmd.description}`;
        });
        return `<title>[Available Commands]</title>\n` + helpLines.join('\n');
    }
}
