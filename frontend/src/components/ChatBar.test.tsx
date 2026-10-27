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
    expect(screen.getByText('Groq Llama 3.1 8B')).toBeInTheDocument();

    // Select different model
    fireEvent.click(screen.getByText('Groq Llama 3.1 8B'));
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
});
