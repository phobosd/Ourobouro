export class LayoutGenerator {
    public static createLayout(w: number, h: number): number[][] {
        const layout = Array(h).fill(0).map(() => Array(w).fill(0));
        const cx = Math.floor(w / 2);
        const cy = Math.floor(h / 2);

        // Main Streets
        for (let y = 2; y < h - 2; y++) layout[y][cx] = 1;
        for (let x = 2; x < w - 2; x++) layout[cy][x] = 1;

        // Plaza
        layout[cy][cx] = 2;
        layout[cy - 1][cx] = 2;
        layout[cy + 1][cx] = 2;
        layout[cy][cx - 1] = 2;
        layout[cy][cx + 1] = 2;
        layout[cy - 1][cx - 1] = 2;
        layout[cy - 1][cx + 1] = 2;
        layout[cy + 1][cx - 1] = 2;
        layout[cy + 1][cx + 1] = 2;

        // Shops
        layout[cy - 2][cx - 2] = 3; // Cyber-Implant Shop
        layout[cy - 2][cx + 2] = 3; // Weapon Shop
        layout[cy + 2][cx - 2] = 3; // General Store

        // Shop Connections (Side Streets)
        layout[cy - 2][cx - 1] = 1; // Connect (8,8) to Main St (10,8)
        layout[cy - 2][cx + 1] = 1; // Connect (12,8) to Main St (10,8)
        layout[cy + 2][cx - 1] = 1; // Connect (8,12) to Main St (10,12)

        // Clinic
        layout[cy + 2][cx + 2] = 4;
        layout[cy + 2][cx + 1] = 1; // Connect (12,12) to Main St (10,12)

        // Club
        layout[cy][cx + 5] = 5;
        layout[cy][cx + 6] = 5;
        layout[cy + 1][cx + 5] = 5;
        layout[cy + 1][cx + 6] = 5;

        // Park
        for (let py = cy + 4; py < cy + 8; py++) {
            for (let px = cx - 6; px < cx - 2; px++) {
                layout[py][px] = 6;
            }
        }
        // Park Connection
        for (let x = cx - 2; x <= cx; x++) {
            layout[cy + 4][x] = 1; // Connect Park top-right to Main St vertical
        }

        // Alchemist's Study (Puzzle Room at 13, 10)
        layout[cy][cx + 3] = 7; // Alchemist's Study
        layout[cy][cx + 2] = 1; // Connecting street

        // Portal Room (Glitch Door at center plaza 10, 10 for easy access)
        layout[cy][cx] = 8; // Portal Room with Glitch Door

        // The Rusty Cog Bar
        layout[9][5] = 9;

        return layout;
    }
}
