import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createModels, createProvider, envApiKeyAuth, type Model } from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { Agent } from '@earendil-works/pi-agent-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 1. Manual .env parsing to ensure keys are loaded
function loadEnv() {
  const envPath = path.resolve(__dirname, '../../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const parts = trimmed.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const val = parts.slice(1).join('=').trim();
          process.env[key] = val;
        }
      }
    }
  }
}

async function runProbe() {
  console.log('=== StepFun Custom Provider Probe (ESM) ===');
  loadEnv();

  const apiKey = process.env.STEPFUN_API_KEY;
  const baseUrl = process.env.STEPFUN_BASE_URL || 'https://api.stepfun.com/v1';
  const chatModel = process.env.STEPFUN_CHAT_MODEL || 'step-3.5-flash';

  console.log('Environment configuration detected:');
  console.log(`- STEPFUN_BASE_URL: ${baseUrl}`);
  console.log(`- STEPFUN_CHAT_MODEL: ${chatModel}`);
  console.log(`- STEPFUN_API_KEY: ${apiKey ? '***' + apiKey.slice(-6) : 'not defined'}`);

  if (!apiKey) {
    console.error('Error: STEPFUN_API_KEY is not defined in the environment.');
    process.exit(1);
  }

  try {
    // 2. Define custom model and provider
    const stepfunModel: Model<'openai-completions'> = {
      id: chatModel,
      name: `StepFun ${chatModel}`,
      api: 'openai-completions',
      provider: 'stepfun',
      baseUrl,
      reasoning: false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 32000
    };

    const stepfunProvider = createProvider({
      id: 'stepfun',
      name: 'StepFun',
      baseUrl,
      auth: { apiKey: envApiKeyAuth('StepFun API key', ['STEPFUN_API_KEY']) },
      models: [stepfunModel],
      api: openAICompletionsApi(),
    });

    // 3. Register custom provider in the models collection
    const models = createModels();
    models.setProvider(stepfunProvider);

    console.log('\nCreating stateful Agent with custom provider...');

    // 4. Set up stateful Agent
    const agent = new Agent({
      initialState: {
        model: stepfunModel,
        systemPrompt: 'You are a helpful assistant. Keep your answers brief.'
      },
      streamFn: (model, context, options) => {
        return models.streamSimple(model, context, options);
      },
      getApiKey: (provider) => {
        if (provider === 'stepfun') {
          return process.env.STEPFUN_API_KEY;
        }
        return undefined;
      }
    });

    // Subscribing to Agent events
    let lastContent = '';
    agent.subscribe((event) => {
      if (event.type === 'message_update') {
        const content = event.message.content;
        const text = content.map((c) => (c.type === 'text' ? c.text : '')).join('');
        if (text !== lastContent) {
          const delta = text.slice(lastContent.length);
          if (delta) {
            process.stdout.write(delta);
          }
          lastContent = text;
        }
      } else {
        console.log(`\n[Agent Event: ${event.type}]`);
      }
    });

    console.log('\nPrompting Agent: "回复 OK"...');
    await agent.prompt('回复 OK');

    console.log('\nWaiting for Agent to finish...');
    await agent.waitForIdle();

    const messages = agent.state.messages;
    console.log('\nFinal transcript length:', messages.length);
    const lastMsg = messages[messages.length - 1];
    
    if (lastMsg && lastMsg.role === 'assistant') {
      const text = lastMsg.content.map(c => c.type === 'text' ? c.text : '').join('');
      console.log('\nAssistant response content:', JSON.stringify(text));
      if (agent.state.errorMessage) {
        console.error('Agent had an error message:', agent.state.errorMessage);
        process.exit(1);
      } else {
        console.log('\nSUCCESS: Pi Agent + StepFun custom provider works perfectly!');
        process.exit(0);
      }
    } else {
      console.error('Error: Last message is not an assistant response.');
      process.exit(1);
    }
  } catch (error) {
    console.error('\nFAILURE: Probe failed with exception:');
    console.error(error);
    process.exit(1);
  }
}

runProbe();
