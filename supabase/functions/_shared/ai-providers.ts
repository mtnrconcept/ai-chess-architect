export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type AiProviderName = 'lovable' | 'groq' | 'openai' | 'gemini';

export type ChatCompletionOptions = {
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  model?: string;
  preferredModels?: Partial<Record<AiProviderName, string>>;
};

type ConfiguredProvider = {
  name: AiProviderName;
  apiKey: string;
  model: string;
};

type ProviderFactory = (provider: ConfiguredProvider, options: ChatCompletionOptions) => Promise<string>;

type ProviderConfig = {
  name: AiProviderName;
  envKey: string;
  modelEnvKey: string;
  defaultModel: string;
  invoke: ProviderFactory;
};

const parseMessages = (messages: ChatMessage[]) =>
  messages.map(message => ({
    role: message.role,
    content: message.content.trim(),
  }));

const parseOpenAIStyleResponse = async (response: Response) => {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI provider error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message;

  if (!message) {
    throw new Error('Réponse invalide du fournisseur IA');
  }

  let rawContent: unknown = message.content;

  if (Array.isArray(rawContent)) {
    rawContent = rawContent
      .map((entry: unknown) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object' && 'text' in entry) {
          const text = (entry as { text?: unknown }).text;
          return typeof text === 'string' ? text : '';
        }
        return '';
      })
      .join('\n');
  }

  if (typeof rawContent !== 'string') {
    throw new Error('Contenu de réponse inattendu du fournisseur IA');
  }

  const content = rawContent.trim();

  if (!content) {
    throw new Error('Réponse vide du fournisseur IA');
  }

  return content;
};

const invokeLovable: ProviderFactory = async (provider, options) => {
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model ?? provider.model,
      messages: parseMessages(options.messages),
      temperature: options.temperature ?? 0.7,
    }),
  });

  return await parseOpenAIStyleResponse(response);
};

const invokeGroq: ProviderFactory = async (provider, options) => {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model ?? provider.model,
      messages: parseMessages(options.messages),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxOutputTokens,
    }),
  });

  return await parseOpenAIStyleResponse(response);
};

const invokeOpenAI: ProviderFactory = async (provider, options) => {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model ?? provider.model,
      messages: parseMessages(options.messages),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxOutputTokens,
    }),
  });

  return await parseOpenAIStyleResponse(response);
};

const buildGeminiPayload = (options: ChatCompletionOptions) => {
  const systemMessages = options.messages.filter(message => message.role === 'system');
  const conversation = options.messages.filter(message => message.role !== 'system');

  const systemInstructionText = systemMessages.map(message => message.content.trim()).filter(Boolean).join('\n\n');

  const contents = (conversation.length > 0 ? conversation : [{ role: 'user', content: '' }]).map(message => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content.trim() }],
  }));

  const payload: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: options.temperature ?? 0.7,
    },
  };

  if (options.maxOutputTokens) {
    (payload.generationConfig as { maxOutputTokens?: number }).maxOutputTokens = options.maxOutputTokens;
  }

  if (systemInstructionText) {
    payload.system_instruction = {
      role: 'system',
      parts: [{ text: systemInstructionText }],
    };
  }

  return payload;
};

const parseGeminiResponse = async (response: Response) => {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI provider error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const candidate = Array.isArray(data?.candidates) ? data.candidates[0] : null;
  const parts = candidate?.content?.parts;

  if (!parts || !Array.isArray(parts)) {
    throw new Error('Réponse invalide du fournisseur IA');
  }

  const text = parts
    .map((part: unknown) => {
      if (part && typeof part === 'object' && 'text' in part) {
        const value = (part as { text?: unknown }).text;
        return typeof value === 'string' ? value : '';
      }
      return '';
    })
    .join('\n')
    .trim();

  if (!text) {
    throw new Error('Réponse vide du fournisseur IA');
  }

  return text;
};

const invokeGemini: ProviderFactory = async (provider, options) => {
  const model = options.model ?? provider.model;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${provider.apiKey}`;

  const payload = buildGeminiPayload(options);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return await parseGeminiResponse(response);
};

const PROVIDERS: ProviderConfig[] = [
  {
    name: 'lovable',
    envKey: 'LOVABLE_API_KEY',
    modelEnvKey: 'LOVABLE_MODEL',
    defaultModel: 'google/gemini-2.5-flash',
    invoke: invokeLovable,
  },
  {
    name: 'groq',
    envKey: 'GROQ_API_KEY',
    modelEnvKey: 'GROQ_MODEL',
    defaultModel: 'llama-3.1-70b-versatile',
    invoke: invokeGroq,
  },
  {
    name: 'openai',
    envKey: 'OPENAI_API_KEY',
    modelEnvKey: 'OPENAI_MODEL',
    defaultModel: 'gpt-4o-mini',
    invoke: invokeOpenAI,
  },
  {
    name: 'gemini',
    envKey: 'GEMINI_API_KEY',
    modelEnvKey: 'GEMINI_MODEL',
    defaultModel: 'gemini-1.5-flash',
    invoke: invokeGemini,
  },
];

const getConfiguredProviders = (): ConfiguredProvider[] => {
  const configured = PROVIDERS
    .map(provider => {
      const apiKey = Deno.env.get(provider.envKey)?.trim();
      if (!apiKey) return null;
      const model = Deno.env.get(provider.modelEnvKey)?.trim() || provider.defaultModel;
      return { name: provider.name, apiKey, model } satisfies ConfiguredProvider;
    })
    .filter((provider): provider is ConfiguredProvider => provider !== null);

  return configured;
};

const pickProvider = (): ProviderConfig & ConfiguredProvider => {
  const configuredProviders = getConfiguredProviders();

  if (configuredProviders.length === 0) {
    throw new Error(
      'Aucun fournisseur IA n\'est configuré. Ajoutez GROQ_API_KEY, LOVABLE_API_KEY, OPENAI_API_KEY ou GEMINI_API_KEY dans les secrets Supabase.'
    );
  }

  const preferred = Deno.env.get('AI_PROVIDER')?.trim().toLowerCase();

  if (preferred) {
    const provider = configuredProviders.find(entry => entry.name === preferred);
    if (provider) {
      const config = PROVIDERS.find(item => item.name === provider.name)!;
      return { ...config, ...provider };
    }
  }

  const fallback = configuredProviders[0];
  const config = PROVIDERS.find(item => item.name === fallback.name)!;
  return { ...config, ...fallback };
};

export const invokeChatCompletion = async (
  options: ChatCompletionOptions
): Promise<{ content: string; provider: AiProviderName }> => {
  const provider = pickProvider();
  const { preferredModels, ...baseOptions } = options;
  const resolvedModel =
    baseOptions.model ?? preferredModels?.[provider.name] ?? provider.model;

  try {
    const content = await provider.invoke(provider, {
      ...baseOptions,
      model: resolvedModel,
    });
    return { content, provider: provider.name };
  } catch (error) {
    const attemptedPreferredModel =
      preferredModels?.[provider.name] !== undefined &&
      resolvedModel === preferredModels[provider.name];

    if (attemptedPreferredModel && preferredModels?.[provider.name] !== provider.model) {
      const fallbackContent = await provider.invoke(provider, {
        ...baseOptions,
        model: provider.model,
      });
      return { content: fallbackContent, provider: provider.name };
    }

    throw error;
  }
};

export const listConfiguredProviders = () => getConfiguredProviders().map(provider => provider.name);
