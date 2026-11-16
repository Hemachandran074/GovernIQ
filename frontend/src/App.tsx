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
  Sparkles,
  Wrench,
  UserRound,
  Database,
  ShieldCheck,
  AlertTriangle,
  Shield,
  Activity,
  FileCode2,
} from 'lucide-react';
import { apiFetch } from './lib/api';
import { UploadZone } from './components/UploadZone';
import { GraphCanvas, GraphCanvasHandle, normalizeNodeType } from './components/GraphCanvas';
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
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'dark';
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
  const [isConfigDropdownOpen, setIsConfigDropdownOpen] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'graph' | 'topology'>('graph');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<QueryHighlight | null>(null);
  const [isClearing, setIsClearing] = useState<boolean>(false);

  const canvasRef = useRef<GraphCanvasHandle>(null);
  const layoutDropdownRef = useRef<HTMLDivElement>(null);
  const configDropdownRef = useRef<HTMLDivElement>(null);

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

  // Breakdown of node counts by entity type for the Overview Panel
  const nodeCountsByType = React.useMemo(() => {
    const counts = {
      Agent: 0,
      Model: 0,
      Tool: 0,
      DataSource: 0,
      Policy: 0,
      User: 0,
    };
    for (const node of displayedGraph.nodes) {
      if (node.type in counts) {
        counts[node.type as keyof typeof counts]++;
      }
    }
    return counts;
  }, [displayedGraph.nodes]);

  // Audit alerts (e.g. orphan agents without tools or policies)
  const auditWarnings = React.useMemo(() => {
    const warnings: string[] = [];
    const agents = displayedGraph.nodes.filter((n) => n.type === 'Agent');
    for (const agent of agents) {
      const hasPolicy = displayedGraph.edges.some(
        (e) => (e.source === agent.id || e.target === agent.id) && e.type.includes('ENFORCE')
      );
      if (!hasPolicy && agents.length > 0) {
        warnings.push(`Unenforced agent: ${agent.name}`);
      }
    }
    return warnings;
  }, [displayedGraph]);

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

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        layoutDropdownRef.current &&
        !layoutDropdownRef.current.contains(e.target as Node)
      ) {
        setIsLayoutDropdownOpen(false);
      }
      if (
        configDropdownRef.current &&
        !configDropdownRef.current.contains(e.target as Node)
      ) {
        setIsConfigDropdownOpen(false);
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
    setIsConfigDropdownOpen(false);
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
      setHighlight(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to clear graph');
    } finally {
      setIsClearing(false);
    }
  };

  // Quick highlight toggle by entity type (Reference Image 2)
  const handleQuickHighlight = (type: string) => {
    const matching = displayedGraph.nodes.filter((n) => n.type === type).map((n) => n.id);
    if (matching.length === 0) return;

    if (
      highlight &&
      highlight.node_ids.length === matching.length &&
      matching.every((id) => highlight.node_ids.includes(id))
    ) {
      setHighlight(null);
    } else {
      const matchingEdges = displayedGraph.edges
        .filter((e) => matching.includes(e.source) || matching.includes(e.target))
        .map((e) => e.id);
      setHighlight({ node_ids: matching, edge_ids: matchingEdges });
    }
  };

  const getNodeColorClass = (type: string) => {
    switch (type) {
      case 'User':
        return 'bg-[#60A5FA]/20 text-[#60A5FA] border-[#60A5FA]/40';
      case 'Agent':
        return 'bg-[#8B7CFF]/20 text-[#8B7CFF] border-[#8B7CFF]/40';
      case 'Model':
        return 'bg-[#38BDF8]/20 text-[#38BDF8] border-[#38BDF8]/40';
      case 'Tool':
        return 'bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/40';
      case 'DataSource':
        return 'bg-[#F87171]/20 text-[#F87171] border-[#F87171]/40';
      case 'Policy':
        return 'bg-[#2DD4BF]/20 text-[#2DD4BF] border-[#2DD4BF]/40';
      default:
        return 'bg-[#202B42] text-[#94A3B8] border-[#29344A]';
    }
  };

  const getNodeIcon = (type: string) => {
    const norm = normalizeNodeType(type);
    switch (norm) {
      case 'User':
        return <UserRound className="h-4 w-4 text-[#60A5FA]" />;
      case 'Agent':
        return <Bot className="h-4 w-4 text-[#8B7CFF]" />;
      case 'Model':
        return <Sparkles className="h-4 w-4 text-[#38BDF8]" />;
      case 'Tool':
        return <Wrench className="h-4 w-4 text-[#F59E0B]" />;
      case 'DataSource':
        return <Database className="h-4 w-4 text-[#F87171]" />;
      case 'Policy':
        return <ShieldCheck className="h-4 w-4 text-[#2DD4BF]" />;
      default:
        return <Layers className="h-4 w-4 text-[#94A3B8]" />;
    }
  };

  const activeConfigTitle =
    selectedConfigTab === 'all'
      ? 'Multi-Agent View'
      : configTabs.find((c) => c.filename === selectedConfigTab)?.title || selectedConfigTab;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#080B18] text-[#F1F5F9] select-none font-sans">
      {/* Collapsible Left Sidebar / Overview Panel (Inspired by Reference Image 1) */}
      <aside
        data-testid="sidebar"
        aria-hidden={!sidebarOpen}
        className={`h-full flex flex-col bg-[#111629] border-[#202B42] shrink-0 overflow-hidden transition-[width,opacity,border-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] z-20 ${
          sidebarOpen ? 'w-[346px] border-r opacity-100' : 'w-0 border-r-0 opacity-0 pointer-events-none'
        }`}
      >
        <div className="w-[346px] h-full flex flex-col p-4 overflow-y-auto custom-scrollbar transition-opacity duration-200 space-y-4">
          {/* Header Row */}
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#8B7CFF] to-[#38BDF8] flex items-center justify-center shadow-[0_0_12px_rgba(139,124,255,0.4)]">
                <Shield className="h-4 w-4 text-[#080B18] stroke-[2.5]" />
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#F1F5F9]">
                  GovernIQ
                </span>
                <span className="text-[10px] text-[#64748B] block font-mono">v0.9.4 • Enterprise</span>
              </div>
            </div>

            <button
              onClick={toggleSidebar}
              title="Collapse sidebar"
              className="h-8 w-8 rounded-lg bg-[#171E32] border border-[#202B42] flex items-center justify-center hover:bg-[#202B42] hover:border-[#8B7CFF]/50 text-[#94A3B8] hover:text-[#F1F5F9] transition-all duration-200 active:scale-90 shadow-sm"
            >
              <ChevronLeft className="h-4 w-4 transition-transform duration-200" />
            </button>
          </div>

          {/* AI Agent & Topology Overview Card (Directly from Reference Image 1) */}
          <div className="rounded-2xl p-4 bg-[#171E32]/90 border border-[#202B42] shadow-[0_10px_30px_rgba(0,0,0,0.4)] shrink-0 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-1 rounded-md bg-[#8B7CFF]/20 text-[#8B7CFF]">
                  <Activity className="h-4 w-4" />
                </div>
                <h2 className="text-xs font-semibold text-[#F1F5F9] tracking-tight">
                  AI Agent and LLM overview
                </h2>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#0B1020] border border-[#202B42] text-[#38BDF8] font-medium">
                Live
              </span>
            </div>

            <p className="text-[11px] text-[#94A3B8] leading-relaxed">
              Gain insight into what AI services, Agents, and LLMs are running, how they are connected, and where governance impact may spread.
            </p>

            {/* Node Types Breakdown */}
            <div className="space-y-1.5 pt-1 border-t border-[#202B42]/80">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] block">
                Node types
              </span>

              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => handleQuickHighlight('Agent')}
                  className="flex items-center justify-between p-2 rounded-xl bg-[#0B1020]/80 border border-[#202B42] hover:border-[#8B7CFF]/50 hover:bg-[#1C253C] transition-all text-left group"
                >
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <Bot className="h-3.5 w-3.5 text-[#8B7CFF] shrink-0" />
                    <span className="text-[11px] text-[#94A3B8] group-hover:text-[#F1F5F9] truncate">Agents</span>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-[#F1F5F9] ml-1">
                    {nodeCountsByType.Agent}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickHighlight('Model')}
                  className="flex items-center justify-between p-2 rounded-xl bg-[#0B1020]/80 border border-[#202B42] hover:border-[#38BDF8]/50 hover:bg-[#1C253C] transition-all text-left group"
                >
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <Sparkles className="h-3.5 w-3.5 text-[#38BDF8] shrink-0" />
                    <span className="text-[11px] text-[#94A3B8] group-hover:text-[#F1F5F9] truncate">LLM Models</span>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-[#F1F5F9] ml-1">
                    {nodeCountsByType.Model}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickHighlight('Tool')}
                  className="flex items-center justify-between p-2 rounded-xl bg-[#0B1020]/80 border border-[#202B42] hover:border-[#F59E0B]/50 hover:bg-[#1C253C] transition-all text-left group"
                >
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <Wrench className="h-3.5 w-3.5 text-[#F59E0B] shrink-0" />
                    <span className="text-[11px] text-[#94A3B8] group-hover:text-[#F1F5F9] truncate">Tools / MCP</span>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-[#F1F5F9] ml-1">
                    {nodeCountsByType.Tool}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickHighlight('DataSource')}
                  className="flex items-center justify-between p-2 rounded-xl bg-[#0B1020]/80 border border-[#202B42] hover:border-[#F87171]/50 hover:bg-[#1C253C] transition-all text-left group"
                >
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <Database className="h-3.5 w-3.5 text-[#F87171] shrink-0" />
                    <span className="text-[11px] text-[#94A3B8] group-hover:text-[#F1F5F9] truncate">Databases / Storage</span>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-[#F1F5F9] ml-1">
                    {nodeCountsByType.DataSource}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickHighlight('Policy')}
                  className="flex items-center justify-between p-2 rounded-xl bg-[#0B1020]/80 border border-[#202B42] hover:border-[#2DD4BF]/50 hover:bg-[#1C253C] transition-all text-left group"
                >
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <ShieldCheck className="h-3.5 w-3.5 text-[#2DD4BF] shrink-0" />
                    <span className="text-[11px] text-[#94A3B8] group-hover:text-[#F1F5F9] truncate">Policies</span>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-[#F1F5F9] ml-1">
                    {nodeCountsByType.Policy}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickHighlight('User')}
                  className="flex items-center justify-between p-2 rounded-xl bg-[#0B1020]/80 border border-[#202B42] hover:border-[#60A5FA]/50 hover:bg-[#1C253C] transition-all text-left group"
                >
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <UserRound className="h-3.5 w-3.5 text-[#60A5FA] shrink-0" />
                    <span className="text-[11px] text-[#94A3B8] group-hover:text-[#F1F5F9] truncate">Users</span>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-[#F1F5F9] ml-1">
                    {nodeCountsByType.User}
                  </span>
                </button>
              </div>
            </div>

            {/* Node Status Summary */}
            <div className="pt-2 border-t border-[#202B42]/80 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                Node status
              </span>
              <div className="flex items-center space-x-1.5 text-[11px]">
                <span className="w-2 h-2 rounded-full bg-[#22C55E] shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                <span className="text-[#94A3B8]">
                  {displayedGraph.node_count > 0 ? 'Topology Verified' : 'Awaiting Ingestion'}
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Upload Drop Zone */}
          <div className="shrink-0">
            <UploadZone onUploadSuccess={handleUploadSuccess} />
          </div>

          {/* Agent Configurations Tabs */}
          {configTabs.length > 0 && (
            <div className="shrink-0 space-y-2" data-testid="agent-configs-section">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-[#F1F5F9] flex items-center space-x-1.5">
                  <FileCode2 className="h-3.5 w-3.5 text-[#8B7CFF]" />
                  <span>Agent Configurations</span>
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#171E32] text-[#94A3B8] border border-[#202B42]">
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
                      ? 'bg-[#171E32] border-[#8B7CFF] text-[#F1F5F9] shadow-[0_0_15px_rgba(139,124,255,0.2)] font-semibold'
                      : 'bg-[#111629] border-[#202B42] text-[#94A3B8] hover:border-[#334155] hover:text-[#F1F5F9]'
                  }`}
                >
                  <div className="flex items-center space-x-2 min-w-0">
                    <Layers className={`h-4 w-4 shrink-0 ${selectedConfigTab === 'all' ? 'text-[#8B7CFF]' : 'text-[#64748B]'}`} />
                    <div className="truncate">
                      <div className="text-xs font-medium truncate text-[#F1F5F9]">
                        All Agent Graphs
                      </div>
                      <div className="text-[10px] text-[#64748B]">
                        Combined multi-agent view
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono shrink-0 px-1.5 py-0.5 rounded bg-[#0B1020] border border-[#202B42] text-[#94A3B8]">
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
                          ? 'bg-[#171E32] border-[#8B7CFF] text-[#F1F5F9] shadow-[0_0_15px_rgba(139,124,255,0.2)] font-semibold'
                          : 'bg-[#111629] border-[#202B42] text-[#94A3B8] hover:border-[#334155] hover:text-[#F1F5F9]'
                      }`}
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        <Bot
                          className={`h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                            isSelected ? 'text-[#8B7CFF]' : 'text-[#64748B]'
                          }`}
                        />
                        <div className="truncate">
                          <div className="text-xs font-medium truncate text-[#F1F5F9]">
                            {cfg.title}
                          </div>
                          <div className="text-[10px] font-mono text-[#64748B] truncate">
                            {cfg.filename}
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono shrink-0 px-1.5 py-0.5 rounded bg-[#0B1020] border border-[#202B42] text-[#94A3B8]">
                        {cfg.nodeCount}n • {cfg.edgeCount}e
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Legend Heading & Card */}
          <div className="shrink-0 space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Legend</h2>
            <div className="border border-[#202B42] rounded-2xl p-3 space-y-1.5 bg-[#171E32]/70">
              {[
                { type: 'User', color: 'bg-[#60A5FA]', border: 'border-[#60A5FA]/40' },
                { type: 'Agent', color: 'bg-[#8B7CFF]', border: 'border-[#8B7CFF]/40' },
                { type: 'Model', color: 'bg-[#38BDF8]', border: 'border-[#38BDF8]/40' },
                { type: 'Tool', color: 'bg-[#F59E0B]', border: 'border-[#F59E0B]/40' },
                { type: 'Data Source', color: 'bg-[#F87171]', border: 'border-[#F87171]/40' },
                { type: 'Policy', color: 'bg-[#2DD4BF]', border: 'border-[#2DD4BF]/40' },
              ].map(({ type, color, border }) => (
                <div
                  key={type}
                  className="flex items-center space-x-2.5 text-xs px-2 py-1 rounded-lg hover:bg-[#202B42]/50 cursor-default transition-colors group"
                >
                  <span
                    className={`w-3 h-3 rounded-full ${color} shrink-0 shadow-sm border ${border} transition-transform duration-200 group-hover:scale-125`}
                  />
                  <span className="text-[#94A3B8] group-hover:text-[#F1F5F9] font-medium text-xs transition-colors">
                    {type}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Helper line */}
          <div className="flex items-center space-x-2 text-[11px] text-[#64748B] shrink-0 pt-2">
            <Info className="h-3.5 w-3.5 shrink-0 text-[#8B7CFF]" />
            <span>Click any node in graph to inspect details</span>
          </div>

          {/* Status footer
          <div className="mt-auto pt-3 border-t border-[#202B42] flex items-center justify-between text-xs text-[#64748B] shrink-0">
            <span>API Status:</span>
            <span
              className={`font-mono px-2 py-0.5 rounded text-[11px] font-semibold border ${
                healthStatus === 'ok'
                  ? 'bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30'
                  : 'bg-[#F43F5E]/15 text-[#F43F5E] border-[#F43F5E]/30'
              }`}
            >
              {healthStatus}
            </span>
          </div> */}
        </div>
      </aside>

      {/* Main Graph & Workspace Area */}
      <main className="flex-1 flex flex-col h-full relative overflow-hidden bg-[#080B18]">
        {/* Compact Top Navigation Header (Reference Image 2 style) */}
        <header className="px-5 py-3 transition-all duration-300 z-10 bg-[#0B1020]/95 backdrop-blur-xl border-b border-[#202B42]">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Left Branding & Workspace Indicator */}
            <div className="flex items-center space-x-3 min-w-0">
              {/* Expand sidebar button when collapsed */}
              <div
                className={`transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden flex items-center ${
                  !sidebarOpen ? 'w-8 opacity-100 scale-100 mr-1' : 'w-0 opacity-0 scale-90 pointer-events-none'
                }`}
              >
                <button
                  onClick={toggleSidebar}
                  title="Expand sidebar"
                  className="h-8 w-8 rounded-lg bg-[#171E32] border border-[#202B42] flex items-center justify-center hover:bg-[#202B42] hover:border-[#8B7CFF]/50 text-[#94A3B8] hover:text-[#F1F5F9] transition-all duration-200 active:scale-90 shadow-sm"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-lg md:text-xl font-bold tracking-tight text-[#F1F5F9]">
                    Governance Graph Builder
                  </h1>
                  <span className="hidden sm:inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#8B7CFF]/20 text-[#8B7CFF] border border-[#8B7CFF]/40">
                    AI Topology
                  </span>
                </div>
                <p className="text-[11px] text-[#94A3B8] truncate">
                  Agents, models, tools, users, data sources &amp; policies — one queryable graph.
                </p>
              </div>
            </div>

            {/* Middle: Configuration Dropdown & Audit Badges (Reference Image 2) */}
            <div className="hidden lg:flex items-center space-x-3">
              {/* Workspace Selector */}
              <div className="relative" ref={configDropdownRef}>
                <button
                  onClick={() => setIsConfigDropdownOpen((prev) => !prev)}
                  className="px-3 py-1.5 rounded-xl border border-[#202B42] bg-[#171E32] hover:bg-[#1C253C] text-xs font-medium flex items-center space-x-2 text-[#F1F5F9] shadow-sm transition-all"
                >
                  <span className="w-2 h-2 rounded-full bg-[#8B7CFF]" />
                  <span className="truncate max-w-[180px]">{activeConfigTitle}</span>
                  <ChevronDown className="h-3 w-3 text-[#94A3B8]" />
                </button>

                {isConfigDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1.5 w-60 bg-[#111629] border border-[#202B42] rounded-xl shadow-[0_15px_30px_rgba(0,0,0,0.8)] p-1.5 z-40 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">
                      Workspaces &amp; Subgraphs
                    </div>
                    <button
                      onClick={() => handleSelectConfigTab('all')}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                        selectedConfigTab === 'all'
                          ? 'bg-[#202B42] text-[#8B7CFF] font-semibold'
                          : 'text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#171E32]'
                      }`}
                    >
                      <span>Multi-Agent View</span>
                      {selectedConfigTab === 'all' && <Check className="h-3.5 w-3.5 text-[#8B7CFF]" />}
                    </button>
                    {configTabs.map((cfg) => (
                      <button
                        key={cfg.filename}
                        onClick={() => handleSelectConfigTab(cfg.filename)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                          selectedConfigTab === cfg.filename
                            ? 'bg-[#202B42] text-[#8B7CFF] font-semibold'
                            : 'text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#171E32]'
                        }`}
                      >
                        <span className="truncate">{cfg.title}</span>
                        {selectedConfigTab === cfg.filename && <Check className="h-3.5 w-3.5 text-[#8B7CFF]" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Status Badges */}
              {auditWarnings.length > 0 ? (
                <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-[#F43F5E]/15 border border-[#F43F5E]/30 text-[#F43F5E] text-[11px] font-medium">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>{auditWarnings.length} Alert</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/30 text-[#22C55E] text-[11px] font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
                  <span>Compliance Active</span>
                </div>
              )}
            </div>

            {/* Right: Quick Highlights + View Mode + Controls */}
            <div className="flex items-center space-x-2">
              {/* Highlight buttons (Reference Image 2) */}
              <div className="hidden xl:flex items-center space-x-1 px-1 py-0.5 rounded-xl bg-[#111629] border border-[#202B42] text-xs">
                <button
                  type="button"
                  onClick={() => handleQuickHighlight('Agent')}
                  className="flex items-center space-x-1 px-2 py-1 rounded-lg text-[#94A3B8] hover:text-[#8B7CFF] hover:bg-[#171E32] transition-colors text-[11px]"
                  title="Highlight Agents"
                >
                  <Bot className="h-3 w-3 text-[#8B7CFF]" />
                  <span>Agents</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickHighlight('Model')}
                  className="flex items-center space-x-1 px-2 py-1 rounded-lg text-[#94A3B8] hover:text-[#38BDF8] hover:bg-[#171E32] transition-colors text-[11px]"
                  title="Highlight LLM Models"
                >
                  <Sparkles className="h-3 w-3 text-[#38BDF8]" />
                  <span>LLMs</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickHighlight('Tool')}
                  className="flex items-center space-x-1 px-2 py-1 rounded-lg text-[#94A3B8] hover:text-[#F59E0B] hover:bg-[#171E32] transition-colors text-[11px]"
                  title="Highlight Tools"
                >
                  <Wrench className="h-3 w-3 text-[#F59E0B]" />
                  <span>Tools</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickHighlight('DataSource')}
                  className="flex items-center space-x-1 px-2 py-1 rounded-lg text-[#94A3B8] hover:text-[#F87171] hover:bg-[#171E32] transition-colors text-[11px]"
                  title="Highlight Databases & Storage"
                >
                  <Database className="h-3 w-3 text-[#F87171]" />
                  <span>Databases</span>
                </button>
              </div>

              {/* View Mode Switcher */}
              <div className="flex items-center p-1 rounded-xl bg-[#111629] border border-[#202B42] text-xs">
                <button
                  onClick={() => setViewMode('graph')}
                  className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg transition-all duration-200 font-medium ${
                    viewMode === 'graph'
                      ? 'bg-[#171E32] text-[#8B7CFF] shadow-sm border border-[#202B42]'
                      : 'text-[#94A3B8] hover:text-[#F1F5F9]'
                  }`}
                >
                  <Network className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Visual Graph</span>
                </button>
                <button
                  onClick={() => setViewMode('topology')}
                  className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg transition-all duration-200 font-medium ${
                    viewMode === 'topology'
                      ? 'bg-[#171E32] text-[#8B7CFF] shadow-sm border border-[#202B42]'
                      : 'text-[#94A3B8] hover:text-[#F1F5F9]'
                  }`}
                >
                  <List className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Topology List</span>
                </button>
              </div>

              <div className="h-4 w-[1px] bg-[#202B42] mx-1 hidden sm:block" />

              {/* Toolbar Controls */}
              <div className="flex items-center space-x-1">
                {/* Layout Dropdown */}
                <div className="relative" ref={layoutDropdownRef}>
                  <button
                    onClick={() => setIsLayoutDropdownOpen((prev) => !prev)}
                    className="px-2.5 py-1.5 rounded-lg border border-[#202B42] bg-[#171E32] hover:bg-[#1C253C] active:scale-95 text-xs font-medium flex items-center space-x-1.5 text-[#F1F5F9] shadow-sm"
                  >
                    <span className="capitalize">{layout}</span>
                    <ChevronDown className="h-3 w-3 text-[#94A3B8]" />
                  </button>

                  {isLayoutDropdownOpen && (
                    <div className="absolute top-full right-0 mt-1.5 w-36 bg-[#111629] border border-[#202B42] rounded-xl shadow-[0_15px_30px_rgba(0,0,0,0.8)] p-1.5 z-40 animate-in fade-in zoom-in-95 duration-150">
                      {(['cose', 'breadthfirst', 'concentric'] as LayoutName[]).map((name) => (
                        <button
                          key={name}
                          onClick={() => handleSelectLayout(name)}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg transition-colors capitalize ${
                            layout === name
                              ? 'bg-[#202B42] text-[#8B7CFF] font-medium'
                              : 'text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#171E32]'
                          }`}
                        >
                          <span>{name}</span>
                          {layout === name && <Check className="h-3.5 w-3.5 text-[#8B7CFF]" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Zoom In */}
                <button
                  onClick={() => canvasRef.current?.zoomIn()}
                  title="Zoom in"
                  className="p-1.5 rounded-lg border border-[#202B42] bg-[#171E32] hover:bg-[#1C253C] text-[#94A3B8] hover:text-[#F1F5F9] active:scale-90 transition-all shadow-sm"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>

                {/* Zoom Out */}
                <button
                  onClick={() => canvasRef.current?.zoomOut()}
                  title="Zoom out"
                  className="p-1.5 rounded-lg border border-[#202B42] bg-[#171E32] hover:bg-[#1C253C] text-[#94A3B8] hover:text-[#F1F5F9] active:scale-90 transition-all shadow-sm"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>

                {/* Fit View */}
                <button
                  onClick={() => canvasRef.current?.fit()}
                  title="Fit to view"
                  className="p-1.5 rounded-lg border border-[#202B42] bg-[#171E32] hover:bg-[#1C253C] text-[#94A3B8] hover:text-[#F1F5F9] active:scale-90 transition-all shadow-sm"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>

                {/* Theme Toggle */}
                <button
                  onClick={toggleTheme}
                  title="Toggle Theme"
                  className="p-1.5 rounded-lg border border-[#202B42] bg-[#171E32] hover:bg-[#1C253C] text-[#94A3B8] hover:text-[#F1F5F9] active:scale-90 transition-all shadow-sm"
                >
                  {theme === 'light' ? (
                    <Sun className="h-3.5 w-3.5" />
                  ) : (
                    <Moon className="h-3.5 w-3.5" />
                  )}
                </button>

                {/* Clear Graph Button */}
                {graph.node_count > 0 && (
                  <button
                    onClick={handleClearGraph}
                    disabled={isClearing}
                    title="Clear graph"
                    className="p-1.5 rounded-lg border border-[#F43F5E]/30 bg-[#F43F5E]/10 hover:bg-[#F43F5E]/20 text-[#F43F5E] active:scale-90 transition-all shadow-sm"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Node & Edge Counters */}
              <div
                data-testid="graph-counters"
                className="text-xs font-mono text-[#94A3B8] flex items-center space-x-1.5 pl-2 border-l border-[#202B42] shrink-0"
              >
                <span className="text-[#F1F5F9] font-semibold">{displayedGraph.node_count} nodes</span>
                <span className="text-[#64748B]">•</span>
                <span className="text-[#F1F5F9] font-semibold">{displayedGraph.edge_count} edges</span>
              </div>
            </div>
          </div>
        </header>

        {/* Canvas & Content Area */}
        <div className="flex-1 relative overflow-hidden bg-[#0B1020]">
          {displayedGraph.node_count === 0 ? (
            <div className="h-full flex items-center justify-center p-6 canvas-dotted-grid">
              <div className="text-center text-[#94A3B8] text-sm p-8 rounded-2xl bg-[#111629]/80 border border-[#202B42] shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-xl max-w-md">
                <div className="w-14 h-14 rounded-2xl bg-[#8B7CFF]/10 border border-[#8B7CFF]/30 flex items-center justify-center mx-auto mb-4 shadow-[0_0_20px_rgba(139,124,255,0.2)]">
                  <Network className="h-7 w-7 text-[#8B7CFF] animate-pulse" />
                </div>
                <h3 className="font-semibold text-lg text-[#F1F5F9] tracking-tight">
                  Ready to build governance graph
                </h3>
                <p className="text-xs mt-2 text-[#94A3B8] leading-relaxed">
                  Upload an agent configuration, tool registry, or policy document on the left sidebar to generate the interactive queryable graph topology.
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
            /* Topology List View (Reference Image 2 style) */
            <div className="h-full overflow-y-auto p-6 max-w-5xl mx-auto space-y-6 pb-28 custom-scrollbar">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] flex items-center space-x-2">
                    <Activity className="h-4 w-4 text-[#8B7CFF]" />
                    <span>Graph Topology ({displayedGraph.node_count} Nodes, {displayedGraph.edge_count} Relationships)</span>
                  </h3>
                  <span className="text-xs font-mono text-[#64748B]">
                    Active Workspace: {activeConfigTitle}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {displayedGraph.nodes.map((node) => (
                    <div
                      key={node.id}
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`border rounded-2xl p-4 bg-[#111629] transition-all duration-200 shadow-sm flex flex-col justify-between cursor-pointer space-y-3 group ${
                        selectedNodeId === node.id
                          ? 'border-[#8B7CFF] ring-1 ring-[#8B7CFF] shadow-[0_0_20px_rgba(139,124,255,0.3)]'
                          : 'border-[#202B42] hover:border-[#8B7CFF]/50 hover:bg-[#171E32]'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <div className="p-2 rounded-xl bg-[#0B1020] border border-[#202B42]">
                            {getNodeIcon(node.type)}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-[#F1F5F9] truncate group-hover:text-[#8B7CFF] transition-colors">
                              {node.name}
                            </h4>
                            <p className="text-[10px] font-mono text-[#64748B] truncate">
                              {node.id}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border shrink-0 ${getNodeColorClass(
                            node.type
                          )}`}
                        >
                          {node.type}
                        </span>
                      </div>

                      {node.source_doc && (
                        <div className="text-[10px] text-[#94A3B8] pt-2 border-t border-[#202B42]/60 flex items-center justify-between">
                          <span className="truncate">Source: {node.source_doc.replace(/:\d+$/, '')}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {displayedGraph.edges.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] mb-3 flex items-center space-x-2">
                    <Network className="h-4 w-4 text-[#38BDF8]" />
                    <span>Relationships</span>
                  </h3>
                  <div className="border border-[#202B42] rounded-2xl divide-y divide-[#202B42] bg-[#111629] text-xs font-mono overflow-hidden">
                    {displayedGraph.edges.map((edge) => (
                      <div key={edge.id} className="p-3 flex items-center justify-between text-[#94A3B8] hover:bg-[#171E32] transition-colors">
                        <span className="truncate text-[#F1F5F9] font-medium max-w-[35%]">{edge.source}</span>
                        <span className="px-2 py-0.5 rounded-md bg-[#202B42] text-[10px] font-bold text-[#8B7CFF] border border-[#29344A]">
                          {edge.type}
                        </span>
                        <span className="truncate text-[#F1F5F9] font-medium max-w-[35%] text-right">{edge.target}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Node Detail Slide-Over Panel (Reference Image 2 style) */}
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

        {/* Interactive Floating Chat Bar Dock */}
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
