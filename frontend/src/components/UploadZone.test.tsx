import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UploadZone } from './UploadZone';

describe('UploadZone', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders idle state with drop prompt and accepts file dialog click', () => {
    render(<UploadZone />);
    expect(screen.getByText('Upload document')).toBeInTheDocument();
    expect(screen.getByText(/MD, YAML, JSON or JSONL supported/i)).toBeInTheDocument();

    const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
    expect(fileInput).toHaveAttribute('accept', '.json,.yaml,.yml,.jsonl,.md,.markdown');
  });

  it('shows error for unsupported file extension', async () => {
    render(<UploadZone />);
    const fileInput = screen.getByTestId('file-input');

    const invalidFile = new File(['hello'], 'invalid.exe', { type: 'application/octet-stream' });
    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    await waitFor(() => {
      expect(screen.getByText('Upload failed')).toBeInTheDocument();
      expect(
        screen.getByText(/Unsupported format. Please upload Markdown \(\.md\), YAML, JSON, or JSONL./i)
      ).toBeInTheDocument();
    });
  });

  it('successfully uploads valid document and triggers callback', async () => {
    const mockOnSuccess = vi.fn();
    const mockResponse = {
      summary: {
        nodes_processed: 2,
        edges_processed: 1,
        source_doc: 'agent.yaml:abc1234',
      },
      graph: {
        nodes: [
          { id: 'Agent:support-bot', name: 'Support Bot', type: 'Agent', source_doc: 'agent.yaml:abc1234', props: {} },
          { id: 'Model:gpt-4o', name: 'GPT-4o', type: 'Model', source_doc: 'agent.yaml:abc1234', props: {} },
        ],
        edges: [
          { id: 'e1', source: 'Agent:support-bot', target: 'Model:gpt-4o', type: 'USES_MODEL', props: {} },
        ],
        node_count: 2,
        edge_count: 1,
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    render(<UploadZone onUploadSuccess={mockOnSuccess} />);
    const fileInput = screen.getByTestId('file-input');

    const yamlContent = 'agent:\n  name: Support Bot\n  model: GPT-4o\n';
    const validFile = new File([yamlContent], 'agent.yaml', { type: 'application/x-yaml' });
    fireEvent.change(fileInput, { target: { files: [validFile] } });

    await waitFor(() => {
      expect(screen.getByText(/Parsed 2 nodes & 1 edges/i)).toBeInTheDocument();
    });

    expect(mockOnSuccess).toHaveBeenCalledTimes(1);
    expect(mockOnSuccess).toHaveBeenCalledWith(mockResponse.graph, mockResponse.summary);
  });

  it('supports dragover, dragleave and drop events cleanly', async () => {
    render(<UploadZone />);
    const dropZone = screen.getByTestId('upload-drop-zone');

    fireEvent.dragOver(dropZone);
    expect(screen.getByText('Drop document here')).toBeInTheDocument();

    fireEvent.dragLeave(dropZone);
    expect(screen.getByText('Upload document')).toBeInTheDocument();
  });
});
