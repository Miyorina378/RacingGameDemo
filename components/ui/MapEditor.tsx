'use client';

import React from 'react';
import { Copy, Play } from 'lucide-react';

interface MapEditorProps {
  activeMode: string;
  editorNodes: any[];
  setEditorNodes: React.Dispatch<React.SetStateAction<any[]>>;
  editorScenery: any[];
  setEditorScenery: React.Dispatch<React.SetStateAction<any[]>>;
  editorTool: string;
  setEditorTool: (tool: any) => void;
  editorCornerHeight: number;
  setEditorCornerHeight: (h: number) => void;
  selectedNodeIndex: number | null;
  setSelectedNodeIndex: (idx: number | null) => void;
  selectedSceneryIndex: number | null;
  setSelectedSceneryIndex: (idx: number | null) => void;
  editorTrackName: string;
  setEditorTrackName: (name: string) => void;
  editorRoadWidth: number;
  setEditorRoadWidth: (w: number) => void;
  editorTimeLimit: number;
  setEditorTimeLimit: (t: number) => void;
  editorHasObstacles: boolean;
  setEditorHasObstacles: (b: boolean) => void;
  editorHaveGrass: boolean;
  setEditorHaveGrass: (b: boolean) => void;
  editorGrassWidth: number;
  setEditorGrassWidth: (w: number) => void;
  editorGridLimit: number;
  setEditorGridLimit: (l: number) => void;
  snapToGrid: number;
  setSnapToGrid: (g: number) => void;
  livePreview: boolean;
  setLivePreview: (p: boolean) => void;
  
  // Handlers
  saveCustomTrack: (nodes: any[], name: string, width: number, time: number, obstacles: boolean, gridLimit: number, grass?: boolean, grassWidth?: number, scenery?: any[]) => void;
  importTrack: (code: string) => void;
  handleClearAll: () => void;
  handleApplyTemplate: (type: 'oval' | 'scurve' | 'figure8') => void;
  launchTestDrive: () => void;
  exitToGarage: () => void;
}

const renderToolIcon = (tool: string, isActive: boolean) => {
  switch (tool) {
    case 'node':
      return (
        <svg className="w-10 h-10" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M 6,36 C 18,36 30,30 30,18 C 30,12 36,6 42,6" stroke={isActive ? "#d946ef" : "#a855f7"} strokeWidth="6" strokeLinecap="round" />
          <path d="M 6,36 C 18,36 30,30 30,18 C 30,12 36,6 42,6" stroke="#ffffff" strokeWidth="1.5" strokeDasharray="3,3" strokeLinecap="round" />
          <circle cx="30" cy="18" r="4" fill="#06b6d4" />
        </svg>
      );
    case 'tree1':
      return (
        <svg className="w-10 h-10" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="22" y="32" width="4" height="10" rx="1" fill="#78350f" />
          <path d="M 24,6 L 12,22 L 36,22 Z" fill={isActive ? "#22c55e" : "#16a34a"} />
          <path d="M 24,14 L 8,30 L 40,30 Z" fill={isActive ? "#16a34a" : "#15803d"} />
        </svg>
      );
    case 'tree2':
      return (
        <svg className="w-10 h-10" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="21" y="30" width="6" height="12" rx="1.5" fill="#78350f" />
          <circle cx="24" cy="20" r="12" fill={isActive ? "#16a34a" : "#15803d"} />
          <circle cx="20" cy="16" r="7" fill={isActive ? "#4ade80" : "#22c55e"} style={{ opacity: 0.85 }} />
        </svg>
      );
    case 'tree3':
      return (
        <svg className="w-10 h-10" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M 24,42 Q 22,28 24,18" stroke="#a16207" strokeWidth="3" strokeLinecap="round" />
          <path d="M 24,18 Q 14,14 10,22" stroke={isActive ? "#4ade80" : "#22c55e"} strokeWidth="3" strokeLinecap="round" />
          <path d="M 24,18 Q 34,14 38,22" stroke={isActive ? "#4ade80" : "#22c55e"} strokeWidth="3" strokeLinecap="round" />
          <path d="M 24,18 Q 16,10 20,6" stroke={isActive ? "#86efac" : "#4ade80"} strokeWidth="3" strokeLinecap="round" />
          <path d="M 24,18 Q 32,10 28,6" stroke={isActive ? "#86efac" : "#4ade80"} strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case 'rock':
      return (
        <svg className="w-10 h-10" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M 24,8 L 38,20 L 32,38 L 16,38 L 10,20 Z" fill={isActive ? "#a8a29e" : "#78716c"} stroke="#57534e" strokeWidth="2" />
          <path d="M 24,8 L 24,24 L 10,20" stroke="#44403c" strokeWidth="1.5" />
          <path d="M 24,24 L 38,20" stroke="#44403c" strokeWidth="1.5" />
          <path d="M 24,24 L 32,38" stroke="#44403c" strokeWidth="1.5" />
          <path d="M 24,24 L 16,38" stroke="#44403c" strokeWidth="1.5" />
        </svg>
      );
    case 'mountain':
      return (
        <svg className="w-10 h-10" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M 24,8 L 6,38 L 42,38 Z" fill={isActive ? "#71717a" : "#3f3f46"} />
          <path d="M 24,8 L 18,18 L 24,16 L 30,18 Z" fill="#ffffff" />
          <path d="M 24,8 L 24,38" stroke="#18181b" strokeWidth="1.5" />
        </svg>
      );
    case 'hill':
      return (
        <svg className="w-10 h-10" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M 4,38 Q 24,12 44,38 Z" fill={isActive ? "#d97706" : "#b45309"} />
          <path d="M 8,38 Q 24,16 40,38 Z" fill={isActive ? "#22c55e" : "#15803d"} style={{ opacity: 0.85 }} />
        </svg>
      );
    case 'podium':
      return (
        <svg className="w-10 h-10" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M 8,36 L 40,36 L 40,24 L 28,24 L 28,16 L 8,16 Z" fill={isActive ? "#475569" : "#334155"} stroke="#1e293b" strokeWidth="1.5" />
          <line x1="8" y1="28" x2="40" y2="28" stroke="#06b6d4" strokeWidth="2" />
          <line x1="8" y1="20" x2="28" y2="20" stroke="#06b6d4" strokeWidth="2" />
          <line x1="10" y1="16" x2="10" y2="8" stroke="#64748b" strokeWidth="2" />
          <line x1="38" y1="24" x2="38" y2="8" stroke="#64748b" strokeWidth="2" />
          <path d="M 6,10 L 42,6 L 38,10 L 10,12 Z" fill={isActive ? "#f43f5e" : "#d946ef"} />
        </svg>
      );
    default:
      return null;
  }
};

export default function MapEditor({
  activeMode,
  editorNodes,
  setEditorNodes,
  editorScenery,
  setEditorScenery,
  editorTool,
  setEditorTool,
  editorCornerHeight,
  setEditorCornerHeight,
  selectedNodeIndex,
  setSelectedNodeIndex,
  selectedSceneryIndex,
  setSelectedSceneryIndex,
  editorTrackName,
  setEditorTrackName,
  editorRoadWidth,
  setEditorRoadWidth,
  editorTimeLimit,
  setEditorTimeLimit,
  editorHasObstacles,
  setEditorHasObstacles,
  editorHaveGrass,
  setEditorHaveGrass,
  editorGrassWidth,
  setEditorGrassWidth,
  editorGridLimit,
  setEditorGridLimit,
  snapToGrid,
  setSnapToGrid,
  livePreview,
  setLivePreview,
  saveCustomTrack,
  importTrack,
  handleClearAll,
  handleApplyTemplate,
  launchTestDrive,
  exitToGarage,
}: MapEditorProps) {
  if (activeMode !== 'editor') return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-30 animate-fadeIn select-none">
      {/* Floating Left Header */}
      <div className="absolute top-6 left-6 w-[320px] pointer-events-auto backdrop-blur-md bg-slate-950/80 border border-purple-500/30 rounded-2xl p-5 shadow-[0_0_30px_rgba(0,0,0,0.5)] flex flex-col gap-1 text-slate-100 text-left">
        <span className="text-[10px] font-bold text-purple-400 tracking-wider uppercase">Interactive 3D Editor</span>
        <h2 className="text-xl font-black italic tracking-wide text-white">Track Designer</h2>
        <div className="flex gap-4 mt-2.5 pt-2.5 border-t border-slate-900 text-[10px] font-mono text-purple-400">
          <div>Nodes: <span className="text-white font-bold">{editorNodes.length}</span></div>
          <div>Scenery: <span className="text-white font-bold">{editorScenery.length}</span></div>
        </div>
      </div>

      {/* Floating Right Controls Panel */}
      <div className="absolute top-6 right-6 bottom-6 w-[320px] pointer-events-auto backdrop-blur-md bg-slate-950/80 border border-purple-500/30 rounded-3xl p-5 shadow-[0_0_30px_rgba(0,0,0,0.5)] flex flex-col justify-between overflow-y-auto z-10 text-left">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-355 uppercase tracking-wider mb-3">Element Properties</h3>
            {selectedNodeIndex === null && selectedSceneryIndex === null && (
              <div className="text-xs text-slate-500 italic py-6 text-center border border-dashed border-slate-900 rounded-2xl bg-slate-950/30">
                Left-Click on a node or scenery object to edit properties...
              </div>
            )}

            {/* Selected Node Properties */}
            {selectedNodeIndex !== null && editorNodes[selectedNodeIndex] && (
              <div className="space-y-1.5 p-3 bg-slate-950/50 border border-purple-500/30 rounded-xl mb-4">
                <div className="flex justify-between text-[10px] font-bold text-purple-400 tracking-wider uppercase">
                  <span>Node {selectedNodeIndex} Elevation</span>
                  <span className="font-mono">{editorNodes[selectedNodeIndex].y ?? 2}m</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="35"
                  step="1"
                  value={editorNodes[selectedNodeIndex].y ?? 2}
                  onChange={(e) => {
                    const yVal = parseInt(e.target.value);
                    const newNodes = [...editorNodes];
                    newNodes[selectedNodeIndex] = { ...newNodes[selectedNodeIndex], y: yVal };
                    setEditorNodes(newNodes);
                    saveCustomTrack(newNodes, editorTrackName, editorRoadWidth, editorTimeLimit, editorHasObstacles, editorGridLimit, editorHaveGrass, editorGrassWidth, editorScenery);
                  }}
                  className="w-full accent-purple-500 cursor-pointer"
                />

                <div className="flex justify-between text-[10px] font-bold text-purple-400 tracking-wider uppercase mt-3">
                  <span>Node {selectedNodeIndex} Banking</span>
                  <span className="font-mono">{editorNodes[selectedNodeIndex].banking ?? 0}°</span>
                </div>
                <input
                  type="range"
                  min="-45"
                  max="45"
                  step="1"
                  value={editorNodes[selectedNodeIndex].banking ?? 0}
                  onChange={(e) => {
                    const bankVal = parseInt(e.target.value);
                    const newNodes = [...editorNodes];
                    newNodes[selectedNodeIndex] = { ...newNodes[selectedNodeIndex], banking: bankVal };
                    setEditorNodes(newNodes);
                    saveCustomTrack(newNodes, editorTrackName, editorRoadWidth, editorTimeLimit, editorHasObstacles, editorGridLimit, editorHaveGrass, editorGrassWidth, editorScenery);
                  }}
                  className="w-full accent-purple-500 cursor-pointer"
                />

                <button
                  onClick={() => {
                    const newNodes = editorNodes.filter((_, idx) => idx !== selectedNodeIndex);
                    setEditorNodes(newNodes);
                    setSelectedNodeIndex(null);
                    saveCustomTrack(newNodes, editorTrackName, editorRoadWidth, editorTimeLimit, editorHasObstacles, editorGridLimit, editorHaveGrass, editorGrassWidth, editorScenery);
                  }}
                  className="w-full mt-3 bg-red-950/60 hover:bg-red-900 border border-red-800/80 hover:border-red-650 text-red-300 hover:text-white py-1.5 rounded-xl text-[10px] font-bold tracking-wider uppercase transition-all cursor-pointer"
                >
                  Delete Selected Node
                </button>
              </div>
            )}

            {/* Selected Scenery Properties */}
            {selectedSceneryIndex !== null && editorScenery[selectedSceneryIndex] && (
              <div className="space-y-1.5 p-3 bg-slate-950/50 border border-green-500/30 rounded-xl mb-4">
                <div className="flex justify-between text-[10px] font-bold text-green-400 tracking-wider uppercase">
                  <span>{editorScenery[selectedSceneryIndex].type} Scale</span>
                  <span className="font-mono">{editorScenery[selectedSceneryIndex].scale}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="20"
                  step="0.5"
                  value={editorScenery[selectedSceneryIndex].scale}
                  onChange={(e) => {
                    const scale = parseFloat(e.target.value);
                    const newScenery = [...editorScenery];
                    newScenery[selectedSceneryIndex] = { ...newScenery[selectedSceneryIndex], scale };
                    setEditorScenery(newScenery);
                    saveCustomTrack(editorNodes, editorTrackName, editorRoadWidth, editorTimeLimit, editorHasObstacles, editorGridLimit, editorHaveGrass, editorGrassWidth, newScenery);
                  }}
                  className="w-full accent-green-500 cursor-pointer mb-2"
                />

                {(editorScenery[selectedSceneryIndex].type === 'hill' || editorScenery[selectedSceneryIndex].type === 'mountain') && (
                  <div className="mt-4 pt-2 border-t border-green-900/30">
                    <div className="flex justify-between text-[10px] font-bold text-green-400 tracking-wider uppercase">
                      <span>Height Scale</span>
                      <span className="font-mono">{editorScenery[selectedSceneryIndex].heightScale ?? (editorScenery[selectedSceneryIndex].scale * 0.8)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="20"
                      step="0.5"
                      value={editorScenery[selectedSceneryIndex].heightScale ?? (editorScenery[selectedSceneryIndex].scale * 0.8)}
                      onChange={(e) => {
                        const heightScale = parseFloat(e.target.value);
                        const newScenery = [...editorScenery];
                        newScenery[selectedSceneryIndex] = { ...newScenery[selectedSceneryIndex], heightScale };
                        setEditorScenery(newScenery);
                        saveCustomTrack(editorNodes, editorTrackName, editorRoadWidth, editorTimeLimit, editorHasObstacles, editorGridLimit, editorHaveGrass, editorGrassWidth, newScenery);
                      }}
                      className="w-full accent-green-500 cursor-pointer"
                    />
                  </div>
                )}

                <div className="mt-4 pt-2 border-t border-green-900/30">
                  <div className="flex justify-between text-[10px] font-bold text-green-400 tracking-wider uppercase">
                    <span>Rotation</span>
                    <span className="font-mono">{Math.round((editorScenery[selectedSceneryIndex].rotation ?? 0) * (180 / Math.PI))}°</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    step="5"
                    value={Math.round((editorScenery[selectedSceneryIndex].rotation ?? 0) * (180 / Math.PI))}
                    onChange={(e) => {
                      const rad = parseFloat(e.target.value) * (Math.PI / 180);
                      const newScenery = [...editorScenery];
                      newScenery[selectedSceneryIndex] = { ...newScenery[selectedSceneryIndex], rotation: rad };
                      setEditorScenery(newScenery);
                      saveCustomTrack(editorNodes, editorTrackName, editorRoadWidth, editorTimeLimit, editorHasObstacles, editorGridLimit, editorHaveGrass, editorGrassWidth, newScenery);
                    }}
                    className="w-full accent-green-500 cursor-pointer"
                  />
                </div>

                <button
                  onClick={() => {
                    const newScenery = editorScenery.filter((_, idx) => idx !== selectedSceneryIndex);
                    setEditorScenery(newScenery);
                    setSelectedSceneryIndex(null);
                    saveCustomTrack(editorNodes, editorTrackName, editorRoadWidth, editorTimeLimit, editorHasObstacles, editorGridLimit, editorHaveGrass, editorGrassWidth, newScenery);
                  }}
                  className="w-full mt-3 bg-red-955/60 hover:bg-red-900 border border-red-800/80 hover:border-red-650 text-red-300 hover:text-white py-1.5 rounded-xl text-[10px] font-bold tracking-wider uppercase transition-all cursor-pointer"
                >
                  Delete Selected Scenery
                </button>
              </div>
            )}
          </div>

          {/* Track Design Settings */}
          <div>
            <h3 className="text-sm font-bold text-slate-355 uppercase tracking-wider mb-3">Track Design & Setup</h3>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Track Name</label>
              <input
                type="text"
                value={editorTrackName}
                onChange={(e) => {
                  setEditorTrackName(e.target.value);
                  saveCustomTrack(editorNodes, e.target.value, editorRoadWidth, editorTimeLimit, editorHasObstacles, editorGridLimit);
                }}
                placeholder="My Custom Track"
                maxLength={24}
                className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none transition-colors"
              />
            </div>

            <div className="space-y-1.5 mt-4">
              <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Snap to Grid</label>
              <select
                value={snapToGrid}
                onChange={(e) => setSnapToGrid(parseInt(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none transition-colors cursor-pointer"
              >
                <option value={0}>Off (Free Move)</option>
                <option value={5}>5m Grid</option>
                <option value={10}>10m Grid</option>
                <option value={20}>20m Grid</option>
              </select>
            </div>

            <div className="space-y-1.5 mt-4">
              <div className="flex justify-between text-[10px] font-bold text-slate-400 tracking-wider uppercase">
                <span>Default Node Elevation</span>
                <span className="text-purple-400 font-mono">{editorCornerHeight}m</span>
              </div>
              <input
                type="range"
                min="2"
                max="35"
                step="1"
                value={editorCornerHeight}
                onChange={(e) => setEditorCornerHeight(parseInt(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer"
              />
            </div>

            <div className="space-y-1.5 mt-4">
              <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Grid Size (Map Scale)</label>
              <select
                value={editorGridLimit}
                onChange={(e) => {
                  const newLimit = parseInt(e.target.value);
                  setEditorGridLimit(newLimit);
                  saveCustomTrack(editorNodes, editorTrackName, editorRoadWidth, editorTimeLimit, editorHasObstacles, newLimit);
                }}
                className="w-full bg-slate-955 border border-slate-800 focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none transition-colors cursor-pointer"
              >
                <option value={250}>250m (Total 500m area)</option>
                <option value={500}>500m (Total 1.0km area)</option>
                <option value={1000}>1000m (Total 2.0km area)</option>
                <option value={2000}>2000m (Total 4.0km area)</option>
                <option value={3000}>3000m (Total 6.0km area)</option>
              </select>
            </div>

            <div className="space-y-1.5 mt-4">
              <div className="flex justify-between text-[10px] font-bold text-slate-400 tracking-wider uppercase">
                <span>Road Width</span>
                <span className="text-purple-400 font-mono">{editorRoadWidth}m</span>
              </div>
              <input
                type="range"
                min="12"
                max="40"
                step="2"
                value={editorRoadWidth}
                onChange={(e) => {
                  const width = parseInt(e.target.value);
                  setEditorRoadWidth(width);
                  saveCustomTrack(editorNodes, editorTrackName, width, editorTimeLimit, editorHasObstacles, editorGridLimit, editorHaveGrass, editorGrassWidth, editorScenery);
                }}
                className="w-full accent-purple-500 cursor-pointer"
              />
            </div>

            <div className="space-y-1.5 mt-4">
              <div className="flex justify-between text-[10px] font-bold text-slate-400 tracking-wider uppercase">
                <span>Time Limit (Lap)</span>
                <span className="text-purple-400 font-mono">{editorTimeLimit}s</span>
              </div>
              <input
                type="range"
                min="10"
                max="120"
                step="5"
                value={editorTimeLimit}
                onChange={(e) => {
                  const time = parseInt(e.target.value);
                  setEditorTimeLimit(time);
                  saveCustomTrack(editorNodes, editorTrackName, editorRoadWidth, time, editorHasObstacles, editorGridLimit, editorHaveGrass, editorGrassWidth, editorScenery);
                }}
                className="w-full accent-purple-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between mt-4 bg-slate-950/40 border border-slate-800 p-2.5 rounded-xl">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-slate-355">Active Obstacles</span>
                <span className="text-[9px] text-slate-500">Spawns cones along paths</span>
              </div>
              <input
                type="checkbox"
                checked={editorHasObstacles}
                onChange={(e) => {
                  setEditorHasObstacles(e.target.checked);
                  saveCustomTrack(editorNodes, editorTrackName, editorRoadWidth, editorTimeLimit, e.target.checked, editorGridLimit, editorHaveGrass, editorGrassWidth, editorScenery);
                }}
                className="w-4 h-4 accent-purple-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between mt-4 bg-slate-955/40 border border-slate-800 p-2.5 rounded-xl">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-slate-355">Trackside Grass</span>
                <span className="text-[9px] text-slate-500">Renders grass curbs</span>
              </div>
              <input
                type="checkbox"
                checked={editorHaveGrass}
                onChange={(e) => {
                  setEditorHaveGrass(e.target.checked);
                  saveCustomTrack(editorNodes, editorTrackName, editorRoadWidth, editorTimeLimit, editorHasObstacles, editorGridLimit, e.target.checked);
                }}
                className="w-4 h-4 accent-purple-500 cursor-pointer"
              />
            </div>

            {editorHaveGrass && (
              <div className="space-y-1.5 mt-4">
                <div className="flex justify-between text-[10px] font-bold text-slate-400 tracking-wider uppercase">
                  <span>Grass Field Width</span>
                  <span className="text-purple-400 font-mono">{editorGrassWidth}m</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="12"
                  step="1"
                  value={editorGrassWidth}
                  onChange={(e) => {
                    const width = parseInt(e.target.value);
                    setEditorGrassWidth(width);
                    saveCustomTrack(editorNodes, editorTrackName, editorRoadWidth, editorTimeLimit, editorHasObstacles, editorGridLimit, editorHaveGrass, width);
                  }}
                  className="w-full accent-purple-500 cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Track Presets */}
          <div>
            <h3 className="text-sm font-bold text-slate-355 uppercase tracking-wider mb-2">Track Presets</h3>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handleApplyTemplate('oval')}
                className="bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[10px] font-bold py-2 rounded-xl transition-all cursor-pointer text-slate-300"
              >
                Oval Loop
              </button>
              <button
                onClick={() => handleApplyTemplate('scurve')}
                className="bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[10px] font-bold py-2 rounded-xl transition-all cursor-pointer text-slate-300"
              >
                S-Curves
              </button>
              <button
                onClick={() => handleApplyTemplate('figure8')}
                className="bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[10px] font-bold py-2 rounded-xl transition-all cursor-pointer text-slate-300"
              >
                Figure 8
              </button>
            </div>
          </div>

          {/* Code Import/Export Box */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-355 uppercase tracking-wider">Vector3 Code Tools</h3>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    editorNodes.map(n => `new THREE.Vector3(${Math.round(n.x)}, 2, ${Math.round(n.z)})`).join(',\n')
                  );
                  alert("Vector3 coordinate code copied to clipboard!");
                }}
                className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer bg-transparent border-0 font-bold"
              >
                <Copy className="w-3 h-3" /> Copy Code
              </button>
            </div>

            <textarea
              placeholder="Paste new THREE.Vector3(x, 2, z) lines here..."
              id="import-export-textarea"
              className="w-full bg-slate-955 border border-slate-800 focus:border-purple-500 rounded-xl px-3 py-2 text-[10px] font-mono text-slate-400 outline-none transition-colors h-24 resize-none leading-relaxed"
            />

            <button
              onClick={() => {
                const txtarea = document.getElementById('import-export-textarea') as HTMLTextAreaElement;
                if (txtarea) importTrack(txtarea.value);
              }}
              className="w-full bg-slate-955 hover:bg-slate-800 border border-slate-800 py-1.5 rounded-xl text-[10px] font-bold transition-all text-slate-200 cursor-pointer"
            >
              Import Code
            </button>
          </div>

          {/* Editor Actions Buttons */}
          <div className="mt-6 space-y-2">
            <button
              disabled={editorNodes.length < 3}
              onClick={launchTestDrive}
              className={`w-full py-3.5 rounded-xl text-xs font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 border cursor-pointer ${
                editorNodes.length >= 3
                  ? 'bg-purple-600 hover:bg-purple-500 border-purple-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.35)] hover:shadow-[0_0_20px_rgba(168,85,247,0.55)]'
                  : 'bg-slate-800 border border-slate-700 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Play className="w-4 h-4 fill-current" />
              {editorNodes.length >= 3 ? 'Test Drive Track' : 'Needs Min. 3 Nodes'}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleClearAll}
                className="bg-slate-955 hover:bg-red-955/40 border border-slate-800 hover:border-red-900/60 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-red-400 transition-all cursor-pointer"
              >
                Clear All
              </button>
              <button
                onClick={exitToGarage}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 py-2 rounded-xl text-xs font-bold text-slate-250 transition-all cursor-pointer"
              >
                Close Editor
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Floating Editor Panel */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-auto backdrop-blur-md bg-slate-950/80 border border-purple-500/30 rounded-3xl p-5 shadow-[0_0_30px_rgba(0,0,0,0.5)] flex flex-col items-center gap-4 w-[620px]">
        {/* Mode Tab Toggle */}
        <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1 w-full max-w-[320px]">
          <button
            onClick={() => setEditorTool('node')}
            className={`flex-1 text-xs font-extrabold py-2 px-4 rounded-lg transition-all uppercase tracking-wider cursor-pointer ${
              editorTool === 'node'
                ? 'bg-purple-600 text-white shadow-[0_0_10px_rgba(168,85,247,0.3)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Track Mode
          </button>
          <button
            onClick={() => setEditorTool('tree1')}
            className={`flex-1 text-xs font-extrabold py-2 px-4 rounded-lg transition-all uppercase tracking-wider cursor-pointer ${
              editorTool !== 'node'
                ? 'bg-emerald-600 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Decorate Mode
          </button>
        </div>

        {/* Selected Mode Options */}
        {editorTool === 'node' ? (
          /* Track Mode options */
          <div className="flex gap-4">
            <button
              onClick={() => setEditorTool('node')}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all cursor-pointer w-[100px] h-[95px] justify-between ${
                editorTool === 'node'
                  ? 'bg-purple-950/40 border-purple-500/80 shadow-[0_0_15px_rgba(168,85,247,0.25)]'
                  : 'bg-slate-950/55 border-slate-900 text-slate-400 hover:bg-slate-800'
              }`}
            >
              {renderToolIcon('node', editorTool === 'node')}
              <span className="text-[10px] font-bold tracking-wide">Track Node</span>
            </button>
          </div>
        ) : (
          /* Decorate Mode options */
          <div className="flex gap-2 overflow-x-auto w-full pb-1 max-w-[580px] scrollbar-thin">
            {[
              { id: 'tree1', name: 'Pine Tree' },
              { id: 'tree2', name: 'Oak Tree' },
              { id: 'tree3', name: 'Palm Tree' },
              { id: 'rock', name: 'Rock' },
              { id: 'mountain', name: 'Mountain' },
              { id: 'hill', name: 'Hill' },
              { id: 'podium', name: 'Grandstand' },
            ].map((item) => {
              const isActive = editorTool === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setEditorTool(item.id as any)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-2xl border transition-all cursor-pointer w-[75px] h-[85px] justify-between shrink-0 ${
                    isActive
                      ? 'bg-emerald-950/40 border-emerald-500/80 shadow-[0_0_15px_rgba(16,185,129,0.25)]'
                      : 'bg-slate-950/55 border-slate-900 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {renderToolIcon(item.id, isActive)}
                  <span className="text-[9px] font-bold tracking-wide text-center leading-none">{item.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
