import fs from 'fs';
import path from 'path';
import { Logger } from './Logger';

export class ImageDownloader {
    private static CLIENT_PUBLIC_DIR = path.join(process.cwd(), '..', 'client', 'public');
    private static ASSETS_DIR = path.join(ImageDownloader.CLIENT_PUBLIC_DIR, 'assets', 'portraits');

    static async downloadImage(url: string, filename: string): Promise<string | null> {
        try {
            // Ensure directory exists
            if (!fs.existsSync(this.ASSETS_DIR)) {
                fs.mkdirSync(this.ASSETS_DIR, { recursive: true });
            }

            const response = await fetch(url);
            if (!response.ok) {
                Logger.error('ImageDownloader', `Failed to fetch image from ${url}: ${response.statusText}`);
                return null;
            }

            const buffer = await response.arrayBuffer();
            const filePath = path.join(this.ASSETS_DIR, filename);

            fs.writeFileSync(filePath, Buffer.from(buffer));

            Logger.info('ImageDownloader', `Downloaded image to ${filePath}`);

            // Return relative path for client
            return `/assets/portraits/${filename}`;
        } catch (error) {
            Logger.error('ImageDownloader', `Error downloading image: ${error}`);
            return null;
        }
    }
}
