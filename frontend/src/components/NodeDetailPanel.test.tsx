import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NodeDetailPanel } from './NodeDetailPanel';

describe('NodeDetailPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when nodeId is null', () => {
    const { container } = render(
      <NodeDetailPanel nodeId={null} onClose={vi.fn()} onSelectNode={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('fetches and renders node details and neighbors', async () => {
    const mockDetail = {
      node: {
        id: 'Agent:support-bot',
        name: 'Support Bot',
        type: 'Agent',
        source_doc: 'agent.yaml:1234',
        props: { version: '1.0.0', description: 'Helpful bot' },
      },
      inbound: [
        {
          edge_id: 'User:alice-OWNS-Agent:support-bot',
          rel_type: 'OWNS',
          direction: 'inbound',
          props: {},
          neighbor: {
            id: 'User:alice',
            name: 'Alice',
            type: 'User',
            source_doc: 'agent.yaml:1234',
            props: {},
          },
        },
      ],
      outbound: [
        {
          edge_id: 'Agent:support-bot-USES-Model:gpt-4o',
          rel_type: 'USES',
          direction: 'outbound',
          props: {},
          neighbor: {
            id: 'Model:gpt-4o',
            name: 'GPT-4o',
            type: 'Model',
            source_doc: 'agent.yaml:1234',
            props: {},
          },
        },
      ],
      total_neighbors: 2,
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockDetail,
    } as Response);

    const onSelectNodeMock = vi.fn();
    const onCloseMock = vi.fn();

    render(
      <NodeDetailPanel
        nodeId="Agent:support-bot"
        onClose={onCloseMock}
        onSelectNode={onSelectNodeMock}
      />
    );

    // Shows loading state initially
    expect(screen.getByText(/Fetching node details/i)).toBeInTheDocument();

    // Renders data after fetch completes
    await waitFor(() => {
      expect(screen.getByText('Support Bot')).toBeInTheDocument();
      expect(screen.getByText('Agent:support-bot')).toBeInTheDocument();
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('GPT-4o')).toBeInTheDocument();
    });

    // Clicking a neighbor navigates to that neighbor
    const neighborBtn = screen.getByText('Alice').closest('button');
    expect(neighborBtn).toBeInTheDocument();
    fireEvent.click(neighborBtn!);
    expect(onSelectNodeMock).toHaveBeenCalledWith('User:alice');

    // Clicking close button calls onClose
    const closeBtn = screen.getByTitle('Close panel');
    fireEvent.click(closeBtn);
    expect(onCloseMock).toHaveBeenCalled();
  });
});
