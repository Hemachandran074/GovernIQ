import React, { useState, useRef, DragEvent, ChangeEvent, KeyboardEvent } from 'react';
import { UploadCloud, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  GraphData,
  IngestionResponse,
  IngestionSummary,
  ingestionResponseSchema,
} from '../types';

interface UploadZoneProps {
  onUploadSuccess?: (graph: GraphData, summary: IngestionSummary) => void;
}

type UploadState = 'idle' | 'dragging' | 'uploading' | 'success' | 'error';

export const UploadZone: React.FC<UploadZoneProps> = ({ onUploadSuccess }) => {
  const [state, setState] = useState<UploadState>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [uploadedFile, setUploadedFile] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (state !== 'uploading') {
      setState('dragging');
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    if (state === 'dragging') {
      setState('idle');
    }
  };

  const processFile = async (file: File) => {
    const validExtensions = ['.json', '.yaml', '.yml', '.jsonl', '.md', '.markdown'];
    const hasValidExt = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));

    if (!hasValidExt) {
      setState('error');
      setStatusMessage('Unsupported format. Please upload Markdown (.md), YAML, JSON, or JSONL.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setState('error');
      setStatusMessage('File exceeds 2 MB limit.');
      return;
    }

    setState('uploading');
    setUploadedFile(file.name);
    setStatusMessage(`Parsing & ingesting ${file.name}...`);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const data: IngestionResponse = await apiFetch('/api/documents', ingestionResponseSchema, {
        method: 'POST',
        body: formData,
      });

      setState('success');
      setStatusMessage(
        `Parsed ${data.summary.nodes_processed} nodes & ${data.summary.edges_processed} edges`
      );

      if (onUploadSuccess) {
        onUploadSuccess(data.graph, data.summary);
      }
    } catch (err) {
      setState('error');
      setStatusMessage(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setState('idle');

    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0]) {
      void processFile(files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && files[0]) {
      void processFile(files[0]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerFileDialog = () => {
    if (state !== 'uploading') {
      fileInputRef.current?.click();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      triggerFileDialog();
    }
  };

  const resetUpload = (e: React.MouseEvent) => {
    e.stopPropagation();
    setState('idle');
    setStatusMessage('');
    setUploadedFile('');
  };

  return (
    <div className="w-full mb-5">
      <input
        ref={fileInputRef}
        type="file"
        data-testid="file-input"
        accept=".json,.yaml,.yml,.jsonl,.md,.markdown"
        onChange={handleFileChange}
        className="hidden"
      />

      <div
        role="button"
        tabIndex={0}
        data-testid="upload-drop-zone"
        onClick={triggerFileDialog}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        aria-label="Upload document drop zone"
        className={`border-2 border-dashed rounded-2xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 ease-out select-none relative group outline-none focus-visible:ring-2 focus-visible:ring-[#8B7CFF]/50 ${
          state === 'dragging'
            ? 'border-[#8B7CFF] bg-[#1C253C] shadow-[0_0_25px_rgba(139,124,255,0.25)] scale-[1.01]'
            : state === 'uploading'
            ? 'border-[#F59E0B] bg-[#171E32] cursor-wait'
            : state === 'success'
            ? 'border-[#22C55E]/60 bg-[#22C55E]/10 hover:bg-[#22C55E]/15'
            : state === 'error'
            ? 'border-[#F43F5E]/60 bg-[#F43F5E]/10 hover:bg-[#F43F5E]/15'
            : 'border-[#29344A] bg-[#171E32]/60 hover:border-[#8B7CFF]/60 hover:bg-[#171E32] hover:shadow-[0_4px_20px_rgba(0,0,0,0.4)] active:scale-[0.99]'
        }`}
      >
        {state === 'uploading' ? (
          <div className="flex flex-col items-center py-1 pointer-events-none">
            <Loader2 className="h-8 w-8 text-[#F59E0B] animate-spin mb-2" />
            <span className="text-sm font-medium text-[#F1F5F9]">{uploadedFile}</span>
            <span className="text-xs text-[#94A3B8] mt-1">{statusMessage}</span>
          </div>
        ) : state === 'success' ? (
          <div className="flex flex-col items-center py-1">
            <CheckCircle2 className="h-8 w-8 text-[#22C55E] mb-2 transition-transform duration-200 scale-110 pointer-events-none" />
            <span className="text-sm font-semibold text-[#F1F5F9] truncate max-w-[260px] pointer-events-none">
              {uploadedFile}
            </span>
            <span className="text-xs text-[#22C55E] font-medium mt-1 pointer-events-none">
              {statusMessage}
            </span>
            <button
              type="button"
              onClick={resetUpload}
              className="text-[11px] text-[#94A3B8] hover:text-[#F1F5F9] underline mt-2 py-0.5 px-2 rounded hover:bg-[#202B42] transition-colors"
            >
              Upload another
            </button>
          </div>
        ) : state === 'error' ? (
          <div className="flex flex-col items-center py-1">
            <AlertCircle className="h-8 w-8 text-[#F43F5E] mb-2 transition-transform duration-200 scale-110 pointer-events-none" />
            <span className="text-sm font-semibold text-[#F43F5E] pointer-events-none">Upload failed</span>
            <span className="text-xs text-[#F43F5E] mt-1 max-w-[260px] pointer-events-none">
              {statusMessage}
            </span>
            <button
              type="button"
              onClick={resetUpload}
              className="text-[11px] text-[#94A3B8] hover:text-[#F1F5F9] underline mt-2 py-0.5 px-2 rounded hover:bg-[#202B42] transition-colors"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center pointer-events-none">
            <div className="w-10 h-10 rounded-xl bg-[#202B42]/80 border border-[#29344A] flex items-center justify-center mb-2.5 group-hover:border-[#8B7CFF]/50 group-hover:scale-105 transition-all">
              <UploadCloud
                className={`h-5 w-5 text-[#8B7CFF] transition-transform duration-300 ease-out ${
                  state === 'dragging' ? '-translate-y-1' : ''
                }`}
              />
            </div>
            <span className="text-sm font-medium text-[#F1F5F9] transition-colors duration-150">
              {state === 'dragging' ? 'Drop document here' : 'Upload document'}
            </span>
            <span className="text-xs text-[#94A3B8] mt-1">MD, YAML, JSON or JSONL supported</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadZone;
