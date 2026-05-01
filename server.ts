import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // AI Providers Proxy
  app.post('/api/ai/move', async (req, res) => {
    const { provider, model, messages, apiKeyOverride } = req.body;
    
    let config: any = {};
    let envVarName = '';
    
    if (provider === 'openai') {
      envVarName = 'OPENAI_API_KEY';
      config = { apiKey: process.env.OPENAI_API_KEY };
    } else if (provider === 'featherless') {
      envVarName = 'FEATHERLESS_API_KEY';
      config = { 
        apiKey: process.env.FEATHERLESS_API_KEY,
        baseURL: 'https://api.featherless.ai/v1'
      };
    } else if (provider === 'ollama') {
      config = {
        apiKey: 'ollama',
        baseURL: process.env.OLLAMA_BASE_URL + '/v1'
      };
    }

    if (apiKeyOverride) {
      config.apiKey = apiKeyOverride;
    } else if (provider !== 'ollama' && (!config.apiKey || config.apiKey === '')) {
      return res.status(400).json({ 
        error: `Missing credentials for ${provider}. Please set ${envVarName} in the AI Studio Secrets panel or provide it in the request.` 
      });
    }

    try {
      const openai = new OpenAI(config);
      const response = await openai.chat.completions.create({
        model: model || (provider === 'openai' ? 'gpt-3.5-turbo' : 'mistral-7b-instruct'),
        messages: messages,
        response_format: { type: 'json_object' }
      });
      res.json(response);
    } catch (error: any) {
      console.error('AI Error:', error);
      res.status(error.status || 500).json({ 
        error: error.message,
        suggestion: error.message.includes('apiKey') ? `Check your ${envVarName} in secrets.` : undefined
      });
    }
  });

  // Ollama Model Detection
  app.get('/api/ollama/models', async (req, res) => {
    try {
      const response = await fetch(`${process.env.OLLAMA_BASE_URL}/api/tags`);
      const data = await response.json();
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: 'Ollama not reachable' });
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
