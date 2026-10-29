import React, { useState, useEffect, useRef } from 'react';
import {
  Sun,
  Moon,
  Plus,
  Minus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  Maximize2,
  Trash2,
  Info,
  Network,
  List,
  Layers,
  Bot,
} from 'lucide-react';
import { apiFetch } from './lib/api';
import { UploadZone } from './components/UploadZone';
import { GraphCanvas, GraphCanvasHandle } from './components/GraphCanvas';
import { NodeDetailPanel } from './components/NodeDetailPanel';
import { ChatBar } from './components/ChatBar';
import {
  GraphData,
  LayoutName,
  QueryHighlight,
  clearGraphResponseSchema,
  graphDataSchema,
  healthResponseSchema,
} from './types';

export const App: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('governiq_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('governiq_sidebar_open');
    return saved !== null ? saved === 'true' : true;
  });

  const [chatCollapsed, setChatCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem('governiq_chat_collapsed');
    return saved === 'true';
  });

  const [healthStatus, setHealthStatus] = useState<string>('checking');
  const [graph, setGraph] = useState<GraphData>({
    nodes: [],
    edges: [],
    node_count: 0,
    edge_count: 0,
  });

  const [selectedConfigTab, setSelectedConfigTab] = useState<string>('all');
  const [layout, setLayout] = useState<LayoutName>('cose');
  const [isLayoutDropdownOpen, setIsLayoutDropdownOpen] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'graph' | 'topology'>('graph');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<QueryHighlight | null>(null);
  const [isClearing, setIsClearing] = useState<boolean>(false);

  const canvasRef = useRef<GraphCanvasHandle>(null);
  const layoutDropdownRef = useRef<HTMLDivElement>(null);

  // Group nodes and edges by agent config / source_doc
  const configTabs = React.useMemo(() => {
    const map = new Map<string, { nodes: Set<string>; edges: Set<string>; agents: string[] }>();

    for (const node of graph.nodes) {
      const doc = node.source_doc || 'manual';
      if (!map.has(doc)) {
        map.set(doc, { nodes: new Set(), edges: new Set(), agents: [] });
      }
      const item = map.get(doc)!;
      item.nodes.add(node.id);
      if (node.type === 'Agent' && !item.agents.includes(node.name)) {
        item.agents.push(node.name);
      }
    }

    for (const edge of graph.edges) {
      let doc = edge.source_doc;
      if (!doc) {
        const sourceNode = graph.nodes.find((n) => n.id === edge.source);
        doc = sourceNode?.source_doc || 'manual';
      }
      if (map.has(doc)) {
        map.get(doc)!.edges.add(edge.id);
      }
    }

    return Array.from(map.entries()).map(([filename, data]) => {
      const agentName = data.agents[0];
      const title = agentName || filename;
      return {
        filename,
        title,
        nodeCount: data.nodes.size,
        edgeCount: data.edges.size,
        agents: data.agents,
      };
    });
  }, [graph]);

  // Derive displayed subgraph based on selected config tab
  const displayedGraph = React.useMemo<GraphData>(() => {
    if (selectedConfigTab === 'all') {
      return graph;
    }

    const filteredNodes = graph.nodes.filter(
      (node) => (node.source_doc || 'manual') === selectedConfigTab
    );
    const nodeIds = new Set(filteredNodes.map((n) => n.id));

    const filteredEdges = graph.edges.filter(
      (edge) =>
        edge.source_doc === selectedConfigTab ||
        (nodeIds.has(edge.source) && nodeIds.has(edge.target))
    );

    return {
      nodes: filteredNodes,
      edges: filteredEdges,
      node_count: filteredNodes.length,
      edge_count: filteredEdges.length,
    };
  }, [graph, selectedConfigTab]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('governiq_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('governiq_sidebar_open', String(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    localStorage.setItem('governiq_chat_collapsed', String(chatCollapsed));
  }, [chatCollapsed]);

  // Close layout dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        layoutDropdownRef.current &&
        !layoutDropdownRef.current.contains(e.target as Node)
      ) {
        setIsLayoutDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Check health and load initial graph
  useEffect(() => {
    const checkHealthAndLoadGraph = async () => {
      try {
        const data = await apiFetch('/api/health', healthResponseSchema);
        setHealthStatus(data.status);
      } catch {
        setHealthStatus('disconnected');
      }

      try {
        const graphData = await apiFetch('/api/graph', graphDataSchema);
        setGraph(graphData);
      } catch {
        // Initial graph load is optional
      }
    };
    void checkHealthAndLoadGraph();
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const toggleSidebar = () => {
    setSidebarOpen((prev) => !prev);
  };

  const handleSelectConfigTab = (tab: string) => {
    setSelectedConfigTab(tab);
    setSelectedNodeId(null);
    setTimeout(() => {
      canvasRef.current?.fit();
    }, 150);
  };

  const handleUploadSuccess = (updatedGraph: GraphData) => {
    setGraph(updatedGraph);
    if (updatedGraph.nodes.length > 0) {
      setTimeout(() => {
        canvasRef.current?.fit();
      }, 200);
    }
  };

  const handleSelectLayout = (newLayout: LayoutName) => {
    setLayout(newLayout);
    setIsLayoutDropdownOpen(false);
    canvasRef.current?.runLayout(newLayout);
  };

  const handleClearGraph = async () => {
    if (!window.confirm('Clear all nodes and relationships from the governance graph?')) {
      return;
    }
    setIsClearing(true);
    try {
      await apiFetch('/api/graph', clearGraphResponseSchema, { method: 'DELETE' });
      setGraph({ nodes: [], edges: [], node_count: 0, edge_count: 0 });
      setSelectedConfigTab('all');
      setSelectedNodeId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to clear graph');
    } finally {
      setIsClearing(false);
    }
  };

  const getNodeColorClass = (type: string) => {
    switch (type) {
      case 'User':
        return 'bg-node-user text-white';
      case 'Agent':
        return 'bg-node-agent text-white';
      case 'Model':
        return 'bg-node-model text-white';
      case 'Tool':
        return 'bg-node-tool text-white';
      case 'DataSource':
        return 'bg-node-datasource text-white';
      case 'Policy':
        return 'bg-node-policy text-white';
      default:
        return 'bg-selected text-content-primary';
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-base text-content-primary select-none font-sans">
      {/* Collapsible Sidebar */}
      <aside
        data-testid="sidebar"
        aria-hidden={!sidebarOpen}
        className={`h-full flex flex-col bg-sidebar border-border shrink-0 overflow-hidden transition-[width,opacity,border-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] z-10 ${
          sidebarOpen ? 'w-[346px] border-r opacity-100' : 'w-0 border-r-0 opacity-0 pointer-events-none'
        }`}
      >
        <div className="w-[346px] h-full flex flex-col p-5 overflow-y-auto transition-opacity duration-200">
          <div className="flex items-center justify-between mb-6 shrink-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-content-muted">
              Workspace
            </span>
            <button
              onClick={toggleSidebar}
              title="Collapse sidebar"
              className="h-[38px] w-[38px] rounded-lg bg-selected flex items-center justify-center hover:bg-surface-hover text-content-primary transition-all duration-200 active:scale-90 hover:scale-105 shadow-sm"
            >
              <ChevronLeft className="h-5 w-5 transition-transform duration-200" />
            </button>
          </div>

          {/* Interactive Upload Drop Zone */}
          <div className="shrink-0 mb-5">
            <UploadZone onUploadSuccess={handleUploadSuccess} />
          </div>

          {/* Agent Configurations Tabs */}
          {configTabs.length > 0 && (
            <div className="mb-5 shrink-0" data-testid="agent-configs-section">
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-sm font-semibold text-content-primary flex items-center space-x-1.5">
                  <Bot className="h-4 w-4 text-node-agent" />
                  <span>Agent Configurations</span>
                </h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-selected text-content-muted font-medium">
                  {configTabs.length} {configTabs.length === 1 ? 'config' : 'configs'}
                </span>
              </div>

              <div className="space-y-1.5" role="tablist" aria-label="Agent Configurations">
                {/* All Graphs Combined Tab */}
                <button
                  role="tab"
                  aria-selected={selectedConfigTab === 'all'}
                  onClick={() => handleSelectConfigTab('all')}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left border transition-all duration-200 ${
                    selectedConfigTab === 'all'
                      ? 'bg-selected border-content-primary text-content-primary shadow-sm font-medium'
                      : 'bg-surface border-border text-content-muted hover:border-content-muted/40 hover:text-content-primary'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <Layers className="h-4 w-4 shrink-0 text-state-info" />
                    <div className="truncate">
                      <div className="text-xs font-semibold truncate text-content-primary">
                        All Agent Graphs
                      </div>
                      <div className="text-[10px] text-content-muted">
                        Combined multi-agent view
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono shrink-0 px-1.5 py-0.5 rounded bg-base text-content-muted">
                    {graph.node_count}n • {graph.edge_count}e
                  </span>
                </button>

                {/* Individual Agent Config Tabs */}
                {configTabs.map((cfg) => {
                  const isSelected = selectedConfigTab === cfg.filename;
                  return (
                    <button
                      key={cfg.filename}
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => handleSelectConfigTab(cfg.filename)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left border transition-all duration-200 group ${
                        isSelected
                          ? 'bg-selected border-content-primary text-content-primary shadow-sm font-medium ring-1 ring-content-primary/30'
                          : 'bg-surface border-border text-content-muted hover:border-content-muted/40 hover:text-content-primary'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <Bot
                          className={`h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                            isSelected ? 'text-node-agent' : 'text-content-muted'
                          }`}
                        />
                        <div className="truncate">
                          <div className="text-xs font-semibold truncate text-content-primary">
                            {cfg.title}
                          </div>
                          <div className="text-[10px] font-mono text-content-muted truncate">
                            {cfg.filename}
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono shrink-0 px-1.5 py-0.5 rounded bg-base text-content-muted">
                        {cfg.nodeCount}n • {cfg.edgeCount}e
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Legend Heading & Card */}
          <div className="mb-2 shrink-0">
            <h2 className="text-sm font-semibold text-content-primary">Legend</h2>
          </div>
          <div className="border border-border rounded-2xl p-4 space-y-2 bg-surface transition-colors duration-200 shrink-0">
            {[
              { type: 'User', color: 'bg-node-user', hex: '#3B82F6' },
              { type: 'Agent', color: 'bg-node-agent', hex: '#A855F7' },
              { type: 'Model', color: 'bg-node-model', hex: '#22C55E' },
              { type: 'Tool', color: 'bg-node-tool', hex: '#F59E0B' },
              { type: 'Data Source', color: 'bg-node-datasource', hex: '#EF4444' },
              { type: 'Policy', color: 'bg-node-policy', hex: '#14B8A6' },
            ].map(({ type, color }) => (
              <div
                key={type}
                className="flex items-center space-x-3 text-sm px-2 py-1.5 rounded-lg transition-all duration-150 hover:bg-surface-hover cursor-default group"
              >
                <span
                  className={`w-4 h-4 rounded-md ${color} shrink-0 transition-transform duration-200 ease-out group-hover:scale-125 group-hover:rotate-6 shadow-sm`}
                />
                <span className="text-content-primary font-medium text-xs transition-colors duration-150">
                  {type}
                </span>
              </div>
            ))}
          </div>

          {/* Helper line */}
          <div className="mt-4 flex items-center space-x-2 text-xs text-content-muted shrink-0">
            <Info className="h-4 w-4 shrink-0 transition-transform duration-200 hover:rotate-12" />
            <span>Click any node in graph to inspect details</span>
          </div>

          <div className="mt-auto pt-4 border-t border-border flex items-center justify-between text-xs text-content-muted shrink-0">
            <span>API Status:</span>
            <span
              className={`font-mono px-2 py-0.5 rounded text-[11px] transition-all duration-200 ${
                healthStatus === 'ok'
                  ? 'bg-state-success/20 text-state-success font-semibold'
                  : 'bg-state-error/20 text-state-error font-semibold'
              }`}
            >
              {healthStatus}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 flex flex-col h-full relative overflow-hidden transition-all duration-300">
        {/* Top Header & Toolbar */}
        <div className="p-6 pb-2 transition-all duration-300 z-10 bg-base/80 backdrop-blur-md border-b border-border/40">
          <div className="flex items-start justify-between">
            <div className="flex items-center">
              {/* Expand sidebar button */}
              <div
                className={`transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden flex items-center ${
                  !sidebarOpen ? 'w-[38px] opacity-100 mr-4 scale-100' : 'w-0 opacity-0 mr-0 scale-90 pointer-events-none'
                }`}
              >
                <button
                  onClick={toggleSidebar}
                  title="Expand sidebar"
                  className="h-[38px] w-[38px] rounded-lg bg-selected flex items-center justify-center hover:bg-surface-hover text-content-primary transition-all duration-200 active:scale-90 hover:scale-105 shadow-sm"
                >
                  <ChevronRight className="h-5 w-5 transition-transform duration-200" />
                </button>
              </div>

              <div>
                <h1 className="text-[34px] md:text-[40px] font-semibold leading-tight tracking-[-0.03em] text-content-primary transition-colors duration-200">
                  Governance Graph Builder
                </h1>
                <p className="text-xs text-content-muted mt-1 transition-colors duration-200">
                  Agents, models, tools, users, data sources &amp; policies — one queryable graph.
                </p>
              </div>
            </div>

            {/* View Mode Switcher (Graph Canvas vs Topology List) */}
            <div className="hidden sm:flex items-center p-1 rounded-xl bg-surface border border-border text-xs">
              <button
                onClick={() => setViewMode('graph')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all duration-200 font-medium ${
                  viewMode === 'graph'
                    ? 'bg-selected text-content-primary shadow-sm'
                    : 'text-content-muted hover:text-content-primary'
                }`}
              >
                <Network className="h-3.5 w-3.5" />
                <span>Visual Graph</span>
              </button>
              <button
                onClick={() => setViewMode('topology')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all duration-200 font-medium ${
                  viewMode === 'topology'
                    ? 'bg-selected text-content-primary shadow-sm'
                    : 'text-content-muted hover:text-content-primary'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                <span>Topology List</span>
              </button>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between mt-5 pt-3 border-t border-border transition-colors duration-200">
            <div className="flex items-center space-x-2">
              <span className="text-[13px] text-content-muted mr-1">Layout:</span>

              {/* Layout Dropdown */}
              <div className="relative" ref={layoutDropdownRef}>
                <button
                  onClick={() => setIsLayoutDropdownOpen((prev) => !prev)}
                  className="px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-hover active:scale-95 text-[13px] font-medium flex items-center space-x-2 transition-all duration-200 shadow-sm"
                >
                  <span className="capitalize">{layout}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-content-muted" />
                </button>

                {isLayoutDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1.5 w-36 bg-surface border border-border rounded-xl shadow-float p-1.5 z-30 animate-in fade-in zoom-in-95 duration-150">
                    {(['cose', 'breadthfirst', 'concentric'] as LayoutName[]).map((name) => (
                      <button
                        key={name}
                        onClick={() => handleSelectLayout(name)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg transition-colors capitalize ${
                          layout === name
                            ? 'bg-selected text-content-primary font-medium'
                            : 'text-content-muted hover:text-content-primary hover:bg-surface-hover'
                        }`}
                      >
                        <span>{name}</span>
                        {layout === name && <Check className="h-3.5 w-3.5 text-content-primary" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="h-4 w-[1px] bg-border mx-2 transition-colors duration-200" />

              {/* Zoom In */}
              <button
                onClick={() => canvasRef.current?.zoomIn()}
                title="Zoom in"
                className="p-1.5 rounded-lg border border-border bg-surface hover:bg-surface-hover active:scale-90 text-content-primary transition-all duration-150 shadow-sm"
              >
                <Plus className="h-4 w-4" />
              </button>

              {/* Zoom Out */}
              <button
                onClick={() => canvasRef.current?.zoomOut()}
                title="Zoom out"
                className="p-1.5 rounded-lg border border-border bg-surface hover:bg-surface-hover active:scale-90 text-content-primary transition-all duration-150 shadow-sm"
              >
                <Minus className="h-4 w-4" />
              </button>

              {/* Center / Fit View */}
              <button
                onClick={() => canvasRef.current?.fit()}
                title="Fit to view"
                className="p-1.5 rounded-lg border border-border bg-surface hover:bg-surface-hover active:scale-90 text-content-primary transition-all duration-150 shadow-sm"
              >
                <Maximize2 className="h-4 w-4" />
              </button>

              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                title="Toggle Theme"
                className="p-1.5 rounded-lg border border-border bg-surface hover:bg-surface-hover active:scale-90 text-content-primary transition-all duration-200 group shadow-sm"
              >
                {theme === 'light' ? (
                  <Sun className="h-4 w-4 transition-transform duration-300 ease-out group-hover:rotate-45" />
                ) : (
                  <Moon className="h-4 w-4 transition-transform duration-300 ease-out group-hover:-rotate-12" />
                )}
              </button>

              {/* Clear Graph Button (Dev/Demo reset) */}
              {graph.node_count > 0 && (
                <button
                  onClick={handleClearGraph}
                  disabled={isClearing}
                  title="Clear graph"
                  className="p-1.5 rounded-lg border border-state-error/30 bg-state-error/10 hover:bg-state-error/20 text-state-error active:scale-90 transition-all duration-150 shadow-sm ml-2"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            <div
              data-testid="graph-counters"
              className="text-[13px] font-mono text-content-muted transition-colors duration-200 flex items-center space-x-2"
            >
              {selectedConfigTab !== 'all' && (
                <span className="px-2 py-0.5 rounded-md bg-selected text-[11px] font-semibold text-content-primary">
                  {configTabs.find((c) => c.filename === selectedConfigTab)?.title || selectedConfigTab}
                </span>
              )}
              <span>{displayedGraph.node_count} nodes</span>
              <span className="mx-1">•</span>
              <span>{displayedGraph.edge_count} edges</span>
            </div>
          </div>
        </div>

        {/* Canvas & Content Area */}
        <div className="flex-1 relative overflow-hidden">
          {displayedGraph.node_count === 0 ? (
            <div className="h-full flex items-center justify-center p-6">
              <div className="text-center text-content-muted text-sm transition-all duration-300 hover:scale-105 cursor-default max-w-sm">
                <Network className="h-10 w-10 mx-auto text-content-muted/60 mb-3 animate-pulse" />
                <p className="font-medium text-base text-content-primary/90">
                  Ready to build governance graph
                </p>
                <p className="text-xs mt-1 text-content-muted leading-relaxed">
                  Upload an agent configuration or policy document on the left sidebar to generate the interactive queryable graph.
                </p>
              </div>
            </div>
          ) : viewMode === 'graph' ? (
            <div className="w-full h-full relative">
              <GraphCanvas
                ref={canvasRef}
                graph={displayedGraph}
                layout={layout}
                theme={theme}
                selectedNodeId={selectedNodeId}
                onSelectNode={(nodeId) => setSelectedNodeId(nodeId)}
                highlight={highlight}
              />
            </div>
          ) : (
            <div className="h-full overflow-y-auto p-6 max-w-4xl mx-auto space-y-6 pb-28">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-content-muted mb-3">
                  Graph Topology ({displayedGraph.node_count} Nodes, {displayedGraph.edge_count} Relationships)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {displayedGraph.nodes.map((node) => (
                    <div
                      key={node.id}
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`border rounded-xl p-3.5 bg-surface transition-all duration-200 shadow-sm flex items-start space-x-3 cursor-pointer ${
                        selectedNodeId === node.id
                          ? 'border-content-primary ring-1 ring-content-primary'
                          : 'border-border hover:border-content-muted/50'
                      }`}
                    >
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${getNodeColorClass(
                          node.type
                        )}`}
                      >
                        {node.type}
                      </span>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-content-primary truncate">
                          {node.name}
                        </h4>
                        <p className="text-[11px] font-mono text-content-muted truncate mt-0.5">
                          {node.id}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {displayedGraph.edges.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-content-muted mb-3">
                    Relationships
                  </h3>
                  <div className="border border-border rounded-xl divide-y divide-border bg-surface text-xs font-mono">
                    {displayedGraph.edges.map((edge) => (
                      <div key={edge.id} className="p-2.5 flex items-center justify-between text-content-muted">
                        <span className="truncate text-content-primary font-medium">{edge.source}</span>
                        <span className="px-2 py-0.5 rounded bg-selected text-[10px] font-bold text-content-primary">
                          {edge.type}
                        </span>
                        <span className="truncate text-content-primary font-medium">{edge.target}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Node Detail Slide-Over Panel */}
          {selectedNodeId && (
            <NodeDetailPanel
              nodeId={selectedNodeId}
              onClose={() => setSelectedNodeId(null)}
              onSelectNode={(nextId) => {
                setSelectedNodeId(nextId);
                canvasRef.current?.selectNode(nextId);
              }}
            />
          )}
        </div>

        {/* Interactive Floating Chat Bar */}
        <ChatBar
          onHighlight={(h) => setHighlight(h)}
          activeHighlight={highlight}
          onAttachClick={() => setSidebarOpen(true)}
          isCollapsed={chatCollapsed}
          onToggleCollapse={setChatCollapsed}
        />
      </main>
    </div>
  );
};

export default App;
