import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bomb, 
  Flag, 
  RefreshCw, 
  Play, 
  Pause, 
  ChevronDown, 
  Cpu, 
  ShieldCheck, 
  Zap, 
  Dice5, 
  Settings2,
  Terminal,
  Trophy,
  History,
  Info
} from 'lucide-react';
import { Grid, Cell, CellState, GameStatus, Persona, AIConfig, AIProvider } from './types.ts';
import { getAIMove, getOllamaModels } from './services/aiService.ts';

const PERSONAS: Persona[] = [
  {
    id: 'cautious',
    name: 'The Cautious Analyst',
    description: 'Avoids risks at all costs. Flags everything potentially dangerous.',
    icon: 'ShieldCheck',
    color: '#34d399', // Emerald 400
    prompt: 'You are the Cautious Analyst. You value survival above all. Never guess. Only reveal if you are 100% mathematically CERTAIN a cell is safe based on flagged neighbors. If unsure, flag potential mines.'
  },
  {
    id: 'logical',
    name: 'Pure Logic Engine',
    description: 'Strict mathematical deduction. Prefers patterns over intuition.',
    icon: 'Cpu',
    color: '#60a5fa', // Blue 400
    prompt: 'You are a Pure Logic Engine. Use standard Minesweeper patterns (1-1, 1-2, etc.). Calculate probabilities for unknown cells. Reveal the cell with the lowest mine probability.'
  },
  {
    id: 'gambler',
    name: 'The Bold Gambler',
    description: 'Fast and aggressive. Will guess if logic takes a second too long.',
    icon: 'Dice5',
    color: '#f87171', // Red 400
    prompt: 'You are the Bold Gambler. You hate waiting. If the obvious moves are gone, pick a random hidden cell and reveal it. You believe in luck.'
  },
  {
    id: 'wildcard',
    name: 'The Chaotic Gitch',
    description: 'Unpredictable. Might move randomly or perfectly. Who knows?',
    icon: 'Zap',
    color: '#fbbf24', // Amber 400
    prompt: 'You are a Chaotic Glitch. Your reasoning is flawed but sometimes brilliant. You can flag safe cells or reveal mines if you feel "spicy". But mostly try to win in your own weird way.'
  }
];

const GRID_SIZE = 8;
const MINES_COUNT = 10;

export default function App() {
  // Game State
  const [grid, setGrid] = useState<Grid>([]);
  const [status, setStatus] = useState<GameStatus>('playing');
  const [revealedCount, setRevealedCount] = useState(0);
  const [flagsUsed, setFlagsUsed] = useState(0);
  const [logs, setLogs] = useState<{ id: string; text: string; type: 'info' | 'warn' | 'error' | 'success' }[]>([]);

  // AI Configuration
  const [selectedPersona, setSelectedPersona] = useState<Persona>(PERSONAS[0]);
  const [aiConfig, setAiConfig] = useState<AIConfig>({ provider: 'openai', model: 'gpt-3.5-turbo' });
  const [isAiRunning, setIsAiRunning] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>(['gpt-3.5-turbo', 'gpt-4o', 'gpt-4o-mini']);
  const [ollamaAvailable, setOllamaAvailable] = useState(false);

  // Stats
  const [stats, setStats] = useState<Record<string, { wins: number; losses: number }>>(
    Object.fromEntries(PERSONAS.map(p => [p.id, { wins: 0, losses: 0 }]))
  );

  // Initialize Board
  const initBoard = useCallback(() => {
    const newGrid: Grid = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      const row: Cell[] = [];
      for (let c = 0; c < GRID_SIZE; c++) {
        row.push({ row: r, col: c, isMine: false, neighborMines: 0, state: 'hidden' });
      }
      newGrid.push(row);
    }

    // Place Mines
    let minesPlaced = 0;
    while (minesPlaced < MINES_COUNT) {
      const r = Math.floor(Math.random() * GRID_SIZE);
      const c = Math.floor(Math.random() * GRID_SIZE);
      if (!newGrid[r][c].isMine) {
        newGrid[r][c].isMine = true;
        minesPlaced++;
      }
    }

    // Calculate Neighbors
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (!newGrid[r][c].isMine) {
          let count = 0;
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const nr = r + dr;
              const nc = c + dc;
              if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE && newGrid[nr][nc].isMine) {
                count++;
              }
            }
          }
          newGrid[r][c].neighborMines = count;
        }
      }
    }

    setGrid(newGrid);
    setStatus('playing');
    setRevealedCount(0);
    setFlagsUsed(0);
    setLogs([{ id: Date.now().toString(), text: 'System Initialized. Awaiting orders.', type: 'info' }]);
  }, []);

  // Initial load
  useEffect(() => {
    initBoard();
  }, [initBoard]);

  // Update models list when provider changes
  useEffect(() => {
    if (aiConfig.provider === 'openai') {
      setAvailableModels(['gpt-3.5-turbo', 'gpt-4o', 'gpt-4o-mini']);
      setAiConfig(prev => ({ ...prev, model: 'gpt-3.5-turbo' }));
    } else if (aiConfig.provider === 'featherless') {
      setAvailableModels(['mistral-7b-instruct', 'llama-3-8b-instruct', 'mixtral-8x7b-instruct']);
      setAiConfig(prev => ({ ...prev, model: 'mistral-7b-instruct' }));
    } else {
      loadOllama();
    }
  }, [aiConfig.provider]);

  const loadOllama = async () => {
    const models = await getOllamaModels();
    if (models.length > 0) {
      setOllamaAvailable(true);
      const modelNames = models.map((m: any) => m.name);
      setAvailableModels(modelNames);
      setAiConfig(prev => ({ ...prev, model: modelNames[0] }));
    } else {
      setOllamaAvailable(false);
      setAvailableModels(['No models found']);
    }
  };

  const addLog = (text: string, type: 'info' | 'warn' | 'error' | 'success' = 'info') => {
    setLogs(prev => [{ id: Math.random().toString(36).substr(2, 9), text, type }, ...prev].slice(0, 10));
  };

  // Game Logic
  const revealCell = (r: number, c: number, board: Grid = grid) => {
    if (status !== 'playing' || board[r][c].state !== 'hidden') return;

    const newGrid = [...board.map(row => [...row])];
    const cell = newGrid[r][c];

    if (cell.isMine) {
      cell.state = 'revealed';
      setGrid(newGrid);
      setStatus('lost');
      addLog(`${selectedPersona.name} hit a mine at (${r}, ${c}). Critical failure.`, 'error');
      setStats(prev => ({ ...prev, [selectedPersona.id]: { ...prev[selectedPersona.id], losses: prev[selectedPersona.id].losses + 1 } }));
      setIsAiRunning(false);
      return;
    }

    const revealRecursive = (row: number, col: number) => {
      if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return;
      const target = newGrid[row][col];
      if (target.state !== 'hidden' || target.isMine) return;

      target.state = 'revealed';
      if (target.neighborMines === 0) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            revealRecursive(row + dr, col + dc);
          }
        }
      }
    };

    revealRecursive(r, c);
    setGrid(newGrid);

    // Check Win
    const revealed = newGrid.flat().filter(c => c.state === 'revealed').length;
    setRevealedCount(revealed);
    if (revealed === (GRID_SIZE * GRID_SIZE - MINES_COUNT)) {
      setStatus('won');
      addLog(`Grid Cleared by ${selectedPersona.name}. Performance: Optimal.`, 'success');
      setStats(prev => ({ ...prev, [selectedPersona.id]: { ...prev[selectedPersona.id], wins: prev[selectedPersona.id].wins + 1 } }));
      setIsAiRunning(false);
    }
  };

  const flagCell = (r: number, c: number) => {
    if (status !== 'playing' || grid[r][c].state === 'revealed') return;
    const newGrid = [...grid.map(row => [...row])];
    const cell = newGrid[r][c];
    if (cell.state === 'flagged') {
      cell.state = 'hidden';
      setFlagsUsed(prev => prev - 1);
    } else {
      cell.state = 'flagged';
      setFlagsUsed(prev => prev + 1);
    }
    setGrid(newGrid);
  };

  // AI Agent Executer
  const makeAiMove = async () => {
    if (status !== 'playing' || isThinking) return;

    // Convert board to simplified state for LLM
    const serialized = grid.map(row => 
      row.map(cell => {
        if (cell.state === 'hidden') return '?';
        if (cell.state === 'flagged') return 'F';
        return cell.neighborMines.toString();
      }).join(' ')
    ).join('\n');

    addLog(`Agent ${selectedPersona.name} is calculating...`, 'info');
    setIsThinking(true);

    try {
      const move = await getAIMove(serialized, selectedPersona.prompt, aiConfig);
      
      const { row, col, action, reasoning } = move;
      addLog(`[Decision]: ${action} (${row}, ${col}). Logic: ${reasoning.substring(0, 50)}...`, 'info');

      if (action === 'reveal') {
        revealCell(row, col);
      } else {
        flagCell(row, col);
      }
    } catch (err: any) {
      addLog(`API ERROR: ${err.message}`, 'error');
      setIsAiRunning(false);
    } finally {
      setIsThinking(false);
    }
  };

  // AI Loop
  useEffect(() => {
    let timer: any;
    if (isAiRunning && status === 'playing' && !isThinking) {
      timer = setTimeout(() => {
        makeAiMove();
      }, 1200); // Increased delay slightly for better visual feedback
    }
    return () => clearTimeout(timer);
  }, [isAiRunning, grid, status, isThinking]);

  const IconComponent = (name: string) => {
    const icons: Record<string, any> = { ShieldCheck, Cpu, Zap, Dice5 };
    const Comp = icons[name] || Info;
    return <Comp size={20} />;
  };

  return (
    <div className="h-screen bg-slate-950 text-slate-200 font-sans flex flex-col overflow-hidden relative">
      {/* Background Decorative Elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="scanline" />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#22d3ee 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      </div>

      {/* Tacticool Header */}
      <header className="h-14 border-b border-white/5 bg-slate-900/60 backdrop-blur-xl flex items-center justify-between px-8 shrink-0 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-cyan-500 rounded-sm flex items-center justify-center font-black text-slate-950 text-xs">NS</div>
            <h1 className="font-bold tracking-tighter text-lg bg-gradient-to-br from-white to-slate-500 bg-clip-text text-transparent">
              NEURAL-SWEEPER <span className="text-[10px] text-cyan-500/50 font-mono ml-1 italic">SYSTEM v4.0</span>
            </h1>
          </div>
          <div className="h-4 w-px bg-white/10 hidden md:block" />
          <div className="hidden md:flex items-center gap-4 text-[10px] font-mono tracking-widest text-slate-500">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              CORE_TEMP: 32°C
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
              UPTIME: 99.98%
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex gap-1 bg-black/40 p-1 rounded-md border border-white/5">
            {(['openai', 'featherless', 'ollama'] as AIProvider['id'][]).map(p => (
              <button
                key={p}
                onClick={() => setAiConfig(prev => ({ ...prev, provider: p }))}
                className={`px-3 py-1 text-[10px] font-bold rounded transition-all uppercase tracking-tighter ${
                  aiConfig.provider === p ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="h-8 w-px bg-white/10 mx-2" />
          <div className="relative group/select">
            <select 
              value={aiConfig.model}
              onChange={(e) => setAiConfig(prev => ({ ...prev, model: e.target.value }))}
              className="appearance-none bg-slate-800/40 px-3 pr-8 py-1.5 rounded border border-white/5 text-[10px] font-mono text-cyan-400 focus:outline-none focus:border-cyan-500/50 cursor-pointer"
            >
              {availableModels.map(m => (
                <option key={m} value={m} className="bg-slate-900">{m}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 opacity-30 pointer-events-none" />
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative z-10">
        {/* Left Neural Rack: Personas */}
        <aside className="w-80 border-r border-white/5 bg-slate-900/10 flex flex-col shrink-0 p-6 overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Neural Profiles</h2>
            <div className="p-1 rounded bg-white/5 border border-white/5">
              <History size={12} className="opacity-40" />
            </div>
          </div>
          
          <div className="space-y-4">
            {PERSONAS.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPersona(p)}
                className={`w-full group text-left relative transition-all duration-300 p-0.5 rounded-xl ${
                  selectedPersona.id === p.id 
                  ? 'bg-gradient-to-br from-cyan-500 to-blue-600 shadow-2xl shadow-cyan-500/10' 
                  : 'bg-white/5 hover:bg-white/10 opacity-70 hover:opacity-100'
                }`}
              >
                <div className={`p-4 rounded-[11px] h-full ${selectedPersona.id === p.id ? 'bg-slate-950' : ''}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg transition-transform duration-500 ${selectedPersona.id === p.id ? 'scale-110' : ''}`} 
                           style={{ backgroundColor: `${p.color}15`, color: p.color }}>
                        {IconComponent(p.icon)}
                      </div>
                      <span className={`font-bold tracking-tight text-sm ${selectedPersona.id === p.id ? 'text-white' : 'text-slate-400'}`}>
                        {p.name}
                      </span>
                    </div>
                    {selectedPersona.id === p.id && (
                      <motion.div layoutId="active-dot" className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_#06b6d4]" />
                    )}
                  </div>
                  
                  <p className={`text-[11px] leading-relaxed mb-4 ${selectedPersona.id === p.id ? 'text-slate-400' : 'text-slate-500'}`}>
                    {p.description}
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white/5 rounded-md p-2 flex flex-col items-center justify-center border border-white/[0.02]">
                      <span className="text-[8px] uppercase opacity-30 font-bold mb-1">Win Rate</span>
                      <span className="text-xs font-mono font-bold text-emerald-500">
                        {stats[p.id].wins + stats[p.id].losses > 0 
                          ? `${Math.round((stats[p.id].wins / (stats[p.id].wins + stats[p.id].losses)) * 100)}%`
                          : '0%'}
                      </span>
                    </div>
                    <div className="bg-white/5 rounded-md p-2 flex flex-col items-center justify-center border border-white/[0.02]">
                      <span className="text-[8px] uppercase opacity-30 font-bold mb-1">Efficiency</span>
                      <span className="text-xs font-mono font-bold text-cyan-400">0.96s</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-auto pt-8">
            <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[8px] uppercase opacity-30 font-bold">Total Operations</span>
                <span className="text-xl font-mono font-bold">0,842</span>
              </div>
              <div className="w-12 h-12 rounded-full border-2 border-white/5 flex items-center justify-center">
                 <Trophy size={18} className="opacity-20" />
              </div>
            </div>
          </div>
        </aside>

        {/* Center Main Arena */}
        <section className="flex-1 bg-slate-950 flex flex-col items-center justify-center p-12 relative overflow-hidden">
          {/* Subtle Grid Pattern Overlay */}
          <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

          <div className="max-w-xl w-full flex flex-col gap-10 relative z-10">
            {/* Top Stat Cluster */}
            <div className="grid grid-cols-3 gap-8">
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Target Grid</span>
                <span className="text-4xl font-mono tracking-tighter">8x8</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Mines ID'd</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-mono text-rose-500 animate-pulse">{MINES_COUNT - flagsUsed}</span>
                  <span className="text-sm opacity-20">/ {MINES_COUNT}</span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Confidence</span>
                <div className="flex items-center gap-2">
                  <span className={`text-4xl font-mono tracking-tighter ${status === 'won' ? 'text-emerald-500' : 'text-cyan-400'}`}>
                    {status === 'playing' ? (98.2 + Math.random() * 1).toFixed(1) : status === 'won' ? '100.0' : '00.0'}%
                  </span>
                </div>
              </div>
            </div>

            {/* The Tactical Matrix */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-br from-white/10 to-transparent rounded-2xl blur-sm opacity-50 group-hover:opacity-100 transition duration-1000" />
              <div className="relative p-6 bg-slate-900 border border-white/5 rounded-2xl shadow-inner-white overflow-hidden">
                
                {/* AI Thinking Overlay */}
                <AnimatePresence>
                  {isThinking && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center pointer-events-none"
                    >
                      <motion.div 
                        animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
                        transition={{ repeat: Infinity, duration: 1.5 }}
                        className="flex flex-col items-center gap-2 text-cyan-400"
                      >
                         <Zap size={32} className="fill-cyan-400/20" />
                         <span className="text-[8px] font-mono tracking-[0.3em] font-bold uppercase">Neural Link Active...</span>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div 
                  className="grid gap-2"
                  style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))` }}
                >
                  {grid.map((row, r) => row.map((cell, c) => (
                    <motion.button
                      key={`${r}-${c}`}
                      initial={false}
                      animate={{
                        scale: cell.state === 'revealed' ? 1 : 1,
                        rotateY: cell.state === 'revealed' ? 0 : 0
                      }}
                      whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.1)' }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => revealCell(r, c)}
                      onContextMenu={(e) => { e.preventDefault(); flagCell(r, c); }}
                      className={`
                        mine-cell group/cell
                        ${cell.state === 'revealed' ? 'revealed shadow-none' : 'shadow-lg shadow-black/40'}
                        ${cell.state === 'revealed' && cell.isMine ? 'bg-rose-500/40 border-rose-500/50' : ''}
                        ${cell.state === 'flagged' ? 'border-amber-500/50' : ''}
                      `}
                    >
                      <AnimatePresence initial={false} mode="wait">
                        {cell.state === 'flagged' && (
                          <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}>
                            <Flag size={14} className="text-amber-500 fill-amber-500/20" />
                          </motion.div>
                        )}
                        {cell.state === 'revealed' ? (
                          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-center">
                            {cell.isMine ? (
                              <Bomb size={18} className="text-rose-400 animate-pulse" />
                            ) : cell.neighborMines > 0 ? (
                              <span className={`text-sm ${
                                cell.neighborMines === 1 ? 'text-cyan-400' :
                                cell.neighborMines === 2 ? 'text-emerald-400' :
                                cell.neighborMines === 3 ? 'text-amber-400' :
                                'text-rose-400'
                              }`}>
                                {cell.neighborMines}
                              </span>
                            ) : null}
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                      {/* Cell Coordinate Tooltip on Hover */}
                      <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center opacity-0 group-hover/cell:opacity-10 pointer-events-none">
                         <span className="text-[8px] font-mono leading-none">{r},{c}</span>
                      </div>
                    </motion.button>
                  )))}
                </div>

                {/* Status Overlays */}
                <AnimatePresence>
                  {status !== 'playing' && (
                    <motion.div 
                      initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                      animate={{ opacity: 1, backdropFilter: 'blur(8px)' }}
                      exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                      className="absolute inset-0 bg-slate-950/60 flex flex-col items-center justify-center z-30 p-8 text-center"
                    >
                      <motion.div 
                        initial={{ scale: 0.8, opacity: 0 }} 
                        animate={{ scale: 1, opacity: 1 }}
                        className="flex flex-col items-center"
                      >
                         <h2 className={`text-4xl font-black mb-1 tracking-tighter ${status === 'won' ? 'text-emerald-400' : 'text-rose-500'}`}>
                           {status === 'won' ? 'MISSION SUCCESS' : 'SYSTEM BREACH'}
                         </h2>
                         <p className="text-xs text-slate-400 font-mono mb-8 uppercase tracking-widest opacity-50">
                           Operation Finalized. Neural feedback stored.
                         </p>
                         <button 
                          onClick={initBoard} 
                          className={`px-10 py-3 rounded-full font-black text-xs uppercase tracking-widest transition-all ${
                            status === 'won' ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400' : 'bg-rose-500 text-white hover:bg-rose-400'
                          }`}
                         >
                           Initiate Reboot
                         </button>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Bottom Primary Controls */}
            <div className="flex gap-4">
              <button 
                onClick={() => setIsAiRunning(!isAiRunning)}
                className={`flex-1 h-14 rounded-xl font-bold flex items-center justify-center gap-3 transition-all border ${
                  isAiRunning 
                  ? 'bg-rose-500/10 text-rose-500 border-rose-500/30' 
                  : 'bg-white text-slate-950 hover:bg-cyan-400 border-white'
                }`}
              >
                {isAiRunning ? <><Pause size={20} /> ABORT SIMULATION</> : <><Play size={20} /> DEPLOY NEURAL AGENT</>}
              </button>
              <button onClick={initBoard} className="w-14 h-14 bg-white/5 border border-white/5 rounded-xl flex items-center justify-center hover:bg-white/10 transition-all text-slate-400">
                <RefreshCw size={22} />
              </button>
            </div>
          </div>
        </section>


        {/* Right Neural Trace Sidebar */}
        <aside className="w-80 border-l border-white/5 bg-slate-900/10 flex flex-col shrink-0">
          <div className="p-6 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Neural Trace Log</h2>
              <Terminal size={12} className="opacity-20" />
            </div>
            
            <div className="flex-1 bg-black/40 rounded-xl border border-white/5 overflow-hidden flex flex-col">
              <div className="p-4 overflow-y-auto space-y-3 custom-scrollbar flex-1">
                {logs.map(log => (
                  <div key={log.id} className={`terminal-text border-l-2 pl-3 py-1 ${
                    log.type === 'error' ? 'text-rose-500 border-rose-500 bg-rose-500/5' :
                    log.type === 'success' ? 'text-emerald-400 border-emerald-500 bg-emerald-500/5' :
                    'text-slate-400 border-slate-800'
                  }`}>
                    {log.text}
                  </div>
                ))}
                {logs.length === 0 && <div className="text-[11px] font-mono text-slate-600 italic">Standby for signal...</div>}
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-4">
              <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                 <div className="flex items-center justify-between mb-3">
                   <h3 className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Ollama Detection</h3>
                   <span className={`w-1.5 h-1.5 rounded-full ${ollamaAvailable ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-slate-700'}`} />
                 </div>
                 <div className="space-y-1">
                    {ollamaAvailable ? (
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-mono text-slate-400">Local Engine</span>
                        <span className="text-[9px] font-bold text-emerald-500 uppercase">Synchronized</span>
                      </div>
                    ) : (
                      <span className="text-[10px] font-mono text-slate-600 block italic leading-none">Bridge not established. Local fallback inactive.</span>
                    )}
                 </div>
              </div>

              <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                 <div className="flex items-center justify-between mb-3">
                   <h3 className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Global Standings</h3>
                   <span className="text-[8px] font-mono opacity-20">TOP RANKED</span>
                 </div>
                 <div className="space-y-2">
                    {(Object.entries(stats) as [string, { wins: number; losses: number }][])
                      .sort(([, a], [, b]) => (b.wins - b.losses) - (a.wins - a.losses))
                      .slice(0, 3)
                      .map(([id, s], i) => {
                        const persona = PERSONAS.find(p => p.id === id);
                        return (
                          <div key={id} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-[8px] font-mono opacity-30">0{i+1}</span>
                              <span className="text-[10px] font-bold text-slate-300">{persona?.name.split(' ').pop()}</span>
                            </div>
                            <div className="flex gap-2">
                               <span className="text-[9px] font-mono text-emerald-500 truncate w-4">{s.wins}</span>
                               <span className="text-[9px] font-mono text-rose-500 truncate w-4">{s.losses}</span>
                            </div>
                          </div>
                        );
                      })}
                 </div>
              </div>
            </div>
          </div>
          <div className="mt-auto p-4 bg-slate-950 rounded-lg border border-slate-800 flex flex-col gap-2">
            <div className="text-[10px] text-slate-500 uppercase font-bold flex items-center justify-between">
              Project Info
              <Info size={10} className="opacity-40" />
            </div>
            <div className="text-[10px] text-slate-400 space-y-2">
              <p>
                Built By <a href="https://harishkotra.me" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">Harish Kotra</a>
              </p>
              <p>
                <a href="https://dailybuild.xyz" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-cyan-400 transition-colors uppercase tracking-widest font-black">Checkout my other builds</a>
              </p>
            </div>
          </div>
        </aside>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        .shadow-inner-white { box-shadow: inset 0 1px 1px rgba(255,255,255,0.05); }
      `}</style>
    </div>
  );
}
