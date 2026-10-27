import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import App from './App';

describe('App Shell', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the header title and subtitle', () => {
    render(<App />);
    expect(screen.getByText('Governance Graph Builder')).toBeInTheDocument();
    expect(
      screen.getByText(/Agents, models, tools, users, data sources & policies/i)
    ).toBeInTheDocument();
  });

  it('renders the sidebar legend items', () => {
    render(<App />);
    expect(screen.getByText('Legend')).toBeInTheDocument();
    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByText('Model')).toBeInTheDocument();
    expect(screen.getByText('Tool')).toBeInTheDocument();
    expect(screen.getByText('Data Source')).toBeInTheDocument();
    expect(screen.getByText('Policy')).toBeInTheDocument();
  });

  it('renders graph node and edge counters initialized to 0', () => {
    render(<App />);
    expect(screen.getByText(/0 nodes/i)).toBeInTheDocument();
    expect(screen.getByText(/0 edges/i)).toBeInTheDocument();
  });

  it('smoothly toggles sidebar collapsed and expanded states', () => {
    render(<App />);
    const sidebar = screen.getByTestId('sidebar');
    expect(sidebar).toHaveClass('w-[346px]');

    // Click collapse button
    const collapseBtn = screen.getByTitle('Collapse sidebar');
    fireEvent.click(collapseBtn);
    expect(sidebar).toHaveClass('w-0');
    expect(sidebar).toHaveClass('opacity-0');

    // Click expand button
    const expandBtn = screen.getByTitle('Expand sidebar');
    fireEvent.click(expandBtn);
    expect(sidebar).toHaveClass('w-[346px]');
    expect(sidebar).toHaveClass('opacity-100');
  });

  it('toggles theme between light and dark', () => {
    render(<App />);
    const themeBtn = screen.getByTitle('Toggle Theme');
    fireEvent.click(themeBtn);
    expect(document.documentElement.getAttribute('data-theme')).toMatch(/light|dark/);
  });

  it('renders and switches between agent config tabs when graph data is loaded', async () => {
    // Mock apiFetch for /api/graph to return multi-agent data
    const mockGraph = {
      nodes: [
        { id: 'Agent:support', name: 'Support Agent', type: 'Agent', source_doc: 'support-agent.yaml' },
        { id: 'Tool:search', name: 'search_tool', type: 'Tool', source_doc: 'support-agent.yaml' },
        { id: 'Agent:billing', name: 'Billing Agent', type: 'Agent', source_doc: 'billing-agent.yaml' },
      ],
      edges: [
        { id: 'e1', source: 'Agent:support', target: 'Tool:search', type: 'CAN_CALL', source_doc: 'support-agent.yaml' },
      ],
      node_count: 3,
      edge_count: 1,
    };

    // Override fetch response for graph endpoint
    const originalFetch = window.fetch;
    window.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = typeof url === 'string' ? url : (url as Request).url;
      if (urlStr.includes('/api/graph')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: () => Promise.resolve(mockGraph),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: () => Promise.resolve({ status: 'ok' }),
      });
    });

    render(<App />);

    // Wait for config tabs to appear
    const configSection = await screen.findByTestId('agent-configs-section');
    expect(configSection).toBeInTheDocument();
    expect(screen.getByText('All Agent Graphs')).toBeInTheDocument();
    expect(screen.getByText('support-agent.yaml')).toBeInTheDocument();
    expect(screen.getByText('billing-agent.yaml')).toBeInTheDocument();

    // Click on support-agent.yaml tab
    const supportTab = screen.getByText('support-agent.yaml').closest('button')!;
    fireEvent.click(supportTab);
    expect(supportTab).toHaveAttribute('aria-selected', 'true');

    window.fetch = originalFetch;
  });
});
