/**
 * Utility class for formatting messages with XML-like tags for the client.
 */
export class MessageFormatter {
    static wrap(tag: string, content: string): string {
        return `<${tag}>${content}</${tag}>`;
    }

    static title(content: string): string {
        return this.wrap('title', content);
    }

    static success(content: string): string {
        return this.wrap('success', content);
    }

    static error(content: string): string {
        return this.wrap('error', content);
    }

    static action(content: string): string {
        return this.wrap('action', content);
    }

    static system(content: string): string {
        return this.wrap('system', content);
    }

    static item(content: string): string {
        return this.wrap('item', content);
    }

    static npc(content: string): string {
        return this.wrap('npc', content);
    }

    static combat(content: string): string {
        return this.wrap('combat', content);
    }

    static currency(newYen: number, credits: number): string {
        return `<currency>¥${newYen} | ${credits} Credits</currency>`;
    }

    static mapPlayer(content: string): string {
        return this.wrap('map-player', content);
    }

    static mapShop(content: string): string {
        return this.wrap('map-shop', content);
    }

    static mapRoom(content: string): string {
        return this.wrap('map-room', content);
    }

    /**
     * Formats a list of items into a readable string.
     */
    static formatList(items: string[], title?: string): string {
        if (items.length === 0) return '';
        let output = title ? `\n${this.title(title)}\n` : '\n';
        output += items.join('\n');
        return output;
    }
}
