export class ParserUtils {
    static readonly ORDINAL_NAMES = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

    /**
     * Parses a string for an ordinal prefix (e.g., "second backpack").
     * Returns the 0-based index and the remaining name.
     */
    static parseOrdinal(input: string): { index: number, name: string } {
        const parts = input.toLowerCase().split(' ');
        if (parts.length > 1) {
            const firstWord = parts[0];
            const ordinalIndex = this.ORDINAL_NAMES.indexOf(firstWord);
            if (ordinalIndex !== -1) {
                return { index: ordinalIndex, name: parts.slice(1).join(' ') };
            }

            // Handle numeric ordinals like "1st", "2nd"
            const numericMatch = firstWord.match(/^(\d+)(st|nd|rd|th)$/);
            if (numericMatch) {
                const num = parseInt(numericMatch[1]);
                if (num > 0) {
                    return { index: num - 1, name: parts.slice(1).join(' ') };
                }
            }
        }
        return { index: 0, name: input };
    }
}
