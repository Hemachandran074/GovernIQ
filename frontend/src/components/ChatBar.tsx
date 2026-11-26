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
  Bot,
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
      .then((data: ModelOption[]) => {
        if (isMounted && data.length > 0) {
          setModels(data);
          const defaultMod = data.find((m: ModelOption) => m.default) || data[0];
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

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [queryResult, onHighlight]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!question.trim() || isLoading || disabled) return;

    const currentQuery = question.trim();
    setIsLoading(true);
    setError(null);

    try {
      const response = await submitGovernanceQuery({
        question: currentQuery,
        model: selectedModelId,
        effort: effort,
      });
      setQueryResult(response);

      if (response.highlight && response.highlight.node_ids.length > 0) {
        onHighlight(response.highlight);
      } else {
        onHighlight(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to execute query';
      setError(msg);
      onHighlight(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyCypher = async () => {
    if (!queryResult?.cypher) return;
    try {
      await navigator.clipboard.writeText(queryResult.cypher);
      setCopiedCypher(true);
      setTimeout(() => setCopiedCypher(false), 2000);
    } catch {
      // ignore
    }
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
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center animate-in fade-in slide-in-from-bottom-2 duration-300"
      >
        <button
          type="button"
          data-testid="expand-chat-btn"
          onClick={handleExpand}
          className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-white dark:bg-[#202020] border border-[#E6E6E6] dark:border-[#2E2E2E] shadow-[0_4px_20px_rgba(0,0,0,0.08)] hover:bg-[#F6F5F4] dark:hover:bg-[#282828] hover:border-[#0075DE]/50 text-[#000000] dark:text-[#EBEBEB] transition-all duration-200 active:scale-95 group cursor-pointer"
          aria-label="Expand AI chat"
          aria-expanded={false}
        >
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-[#0075DE]/10 text-[#0075DE]">
            <Sparkles className="h-3.5 w-3.5 group-hover:rotate-12 transition-transform duration-200" />
          </div>
          <span className="text-xs font-semibold tracking-tight">Ask AI Assistant</span>
          {queryResult && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#0075DE]/10 text-[#0075DE] border border-[#0075DE]/30">
              Result Ready
            </span>
          )}
          {activeHighlight && activeHighlight.node_ids.length > 0 && (
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#E7F7ED] text-[#1AAE39] font-semibold border border-[#1AAE39]/30">
              {activeHighlight.node_ids.length} highlighted
            </span>
          )}
          <ChevronUp className="h-4 w-4 text-[#615D59] dark:text-[#9B9B9B] group-hover:text-[#000000] dark:group-hover:text-[#EBEBEB] transition-transform duration-200 group-hover:-translate-y-0.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="chat-bar-expanded"
      className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-[560px] z-30 flex flex-col items-center transition-all duration-200 animate-in fade-in slide-in-from-bottom-2"
    >
      {/* Answer & Query Result Card */}
      {queryResult && (
        <div
          data-testid="query-answer-card"
          className="w-full mb-3 p-4 rounded-xl bg-white dark:bg-[#202020] border border-[#E6E6E6] dark:border-[#2E2E2E] shadow-[0_10px_30px_rgba(0,0,0,0.08)] transition-all animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#0075DE] bg-[#0075DE]/10 px-2.5 py-0.5 rounded-full border border-[#0075DE]/30 flex items-center space-x-1">
                <Bot className="h-3 w-3" />
                <span>Query Result</span>
              </span>
              {activeHighlight && activeHighlight.node_ids.length > 0 && (
                <span className="text-xs font-medium text-[#1AAE39] bg-[#E7F7ED] px-2.5 py-0.5 rounded-full border border-[#1AAE39]/30">
                  {activeHighlight.node_ids.length} nodes highlighted
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleClearHighlight}
                className="text-xs text-[#615D59] dark:text-[#9B9B9B] hover:text-[#000000] dark:hover:text-[#EBEBEB] hover:bg-[#F6F5F4] dark:hover:bg-[#2A2A2A] px-2 py-1 rounded-md transition-colors"
                title="Clear highlight and dismiss"
              >
                Clear
              </button>
              <button
                type="button"
                data-testid="collapse-card-btn"
                onClick={() => handleToggleCollapse(true)}
                className="p-1 rounded-md text-[#615D59] dark:text-[#9B9B9B] hover:text-[#000000] dark:hover:text-[#EBEBEB] hover:bg-[#F6F5F4] dark:hover:bg-[#2A2A2A] transition-colors"
                title="Collapse chat"
                aria-label="Collapse chat"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setQueryResult(null)}
                className="p-1 rounded-md text-[#615D59] dark:text-[#9B9B9B] hover:text-[#000000] dark:hover:text-[#EBEBEB] hover:bg-[#F6F5F4] dark:hover:bg-[#2A2A2A] transition-colors"
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Natural language explanation */}
          <p className="text-sm text-[#31302E] dark:text-[#EBEBEB] leading-relaxed mb-3">
            {queryResult.explanation}
          </p>

          {/* Collapsible Cypher Query */}
          <div className="border-t border-[#E6E6E6] dark:border-[#2E2E2E] pt-2.5">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowCypher(!showCypher)}
                className="flex items-center gap-1.5 text-xs font-mono font-medium text-[#615D59] dark:text-[#9B9B9B] hover:text-[#0075DE] transition-colors"
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
                  className="flex items-center gap-1 text-xs text-[#615D59] dark:text-[#9B9B9B] hover:text-[#000000] dark:hover:text-[#EBEBEB] transition-colors"
                  title="Copy Cypher query"
                >
                  {copiedCypher ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-[#1AAE39]" />
                      <span className="text-[#1AAE39]">Copied</span>
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
              <pre className="mt-2 p-2.5 rounded-lg bg-[#F6F5F4] dark:bg-[#191919] border border-[#E6E6E6] dark:border-[#2E2E2E] text-xs font-mono text-[#0075DE] dark:text-[#62AEF0] overflow-x-auto whitespace-pre-wrap break-all leading-normal">
                {queryResult.cypher}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="w-full mb-2 px-3 py-2 rounded-lg bg-[#FFDEDE] dark:bg-[#331C1C] border border-[#E03E3E]/40 text-xs text-[#E03E3E] flex items-center justify-between gap-2 animate-in fade-in duration-200">
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
        className="w-full rounded-2xl bg-white dark:bg-[#202020] border border-[#E6E6E6] dark:border-[#2E2E2E] shadow-[0_12px_36px_rgba(0,0,0,0.1)] transition-all duration-200 focus-within:ring-2 focus-within:ring-[#0075DE]/30 focus-within:border-[#0075DE] p-2.5"
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
            className="w-full bg-transparent text-sm text-[#000000] dark:text-[#EBEBEB] placeholder:text-[#A39E98] focus:outline-none"
          />
          <button
            type="button"
            data-testid="collapse-chat-btn"
            onClick={() => handleToggleCollapse(true)}
            className="p-1 rounded-md text-[#615D59] dark:text-[#9B9B9B] hover:text-[#000000] dark:hover:text-[#EBEBEB] hover:bg-[#F6F5F4] dark:hover:bg-[#282828] transition-colors shrink-0"
            title="Collapse chat"
            aria-label="Collapse chat"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>

        {/* Bottom Actions Row */}
        <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[#E6E6E6] dark:border-[#2E2E2E] text-xs">
          {/* Left Controls: Attach + Model + Effort */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Attach button */}
            <button
              type="button"
              onClick={onAttachClick}
              disabled={disabled || isLoading}
              className="p-1.5 rounded-md text-[#615D59] dark:text-[#9B9B9B] hover:text-[#000000] dark:hover:text-[#EBEBEB] hover:bg-[#F6F5F4] dark:hover:bg-[#282828] transition-colors"
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
                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#F6F5F4] dark:bg-[#282828] border border-[#E6E6E6] dark:border-[#373737] text-[#31302E] dark:text-[#C7C7C7] hover:border-[#0075DE] transition-colors font-medium text-[11px]"
              >
                <span className="truncate max-w-[130px]">{currentModel.name}</span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </button>

              {isModelMenuOpen && (
                <div
                  data-testid="model-dropdown-menu"
                  className="absolute bottom-full mb-2 left-0 w-56 rounded-xl bg-white dark:bg-[#202020] border border-[#E6E6E6] dark:border-[#2E2E2E] shadow-[0_12px_30px_rgba(0,0,0,0.12)] py-1 z-40 animate-in fade-in-0 zoom-in-95 duration-150"
                >
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#A39E98] border-b border-[#E6E6E6] dark:border-[#2E2E2E]">
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
                      className={`w-full text-left px-3 py-2 flex items-center justify-between text-xs hover:bg-[#F6F5F4] dark:hover:bg-[#282828] transition-colors ${
                        selectedModelId === mod.id
                          ? 'bg-[#EEF6FF] dark:bg-[#1F334A] font-semibold text-[#0075DE]'
                          : 'text-[#31302E] dark:text-[#EBEBEB]'
                      }`}
                    >
                      <div className="flex flex-col truncate">
                        <span className="truncate">{mod.name}</span>
                        <span className="text-[10px] text-[#A39E98]">{mod.provider}</span>
                      </div>
                      {selectedModelId === mod.id && (
                        <Check className="h-3.5 w-3.5 text-[#0075DE] shrink-0" />
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
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#F6F5F4] dark:bg-[#282828] border border-[#E6E6E6] dark:border-[#373737] text-[#31302E] dark:text-[#C7C7C7] hover:border-[#0075DE] transition-colors font-medium capitalize text-[11px]"
              >
                <Sparkles className="h-3 w-3 text-[#DD5B00] shrink-0" />
                <span>{effort}</span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </button>

              {isEffortMenuOpen && (
                <div
                  data-testid="effort-dropdown-menu"
                  className="absolute bottom-full mb-2 left-0 w-36 rounded-xl bg-white dark:bg-[#202020] border border-[#E6E6E6] dark:border-[#2E2E2E] shadow-[0_12px_30px_rgba(0,0,0,0.12)] py-1 z-40 animate-in fade-in-0 zoom-in-95 duration-150"
                >
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#A39E98] border-b border-[#E6E6E6] dark:border-[#2E2E2E]">
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
                      className={`w-full text-left px-3 py-1.5 flex items-center justify-between text-xs capitalize hover:bg-[#F6F5F4] dark:hover:bg-[#282828] transition-colors ${
                        effort === level
                          ? 'bg-[#EEF6FF] dark:bg-[#1F334A] font-semibold text-[#0075DE]'
                          : 'text-[#31302E] dark:text-[#EBEBEB]'
                      }`}
                    >
                      <span>{level}</span>
                      {effort === level && (
                        <Check className="h-3.5 w-3.5 text-[#0075DE] shrink-0" />
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
              className="p-1.5 rounded-md text-[#615D59] dark:text-[#9B9B9B] hover:text-[#000000] dark:hover:text-[#EBEBEB] hover:bg-[#F6F5F4] dark:hover:bg-[#282828] transition-colors"
              title="Voice dictation (speech-to-text)"
              onClick={() => {
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

            {/* Send Button (Notion Blue #0075DE) */}
            <button
              type="submit"
              data-testid="chat-submit-btn"
              disabled={!question.trim() || isLoading || disabled}
              className={`p-1.5 rounded-lg transition-all ${
                question.trim() && !isLoading && !disabled
                  ? 'bg-[#0075DE] text-white font-medium hover:bg-[#005BAB] shadow-sm active:scale-95 cursor-pointer'
                  : 'bg-[#F6F5F4] dark:bg-[#2A2A2A] text-[#A39E98] dark:text-[#615D59] opacity-60 cursor-not-allowed'
              }`}
              title="Execute governance query"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4 stroke-[2.5]" />
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default ChatBar;
