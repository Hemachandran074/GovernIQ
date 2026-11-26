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
    return 'light';
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
        return 'bg-[#213183]/15 text-[#213183] border-[#213183]/30 dark:bg-[#213183]/30 dark:text-[#93A5FF]';
      case 'Agent':
        return 'bg-[#D6B6F6]/30 text-[#391C57] border-[#D6B6F6] dark:bg-[#8B5CF6]/20 dark:text-[#D6B6F6]';
      case 'Model':
        return 'bg-[#62AEF0]/25 text-[#005BAB] border-[#62AEF0] dark:bg-[#0075DE]/20 dark:text-[#62AEF0]';
      case 'Tool':
        return 'bg-[#DD5B00]/20 text-[#793400] border-[#DD5B00]/40 dark:bg-[#DD5B00]/20 dark:text-[#FFA057]';
      case 'DataSource':
        return 'bg-[#FF64C8]/20 text-[#9D174D] border-[#FF64C8]/40 dark:bg-[#EC4899]/20 dark:text-[#FF64C8]';
      case 'Policy':
        return 'bg-[#2A9D99]/20 text-[#0F766E] border-[#2A9D99]/40 dark:bg-[#2A9D99]/20 dark:text-[#5EEAD4]';
      default:
        return 'bg-[#F6F5F4] text-[#615D59] border-[#E6E6E6] dark:bg-[#282828] dark:text-[#9B9B9B] dark:border-[#373737]';
    }
  };

  const getNodeIcon = (type: string) => {
    const norm = normalizeNodeType(type);
    switch (norm) {
      case 'User':
        return <UserRound className="h-4 w-4 text-[#213183] dark:text-[#93A5FF]" />;
      case 'Agent':
        return <Bot className="h-4 w-4 text-[#8B5CF6] dark:text-[#D6B6F6]" />;
      case 'Model':
        return <Sparkles className="h-4 w-4 text-[#0075DE] dark:text-[#62AEF0]" />;
      case 'Tool':
        return <Wrench className="h-4 w-4 text-[#DD5B00]" />;
      case 'DataSource':
        return <Database className="h-4 w-4 text-[#EC4899] dark:text-[#FF64C8]" />;
      case 'Policy':
        return <ShieldCheck className="h-4 w-4 text-[#2A9D99]" />;
      default:
        return <Layers className="h-4 w-4 text-[#615D59]" />;
    }
  };

  const activeConfigTitle =
    selectedConfigTab === 'all'
      ? 'Multi-Agent View'
      : configTabs.find((c) => c.filename === selectedConfigTab)?.title || selectedConfigTab;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F6F5F4] dark:bg-[#191919] text-[#000000] dark:text-[#EBEBEB] select-none font-sans">
      {/* Collapsible Left Sidebar / Overview Panel (Notion Document Style) */}
      <aside
        data-testid="sidebar"
        aria-hidden={!sidebarOpen}
        className={`h-full flex flex-col bg-white dark:bg-[#202020] border-[#E6E6E6] dark:border-[#2E2E2E] shrink-0 overflow-hidden transition-[width,opacity,border-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] z-20 shadow-sm ${
          sidebarOpen ? 'w-[346px] border-r opacity-100' : 'w-0 border-r-0 opacity-0 pointer-events-none'
        }`}
      >
        <div className="w-[346px] h-full flex flex-col p-4 overflow-y-auto transition-opacity duration-200 space-y-4">
          {/* Header Row */}
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#0075DE] flex items-center justify-center text-white shadow-sm">
                <Shield className="h-4 w-4 stroke-[2.5]" />
              </div>
              <div>
                <span className="text-xs font-bold tracking-tight text-[#000000] dark:text-[#EBEBEB] block">
                  GovernIQ
                </span>
                <span className="text-[10px] text-[#615D59] dark:text-[#9B9B9B] block font-mono">AI Governance Platform</span>
              </div>
            </div>

            <button
              onClick={toggleSidebar}
              title="Collapse sidebar"
              className="h-7 w-7 rounded-md border border-[#E6E6E6] dark:border-[#373737] flex items-center justify-center hover:bg-[#F6F5F4] dark:hover:bg-[#2A2A2A] text-[#615D59] dark:text-[#9B9B9B] hover:text-[#000000] dark:hover:text-[#EBEBEB] transition-colors"
            >
              <ChevronLeft className="h-4 w-4 transition-transform duration-200" />
            </button>
          </div>

          {/* AI Agent & Topology Overview Card */}
          <div className="rounded-xl p-3.5 bg-[#F6F5F4] dark:bg-[#252525] border border-[#E6E6E6] dark:border-[#373737] shadow-sm shrink-0 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-1 rounded-md bg-[#0075DE]/10 text-[#0075DE]">
                  <Activity className="h-4 w-4" />
                </div>
                <h2 className="text-xs font-bold text-[#000000] dark:text-[#EBEBEB] tracking-tight">
                  AI Agent and LLM overview
                </h2>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white dark:bg-[#1E1E1E] border border-[#E6E6E6] dark:border-[#373737] text-[#0075DE] font-semibold">
                Live
              </span>
            </div>

            <p className="text-[11px] text-[#615D59] dark:text-[#9B9B9B] leading-relaxed">
              Gain insight into what AI services, Agents, and LLMs are running, how they are connected, and where governance impact may spread.
            </p>

            {/* Node Types Breakdown */}
            <div className="space-y-1.5 pt-1 border-t border-[#E6E6E6] dark:border-[#373737]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#A39E98] dark:text-[#777777] block">
                Node types
              </span>

              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => handleQuickHighlight('Agent')}
                  className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-[#202020] border border-[#E6E6E6] dark:border-[#373737] hover:border-[#8B5CF6] hover:bg-[#F6F5F4] dark:hover:bg-[#282828] transition-all text-left group shadow-xs"
                >
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <Bot className="h-3.5 w-3.5 text-[#8B5CF6] shrink-0" />
                    <span className="text-[11px] text-[#31302E] dark:text-[#C7C7C7] group-hover:text-[#000000] dark:group-hover:text-white truncate">Agents</span>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-[#000000] dark:text-[#EBEBEB] ml-1">
                    {nodeCountsByType.Agent}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickHighlight('Model')}
                  className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-[#202020] border border-[#E6E6E6] dark:border-[#373737] hover:border-[#0075DE] hover:bg-[#F6F5F4] dark:hover:bg-[#282828] transition-all text-left group shadow-xs"
                >
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <Sparkles className="h-3.5 w-3.5 text-[#0075DE] shrink-0" />
                    <span className="text-[11px] text-[#31302E] dark:text-[#C7C7C7] group-hover:text-[#000000] dark:group-hover:text-white truncate">LLM Models</span>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-[#000000] dark:text-[#EBEBEB] ml-1">
                    {nodeCountsByType.Model}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickHighlight('Tool')}
                  className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-[#202020] border border-[#E6E6E6] dark:border-[#373737] hover:border-[#DD5B00] hover:bg-[#F6F5F4] dark:hover:bg-[#282828] transition-all text-left group shadow-xs"
                >
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <Wrench className="h-3.5 w-3.5 text-[#DD5B00] shrink-0" />
                    <span className="text-[11px] text-[#31302E] dark:text-[#C7C7C7] group-hover:text-[#000000] dark:group-hover:text-white truncate">Tools / MCP</span>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-[#000000] dark:text-[#EBEBEB] ml-1">
                    {nodeCountsByType.Tool}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickHighlight('DataSource')}
                  className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-[#202020] border border-[#E6E6E6] dark:border-[#373737] hover:border-[#EC4899] hover:bg-[#F6F5F4] dark:hover:bg-[#282828] transition-all text-left group shadow-xs"
                >
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <Database className="h-3.5 w-3.5 text-[#EC4899] shrink-0" />
                    <span className="text-[11px] text-[#31302E] dark:text-[#C7C7C7] group-hover:text-[#000000] dark:group-hover:text-white truncate">Databases</span>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-[#000000] dark:text-[#EBEBEB] ml-1">
                    {nodeCountsByType.DataSource}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickHighlight('Policy')}
                  className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-[#202020] border border-[#E6E6E6] dark:border-[#373737] hover:border-[#2A9D99] hover:bg-[#F6F5F4] dark:hover:bg-[#282828] transition-all text-left group shadow-xs"
                >
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <ShieldCheck className="h-3.5 w-3.5 text-[#2A9D99] shrink-0" />
                    <span className="text-[11px] text-[#31302E] dark:text-[#C7C7C7] group-hover:text-[#000000] dark:group-hover:text-white truncate">Policies</span>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-[#000000] dark:text-[#EBEBEB] ml-1">
                    {nodeCountsByType.Policy}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickHighlight('User')}
                  className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-[#202020] border border-[#E6E6E6] dark:border-[#373737] hover:border-[#213183] hover:bg-[#F6F5F4] dark:hover:bg-[#282828] transition-all text-left group shadow-xs"
                >
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <UserRound className="h-3.5 w-3.5 text-[#213183] dark:text-[#93A5FF] shrink-0" />
                    <span className="text-[11px] text-[#31302E] dark:text-[#C7C7C7] group-hover:text-[#000000] dark:group-hover:text-white truncate">Users</span>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-[#000000] dark:text-[#EBEBEB] ml-1">
                    {nodeCountsByType.User}
                  </span>
                </button>
              </div>
            </div>

            {/* Node Status Summary */}
            <div className="pt-2 border-t border-[#E6E6E6] dark:border-[#373737] flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#A39E98] dark:text-[#777777]">
                Node status
              </span>
              <div className="flex items-center space-x-1.5 text-[11px]">
                <span className="w-2 h-2 rounded-full bg-[#1AAE39]" />
                <span className="text-[#31302E] dark:text-[#C7C7C7] font-medium">
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
                <h2 className="text-xs font-bold text-[#000000] dark:text-[#EBEBEB] flex items-center space-x-1.5">
                  <FileCode2 className="h-3.5 w-3.5 text-[#0075DE]" />
                  <span>Agent Configurations</span>
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#F6F5F4] dark:bg-[#282828] text-[#615D59] dark:text-[#9B9B9B] border border-[#E6E6E6] dark:border-[#373737]">
                  {configTabs.length} {configTabs.length === 1 ? 'config' : 'configs'}
                </span>
              </div>

              <div className="space-y-1.5" role="tablist" aria-label="Agent Configurations">
                {/* All Graphs Combined Tab */}
                <button
                  role="tab"
                  aria-selected={selectedConfigTab === 'all'}
                  onClick={() => handleSelectConfigTab('all')}
                  className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left border transition-all ${
                    selectedConfigTab === 'all'
                      ? 'bg-[#EEF6FF] dark:bg-[#1F334A] border-[#0075DE] text-[#0075DE] font-semibold shadow-xs'
                      : 'bg-white dark:bg-[#202020] border-[#E6E6E6] dark:border-[#373737] text-[#31302E] dark:text-[#C7C7C7] hover:bg-[#F6F5F4] dark:hover:bg-[#282828]'
                  }`}
                >
                  <div className="flex items-center space-x-2 min-w-0">
                    <Layers className={`h-4 w-4 shrink-0 ${selectedConfigTab === 'all' ? 'text-[#0075DE]' : 'text-[#615D59]'}`} />
                    <div className="truncate">
                      <div className="text-xs font-medium truncate text-[#000000] dark:text-[#EBEBEB]">
                        All Agent Graphs
                      </div>
                      <div className="text-[10px] text-[#615D59] dark:text-[#9B9B9B]">
                        Combined multi-agent view
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono shrink-0 px-1.5 py-0.5 rounded bg-[#F6F5F4] dark:bg-[#1E1E1E] border border-[#E6E6E6] dark:border-[#373737] text-[#615D59] dark:text-[#9B9B9B]">
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
                      className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left border transition-all group ${
                        isSelected
                          ? 'bg-[#EEF6FF] dark:bg-[#1F334A] border-[#0075DE] text-[#0075DE] font-semibold shadow-xs'
                          : 'bg-white dark:bg-[#202020] border-[#E6E6E6] dark:border-[#373737] text-[#31302E] dark:text-[#C7C7C7] hover:bg-[#F6F5F4] dark:hover:bg-[#282828]'
                      }`}
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        <Bot
                          className={`h-4 w-4 shrink-0 transition-transform ${
                            isSelected ? 'text-[#0075DE]' : 'text-[#8B5CF6]'
                          }`}
                        />
                        <div className="truncate">
                          <div className="text-xs font-medium truncate text-[#000000] dark:text-[#EBEBEB]">
                            {cfg.title}
                          </div>
                          <div className="text-[10px] font-mono text-[#615D59] dark:text-[#9B9B9B] truncate">
                            {cfg.filename}
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono shrink-0 px-1.5 py-0.5 rounded bg-[#F6F5F4] dark:bg-[#1E1E1E] border border-[#E6E6E6] dark:border-[#373737] text-[#615D59] dark:text-[#9B9B9B]">
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
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#A39E98] dark:text-[#777777]">Legend</h2>
            <div className="border border-[#E6E6E6] dark:border-[#373737] rounded-xl p-3 space-y-1.5 bg-[#F6F5F4] dark:bg-[#252525]">
              {[
                { type: 'User', color: 'bg-[#213183]', border: 'border-[#213183]/30' },
                { type: 'Agent', color: 'bg-[#8B5CF6]', border: 'border-[#8B5CF6]/40' },
                { type: 'Model', color: 'bg-[#0075DE]', border: 'border-[#0075DE]/40' },
                { type: 'Tool', color: 'bg-[#DD5B00]', border: 'border-[#DD5B00]/40' },
                { type: 'Data Source', color: 'bg-[#EC4899]', border: 'border-[#EC4899]/40' },
                { type: 'Policy', color: 'bg-[#2A9D99]', border: 'border-[#2A9D99]/40' },
              ].map(({ type, color, border }) => (
                <div
                  key={type}
                  className="flex items-center space-x-2.5 text-xs px-2 py-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 cursor-default transition-colors group"
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${color} shrink-0 shadow-xs border ${border}`}
                  />
                  <span className="text-[#31302E] dark:text-[#C7C7C7] font-medium text-xs">
                    {type}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Helper line */}
          <div className="flex items-center space-x-2 text-[11px] text-[#615D59] dark:text-[#9B9B9B] shrink-0 pt-1">
            <Info className="h-3.5 w-3.5 shrink-0 text-[#0075DE]" />
            <span>Click any node in graph to inspect details</span>
          </div>

          {/* Status footer */}
          <div className="mt-auto pt-3 border-t border-[#E6E6E6] dark:border-[#373737] flex items-center justify-between text-xs text-[#615D59] dark:text-[#9B9B9B] shrink-0">
            <span>API Status:</span>
            <span
              className={`font-mono px-2 py-0.5 rounded text-[11px] font-semibold border ${
                healthStatus === 'ok'
                  ? 'bg-[#E7F7ED] text-[#1AAE39] border-[#1AAE39]/30'
                  : 'bg-[#FFDEDE] text-[#E03E3E] border-[#E03E3E]/30'
              }`}
            >
              {healthStatus}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Graph & Workspace Area */}
      <main className="flex-1 flex flex-col h-full relative overflow-hidden bg-[#F6F5F4] dark:bg-[#191919]">
        {/* Compact Top Navigation Header (Notion Bar) */}
        <header className="px-5 py-2.5 transition-all z-10 bg-white/95 dark:bg-[#202020]/95 backdrop-blur-md border-b border-[#E6E6E6] dark:border-[#2E2E2E]">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Left Branding & Workspace Indicator */}
            <div className="flex items-center space-x-3 min-w-0">
              {/* Expand sidebar button when collapsed */}
              <div
                className={`transition-all duration-200 overflow-hidden flex items-center ${
                  !sidebarOpen ? 'w-8 opacity-100 scale-100 mr-1' : 'w-0 opacity-0 scale-90 pointer-events-none'
                }`}
              >
                <button
                  onClick={toggleSidebar}
                  title="Expand sidebar"
                  className="h-7 w-7 rounded-md bg-white dark:bg-[#252525] border border-[#E6E6E6] dark:border-[#373737] flex items-center justify-center hover:bg-[#F6F5F4] dark:hover:bg-[#2A2A2A] text-[#615D59] dark:text-[#9B9B9B] hover:text-[#000000] dark:hover:text-[#EBEBEB] transition-colors shadow-xs"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-base md:text-lg font-bold tracking-tight text-[#000000] dark:text-[#EBEBEB]">
                    Governance Graph Builder
                  </h1>
                  <span className="hidden sm:inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#EEF6FF] dark:bg-[#1F334A] text-[#0075DE] border border-[#0075DE]/30">
                    AI Topology
                  </span>
                </div>
                <p className="text-[11px] text-[#615D59] dark:text-[#9B9B9B] truncate">
                  Agents, models, tools, users, data sources &amp; policies — one queryable graph.
                </p>
              </div>
            </div>

            {/* Middle: Configuration Dropdown & Audit Badges */}
            <div className="hidden lg:flex items-center space-x-3">
              {/* Workspace Selector */}
              <div className="relative" ref={configDropdownRef}>
                <button
                  onClick={() => setIsConfigDropdownOpen((prev) => !prev)}
                  className="px-2.5 py-1 rounded-md border border-[#E6E6E6] dark:border-[#373737] bg-white dark:bg-[#252525] hover:bg-[#F6F5F4] dark:hover:bg-[#2A2A2A] text-xs font-medium flex items-center space-x-2 text-[#31302E] dark:text-[#EBEBEB] shadow-xs transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-[#0075DE]" />
                  <span className="truncate max-w-[180px]">{activeConfigTitle}</span>
                  <ChevronDown className="h-3 w-3 text-[#615D59] dark:text-[#9B9B9B]" />
                </button>

                {isConfigDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1.5 w-60 bg-white dark:bg-[#202020] border border-[#E6E6E6] dark:border-[#2E2E2E] rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.1)] p-1.5 z-40 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#A39E98]">
                      Workspaces &amp; Subgraphs
                    </div>
                    <button
                      onClick={() => handleSelectConfigTab('all')}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                        selectedConfigTab === 'all'
                          ? 'bg-[#EEF6FF] dark:bg-[#1F334A] text-[#0075DE] font-semibold'
                          : 'text-[#31302E] dark:text-[#C7C7C7] hover:bg-[#F6F5F4] dark:hover:bg-[#282828]'
                      }`}
                    >
                      <span>Multi-Agent View</span>
                      {selectedConfigTab === 'all' && <Check className="h-3.5 w-3.5 text-[#0075DE]" />}
                    </button>
                    {configTabs.map((cfg) => (
                      <button
                        key={cfg.filename}
                        onClick={() => handleSelectConfigTab(cfg.filename)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                          selectedConfigTab === cfg.filename
                            ? 'bg-[#EEF6FF] dark:bg-[#1F334A] text-[#0075DE] font-semibold'
                            : 'text-[#31302E] dark:text-[#C7C7C7] hover:bg-[#F6F5F4] dark:hover:bg-[#282828]'
                        }`}
                      >
                        <span className="truncate">{cfg.title}</span>
                        {selectedConfigTab === cfg.filename && <Check className="h-3.5 w-3.5 text-[#0075DE]" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Status Badges */}
              {auditWarnings.length > 0 ? (
                <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-[#FFDEDE] dark:bg-[#331C1C] border border-[#E03E3E]/30 text-[#E03E3E] text-[11px] font-medium">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>{auditWarnings.length} Alert</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-[#E7F7ED] dark:bg-[#1A2E20] border border-[#1AAE39]/30 text-[#1AAE39] text-[11px] font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1AAE39]" />
                  <span>Compliance Active</span>
                </div>
              )}
            </div>

            {/* Right: Quick Highlights + View Mode + Controls */}
            <div className="flex items-center space-x-2">
              {/* Highlight buttons (Notion sticker dots) */}
              <div className="hidden xl:flex items-center space-x-1 px-1 py-0.5 rounded-lg bg-[#F6F5F4] dark:bg-[#252525] border border-[#E6E6E6] dark:border-[#373737] text-xs">
                <button
                  type="button"
                  onClick={() => handleQuickHighlight('Agent')}
                  className="flex items-center space-x-1 px-2 py-0.5 rounded hover:bg-white dark:hover:bg-[#202020] text-[#31302E] dark:text-[#C7C7C7] transition-colors text-[11px] font-medium"
                  title="Highlight Agents"
                >
                  <span className="w-2 h-2 rounded-full bg-[#8B5CF6]" />
                  <span>Agents</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickHighlight('Model')}
                  className="flex items-center space-x-1 px-2 py-0.5 rounded hover:bg-white dark:hover:bg-[#202020] text-[#31302E] dark:text-[#C7C7C7] transition-colors text-[11px] font-medium"
                  title="Highlight LLM Models"
                >
                  <span className="w-2 h-2 rounded-full bg-[#0075DE]" />
                  <span>Models</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickHighlight('Tool')}
                  className="flex items-center space-x-1 px-2 py-0.5 rounded hover:bg-white dark:hover:bg-[#202020] text-[#31302E] dark:text-[#C7C7C7] transition-colors text-[11px] font-medium"
                  title="Highlight Tools"
                >
                  <span className="w-2 h-2 rounded-full bg-[#DD5B00]" />
                  <span>Tools</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickHighlight('DataSource')}
                  className="flex items-center space-x-1 px-2 py-0.5 rounded hover:bg-white dark:hover:bg-[#202020] text-[#31302E] dark:text-[#C7C7C7] transition-colors text-[11px] font-medium"
                  title="Highlight Databases"
                >
                  <span className="w-2 h-2 rounded-full bg-[#EC4899]" />
                  <span>Data</span>
                </button>
              </div>

              {/* View Mode Switcher (Notion Segmented Control) */}
              <div className="flex items-center p-0.5 rounded-lg bg-[#F6F5F4] dark:bg-[#252525] border border-[#E6E6E6] dark:border-[#373737] text-xs">
                <button
                  onClick={() => setViewMode('graph')}
                  className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md transition-all font-medium ${
                    viewMode === 'graph'
                      ? 'bg-white dark:bg-[#202020] text-[#0075DE] shadow-xs'
                      : 'text-[#615D59] dark:text-[#9B9B9B] hover:text-[#000000] dark:hover:text-[#EBEBEB]'
                  }`}
                >
                  <Network className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Visual Graph</span>
                </button>
                <button
                  onClick={() => setViewMode('topology')}
                  className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md transition-all font-medium ${
                    viewMode === 'topology'
                      ? 'bg-white dark:bg-[#202020] text-[#0075DE] shadow-xs'
                      : 'text-[#615D59] dark:text-[#9B9B9B] hover:text-[#000000] dark:hover:text-[#EBEBEB]'
                  }`}
                >
                  <List className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Topology List</span>
                </button>
              </div>

              <div className="h-4 w-[1px] bg-[#E6E6E6] dark:bg-[#373737] mx-0.5 hidden sm:block" />

              {/* Toolbar Controls */}
              <div className="flex items-center space-x-1">
                {/* Layout Dropdown */}
                <div className="relative" ref={layoutDropdownRef}>
                  <button
                    onClick={() => setIsLayoutDropdownOpen((prev) => !prev)}
                    className="px-2.5 py-1 rounded-md border border-[#E6E6E6] dark:border-[#373737] bg-white dark:bg-[#252525] hover:bg-[#F6F5F4] dark:hover:bg-[#2A2A2A] text-xs font-medium flex items-center space-x-1.5 text-[#31302E] dark:text-[#EBEBEB] shadow-xs"
                  >
                    <span className="capitalize">{layout}</span>
                    <ChevronDown className="h-3 w-3 text-[#615D59]" />
                  </button>

                  {isLayoutDropdownOpen && (
                    <div className="absolute top-full right-0 mt-1.5 w-36 bg-white dark:bg-[#202020] border border-[#E6E6E6] dark:border-[#2E2E2E] rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.1)] p-1 z-40 animate-in fade-in zoom-in-95 duration-150">
                      {(['cose', 'breadthfirst', 'concentric'] as LayoutName[]).map((name) => (
                        <button
                          key={name}
                          onClick={() => handleSelectLayout(name)}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-md transition-colors capitalize ${
                            layout === name
                              ? 'bg-[#EEF6FF] dark:bg-[#1F334A] text-[#0075DE] font-semibold'
                              : 'text-[#31302E] dark:text-[#C7C7C7] hover:bg-[#F6F5F4] dark:hover:bg-[#282828]'
                          }`}
                        >
                          <span>{name}</span>
                          {layout === name && <Check className="h-3.5 w-3.5 text-[#0075DE]" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Zoom In */}
                <button
                  onClick={() => canvasRef.current?.zoomIn()}
                  title="Zoom in"
                  className="p-1 rounded-md border border-[#E6E6E6] dark:border-[#373737] bg-white dark:bg-[#252525] hover:bg-[#F6F5F4] dark:hover:bg-[#2A2A2A] text-[#615D59] dark:text-[#9B9B9B] hover:text-[#000000] dark:hover:text-[#EBEBEB] transition-colors shadow-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>

                {/* Zoom Out */}
                <button
                  onClick={() => canvasRef.current?.zoomOut()}
                  title="Zoom out"
                  className="p-1 rounded-md border border-[#E6E6E6] dark:border-[#373737] bg-white dark:bg-[#252525] hover:bg-[#F6F5F4] dark:hover:bg-[#2A2A2A] text-[#615D59] dark:text-[#9B9B9B] hover:text-[#000000] dark:hover:text-[#EBEBEB] transition-colors shadow-xs"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>

                {/* Fit View */}
                <button
                  onClick={() => canvasRef.current?.fit()}
                  title="Fit to view"
                  className="p-1 rounded-md border border-[#E6E6E6] dark:border-[#373737] bg-white dark:bg-[#252525] hover:bg-[#F6F5F4] dark:hover:bg-[#2A2A2A] text-[#615D59] dark:text-[#9B9B9B] hover:text-[#000000] dark:hover:text-[#EBEBEB] transition-colors shadow-xs"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>

                {/* Theme Toggle */}
                <button
                  onClick={toggleTheme}
                  title="Toggle Theme"
                  className="p-1 rounded-md border border-[#E6E6E6] dark:border-[#373737] bg-white dark:bg-[#252525] hover:bg-[#F6F5F4] dark:hover:bg-[#2A2A2A] text-[#615D59] dark:text-[#9B9B9B] hover:text-[#000000] dark:hover:text-[#EBEBEB] transition-colors shadow-xs"
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
                    className="p-1 rounded-md border border-[#E03E3E]/30 bg-[#FFDEDE] dark:bg-[#331C1C] hover:bg-[#FFDEDE]/80 text-[#E03E3E] transition-colors shadow-xs"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Node & Edge Counters */}
              <div
                data-testid="graph-counters"
                className="text-xs font-mono text-[#615D59] dark:text-[#9B9B9B] flex items-center space-x-1.5 pl-2 border-l border-[#E6E6E6] dark:border-[#373737] shrink-0"
              >
                <span className="text-[#000000] dark:text-[#EBEBEB] font-semibold">{displayedGraph.node_count} nodes</span>
                <span className="text-[#A39E98]">•</span>
                <span className="text-[#000000] dark:text-[#EBEBEB] font-semibold">{displayedGraph.edge_count} edges</span>
              </div>
            </div>
          </div>
        </header>

        {/* Canvas & Content Area */}
        <div className="flex-1 relative overflow-hidden bg-[#F6F5F4] dark:bg-[#191919]">
          {displayedGraph.node_count === 0 ? (
            <div className="h-full flex items-center justify-center p-6 canvas-dotted-grid">
              <div className="text-center text-[#615D59] dark:text-[#9B9B9B] text-sm p-8 rounded-xl bg-white dark:bg-[#202020] border border-[#E6E6E6] dark:border-[#2E2E2E] shadow-[0_8px_30px_rgba(0,0,0,0.06)] max-w-md">
                <div className="w-12 h-12 rounded-xl bg-[#EEF6FF] dark:bg-[#1F334A] border border-[#0075DE]/20 flex items-center justify-center mx-auto mb-3.5 text-[#0075DE]">
                  <Network className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-base text-[#000000] dark:text-[#EBEBEB] tracking-tight">
                  Ready to build governance graph
                </h3>
                <p className="text-xs mt-1.5 text-[#615D59] dark:text-[#9B9B9B] leading-relaxed">
                  Upload an agent configuration, tool registry, or policy document on the left sidebar to generate the interactive queryable graph topology.
                </p>
              </div>
            </div>
          ) : viewMode === 'graph' ? (
            <div className="w-full h-full relative canvas-dotted-grid">
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
            /* Topology List View (Notion Database View) */
            <div className="h-full overflow-y-auto p-6 max-w-5xl mx-auto space-y-6 pb-28">
              <div>
                <div className="flex items-center justify-between mb-3.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#615D59] dark:text-[#9B9B9B] flex items-center space-x-2">
                    <Activity className="h-4 w-4 text-[#0075DE]" />
                    <span>Graph Topology ({displayedGraph.node_count} Nodes, {displayedGraph.edge_count} Relationships)</span>
                  </h3>
                  <span className="text-xs font-mono text-[#A39E98]">
                    Active Workspace: {activeConfigTitle}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {displayedGraph.nodes.map((node) => (
                    <div
                      key={node.id}
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`border rounded-xl p-3.5 bg-white dark:bg-[#202020] transition-all shadow-xs flex flex-col justify-between cursor-pointer space-y-2.5 group ${
                        selectedNodeId === node.id
                          ? 'border-[#0075DE] ring-1 ring-[#0075DE] shadow-sm'
                          : 'border-[#E6E6E6] dark:border-[#2E2E2E] hover:border-[#0075DE] hover:bg-[#F6F5F4] dark:hover:bg-[#252525]'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-2 min-w-0">
                          <div className="p-1.5 rounded-lg bg-[#F6F5F4] dark:bg-[#282828] border border-[#E6E6E6] dark:border-[#373737]">
                            {getNodeIcon(node.type)}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-[#000000] dark:text-[#EBEBEB] truncate group-hover:text-[#0075DE] transition-colors">
                              {node.name}
                            </h4>
                            <p className="text-[10px] font-mono text-[#A39E98] truncate">
                              {node.id}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${getNodeColorClass(
                            node.type
                          )}`}
                        >
                          {node.type}
                        </span>
                      </div>

                      {node.source_doc && (
                        <div className="text-[10px] text-[#615D59] dark:text-[#9B9B9B] pt-2 border-t border-[#E6E6E6] dark:border-[#2E2E2E] flex items-center justify-between">
                          <span className="truncate">Source: {node.source_doc.replace(/:\d+$/, '')}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {displayedGraph.edges.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#615D59] dark:text-[#9B9B9B] mb-3 flex items-center space-x-2">
                    <Network className="h-4 w-4 text-[#0075DE]" />
                    <span>Relationships</span>
                  </h3>
                  <div className="border border-[#E6E6E6] dark:border-[#2E2E2E] rounded-xl divide-y divide-[#E6E6E6] dark:divide-[#2E2E2E] bg-white dark:bg-[#202020] text-xs font-mono overflow-hidden shadow-xs">
                    {displayedGraph.edges.map((edge) => (
                      <div key={edge.id} className="p-3 flex items-center justify-between text-[#615D59] dark:text-[#9B9B9B] hover:bg-[#F6F5F4] dark:hover:bg-[#252525] transition-colors">
                        <span className="truncate text-[#000000] dark:text-[#EBEBEB] font-semibold max-w-[35%]">{edge.source}</span>
                        <span className="px-2 py-0.5 rounded-md bg-[#F6F5F4] dark:bg-[#1E1E1E] text-[10px] font-bold text-[#0075DE] border border-[#E6E6E6] dark:border-[#373737]">
                          {edge.type}
                        </span>
                        <span className="truncate text-[#000000] dark:text-[#EBEBEB] font-semibold max-w-[35%] text-right">{edge.target}</span>
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
