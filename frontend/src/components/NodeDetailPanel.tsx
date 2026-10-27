import React, { useEffect, useState } from 'react';
import { X, Copy, Check, ArrowRight, ArrowLeft, Loader2, AlertCircle, FileText } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { NodeDetailResponse, nodeDetailResponseSchema } from '../types';

interface NodeDetailPanelProps {
  nodeId: string | null;
  onClose: () => void;
  onSelectNode: (nodeId: string) => void;
}

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  User: { bg: 'bg-[#3B82F6]/15', text: 'text-[#3B82F6]', border: 'border-[#3B82F6]/30' },
  Agent: { bg: 'bg-[#A855F7]/15', text: 'text-[#A855F7]', border: 'border-[#A855F7]/30' },
  Model: { bg: 'bg-[#22C55E]/15', text: 'text-[#22C55E]', border: 'border-[#22C55E]/30' },
  Tool: { bg: 'bg-[#F59E0B]/15', text: 'text-[#F59E0B]', border: 'border-[#F59E0B]/30' },
  DataSource: { bg: 'bg-[#EF4444]/15', text: 'text-[#EF4444]', border: 'border-[#EF4444]/30' },
  Policy: { bg: 'bg-[#14B8A6]/15', text: 'text-[#14B8A6]', border: 'border-[#14B8A6]/30' },
};

export const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({
  nodeId,
  onClose,
  onSelectNode,
}) => {
  const [detail, setDetail] = useState<NodeDetailResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (!nodeId) {
      setDetail(null);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    const fetchDetail = async () => {
      try {
        const data = await apiFetch(`/api/graph/nodes/${encodeURIComponent(nodeId)}`, nodeDetailResponseSchema);
        if (isMounted) {
          setDetail(data);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load node details');
          setLoading(false);
        }
      }
    };

    void fetchDetail();

    return () => {
      isMounted = false;
    };
  }, [nodeId]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!nodeId) return null;

  const copyId = async () => {
    if (!detail) return;
    try {
      await navigator.clipboard.writeText(detail.node.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const typeStyle = detail
    ? TYPE_COLORS[detail.node.type] || {
        bg: 'bg-selected/20',
        text: 'text-content-primary',
        border: 'border-border',
      }
    : { bg: 'bg-selected/20', text: 'text-content-primary', border: 'border-border' };

  return (
    <div
      data-testid="node-detail-panel"
      className="absolute top-4 right-4 w-96 max-w-[calc(100vw-32px)] max-h-[calc(100%-32px)] bg-surface border border-border rounded-2xl shadow-float flex flex-col z-20 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] animate-in fade-in slide-in-from-right-4"
    >
      {/* Header */}
      <div className="p-4 border-b border-border flex items-start justify-between bg-surface/80 backdrop-blur-sm">
        <div className="flex-1 min-w-0 pr-2">
          {detail && (
            <span
              className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border mb-1.5 ${typeStyle.bg} ${typeStyle.text} ${typeStyle.border}`}
            >
              {detail.node.type}
            </span>
          )}
          <h3 className="text-base font-semibold text-content-primary truncate">
            {detail ? detail.node.name : 'Loading Node...'}
          </h3>
        </div>
        <button
          onClick={onClose}
          title="Close panel"
          className="p-1 rounded-lg hover:bg-surface-hover text-content-muted hover:text-content-primary transition-all duration-150 active:scale-95"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-content-muted">
            <Loader2 className="h-6 w-6 animate-spin text-content-primary mb-2" />
            <span className="text-xs">Fetching node details...</span>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-state-error/10 border border-state-error/20 text-state-error text-xs flex items-start space-x-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : detail ? (
          <>
            {/* Node ID & Provenance */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-content-muted">
                <span>Node ID</span>
                <button
                  onClick={copyId}
                  className="flex items-center space-x-1 hover:text-content-primary transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-state-success" />
                      <span className="text-[11px] text-state-success font-medium">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span className="text-[11px]">Copy</span>
                    </>
                  )}
                </button>
              </div>
              <div className="p-2 rounded-lg bg-base border border-border font-mono text-[11px] text-content-primary break-all select-all">
                {detail.node.id}
              </div>

              {detail.node.source_doc && (
                <div className="flex items-center space-x-1.5 text-[11px] text-content-muted pt-1">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Source: {detail.node.source_doc}</span>
                </div>
              )}
            </div>

            {/* Properties */}
            {Object.keys(detail.node.props ?? {}).length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-content-muted mb-2">
                  Properties
                </h4>
                <div className="border border-border rounded-xl divide-y divide-border bg-base text-xs">
                  {Object.entries(detail.node.props ?? {}).map(([key, value]) => (
                    <div key={key} className="p-2.5 flex items-start justify-between space-x-2">
                      <span className="font-mono text-content-muted shrink-0">{key}</span>
                      <span className="font-mono text-content-primary text-right break-words max-w-[200px]">
                        {Array.isArray(value)
                          ? value.join(', ')
                          : typeof value === 'object' && value !== null
                          ? JSON.stringify(value)
                          : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Outbound Relationships */}
            {detail.outbound.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-content-muted mb-2 flex items-center justify-between">
                  <span>Outbound Links</span>
                  <span className="font-mono text-[10px]">{detail.outbound.length}</span>
                </h4>
                <div className="space-y-1.5">
                  {detail.outbound.map((link) => {
                    const nStyle = TYPE_COLORS[link.neighbor.type] || {
                      bg: 'bg-selected/20',
                      text: 'text-content-primary',
                      border: 'border-border',
                    };
                    return (
                      <button
                        key={link.edge_id}
                        onClick={() => onSelectNode(link.neighbor.id)}
                        className="w-full p-2.5 rounded-xl border border-border bg-base hover:bg-surface-hover hover:border-content-muted/40 transition-all duration-150 flex items-center justify-between group text-left"
                      >
                        <div className="flex items-center space-x-2 min-w-0 flex-1">
                          <ArrowRight className="h-3.5 w-3.5 text-content-muted shrink-0 group-hover:translate-x-0.5 transition-transform" />
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-selected text-content-primary">
                            {link.rel_type}
                          </span>
                          <span className="text-xs font-medium text-content-primary truncate">
                            {link.neighbor.name}
                          </span>
                        </div>
                        <span
                          className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 ${nStyle.bg} ${nStyle.text} ${nStyle.border}`}
                        >
                          {link.neighbor.type}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Inbound Relationships */}
            {detail.inbound.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-content-muted mb-2 flex items-center justify-between">
                  <span>Inbound Links</span>
                  <span className="font-mono text-[10px]">{detail.inbound.length}</span>
                </h4>
                <div className="space-y-1.5">
                  {detail.inbound.map((link) => {
                    const nStyle = TYPE_COLORS[link.neighbor.type] || {
                      bg: 'bg-selected/20',
                      text: 'text-content-primary',
                      border: 'border-border',
                    };
                    return (
                      <button
                        key={link.edge_id}
                        onClick={() => onSelectNode(link.neighbor.id)}
                        className="w-full p-2.5 rounded-xl border border-border bg-base hover:bg-surface-hover hover:border-content-muted/40 transition-all duration-150 flex items-center justify-between group text-left"
                      >
                        <div className="flex items-center space-x-2 min-w-0 flex-1">
                          <ArrowLeft className="h-3.5 w-3.5 text-content-muted shrink-0 group-hover:-translate-x-0.5 transition-transform" />
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-selected text-content-primary">
                            {link.rel_type}
                          </span>
                          <span className="text-xs font-medium text-content-primary truncate">
                            {link.neighbor.name}
                          </span>
                        </div>
                        <span
                          className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 ${nStyle.bg} ${nStyle.text} ${nStyle.border}`}
                        >
                          {link.neighbor.type}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {detail.total_neighbors === 0 && (
              <div className="p-4 rounded-xl border border-dashed border-border text-center text-xs text-content-muted">
                No connected relationships found for this node.
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
};

export default NodeDetailPanel;
