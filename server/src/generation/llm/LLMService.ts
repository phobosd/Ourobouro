import { LLMProfile, LLMRole } from '../../services/GuardrailService';
import { Logger } from '../../utils/Logger';
import { FinOpsService } from '../../services/FinOpsService';

export interface LLMResponse {
    text: string;
    reasoning?: string;
    model: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
    };
}

export class LLMService {
    private profiles: Record<string, LLMProfile> = {};

    constructor(profiles: Record<string, LLMProfile>) {
        this.profiles = profiles;
    }

    public updateConfig(profiles: Record<string, LLMProfile>) {
        this.profiles = profiles;
        Logger.info('LLMService', `Updated with ${Object.keys(profiles).length} profiles.`);
    }

    /**
     * Chat with a model assigned to a specific role.
     */
    public async chat(prompt: string, systemPrompt: string = "You are a helpful assistant.", role: LLMRole = LLMRole.DEFAULT): Promise<LLMResponse> {
        const profile = this.getProfileForRole(role);

        if (!profile) {
            Logger.error('LLMService', `No LLM profile found for role: ${role}`);
            throw new Error(`No LLM profile found for role: ${role}`);
        }

        Logger.info('LLMService', `Routing [${role}] request to: ${profile.name} | Model: ${profile.model} | Provider: ${profile.provider}`);
        Logger.info('LLMService', `Prompt: ${prompt.substring(0, 100)}...`);

        let response: LLMResponse;
        if (profile.provider === 'gemini') {
            response = await this.callGemini(profile, prompt, systemPrompt);
        } else if (profile.provider === 'pollinations') {
            // Pollinations text uses the new gen.pollinations.ai gateway
            const textProfile = { ...profile, baseUrl: 'https://gen.pollinations.ai/v1' };
            response = await this.callOpenAICompatible(textProfile, prompt, systemPrompt);
        } else {
            // OpenAI and Local (LM Studio/Ollama) use the same OpenAI-compatible format
            response = await this.callOpenAICompatible(profile, prompt, systemPrompt);
        }

        Logger.info('LLMService', `Response from ${profile.model}: ${response.text.substring(0, 100)}...`);
        return response;
    }

    /**
     * Convenience method for simple text generation using the DEFAULT role.
     */
    public async generateText(prompt: string, systemPrompt: string = "You are a helpful assistant."): Promise<string> {
        const response = await this.chat(prompt, systemPrompt, LLMRole.DEFAULT);
        return response.text;
    }

    /**
     * Generate an image using a model assigned to the IMAGE role.
     */
    public async generateImage(prompt: string, role: LLMRole = LLMRole.IMAGE): Promise<{ url: string; model: string }> {
        const profile = this.getProfileForRole(role);

        if (!profile) {
            Logger.warn('LLMService', `No IMAGE profile found. Falling back to placeholder.`);
            return { url: "", model: "none" };
        }

        Logger.info('LLMService', `Generating image via: ${profile.name} | Model: ${profile.model}`);

        let url = "";
        if (profile.provider === 'openai') {
            url = await this.generateOpenAIImage(profile, prompt);
        } else if (profile.provider === 'gemini') {
            url = await this.generateGeminiImage(profile, prompt);
        } else if (profile.provider === 'pollinations') {
            url = await this.generatePollinationsImage(profile, prompt);
        } else if (profile.provider === 'stable-diffusion') {
            url = await this.generateStableDiffusionImage(profile, prompt);
        } else {
            // Local providers usually don't support image gen via the same API
            // But we'll try the OpenAI-compatible image endpoint just in case
            url = await this.generateOpenAIImage(profile, prompt);
        }

        return { url, model: profile.model };
    }

    private getProfileForRole(role: LLMRole): LLMProfile | undefined {
        const profiles = Object.values(this.profiles);

        // 1. Try to find a profile explicitly assigned to this role
        // For IMAGE role, prioritize providers that are NOT 'local'
        if (role === LLMRole.IMAGE) {
            const imageProfiles = profiles.filter(p => p.roles.includes(role));
            const nonLocal = imageProfiles.find(p => p.provider !== 'local');
            if (nonLocal) return nonLocal;
            if (imageProfiles.length > 0) return imageProfiles[0];
        } else {
            const specific = profiles.find(p => p.roles.includes(role));
            if (specific) return specific;
        }

        // 2. Fallback to DEFAULT role
        const fallback = profiles.find(p => p.roles.includes(LLMRole.DEFAULT));
        if (fallback) return fallback;

        // 3. Fallback to the first available profile
        return profiles[0];
    }

    private async callOpenAICompatible(profile: LLMProfile, prompt: string, systemPrompt: string): Promise<LLMResponse> {
        try {
            let baseUrl = profile.baseUrl.replace(/\/+$/, '');
            // For local providers, if they don't have /v1, they often need it for OpenAI compatibility
            if (profile.provider === 'local' && !baseUrl.endsWith('/v1') && !baseUrl.includes('/v1/')) {
                baseUrl += '/v1';
            }
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${profile.apiKey || 'not-needed'}`
                },
                body: JSON.stringify({
                    model: profile.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`OpenAI API Error (${response.status}): ${error}`);
            }

            const data = await response.json();
            if (!data.choices || data.choices.length === 0 || !data.choices[0].message) {
                throw new Error(`OpenAI response missing choices or message content. Response: ${JSON.stringify(data)}`);
            }

            const message = data.choices[0].message;
            const usage = {
                promptTokens: data.usage?.prompt_tokens || 0,
                completionTokens: data.usage?.completion_tokens || 0
            };

            // Record usage for FinOps
            FinOpsService.getInstance().recordUsage(usage.promptTokens, usage.completionTokens);

            return {
                text: message.content,
                reasoning: message.reasoning_content || null,
                model: profile.model,
                usage
            };
        } catch (err) {
            Logger.error('LLMService', `OpenAI call failed: ${err}`);
            throw err;
        }
    }

    private async callGemini(profile: LLMProfile, prompt: string, systemPrompt: string): Promise<LLMResponse> {
        try {
            // Gemini API uses a different structure
            const url = `${profile.baseUrl}/models/${profile.model}:generateContent?key=${profile.apiKey}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [
                        {
                            role: 'user',
                            parts: [{ text: `${systemPrompt}\n\nUser Request: ${prompt}` }]
                        }
                    ],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 2048,
                    }
                })
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Gemini API Error (${response.status}): ${error}`);
            }

            const data = await response.json();
            const usage = {
                promptTokens: data.usageMetadata?.promptTokenCount || 0,
                completionTokens: data.usageMetadata?.candidatesTokenCount || 0
            };

            // Record usage for FinOps
            FinOpsService.getInstance().recordUsage(usage.promptTokens, usage.completionTokens);

            return {
                text: data.candidates[0].content.parts[0].text,
                model: profile.model,
                usage
            };
        } catch (err) {
            Logger.error('LLMService', `Gemini call failed: ${err}`);
            throw err;
        }
    }

    private async generateOpenAIImage(profile: LLMProfile, prompt: string): Promise<string> {
        try {
            const response = await fetch(`${profile.baseUrl}/images/generations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${profile.apiKey || 'not-needed'}`
                },
                body: JSON.stringify({
                    model: profile.model,
                    prompt: prompt,
                    n: 1,
                    size: "1024x1024"
                })
            });

            if (!response.ok) {
                const error = await response.text();
                Logger.error('LLMService', `OpenAI Image Error (${response.status}): ${error}`);
                return "";
            }

            const data = await response.json();
            if (data.data && data.data[0] && data.data[0].url) {
                FinOpsService.getInstance().recordImageGen();
                return data.data[0].url;
            } else {
                Logger.error('LLMService', `OpenAI Image response missing data.data[0].url. Response: ${JSON.stringify(data)}`);
                return "";
            }
        } catch (err) {
            Logger.error('LLMService', `OpenAI image generation failed: ${err}`);
            return "";
        }
    }

    private async generatePollinationsImage(profile: LLMProfile, prompt: string): Promise<string> {
        try {
            // Clean up prompt: remove trailing punctuation, internal question marks, and limit length
            let cleanPrompt = prompt.trim()
                .replace(/\?/g, "") // Remove all question marks
                .replace(/[.,!?;:]+$/, ""); // Remove trailing punctuation

            if (cleanPrompt.length > 800) {
                cleanPrompt = cleanPrompt.substring(0, 800);
            }

            const encodedPrompt = encodeURIComponent(cleanPrompt);
            const width = 1024;
            const height = 1024;
            const model = profile.model || 'flux';

            // Use the reliable image.pollinations.ai endpoint for direct image fetching
            const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&model=${model}&nologo=true`;

            Logger.info('LLMService', `Generated Pollinations URL: ${imageUrl}`);
            FinOpsService.getInstance().recordImageGen();
            return imageUrl;
        } catch (err) {
            Logger.error('LLMService', `Pollinations image generation failed: ${err}`);
            return "";
        }
    }

    private async generateGeminiImage(profile: LLMProfile, prompt: string): Promise<string> {
        try {
            const modelId = profile.model.includes('imagen') ? profile.model : 'imagen-3.0-generate-001';

            // Try the preferred method first based on model name
            const isImagen4 = modelId.includes('imagen-4');
            const methods = isImagen4 ? ['predict', 'generateImages'] : ['generateImages', 'predict'];

            for (const method of methods) {
                const url = `${profile.baseUrl}/models/${modelId}:${method}?key=${profile.apiKey}`;
                Logger.info('LLMService', `Attempting Gemini Image Gen [${method}]: ${modelId}`);

                const body = method === 'predict' ? {
                    instances: [{ prompt }],
                    parameters: { sampleCount: 1 }
                } : {
                    prompt: prompt,
                    number_of_images: 1,
                    safety_filter_level: "BLOCK_MEDIUM_AND_ABOVE",
                    person_generation: "ALLOW_ADULT"
                };

                try {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    });

                    if (!response.ok) {
                        const error = await response.text();
                        Logger.warn('LLMService', `Gemini Image [${method}] failed (${response.status}): ${error.substring(0, 200)}`);
                        continue; // Try next method
                    }

                    const data = await response.json();

                    // Handle :generateImages response (Imagen 3 style)
                    if (data.images && data.images[0] && data.images[0].imageRawBase64) {
                        Logger.info('LLMService', `Successfully generated image via ${method} (imageRawBase64)`);
                        return `data:image/png;base64,${data.images[0].imageRawBase64}`;
                    }

                    // Handle :predict response (Imagen 4 / Vertex style)
                    if (data.predictions && data.predictions[0]) {
                        const pred = data.predictions[0];
                        const base64 = pred.bytesBase64Encoded || pred.imageRawBase64 || (typeof pred === 'string' ? pred : null);
                        if (base64) {
                            Logger.info('LLMService', `Successfully generated image via ${method} (predictions)`);
                            FinOpsService.getInstance().recordImageGen();
                            return `data:image/png;base64,${base64}`;
                        }
                    }

                    Logger.warn('LLMService', `Gemini Image [${method}] returned no recognizable image data. Keys: ${Object.keys(data)}`);
                } catch (err) {
                    Logger.error('LLMService', `Error during Gemini Image [${method}]: ${err}`);
                }
            }

            return "";
        } catch (err) {
            Logger.error('LLMService', `Gemini image generation failed: ${err}`);
            return "";
        }
    }

    private async generateStableDiffusionImage(profile: LLMProfile, prompt: string): Promise<string> {
        try {
            // Standard Automatic1111 API endpoint
            const baseUrl = profile.baseUrl.replace(/\/+$/, '');
            const url = `${baseUrl}/sdapi/v1/txt2img`;

            Logger.info('LLMService', `Attempting Stable Diffusion generation at: ${url}`);

            const body = {
                prompt: `${prompt}, masterpiece, best quality, 8k, ultra detailed`,
                negative_prompt: "photorealistic, real life, 3d render, octane render, photograph, dslr",
                steps: 30,
                width: 1024,
                height: 1024,
                cfg_scale: 7,
                sampler_name: "DPM++ 2M SDE"
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': profile.apiKey ? `Bearer ${profile.apiKey}` : ''
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const error = await response.text();
                Logger.error('LLMService', `Stable Diffusion Error (${response.status}): ${error}`);
                return "";
            }

            const data = await response.json();

            if (data.images && data.images.length > 0) {
                Logger.info('LLMService', `Successfully generated image via Stable Diffusion`);
                FinOpsService.getInstance().recordImageGen();
                // A1111 returns base64 strings in the images array
                return `data:image/png;base64,${data.images[0]}`;
            } else {
                Logger.error('LLMService', `Stable Diffusion response missing images. Response keys: ${Object.keys(data)}`);
                return "";
            }
        } catch (err) {
            Logger.error('LLMService', `Stable Diffusion generation failed: ${err}`);
            return "";
        }
    }

    /**
     * Robustly parse JSON from an LLM response, stripping markdown and reasoning blocks.
     */
    public static parseJson(text: string): any {
        try {
            // 1. Strip reasoning blocks (e.g., <think>...</think>)
            let clean = text.replace(/<think>[\s\S]*?<\/think>/gi, '');

            // 2. Strip markdown code blocks
            clean = clean.replace(/```json|```/g, '');

            // 3. Find the first '{' or '[' and last '}' or ']' to extract the JSON object/array
            const startObj = clean.indexOf('{');
            const startArr = clean.indexOf('[');

            let start = -1;
            let end = -1;

            if (startObj !== -1 && (startArr === -1 || startObj < startArr)) {
                start = startObj;
                end = clean.lastIndexOf('}');
            } else if (startArr !== -1) {
                start = startArr;
                end = clean.lastIndexOf(']');
            }

            if (start === -1 || end === -1) {
                throw new Error('No JSON object or array found in response');
            }

            clean = clean.substring(start, end + 1);

            return JSON.parse(clean);
        } catch (err) {
            Logger.error('LLMService', `Failed to parse JSON: ${err}\nRaw text: ${text}`);
            throw err;
        }
    }

    public async getProviderBalance(profile: LLMProfile): Promise<any> {
        if (profile.provider === 'pollinations') {
            try {
                if (!profile.apiKey) {
                    return { error: 'API Key is required for Pollinations.ai balance check' };
                }

                const headers = {
                    'Authorization': `Bearer ${profile.apiKey}`,
                    'Content-Type': 'application/json'
                };

                const response = await fetch('https://enter.pollinations.ai/api/account/balance', { headers });

                if (response.ok) {
                    const data = await response.json();
                    return { pollen: data }; // Wrap it to be clear
                } else {
                    const text = await response.text();
                    return { error: `Failed to fetch balance (${response.status})`, details: text };
                }
            } catch (err) {
                return { error: `Failed to fetch pollination stats: ${err}` };
            }
        }

        return { message: 'Balance check not supported for this provider' };
    }

    public async getAvailableModels(profile: LLMProfile): Promise<string[]> {
        try {
            const baseUrl = profile.baseUrl.replace(/\/+$/, '');
            let url = '';
            let method = 'GET';
            let headers: any = { 'Content-Type': 'application/json' };
            if (profile.apiKey) headers['Authorization'] = `Bearer ${profile.apiKey}`;

            if (profile.provider === 'stable-diffusion') {
                url = `${baseUrl}/sdapi/v1/sd-models`;
            } else if (profile.provider === 'openai' || profile.provider === 'local') {
                url = `${baseUrl}/models`;
                // Local providers might need /v1/models
                if (profile.provider === 'local' && !baseUrl.endsWith('/v1') && !baseUrl.includes('/v1/')) {
                    url = `${baseUrl}/v1/models`;
                }
            } else if (profile.provider === 'gemini') {
                url = `${baseUrl}/models?key=${profile.apiKey}`;
            } else {
                return [];
            }

            Logger.info('LLMService', `Fetching models from: ${url}`);
            const response = await fetch(url, { method, headers });

            if (!response.ok) {
                Logger.warn('LLMService', `Failed to fetch models: ${response.status} ${response.statusText}`);
                return [];
            }

            const data = await response.json();

            if (profile.provider === 'stable-diffusion') {
                // A1111 returns array of objects with 'title' and 'model_name'
                return data.map((m: any) => m.title);
            } else if (profile.provider === 'openai' || profile.provider === 'local') {
                // OpenAI format: { data: [{ id: 'model-id', ... }] }
                if (data.data && Array.isArray(data.data)) {
                    return data.data.map((m: any) => m.id);
                }
            } else if (profile.provider === 'gemini') {
                // Gemini format: { models: [{ name: 'models/gemini-pro', ... }] }
                if (data.models && Array.isArray(data.models)) {
                    return data.models.map((m: any) => m.name.replace('models/', ''));
                }
            }

            return [];
        } catch (err) {
            Logger.error('LLMService', `Error fetching models: ${err}`);
            return [];
        }
    }

    public async getAvailableSamplers(profile: LLMProfile): Promise<string[]> {
        try {
            if (profile.provider !== 'stable-diffusion') {
                return [];
            }

            const baseUrl = profile.baseUrl.replace(/\/+$/, '');
            const url = `${baseUrl}/sdapi/v1/samplers`;

            Logger.info('LLMService', `Fetching samplers from: ${url}`);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': profile.apiKey ? `Bearer ${profile.apiKey}` : ''
                }
            });

            if (!response.ok) {
                Logger.warn('LLMService', `Failed to fetch samplers: ${response.status} ${response.statusText}`);
                return [];
            }

            const data = await response.json();
            // A1111 returns array of objects with 'name', 'aliases', 'options'
            if (Array.isArray(data)) {
                return data.map((s: any) => s.name);
            }

            return [];
        } catch (err) {
            Logger.error('LLMService', `Error fetching samplers: ${err}`);
            return [];
        }
    }
}
