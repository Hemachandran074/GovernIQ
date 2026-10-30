import { useState, useEffect, useRef } from 'react';
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Mic,
  Plus,
  Loader2,
  X,
  Code2,
  Check,
  Copy,
  AlertCircle,
} from 'lucide-react';
import { ModelOption, QueryHighlight, QueryResult } from '../types';
import { fetchModels, submitGovernanceQuery } from '../lib/api';

interface ChatBarProps {
  onHighlight: (highlight: QueryHighlight | null) => void;
  activeHighlight: QueryHighlight | null;
  onAttachClick?: () => void;
  disabled?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
  defaultCollapsed?: boolean;
}

const DEFAULT_MODELS: ModelOption[] = [
  {
    id: 'openai/gpt-oss-120b',
    name: 'Groq GPT-OSS 120B',
    provider: 'Groq',
    default: true,
  },
  {
    id: 'qwen/qwen3.8-27b',
    name: 'Groq Qwen 3.8 27B',
    provider: 'Groq',
    default: false,
  },
  {
    id: 'openai/gpt-oss-20b',
    name: 'Groq GPT-OSS 20B',
    provider: 'Groq',
    default: false,
  },
  {
    id: 'llama-3.3-70b-versatile',
    name: 'Groq Llama 3.3 70B',
    provider: 'Groq',
    default: false,
  },
  {
    id: 'gpt-4o-mini',
    name: 'OpenAI GPT-4o Mini',
    provider: 'OpenAI',
    default: false,
  },
  {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    default: false,
  },
];

type EffortLevel = 'low' | 'medium' | 'high';

export function ChatBar({
  onHighlight,
  activeHighlight,
  onAttachClick,
  disabled = false,
  isCollapsed: controlledCollapsed,
  onToggleCollapse,
  defaultCollapsed = false,
}: ChatBarProps) {
  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(defaultCollapsed);
  const isCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;

  const handleToggleCollapse = (nextCollapsed: boolean) => {
    if (nextCollapsed) {
      setIsModelMenuOpen(false);
      setIsEffortMenuOpen(false);
    }
    if (controlledCollapsed === undefined) {
      setInternalCollapsed(nextCollapsed);
    }
    onToggleCollapse?.(nextCollapsed);
  };

  const handleExpand = () => {
    handleToggleCollapse(false);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const [question, setQuestion] = useState('');
  const [models, setModels] = useState<ModelOption[]>(DEFAULT_MODELS);
  const [selectedModelId, setSelectedModelId] = useState<string>('openai/gpt-oss-120b');
  const [effort, setEffort] = useState<EffortLevel>('high');

  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isEffortMenuOpen, setIsEffortMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [showCypher, setShowCypher] = useState(false);
  const [copiedCypher, setCopiedCypher] = useState(false);

  const modelMenuRef = useRef<HTMLDivElement>(null);
  const effortMenuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch available models from backend
  useEffect(() => {
    let isMounted = true;
    fetchModels()
      .then((data) => {
        if (isMounted && data.length > 0) {
          setModels(data);
          const defaultMod = data.find((m) => m.default) || data[0];
          if (defaultMod) {
            setSelectedModelId(defaultMod.id);
          }
        }
      })
      .catch(() => {
        // Fallback to static defaults
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Close menus on outside click or Esc
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsModelMenuOpen(false);
        setIsEffortMenuOpen(false);
        if (queryResult) {
          setQueryResult(null);
          onHighlight(null);
        }
      }
    }

    function handleClickOutside(e: MouseEvent) {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setIsModelMenuOpen(false);
      }
      if (effortMenuRef.current && !effortMenuRef.current.contains(e.target as Node)) {
        setIsEffortMenuOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [queryResult, onHighlight]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || isLoading || disabled) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await submitGovernanceQuery({
        question: trimmed,
        model: selectedModelId,
        effort,
      });
      setQueryResult(res);
      onHighlight(res.highlight);
      setQuestion('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to execute query';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyCypher = () => {
    if (!queryResult?.cypher) return;
    navigator.clipboard.writeText(queryResult.cypher);
    setCopiedCypher(true);
    setTimeout(() => setCopiedCypher(false), 2000);
  };

  const handleClearHighlight = () => {
    onHighlight(null);
    setQueryResult(null);
  };

  const fallbackModel: ModelOption = {
    id: 'openai/gpt-oss-120b',
    name: 'Groq GPT-OSS 120B',
    provider: 'Groq',
    default: true,
  };
  const currentModel: ModelOption =
    models.find((m) => m.id === selectedModelId) ?? models[0] ?? fallbackModel;

  if (isCollapsed) {
    return (
      <div
        data-testid="chat-bar-collapsed"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center animate-in fade-in slide-in-from-bottom-2 duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
      >
        <button
          type="button"
          data-testid="expand-chat-btn"
          onClick={handleExpand}
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[var(--bg-surface)]/90 border border-[var(--border-default)] shadow-[var(--shadow-float)] hover:bg-[var(--bg-surface-hover)] hover:border-[var(--text-muted)] text-[var(--text-primary)] transition-all duration-300 active:scale-95 group backdrop-blur-xl cursor-pointer"
          aria-label="Expand AI chat"
          aria-expanded={false}
        >
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-[var(--node-agent)]/15 text-[var(--node-agent)]">
            <Sparkles className="h-3.5 w-3.5 group-hover:rotate-12 transition-transform duration-300" />
          </div>
          <span className="text-xs font-semibold tracking-tight">Ask AI Assistant</span>
          {queryResult && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--node-agent)]/15 text-[var(--node-agent)] border border-[var(--node-agent)]/30">
              Result Ready
            </span>
          )}
          {activeHighlight && activeHighlight.node_ids.length > 0 && (
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[var(--state-success)]/15 text-[var(--state-success)] font-semibold border border-[var(--state-success)]/30">
              {activeHighlight.node_ids.length} highlighted
            </span>
          )}
          <ChevronUp className="h-4 w-4 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-transform duration-300 group-hover:-translate-y-0.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="chat-bar-expanded"
      className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-[540px] z-30 flex flex-col items-center transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] animate-in fade-in slide-in-from-bottom-2"
    >
      {/* Answer & Query Result Card */}
      {queryResult && (
        <div
          data-testid="query-answer-card"
          className="w-full mb-3 p-4 rounded-2xl bg-[var(--bg-surface)]/95 border border-[var(--border-default)] shadow-[var(--shadow-float)] backdrop-blur-xl transition-all animate-in fade-in slide-in-from-bottom-2 duration-300"
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--node-agent)] bg-[var(--bg-surface-hover)] px-2 py-0.5 rounded-full border border-[var(--border-default)]">
                Query Result
              </span>
              {activeHighlight && activeHighlight.node_ids.length > 0 && (
                <span className="text-xs font-medium text-[var(--state-success)] bg-[var(--bg-surface-hover)] px-2 py-0.5 rounded-full border border-[var(--border-default)]">
                  {activeHighlight.node_ids.length} nodes highlighted
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleClearHighlight}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] px-2 py-1 rounded-md transition-colors"
                title="Clear highlight and dismiss"
              >
                Clear
              </button>
              <button
                type="button"
                data-testid="collapse-card-btn"
                onClick={() => handleToggleCollapse(true)}
                className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
                title="Collapse chat"
                aria-label="Collapse chat"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setQueryResult(null)}
                className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Natural language explanation */}
          <p className="text-sm text-[var(--text-primary)] leading-relaxed mb-3">
            {queryResult.explanation}
          </p>

          {/* Collapsible Cypher Query */}
          <div className="border-t border-[var(--border-default)] pt-2.5">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowCypher(!showCypher)}
                className="flex items-center gap-1.5 text-xs font-mono font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                <Code2 className="h-3.5 w-3.5" />
                <span>{showCypher ? 'Hide Cypher Query' : 'View Generated Cypher'}</span>
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${showCypher ? 'rotate-180' : ''}`}
                />
              </button>

              {showCypher && (
                <button
                  type="button"
                  onClick={handleCopyCypher}
                  className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  title="Copy Cypher query"
                >
                  {copiedCypher ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-[var(--state-success)]" />
                      <span className="text-[var(--state-success)]">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {showCypher && (
              <pre className="mt-2 p-2.5 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)] text-xs font-mono text-[var(--text-primary)] overflow-x-auto whitespace-pre-wrap break-all leading-normal">
                {queryResult.cypher}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="w-full mb-2 px-3 py-2 rounded-xl bg-red-500/10 border border-[var(--state-error)]/30 text-xs text-[var(--state-error)] flex items-center justify-between gap-2 animate-in fade-in duration-200">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="p-0.5 hover:opacity-80"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Main Floating Chat Input Card */}
      <form
        onSubmit={handleSubmit}
        className="w-full rounded-2xl bg-[var(--bg-surface)]/95 backdrop-blur-xl border border-[var(--border-default)] shadow-[var(--shadow-float)] transition-all duration-200 focus-within:ring-2 focus-within:ring-[var(--text-primary)]/15 focus-within:border-[var(--text-muted)] p-2.5"
      >
        {/* Top Input Row */}
        <div className="px-2 pt-1 pb-2 flex items-center justify-between gap-2">
          <input
            ref={inputRef}
            type="text"
            data-testid="chat-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={isLoading || disabled}
            placeholder="Ask anything about agents, tools, models, policies..."
            className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          <button
            type="button"
            data-testid="collapse-chat-btn"
            onClick={() => handleToggleCollapse(true)}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors shrink-0"
            title="Collapse chat"
            aria-label="Collapse chat"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>

        {/* Bottom Actions Row */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border-default)]/60 text-xs">
          {/* Left Controls: Attach + Model + Effort */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Attach button */}
            <button
              type="button"
              onClick={onAttachClick}
              disabled={disabled || isLoading}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
              title="Attach document for ingestion"
            >
              <Plus className="h-4 w-4" />
            </button>

            {/* Model Selector Dropdown */}
            <div className="relative" ref={modelMenuRef}>
              <button
                type="button"
                data-testid="model-selector-btn"
                onClick={() => {
                  setIsModelMenuOpen(!isModelMenuOpen);
                  setIsEffortMenuOpen(false);
                }}
                disabled={disabled || isLoading}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors font-medium"
              >
                <span className="truncate max-w-[130px]">{currentModel.name}</span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </button>

              {isModelMenuOpen && (
                <div
                  data-testid="model-dropdown-menu"
                  className="absolute bottom-full mb-2 left-0 w-52 rounded-xl bg-[var(--bg-surface)]/95 backdrop-blur-xl border border-[var(--border-default)] shadow-[var(--shadow-float)] py-1 z-40 animate-in fade-in-0 zoom-in-95 duration-150"
                >
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-default)]">
                    Select LLM Model
                  </div>
                  {models.map((mod) => (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => {
                        setSelectedModelId(mod.id);
                        setIsModelMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 flex items-center justify-between text-xs hover:bg-[var(--bg-surface-hover)] transition-colors ${
                        selectedModelId === mod.id
                          ? 'bg-[var(--bg-selected)] font-semibold text-[var(--text-primary)]'
                          : 'text-[var(--text-primary)]'
                      }`}
                    >
                      <div className="flex flex-col truncate">
                        <span className="truncate">{mod.name}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">{mod.provider}</span>
                      </div>
                      {selectedModelId === mod.id && (
                        <Check className="h-3.5 w-3.5 text-[var(--text-primary)] shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Reasoning Effort Selector */}
            <div className="relative" ref={effortMenuRef}>
              <button
                type="button"
                data-testid="effort-selector-btn"
                onClick={() => {
                  setIsEffortMenuOpen(!isEffortMenuOpen);
                  setIsModelMenuOpen(false);
                }}
                disabled={disabled || isLoading}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors font-medium capitalize"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span>{effort}</span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </button>

              {isEffortMenuOpen && (
                <div
                  data-testid="effort-dropdown-menu"
                  className="absolute bottom-full mb-2 left-0 w-36 rounded-xl bg-[var(--bg-surface)]/95 backdrop-blur-xl border border-[var(--border-default)] shadow-[var(--shadow-float)] py-1 z-40 animate-in fade-in-0 zoom-in-95 duration-150"
                >
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-default)]">
                    Effort Level
                  </div>
                  {(['low', 'medium', 'high'] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => {
                        setEffort(level);
                        setIsEffortMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 flex items-center justify-between text-xs capitalize hover:bg-[var(--bg-surface-hover)] transition-colors ${
                        effort === level
                          ? 'bg-[var(--bg-selected)] font-semibold text-[var(--text-primary)]'
                          : 'text-[var(--text-primary)]'
                      }`}
                    >
                      <span>{level}</span>
                      {effort === level && (
                        <Check className="h-3.5 w-3.5 text-[var(--text-primary)] shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Controls: Mic + Send Button */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Microphone button */}
            <button
              type="button"
              disabled={disabled || isLoading}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
              title="Voice dictation (speech-to-text)"
              onClick={() => {
                // Visual placeholder / web speech API support
                if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
                  try {
                    const SpeechRecognition =
                      (window as unknown as { SpeechRecognition?: new () => any }).SpeechRecognition ||
                      (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;
                    if (SpeechRecognition) {
                      const recognition = new SpeechRecognition();
                      recognition.onresult = (evt: any) => {
                        const transcript = evt.results[0][0].transcript;
                        setQuestion((prev) => (prev ? `${prev} ${transcript}` : transcript));
                      };
                      recognition.start();
                    }
                  } catch {
                    // Ignore
                  }
                }
              }}
            >
              <Mic className="h-4 w-4" />
            </button>

            {/* Send Button */}
            <button
              type="submit"
              data-testid="chat-submit-btn"
              disabled={!question.trim() || isLoading || disabled}
              className={`p-1.5 rounded-xl transition-all ${
                question.trim() && !isLoading && !disabled
                  ? 'bg-[var(--text-primary)] text-[var(--bg-surface)] hover:opacity-90 shadow-sm'
                  : 'bg-[var(--border-default)] text-[var(--text-muted)] opacity-50 cursor-not-allowed'
              }`}
              title="Execute governance query"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default ChatBar;
