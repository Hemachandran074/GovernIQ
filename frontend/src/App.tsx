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
    <div className="flex h-screen w-screen overflow-hidden bg-base text-content-primary">
      {/* Collapsible Sidebar */}
      {sidebarOpen && (
        <aside
          data-testid="sidebar"
          className="w-[346px] h-full flex flex-col bg-sidebar border-r border-border shrink-0 transition-all p-5"
        >
          <div className="flex items-center justify-between mb-6">
            <span className="text-xs font-semibold uppercase tracking-wider text-content-muted">
              Workspace
            </span>
            <button
              onClick={toggleSidebar}
              title="Collapse sidebar"
              className="h-[38px] w-[38px] rounded-lg bg-selected flex items-center justify-center hover:bg-surface-hover text-content-primary transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          </div>

          {/* Upload Drop Zone */}
          <div className="border-2 border-dashed border-border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-surface-hover transition-colors mb-6">
            <UploadCloud className="h-8 w-8 text-content-muted mb-2" />
            <span className="text-sm font-medium text-content-primary">Upload document</span>
            <span className="text-xs text-content-muted mt-1">MD, YAML or JSON, are supported</span>
          </div>

          {/* Legend Heading & Card */}
          <div className="mb-2">
            <h2 className="text-sm font-semibold text-content-primary">Legend</h2>
          </div>
          <div className="border border-border rounded-2xl p-4 space-y-3 bg-surface">
            {[
              { type: 'User', color: 'bg-node-user' },
              { type: 'Agent', color: 'bg-node-agent' },
              { type: 'Model', color: 'bg-node-model' },
              { type: 'Tool', color: 'bg-node-tool' },
              { type: 'Data Source', color: 'bg-node-datasource' },
              { type: 'Policy', color: 'bg-node-policy' },
            ].map(({ type, color }) => (
              <div key={type} className="flex items-center space-x-3 text-sm">
                <span className={`w-4 h-4 rounded-md ${color} shrink-0`} />
                <span className="text-content-primary font-medium">{type}</span>
              </div>
            ))}
          </div>

          {/* Helper line */}
          <div className="mt-4 flex items-center space-x-2 text-xs text-content-muted">
            <Info className="h-4 w-4 shrink-0" />
            <span>Click a node to view its information</span>
          </div>

          <div className="mt-auto pt-4 border-t border-border flex items-center justify-between text-xs text-content-muted">
            <span>API Status:</span>
            <span
              className={`font-mono px-2 py-0.5 rounded text-[11px] ${
                healthStatus === 'ok'
                  ? 'bg-state-success/20 text-state-success'
                  : 'bg-state-error/20 text-state-error'
              }`}
            >
              {healthStatus}
            </span>
          </div>
        </aside>
      )}

      {/* Main Canvas Area */}
      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        {/* Top Header & Toolbar */}
        <div className="p-6 pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-4">
              {!sidebarOpen && (
                <button
                  onClick={toggleSidebar}
                  title="Expand sidebar"
                  className="h-[38px] w-[38px] rounded-lg bg-selected flex items-center justify-center hover:bg-surface-hover text-content-primary transition-colors"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
              <div>
                <h1 className="text-[40px] font-semibold leading-tight tracking-[-0.03em] text-content-primary">
                  Governance Graph Builder
                </h1>
                <p className="text-xs text-content-muted mt-1">
                  Agents, models, tools, users, data sources &amp; policies — one queryable graph.
                </p>
              </div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
            <div className="flex items-center space-x-2">
              <span className="text-[13px] text-content-muted mr-1">Layout:</span>
              <button className="px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-hover text-[13px] font-medium flex items-center space-x-2">
                <span>Cose</span>
              </button>

              <div className="h-4 w-[1px] bg-border mx-2" />

              <button
                title="Zoom in"
                className="p-1.5 rounded-lg border border-border bg-surface hover:bg-surface-hover text-content-primary"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                title="Zoom out"
                className="p-1.5 rounded-lg border border-border bg-surface hover:bg-surface-hover text-content-primary"
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                onClick={toggleTheme}
                title="Toggle Theme"
                className="p-1.5 rounded-lg border border-border bg-surface hover:bg-surface-hover text-content-primary"
              >
                {theme === 'light' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>

            <div className="text-[13px] font-mono text-content-muted">
              <span>0 nodes</span>
              <span className="mx-2">•</span>
              <span>0 edges</span>
            </div>
          </div>
        </div>

        {/* Empty Canvas Area */}
        <div className="flex-1 relative flex items-center justify-center">
          <div className="text-center text-content-muted text-sm">
            <p>Ready to build governance graph</p>
            <p className="text-xs mt-1">Upload a configuration or policy document to begin</p>
          </div>
        </div>

        {/* Floating Chat Bar */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[415px] max-w-[calc(100%-32px)] bg-surface border border-border rounded-2xl shadow-float p-3 z-10">
          <input
            type="text"
            placeholder="Ask anything..."
            className="w-full bg-transparent border-none outline-none text-sm text-content-primary placeholder:text-content-muted mb-2 px-1"
          />
          <div className="flex items-center justify-between pt-2 text-xs">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                title="Attach document"
                className="p-1 rounded-md hover:bg-surface-hover text-content-muted"
              >
                <Plus className="h-4 w-4" />
              </button>
              <span className="text-[11px] text-content-muted px-2 py-0.5 rounded bg-selected font-medium">
                Groq Llama 3.3
              </span>
            </div>
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                title="Voice input"
                className="p-1.5 rounded-md hover:bg-surface-hover text-content-muted"
              >
                <Mic className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Send query"
                disabled
                className="p-1.5 rounded-lg bg-content-primary text-base disabled:opacity-50 flex items-center justify-center cursor-not-allowed"
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
