import React, { useState, useEffect } from 'react';
import {
  Sun,
  Moon,
  Plus,
  Minus,
  ChevronLeft,
  ChevronRight,
  UploadCloud,
  Info,
  Sparkles,
  ArrowUp,
  Mic,
} from 'lucide-react';
import { env } from './lib/env';

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

  const [healthStatus, setHealthStatus] = useState<string>('checking');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('governiq_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('governiq_sidebar_open', String(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(`${env.VITE_API_URL}/api/health`, {
          headers: { 'X-API-Key': env.VITE_API_KEY },
        });
        if (res.ok) {
          const data = (await res.json()) as { status: string };
          setHealthStatus(data.status);
        } else {
          setHealthStatus('error');
        }
      } catch {
        setHealthStatus('disconnected');
      }
    };
    void checkHealth();
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const toggleSidebar = () => {
    setSidebarOpen((prev) => !prev);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-base text-content-primary select-none">
      {/* Collapsible Sidebar with smooth width and opacity transition */}
      <aside
        data-testid="sidebar"
        aria-hidden={!sidebarOpen}
        className={`h-full flex flex-col bg-sidebar border-border shrink-0 overflow-hidden transition-[width,opacity,border-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          sidebarOpen ? 'w-[346px] border-r opacity-100' : 'w-0 border-r-0 opacity-0 pointer-events-none'
        }`}
      >
        <div className="w-[346px] h-full flex flex-col p-5 transition-opacity duration-200">
          <div className="flex items-center justify-between mb-6">
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

          {/* Upload Drop Zone with micro-interaction */}
          <div className="border-2 border-dashed border-border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 ease-out hover:border-content-primary hover:bg-surface-hover/70 hover:shadow-sm active:scale-[0.99] group mb-6">
            <UploadCloud className="h-8 w-8 text-content-muted mb-2 transition-transform duration-300 ease-out group-hover:-translate-y-1 group-hover:text-content-primary" />
            <span className="text-sm font-medium text-content-primary transition-colors duration-150">Upload document</span>
            <span className="text-xs text-content-muted mt-1">MD, YAML or JSON, are supported</span>
          </div>

          {/* Legend Heading & Card with hoverable rows */}
          <div className="mb-2">
            <h2 className="text-sm font-semibold text-content-primary">Legend</h2>
          </div>
          <div className="border border-border rounded-2xl p-4 space-y-2 bg-surface transition-colors duration-200">
            {[
              { type: 'User', color: 'bg-node-user' },
              { type: 'Agent', color: 'bg-node-agent' },
              { type: 'Model', color: 'bg-node-model' },
              { type: 'Tool', color: 'bg-node-tool' },
              { type: 'Data Source', color: 'bg-node-datasource' },
              { type: 'Policy', color: 'bg-node-policy' },
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
          <div className="mt-4 flex items-center space-x-2 text-xs text-content-muted">
            <Info className="h-4 w-4 shrink-0 transition-transform duration-200 hover:rotate-12" />
            <span>Click a node to view its information</span>
          </div>

          <div className="mt-auto pt-4 border-t border-border flex items-center justify-between text-xs text-content-muted">
            <span>API Status:</span>
            <span
              className={`font-mono px-2 py-0.5 rounded text-[11px] transition-all duration-200 ${
                healthStatus === 'ok'
                  ? 'bg-state-success/20 text-state-success'
                  : 'bg-state-error/20 text-state-error'
              }`}
            >
              {healthStatus}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Canvas Area */}
      <main className="flex-1 flex flex-col h-full relative overflow-hidden transition-all duration-300">
        {/* Top Header & Toolbar */}
        <div className="p-6 pb-2 transition-all duration-300">
          <div className="flex items-start justify-between">
            <div className="flex items-center">
              {/* Smooth expand button appearing when sidebar is collapsed */}
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
                <h1 className="text-[40px] font-semibold leading-tight tracking-[-0.03em] text-content-primary transition-colors duration-200">
                  Governance Graph Builder
                </h1>
                <p className="text-xs text-content-muted mt-1 transition-colors duration-200">
                  Agents, models, tools, users, data sources &amp; policies — one queryable graph.
                </p>
              </div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-border transition-colors duration-200">
            <div className="flex items-center space-x-2">
              <span className="text-[13px] text-content-muted mr-1">Layout:</span>
              <button className="px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-hover active:scale-95 hover:border-content-muted/50 hover:shadow-sm text-[13px] font-medium flex items-center space-x-2 transition-all duration-200">
                <span>Cose</span>
              </button>

              <div className="h-4 w-[1px] bg-border mx-2 transition-colors duration-200" />

              <button
                title="Zoom in"
                className="p-1.5 rounded-lg border border-border bg-surface hover:bg-surface-hover active:scale-90 hover:border-content-muted/50 hover:shadow-sm text-content-primary transition-all duration-150"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                title="Zoom out"
                className="p-1.5 rounded-lg border border-border bg-surface hover:bg-surface-hover active:scale-90 hover:border-content-muted/50 hover:shadow-sm text-content-primary transition-all duration-150"
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                onClick={toggleTheme}
                title="Toggle Theme"
                className="p-1.5 rounded-lg border border-border bg-surface hover:bg-surface-hover active:scale-90 hover:border-content-muted/50 hover:shadow-sm text-content-primary transition-all duration-200 group"
              >
                {theme === 'light' ? (
                  <Sun className="h-4 w-4 transition-transform duration-300 ease-out group-hover:rotate-45" />
                ) : (
                  <Moon className="h-4 w-4 transition-transform duration-300 ease-out group-hover:-rotate-12" />
                )}
              </button>
            </div>

            <div className="text-[13px] font-mono text-content-muted transition-colors duration-200">
              <span>0 nodes</span>
              <span className="mx-2">•</span>
              <span>0 edges</span>
            </div>
          </div>
        </div>

        {/* Empty Canvas Area */}
        <div className="flex-1 relative flex items-center justify-center p-6">
          <div className="text-center text-content-muted text-sm transition-all duration-300 hover:scale-105 cursor-default">
            <p className="font-medium text-content-primary/80">Ready to build governance graph</p>
            <p className="text-xs mt-1 text-content-muted">Upload a configuration or policy document to begin</p>
          </div>
        </div>

        {/* Floating Chat Bar with focus-within elevation & button micro-interactions */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[415px] max-w-[calc(100%-32px)] bg-surface border border-border rounded-2xl shadow-float p-3 z-10 transition-all duration-300 ease-out focus-within:shadow-lg focus-within:border-content-muted/50 focus-within:-translate-y-0.5">
          <input
            type="text"
            placeholder="Ask anything..."
            className="w-full bg-transparent border-none outline-none text-sm text-content-primary placeholder:text-content-muted mb-2 px-1 transition-colors duration-150"
          />
          <div className="flex items-center justify-between pt-2 text-xs">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                title="Attach document"
                className="p-1 rounded-md hover:bg-surface-hover active:scale-90 text-content-muted hover:text-content-primary transition-all duration-150"
              >
                <Plus className="h-4 w-4" />
              </button>
              <span className="text-[11px] text-content-muted px-2 py-0.5 rounded bg-selected hover:bg-surface-hover active:scale-95 transition-all duration-150 cursor-pointer font-medium">
                Groq Llama 3.3
              </span>
            </div>
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                title="Voice input"
                className="p-1.5 rounded-md hover:bg-surface-hover active:scale-90 text-content-muted hover:text-content-primary transition-all duration-150"
              >
                <Mic className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Send query"
                disabled
                className="p-1.5 rounded-lg bg-content-primary text-base disabled:opacity-50 flex items-center justify-center cursor-not-allowed transition-all duration-200 active:scale-95 hover:shadow-md"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
