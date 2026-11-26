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
        className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 select-none relative group outline-none focus-visible:ring-2 focus-visible:ring-[#0075DE]/40 ${
          state === 'dragging'
            ? 'border-[#0075DE] bg-[#EEF6FF] dark:bg-[#1F334A] scale-[1.01]'
            : state === 'uploading'
            ? 'border-[#DD5B00] bg-[#FFF8F0] dark:bg-[#2A2015] cursor-wait'
            : state === 'success'
            ? 'border-[#1AAE39]/60 bg-[#E7F7ED] dark:bg-[#1A2E20]'
            : state === 'error'
            ? 'border-[#E03E3E]/60 bg-[#FFDEDE] dark:bg-[#331C1C]'
            : 'border-[#D4D4D4] dark:border-[#3F3F3F] bg-[#F6F5F4] dark:bg-[#252525] hover:border-[#0075DE] hover:bg-[#FFFFFF] dark:hover:bg-[#2A2A2A] shadow-sm'
        }`}
      >
        {state === 'uploading' ? (
          <div className="flex flex-col items-center py-1 pointer-events-none">
            <Loader2 className="h-6 w-6 text-[#DD5B00] animate-spin mb-1.5" />
            <span className="text-xs font-semibold text-[#000000] dark:text-[#EBEBEB]">{uploadedFile}</span>
            <span className="text-[11px] text-[#615D59] dark:text-[#9B9B9B] mt-0.5">{statusMessage}</span>
          </div>
        ) : state === 'success' ? (
          <div className="flex flex-col items-center py-1">
            <CheckCircle2 className="h-6 w-6 text-[#1AAE39] mb-1.5 transition-transform duration-200 scale-105 pointer-events-none" />
            <span className="text-xs font-semibold text-[#000000] dark:text-[#EBEBEB] truncate max-w-[240px] pointer-events-none">
              {uploadedFile}
            </span>
            <span className="text-[11px] text-[#1AAE39] font-medium mt-0.5 pointer-events-none">
              {statusMessage}
            </span>
            <button
              type="button"
              onClick={resetUpload}
              className="text-[11px] text-[#0075DE] hover:underline mt-1.5 py-0.5 px-2 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              Upload another
            </button>
          </div>
        ) : state === 'error' ? (
          <div className="flex flex-col items-center py-1">
            <AlertCircle className="h-6 w-6 text-[#E03E3E] mb-1.5 pointer-events-none" />
            <span className="text-xs font-semibold text-[#E03E3E] pointer-events-none">Upload failed</span>
            <span className="text-[11px] text-[#E03E3E] mt-0.5 max-w-[240px] pointer-events-none">
              {statusMessage}
            </span>
            <button
              type="button"
              onClick={resetUpload}
              className="text-[11px] text-[#E03E3E] hover:underline mt-1.5 py-0.5 px-2 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center pointer-events-none">
            <div className="w-8 h-8 rounded-lg bg-white dark:bg-[#1E1E1E] border border-[#E6E6E6] dark:border-[#373737] flex items-center justify-center mb-1.5 shadow-sm group-hover:scale-105 transition-transform">
              <UploadCloud
                className={`h-4 w-4 text-[#0075DE] transition-transform duration-200 ${
                  state === 'dragging' ? '-translate-y-0.5' : ''
                }`}
              />
            </div>
            <span className="text-xs font-semibold text-[#000000] dark:text-[#EBEBEB]">
              {state === 'dragging' ? 'Drop document here' : 'Upload document'}
            </span>
            <span className="text-[10px] text-[#615D59] dark:text-[#9B9B9B] mt-0.5">MD, YAML, JSON or JSONL supported</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadZone;
