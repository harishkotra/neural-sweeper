export type CellState = 'hidden' | 'revealed' | 'flagged';

export interface Cell {
  row: number;
  col: number;
  isMine: boolean;
  neighborMines: number;
  state: CellState;
}

export type Grid = Cell[][];

export type GameStatus = 'playing' | 'won' | 'lost';

export interface Persona {
  id: string;
  name: string;
  description: string;
  prompt: string;
  icon: string;
  color: string;
}

export interface AIProvider {
  id: 'openai' | 'featherless' | 'ollama';
  name: string;
}

export interface AIConfig {
  provider: AIProvider['id'];
  model: string;
  apiKey?: string;
}
