import React, { useEffect, useState } from 'react';
import {
  X,
  Copy,
  Check,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  FileText,
  Bot,
  Sparkles,
  Wrench,
  UserRound,
  Database,
  ShieldCheck,
  Activity,
  Layers,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { NodeDetailResponse, nodeDetailResponseSchema } from '../types';
import { normalizeNodeType } from './GraphCanvas';

interface NodeDetailPanelProps {
  nodeId: string | null;
  onClose: () => void;
  onSelectNode: (nodeId: string) => void;
}

const TYPE_CONFIG: Record<
  string,
  {
    icon: React.ElementType;
    color: string;
    bgPill: string;
    border: string;
    label: string;
  }
> = {
  Agent: {
    icon: Bot,
    color: 'text-[#8B7CFF]',
    bgPill: 'bg-[#8B7CFF]/15 text-[#8B7CFF]',
    border: 'border-[#8B7CFF]/40',
    label: 'AI Agent',
  },
  Model: {
    icon: Sparkles,
    color: 'text-[#38BDF8]',
    bgPill: 'bg-[#38BDF8]/15 text-[#38BDF8]',
    border: 'border-[#38BDF8]/40',
    label: 'LLM Model',
  },
  Tool: {
    icon: Wrench,
    color: 'text-[#F59E0B]',
    bgPill: 'bg-[#F59E0B]/15 text-[#F59E0B]',
    border: 'border-[#F59E0B]/40',
    label: 'MCP Tool',
  },
  User: {
    icon: UserRound,
    color: 'text-[#60A5FA]',
    bgPill: 'bg-[#60A5FA]/15 text-[#60A5FA]',
    border: 'border-[#60A5FA]/40',
    label: 'User Identity',
  },
  DataSource: {
    icon: Database,
    color: 'text-[#F87171]',
    bgPill: 'bg-[#F87171]/15 text-[#F87171]',
    border: 'border-[#F87171]/40',
    label: 'Database / Storage',
  },
  Policy: {
    icon: ShieldCheck,
    color: 'text-[#2DD4BF]',
    bgPill: 'bg-[#2DD4BF]/15 text-[#2DD4BF]',
    border: 'border-[#2DD4BF]/40',
    label: 'Governance Policy',
  },
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

  const currentTypeConfig = detail
    ? TYPE_CONFIG[normalizeNodeType(detail.node.type)] || {
        icon: Layers,
        color: 'text-[#94A3B8]',
        bgPill: 'bg-[#94A3B8]/15 text-[#94A3B8]',
        border: 'border-[#94A3B8]/30',
        label: detail.node.type,
      }
    : null;

  const IconComponent = currentTypeConfig?.icon || Layers;

  // Infer security or access tags from relation or type
  const getRelationBadges = (relType: string, targetType: string) => {
    const badges: { text: string; bg: string; textCol: string }[] = [];
    const upperRel = relType.toUpperCase();

    if (upperRel.includes('CALL') || upperRel.includes('EXECUTE')) {
      badges.push({ text: 'calls', bg: 'bg-[#8B7CFF]/15', textCol: 'text-[#8B7CFF]' });
    } else if (upperRel.includes('READ') || upperRel.includes('ACCESS') || upperRel.includes('FETCH')) {
      badges.push({ text: 'reads', bg: 'bg-[#38BDF8]/15', textCol: 'text-[#38BDF8]' });
    } else if (upperRel.includes('WRITE') || upperRel.includes('MUTATE') || upperRel.includes('DELETE')) {
      badges.push({ text: 'writes', bg: 'bg-[#F59E0B]/15', textCol: 'text-[#F59E0B]' });
    } else if (upperRel.includes('ENFORCE') || upperRel.includes('GOVERN')) {
      badges.push({ text: 'enforces', bg: 'bg-[#2DD4BF]/15', textCol: 'text-[#2DD4BF]' });
    } else {
      badges.push({ text: relType.toLowerCase(), bg: 'bg-[#202B42]', textCol: 'text-[#94A3B8]' });
    }

    if (targetType === 'DataSource') {
      badges.push({ text: 'SQL', bg: 'bg-[#0B1020]', textCol: 'text-[#38BDF8]' });
    } else if (targetType === 'Model') {
      badges.push({ text: 'HTTPS', bg: 'bg-[#0B1020]', textCol: 'text-[#8B7CFF]' });
    } else if (targetType === 'Tool') {
      badges.push({ text: 'MCP', bg: 'bg-[#0B1020]', textCol: 'text-[#F59E0B]' });
    }

    return badges;
  };

  return (
    <div
      data-testid="node-detail-panel"
      className="absolute top-4 right-4 w-[400px] max-w-[calc(100vw-32px)] max-h-[calc(100%-32px)] bg-[#111629]/95 backdrop-blur-2xl border border-[#202B42] rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8),0_0_1px_1px_rgba(255,255,255,0.05)] flex flex-col z-30 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] animate-in fade-in slide-in-from-right-4"
    >
      {/* Top Header Card */}
      <div className="p-4 border-b border-[#202B42]/80 bg-[#171E32]/70 flex items-start justify-between">
        <div className="flex items-start space-x-3 min-w-0 pr-2">
          {detail && (
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${currentTypeConfig?.border} bg-[#0B1020] shadow-sm mt-0.5`}
            >
              <IconComponent className={`h-5 w-5 ${currentTypeConfig?.color}`} />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[white] truncate tracking-tight">
              {detail ? detail.node.name : 'Loading Node...'}
            </h3>
            <p className="text-[11px] text-[#94A3B8] truncate mt-0.5">
              {detail?.node.source_doc
                ? `Configuration • ${detail.node.source_doc.replace(/:\d+$/, '')}`
                : 'Data Governance & Observability'}
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          title="Close panel"
          className="p-1.5 rounded-lg bg-[#202B42]/50 hover:bg-[#202B42] text-[#94A3B8] hover:text-[#F1F5F9] transition-all duration-150 active:scale-95 shrink-0 ml-2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Status & Type Badges Row */}
      {detail && (
        <div className="px-4 py-2.5 bg-[#0B1020]/60 border-b border-[#202B42]/60 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#22C55E]/15 text-[#22C55E] border border-[#22C55E]/30 flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
            <span>Active</span>
          </span>
          <span
            className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md border ${currentTypeConfig?.bgPill} ${currentTypeConfig?.border}`}
          >
            {detail.node.type.toLowerCase()}
          </span>
          {detail.node.type === 'Agent' && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-[#8B7CFF]/10 text-[#8B7CFF] border border-[#8B7CFF]/20">
              Autonomous
            </span>
          )}
          {detail.node.type === 'DataSource' && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-[#F87171]/10 text-[#F87171] border border-[#F87171]/20">
              Data Governance
            </span>
          )}
        </div>
      )}

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
        {loading ? (
          <div className="py-14 flex flex-col items-center justify-center text-[#94A3B8]">
            <Loader2 className="h-7 w-7 animate-spin text-[#8B7CFF] mb-2" />
            <span className="text-xs">Fetching node details...</span>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-[#F43F5E]/10 border border-[#F43F5E]/30 text-[#F43F5E] text-xs flex items-start space-x-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : detail ? (
          <>
            {/* Technical ID & Provenance */}
            <div className="p-3 rounded-xl bg-[#171E32]/80 border border-[#202B42] space-y-2">
              <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                <span className="font-medium tracking-wide uppercase text-[10px]">Technical Identifier</span>
                <button
                  onClick={copyId}
                  className="flex items-center space-x-1 hover:text-[#F1F5F9] transition-colors text-[11px]"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-[#22C55E]" />
                      <span className="text-[#22C55E] font-medium">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <div className="p-2 rounded-lg bg-[#0B1020] border border-[#202B42] font-mono text-[11px] text-[#F1F5F9] break-all select-all">
                {detail.node.id}
              </div>

              {detail.node.source_doc && (
                <div className="flex items-center space-x-1.5 text-[11px] text-[#94A3B8] pt-1 border-t border-[#202B42]/60">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-[#8B7CFF]" />
                  <span className="truncate">Source: {detail.node.source_doc}</span>
                </div>
              )}
            </div>

            {/* Properties Breakdown */}
            {Object.keys(detail.node.props ?? {}).length > 0 && (
              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8] mb-2 flex items-center justify-between">
                  <span>Properties</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#202B42] text-[#94A3B8]">
                    {Object.keys(detail.node.props ?? {}).length}
                  </span>
                </h4>
                <div className="border border-[#202B42] rounded-xl divide-y divide-[#202B42] bg-[#171E32]/70 overflow-hidden text-xs">
                  {Object.entries(detail.node.props ?? {}).map(([key, value]) => (
                    <div key={key} className="p-2.5 flex items-start justify-between space-x-3">
                      <span className="font-mono text-[#94A3B8] text-[11px] shrink-0 font-medium">
                        {key}
                      </span>
                      <span className="font-mono text-[#F1F5F9] text-right text-[11px] break-words max-w-[210px] bg-[#0B1020]/60 px-1.5 py-0.5 rounded border border-[#202B42]/50">
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

            {/* Connections Section */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8] flex items-center space-x-1.5">
                  <Activity className="h-3.5 w-3.5 text-[#8B7CFF]" />
                  <span>CONNECTIONS ({detail.total_neighbors})</span>
                </h4>
              </div>

              {detail.total_neighbors === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-[#202B42] text-center text-xs text-[#64748B] bg-[#0B1020]/40">
                  No connected relationships found for this node.
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Outbound Connections */}
                  {detail.outbound.map((link) => {
                    const normNType = normalizeNodeType(link.neighbor.type);
                    const nConfig = TYPE_CONFIG[normNType] || {
                      icon: Layers,
                      color: 'text-[#94A3B8]',
                      bgPill: 'bg-[#94A3B8]/15 text-[#94A3B8]',
                      border: 'border-[#94A3B8]/30',
                    };
                    const NIcon = nConfig.icon;
                    const badges = getRelationBadges(link.rel_type, normNType);

                    return (
                      <button
                        key={link.edge_id}
                        onClick={() => onSelectNode(link.neighbor.id)}
                        className="w-full p-3 rounded-xl border border-[#202B42] bg-[#171E32] hover:bg-[#1C253C] hover:border-[#8B7CFF]/50 transition-all duration-200 flex flex-col space-y-2 group text-left shadow-sm"
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center space-x-2 min-w-0">
                            <ArrowRight className="h-3.5 w-3.5 text-[#8B7CFF] shrink-0 group-hover:translate-x-1 transition-transform" />
                            <NIcon className={`h-4 w-4 shrink-0 ${nConfig.color}`} />
                            <span className="text-xs font-semibold text-[#F1F5F9] truncate group-hover:text-[#8B7CFF] transition-colors">
                              {link.neighbor.name}
                            </span>
                          </div>
                          <span
                            className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 ${nConfig.bgPill} ${nConfig.border}`}
                          >
                            {link.neighbor.type}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap pl-5">
                          <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-[#202B42] text-[#F1F5F9]">
                            {link.rel_type}
                          </span>
                          {badges.map((b, idx) => (
                            <span
                              key={idx}
                              className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${b.bg} ${b.textCol}`}
                            >
                              {b.text}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}

                  {/* Inbound Connections */}
                  {detail.inbound.map((link) => {
                    const normNType = normalizeNodeType(link.neighbor.type);
                    const nConfig = TYPE_CONFIG[normNType] || {
                      icon: Layers,
                      color: 'text-[#94A3B8]',
                      bgPill: 'bg-[#94A3B8]/15 text-[#94A3B8]',
                      border: 'border-[#94A3B8]/30',
                    };
                    const NIcon = nConfig.icon;
                    const badges = getRelationBadges(link.rel_type, normNType);

                    return (
                      <button
                        key={link.edge_id}
                        onClick={() => onSelectNode(link.neighbor.id)}
                        className="w-full p-3 rounded-xl border border-[#202B42] bg-[#171E32] hover:bg-[#1C253C] hover:border-[#8B7CFF]/50 transition-all duration-200 flex flex-col space-y-2 group text-left shadow-sm"
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center space-x-2 min-w-0">
                            <ArrowLeft className="h-3.5 w-3.5 text-[#38BDF8] shrink-0 group-hover:-translate-x-1 transition-transform" />
                            <NIcon className={`h-4 w-4 shrink-0 ${nConfig.color}`} />
                            <span className="text-xs font-semibold text-[#F1F5F9] truncate group-hover:text-[#38BDF8] transition-colors">
                              {link.neighbor.name}
                            </span>
                          </div>
                          <span
                            className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 ${nConfig.bgPill} ${nConfig.border}`}
                          >
                            {link.neighbor.type}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap pl-5">
                          <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-[#202B42] text-[#F1F5F9]">
                            {link.rel_type}
                          </span>
                          {badges.map((b, idx) => (
                            <span
                              key={idx}
                              className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${b.bg} ${b.textCol}`}
                            >
                              {b.text}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default NodeDetailPanel;
