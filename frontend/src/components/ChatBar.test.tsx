import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatBar } from './ChatBar';

describe('ChatBar', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders input, model selector, effort selector, and disabled submit button when empty', () => {
    render(<ChatBar onHighlight={vi.fn()} activeHighlight={null} />);

    expect(
      screen.getByPlaceholderText(/Ask anything about agents, tools, models, policies.../i)
    ).toBeInTheDocument();
    expect(screen.getByTestId('model-selector-btn')).toBeInTheDocument();
    expect(screen.getByTestId('effort-selector-btn')).toBeInTheDocument();
    expect(screen.getByTestId('chat-submit-btn')).toBeDisabled();
  });

  it('enables send button when text is entered and allows model selection', () => {
    render(<ChatBar onHighlight={vi.fn()} activeHighlight={null} />);

    const input = screen.getByTestId('chat-input');
    fireEvent.change(input, { target: { value: 'What tools does agent support-bot use?' } });

    expect(screen.getByTestId('chat-submit-btn')).not.toBeDisabled();

    // Open model selector
    const modelBtn = screen.getByTestId('model-selector-btn');
    fireEvent.click(modelBtn);

    expect(screen.getByTestId('model-dropdown-menu')).toBeInTheDocument();
    expect(screen.getByText('Groq Qwen 3.8 27B')).toBeInTheDocument();

    // Select different model
    fireEvent.click(screen.getByText('Groq Qwen 3.8 27B'));
    expect(screen.queryByTestId('model-dropdown-menu')).not.toBeInTheDocument();
  });

  it('executes governance query and displays answer card with collapsible Cypher', async () => {
    const mockOnHighlight = vi.fn();
    const mockQueryResult = {
      question: 'Is there any agent with no policy?',
      cypher: 'MATCH (a:Agent) WHERE NOT (a)-[:GOVERNED_BY]->(:Policy) RETURN a',
      explanation: 'Found 1 orphan agent with no compliance policy attached.',
      highlight: {
        node_ids: ['Agent:orphan-bot'],
        edge_ids: [],
      },
      records_count: 1,
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockQueryResult,
    } as Response);

    render(
      <ChatBar
        onHighlight={mockOnHighlight}
        activeHighlight={{ node_ids: ['Agent:orphan-bot'], edge_ids: [] }}
      />
    );

    const input = screen.getByTestId('chat-input');
    fireEvent.change(input, { target: { value: 'Is there any agent with no policy?' } });
    fireEvent.click(screen.getByTestId('chat-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('query-answer-card')).toBeInTheDocument();
      expect(
        screen.getByText('Found 1 orphan agent with no compliance policy attached.')
      ).toBeInTheDocument();
      expect(screen.getByText(/1 nodes highlighted/i)).toBeInTheDocument();
    });

    expect(mockOnHighlight).toHaveBeenCalledWith({
      node_ids: ['Agent:orphan-bot'],
      edge_ids: [],
    });

    // Expand Cypher preview
    fireEvent.click(screen.getByText(/View Generated Cypher/i));
    expect(
      screen.getByText(/MATCH \(a:Agent\) WHERE NOT \(a\)-\[:GOVERNED_BY\]->\(:Policy\) RETURN a/i)
    ).toBeInTheDocument();

    // Clear highlight button
    fireEvent.click(screen.getByText('Clear'));
    expect(mockOnHighlight).toHaveBeenCalledWith(null);
    expect(screen.queryByTestId('query-answer-card')).not.toBeInTheDocument();
  });

  it('collapses to compact button when collapse button is clicked, and expands back', () => {
    render(<ChatBar onHighlight={vi.fn()} activeHighlight={null} />);

    expect(screen.getByTestId('chat-input')).toBeInTheDocument();
    expect(screen.queryByTestId('expand-chat-btn')).not.toBeInTheDocument();

    // Click collapse button
    const collapseBtn = screen.getByTestId('collapse-chat-btn');
    fireEvent.click(collapseBtn);

    expect(screen.queryByTestId('chat-input')).not.toBeInTheDocument();
    const expandBtn = screen.getByTestId('expand-chat-btn');
    expect(expandBtn).toBeInTheDocument();
    expect(screen.getByText('Ask AI Assistant')).toBeInTheDocument();

    // Click expand button to restore
    fireEvent.click(expandBtn);
    expect(screen.getByTestId('chat-input')).toBeInTheDocument();
  });

  it('renders collapsed state initially when defaultCollapsed is true, showing highlights badge', () => {
    render(
      <ChatBar
        onHighlight={vi.fn()}
        activeHighlight={{ node_ids: ['Agent:a1', 'Agent:a2'], edge_ids: [] }}
        defaultCollapsed={true}
      />
    );

    expect(screen.queryByTestId('chat-input')).not.toBeInTheDocument();
    expect(screen.getByTestId('expand-chat-btn')).toBeInTheDocument();
    expect(screen.getByText(/2 highlighted/i)).toBeInTheDocument();
  });

  it('triggers onToggleCollapse when controlled by parent component', () => {
    const onToggleCollapse = vi.fn();
    render(
      <ChatBar
        onHighlight={vi.fn()}
        activeHighlight={null}
        isCollapsed={false}
        onToggleCollapse={onToggleCollapse}
      />
    );

    fireEvent.click(screen.getByTestId('collapse-chat-btn'));
    expect(onToggleCollapse).toHaveBeenCalledWith(true);
  });
});
