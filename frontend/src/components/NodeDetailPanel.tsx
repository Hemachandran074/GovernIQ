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
    color: 'text-[#8B5CF6]',
    bgPill: 'bg-[#D6B6F6]/35 text-[#391C57] dark:bg-[#8B5CF6]/20 dark:text-[#D6B6F6]',
    border: 'border-[#D6B6F6] dark:border-[#8B5CF6]/40',
    label: 'AI Agent',
  },
  Model: {
    icon: Sparkles,
    color: 'text-[#0075DE]',
    bgPill: 'bg-[#62AEF0]/30 text-[#005BAB] dark:bg-[#0075DE]/20 dark:text-[#62AEF0]',
    border: 'border-[#62AEF0] dark:border-[#0075DE]/40',
    label: 'LLM Model',
  },
  Tool: {
    icon: Wrench,
    color: 'text-[#DD5B00]',
    bgPill: 'bg-[#DD5B00]/20 text-[#793400] dark:bg-[#DD5B00]/20 dark:text-[#FFA057]',
    border: 'border-[#DD5B00]/40',
    label: 'Tool / MCP',
  },
  User: {
    icon: UserRound,
    color: 'text-[#213183]',
    bgPill: 'bg-[#213183]/15 text-[#213183] dark:bg-[#213183]/30 dark:text-[#93A5FF]',
    border: 'border-[#213183]/30',
    label: 'User Identity',
  },
  DataSource: {
    icon: Database,
    color: 'text-[#EC4899]',
    bgPill: 'bg-[#FF64C8]/25 text-[#9D174D] dark:bg-[#EC4899]/20 dark:text-[#FF64C8]',
    border: 'border-[#FF64C8]/40',
    label: 'Data Source',
  },
  Policy: {
    icon: ShieldCheck,
    color: 'text-[#2A9D99]',
    bgPill: 'bg-[#2A9D99]/25 text-[#0F766E] dark:bg-[#2A9D99]/20 dark:text-[#5EEAD4]',
    border: 'border-[#2A9D99]/40',
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
      className="absolute top-4 right-4 w-[400px] max-w-[calc(100vw-32px)] max-h-[calc(100%-32px)] bg-white dark:bg-[#202020] border border-[#E6E6E6] dark:border-[#2E2E2E] rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.5)] flex flex-col z-30 overflow-hidden transition-all duration-200 animate-in fade-in slide-in-from-right-4"
    >
      {/* Top Header Card */}
      <div className="p-4 border-b border-[#E6E6E6] dark:border-[#2E2E2E] bg-white dark:bg-[#202020] flex items-start justify-between">
        <div className="flex items-start space-x-3 min-w-0 pr-2">
          {detail && (
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${currentTypeConfig?.border} bg-[#F6F5F4] dark:bg-[#282828] shadow-sm mt-0.5`}
            >
              <IconComponent className={`h-5 w-5 ${currentTypeConfig?.color}`} />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="text-base font-bold text-[#000000] dark:text-[#EBEBEB] truncate tracking-tight">
              {detail ? detail.node.name : 'Loading Node...'}
            </h3>
            <p className="text-xs text-[#615D59] dark:text-[#9B9B9B] truncate mt-0.5">
              {detail?.node.source_doc
                ? `Configuration • ${detail.node.source_doc.replace(/:\d+$/, '')}`
                : 'Data Governance & Observability'}
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          title="Close panel"
          className="p-1.5 rounded-md hover:bg-[#F6F5F4] dark:hover:bg-[#2C2C2C] text-[#615D59] dark:text-[#9B9B9B] hover:text-[#000000] dark:hover:text-[#EBEBEB] transition-colors shrink-0 ml-2 border border-transparent hover:border-[#E6E6E6] dark:hover:border-[#373737]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Status & Type Badges Row */}
      {detail && (
        <div className="px-4 py-2.5 bg-[#F6F5F4]/60 dark:bg-[#1E1E1E] border-b border-[#E6E6E6] dark:border-[#2E2E2E] flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#E7F7ED] text-[#1AAE39] border border-[#1AAE39]/30 flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1AAE39] animate-pulse" />
            <span>Active</span>
          </span>
          <span
            className={`text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${currentTypeConfig?.bgPill} ${currentTypeConfig?.border}`}
          >
            {detail.node.type.toLowerCase()}
          </span>
          {detail.node.type === 'Agent' && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#F6F5F4] dark:bg-[#2A2A2A] text-[#615D59] dark:text-[#C7C7C7] border border-[#E6E6E6] dark:border-[#373737]">
              Autonomous
            </span>
          )}
          {detail.node.type === 'DataSource' && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#F6F5F4] dark:bg-[#2A2A2A] text-[#615D59] dark:text-[#C7C7C7] border border-[#E6E6E6] dark:border-[#373737]">
              Data Governance
            </span>
          )}
        </div>
      )}

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="py-14 flex flex-col items-center justify-center text-[#615D59] dark:text-[#9B9B9B]">
            <Loader2 className="h-6 w-6 animate-spin text-[#0075DE] mb-2" />
            <span className="text-xs">Fetching node details...</span>
          </div>
        ) : error ? (
          <div className="p-3.5 rounded-lg bg-[#FFDEDE] dark:bg-[#331C1C] border border-[#E03E3E]/40 text-[#E03E3E] text-xs flex items-start space-x-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : detail ? (
          <>
            {/* Technical ID & Provenance */}
            <div className="p-3 rounded-lg bg-[#F6F5F4] dark:bg-[#252525] border border-[#E6E6E6] dark:border-[#373737] space-y-2">
              <div className="flex items-center justify-between text-xs text-[#615D59] dark:text-[#9B9B9B]">
                <span className="font-semibold tracking-wide uppercase text-[10px]">Technical Identifier</span>
                <button
                  onClick={copyId}
                  className="flex items-center space-x-1 hover:text-[#000000] dark:hover:text-[#EBEBEB] text-[#0075DE] transition-colors text-[11px]"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-[#1AAE39]" />
                      <span className="text-[#1AAE39] font-medium">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <div className="p-2 rounded bg-white dark:bg-[#1C1C1C] border border-[#E6E6E6] dark:border-[#373737] font-mono text-[11px] text-[#31302E] dark:text-[#EBEBEB] break-all select-all">
                {detail.node.id}
              </div>

              {detail.node.source_doc && (
                <div className="flex items-center space-x-1.5 text-[11px] text-[#615D59] dark:text-[#9B9B9B] pt-1 border-t border-[#E6E6E6] dark:border-[#373737]">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-[#0075DE]" />
                  <span className="truncate">Source: {detail.node.source_doc}</span>
                </div>
              )}
            </div>

            {/* Properties Breakdown */}
            {Object.keys(detail.node.props ?? {}).length > 0 && (
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#615D59] dark:text-[#9B9B9B] mb-2 flex items-center justify-between">
                  <span>Properties</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#F6F5F4] dark:bg-[#2C2C2C] text-[#31302E] dark:text-[#C7C7C7]">
                    {Object.keys(detail.node.props ?? {}).length}
                  </span>
                </h4>
                <div className="border border-[#E6E6E6] dark:border-[#373737] rounded-lg divide-y divide-[#E6E6E6] dark:divide-[#373737] bg-white dark:bg-[#252525] overflow-hidden text-xs shadow-sm">
                  {Object.entries(detail.node.props ?? {}).map(([key, value]) => (
                    <div key={key} className="p-2.5 flex items-start justify-between space-x-3">
                      <span className="font-mono text-[#615D59] dark:text-[#9B9B9B] text-[11px] shrink-0 font-medium">
                        {key}
                      </span>
                      <span className="font-mono text-[#000000] dark:text-[#EBEBEB] text-right text-[11px] break-words max-w-[210px] bg-[#F6F5F4] dark:bg-[#1E1E1E] px-1.5 py-0.5 rounded border border-[#E6E6E6] dark:border-[#373737]">
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
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#615D59] dark:text-[#9B9B9B] flex items-center space-x-1.5">
                  <Activity className="h-3.5 w-3.5 text-[#0075DE]" />
                  <span>CONNECTIONS ({detail.total_neighbors})</span>
                </h4>
              </div>

              {detail.total_neighbors === 0 ? (
                <div className="p-4 rounded-lg border border-dashed border-[#E6E6E6] dark:border-[#373737] text-center text-xs text-[#615D59] dark:text-[#9B9B9B] bg-[#F6F5F4]/50 dark:bg-[#252525]">
                  No connected relationships found for this node.
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Outbound Connections */}
                  {detail.outbound.map((link) => {
                    const normNType = normalizeNodeType(link.neighbor.type);
                    const nConfig = TYPE_CONFIG[normNType] || {
                      icon: Layers,
                      color: 'text-[#615D59]',
                      bgPill: 'bg-[#F6F5F4] text-[#615D59]',
                      border: 'border-[#E6E6E6]',
                    };
                    const NIcon = nConfig.icon;
                    const badges = getRelationBadges(link.rel_type, normNType);

                    return (
                      <button
                        key={link.edge_id}
                        onClick={() => onSelectNode(link.neighbor.id)}
                        className="w-full p-2.5 rounded-lg border border-[#E6E6E6] dark:border-[#373737] bg-white dark:bg-[#252525] hover:bg-[#F6F5F4] dark:hover:bg-[#2A2A2A] hover:border-[#0075DE] transition-all flex flex-col space-y-1.5 group text-left shadow-sm"
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center space-x-2 min-w-0">
                            <ArrowRight className="h-3.5 w-3.5 text-[#0075DE] shrink-0 group-hover:translate-x-0.5 transition-transform" />
                            <NIcon className={`h-4 w-4 shrink-0 ${nConfig.color}`} />
                            <span className="text-xs font-semibold text-[#000000] dark:text-[#EBEBEB] truncate group-hover:text-[#0075DE] transition-colors">
                              {link.neighbor.name}
                            </span>
                          </div>
                          <span
                            className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border shrink-0 ${nConfig.bgPill} ${nConfig.border}`}
                          >
                            {link.neighbor.type}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap pl-5">
                          <span className="text-[10px] font-mono font-semibold uppercase px-1.5 py-0.5 rounded bg-[#F6F5F4] dark:bg-[#1E1E1E] text-[#31302E] dark:text-[#EBEBEB] border border-[#E6E6E6] dark:border-[#373737]">
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
                      color: 'text-[#615D59]',
                      bgPill: 'bg-[#F6F5F4] text-[#615D59]',
                      border: 'border-[#E6E6E6]',
                    };
                    const NIcon = nConfig.icon;
                    const badges = getRelationBadges(link.rel_type, normNType);

                    return (
                      <button
                        key={link.edge_id}
                        onClick={() => onSelectNode(link.neighbor.id)}
                        className="w-full p-2.5 rounded-lg border border-[#E6E6E6] dark:border-[#373737] bg-white dark:bg-[#252525] hover:bg-[#F6F5F4] dark:hover:bg-[#2A2A2A] hover:border-[#0075DE] transition-all flex flex-col space-y-1.5 group text-left shadow-sm"
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center space-x-2 min-w-0">
                            <ArrowLeft className="h-3.5 w-3.5 text-[#0075DE] shrink-0 group-hover:-translate-x-0.5 transition-transform" />
                            <NIcon className={`h-4 w-4 shrink-0 ${nConfig.color}`} />
                            <span className="text-xs font-semibold text-[#000000] dark:text-[#EBEBEB] truncate group-hover:text-[#0075DE] transition-colors">
                              {link.neighbor.name}
                            </span>
                          </div>
                          <span
                            className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border shrink-0 ${nConfig.bgPill} ${nConfig.border}`}
                          >
                            {link.neighbor.type}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap pl-5">
                          <span className="text-[10px] font-mono font-semibold uppercase px-1.5 py-0.5 rounded bg-[#F6F5F4] dark:bg-[#1E1E1E] text-[#31302E] dark:text-[#EBEBEB] border border-[#E6E6E6] dark:border-[#373737]">
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
