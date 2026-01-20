import { Logger } from '../utils/Logger';

export interface CostProfile {
    name: string;
    inputCostPer1M: number;
    outputCostPer1M: number;
}

export interface FinOpsStats {
    totalRequests: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalImages: number;
    requestsPerSecond: number;
    uptimeSeconds: number;
    projectedMonthlyCosts: Record<string, number>;
}

export class FinOpsService {
    private static instance: FinOpsService;

    private totalRequests: number = 0;
    private totalPromptTokens: number = 0;
    private totalCompletionTokens: number = 0;
    private totalImages: number = 0;
    private startTime: number = Date.now();

    // For RPS calculation
    private requestTimestamps: number[] = [];
    private readonly RPS_WINDOW_MS = 60000; // 1 minute window for RPS

    private readonly costProfiles: (CostProfile & { imageCostPerUnit: number })[] = [
        { name: 'Gemini 1.5 Flash', inputCostPer1M: 0.075, outputCostPer1M: 0.30, imageCostPerUnit: 0.03 },
        { name: 'Gemini 1.5 Pro', inputCostPer1M: 3.50, outputCostPer1M: 10.50, imageCostPerUnit: 0.03 },
        { name: 'GPT-4o mini', inputCostPer1M: 0.15, outputCostPer1M: 0.60, imageCostPerUnit: 0.04 },
        { name: 'GPT-4o', inputCostPer1M: 5.00, outputCostPer1M: 15.00, imageCostPerUnit: 0.04 },
        { name: 'Claude 3.5 Sonnet', inputCostPer1M: 3.00, outputCostPer1M: 15.00, imageCostPerUnit: 0.04 },
        { name: 'Local (RTX 5090)', inputCostPer1M: 0, outputCostPer1M: 0, imageCostPerUnit: 0 }
    ];

    private constructor() { }

    public static getInstance(): FinOpsService {
        if (!FinOpsService.instance) {
            FinOpsService.instance = new FinOpsService();
        }
        return FinOpsService.instance;
    }

    public recordUsage(promptTokens: number, completionTokens: number) {
        this.totalRequests++;
        this.totalPromptTokens += promptTokens;
        this.totalCompletionTokens += completionTokens;
        this.requestTimestamps.push(Date.now());

        // Clean up old timestamps
        this.cleanOldTimestamps();
    }

    public recordImageGen() {
        this.totalRequests++;
        this.totalImages++;
        this.requestTimestamps.push(Date.now());
        this.cleanOldTimestamps();
    }

    private cleanOldTimestamps() {
        const now = Date.now();
        const cutoff = now - this.RPS_WINDOW_MS;
        while (this.requestTimestamps.length > 0 && this.requestTimestamps[0] < cutoff) {
            this.requestTimestamps.shift();
        }
    }

    public getStats(): FinOpsStats {
        this.cleanOldTimestamps();

        const uptimeSeconds = (Date.now() - this.startTime) / 1000;
        const rps = this.requestTimestamps.length / (this.RPS_WINDOW_MS / 1000);

        const projectedMonthlyCosts: Record<string, number> = {};

        // Calculate projected monthly cost based on current average usage
        // Monthly tokens = (Total Tokens / Uptime) * Seconds in a Month
        const secondsInMonth = 30 * 24 * 60 * 60;
        const projectedPromptTokens = (this.totalPromptTokens / uptimeSeconds) * secondsInMonth;
        const projectedCompletionTokens = (this.totalCompletionTokens / uptimeSeconds) * secondsInMonth;
        const projectedImages = (this.totalImages / uptimeSeconds) * secondsInMonth;

        for (const profile of this.costProfiles) {
            const inputCost = (projectedPromptTokens / 1_000_000) * profile.inputCostPer1M;
            const outputCost = (projectedCompletionTokens / 1_000_000) * profile.outputCostPer1M;
            const imageCost = projectedImages * profile.imageCostPerUnit;
            projectedMonthlyCosts[profile.name] = inputCost + outputCost + imageCost;
        }

        return {
            totalRequests: this.totalRequests,
            totalPromptTokens: this.totalPromptTokens,
            totalCompletionTokens: this.totalCompletionTokens,
            totalImages: this.totalImages,
            requestsPerSecond: rps,
            uptimeSeconds,
            projectedMonthlyCosts
        };
    }

    public getCostProfiles(): CostProfile[] {
        return this.costProfiles;
    }
}
