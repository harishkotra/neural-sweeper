import { AIConfig } from "../types";

export async function getAIMove(boardState: string, personaPrompt: string, config: AIConfig) {
  const messages = [
    {
      role: "system",
      content: `${personaPrompt}\n\nYou are playing Minesweeper. Your goal is to reveal all non-mine cells. 
      The current board state is provided as a JSON grid where:
      - '?' means hidden cell.
      - 'F' means flagged cell.
      - Numbers (0-8) mean revealed cells with that many neighbor mines.
      
      Respond with a JSON object: { "row": number, "col": number, "action": "reveal" | "flag", "reasoning": "string" }
      Only pick hidden cells (?). 
      If you are sure a cell is a mine, flag it. 
      If you are sure a cell is safe, reveal it.
      If you must guess, explain why.`
    },
    {
      role: "user",
      content: `Current Board:\n${boardState}`
    }
  ];

  const response = await fetch('/api/ai/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: config.provider,
      model: config.model,
      messages,
      apiKeyOverride: config.apiKey
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch AI move');
  }

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}

export async function getOllamaModels() {
  try {
    const res = await fetch('/api/ollama/models');
    if (!res.ok) return [];
    const data = await res.json();
    return data.models || [];
  } catch {
    return [];
  }
}
