import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatGroq } from '@langchain/groq';

export const DEFAULT_MODEL = 'claude-sonnet-4-6';

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly cache  = new Map<string, BaseChatModel>();

  constructor(private readonly cfg: ConfigService) {}

  getLLM(modelId: string = DEFAULT_MODEL): BaseChatModel {
    if (this.cache.has(modelId)) return this.cache.get(modelId)!;

    let llm: BaseChatModel;

    if (modelId.startsWith('claude')) {
      llm = new ChatAnthropic({ model: modelId, temperature: 0 });

    } else if (modelId.startsWith('gpt')) {
      llm = new ChatOpenAI({ model: modelId, temperature: 0 });

    } else if (modelId.startsWith('gemini')) {
      const apiKey = (this.cfg.get<string>('GOOGLE_API_KEY') ?? '').trim();
      llm = new ChatGoogleGenerativeAI({
        model: modelId,
        temperature: 0,
        apiKey,
        apiVersion: 'v1',
      } as any);

    } else if (
      modelId.startsWith('llama') ||
      modelId.startsWith('gemma') ||
      modelId.startsWith('mixtral') ||
      modelId.startsWith('qwen') ||
      modelId.startsWith('deepseek')
    ) {
      llm = new ChatGroq({ model: modelId, temperature: 0 });

    } else {
      this.logger.warn(`Unknown model "${modelId}", falling back to ${DEFAULT_MODEL}`);
      llm = new ChatAnthropic({ model: DEFAULT_MODEL, temperature: 0 });
    }

    this.cache.set(modelId, llm);
    return llm;
  }

  chunkText(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return (content as Array<{ type?: string; text?: string }>)
        .filter(c => c.type === 'text')
        .map(c => c.text ?? '')
        .join('');
    }
    return '';
  }
}
