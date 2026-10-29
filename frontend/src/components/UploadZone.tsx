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
    // Only leave if exiting the drop zone boundaries
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
    // Reset file input value to allow re-uploading the same file
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
    <div className="w-full mb-6">
      {/* Hidden file input placed outside the clickable card to prevent event bubbling recursion */}
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
        className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 ease-out select-none relative group outline-none focus-visible:ring-2 focus-visible:ring-content-primary/40 ${
          state === 'dragging'
            ? 'border-content-primary bg-surface-hover shadow-md scale-[1.01]'
            : state === 'uploading'
            ? 'border-node-tool bg-surface cursor-wait'
            : state === 'success'
            ? 'border-state-success bg-state-success/10 hover:bg-state-success/15'
            : state === 'error'
            ? 'border-state-error bg-state-error/10 hover:bg-state-error/15'
            : 'border-border-dashed hover:border-content-primary hover:bg-surface-hover/70 hover:shadow-sm active:scale-[0.99]'
        }`}
      >
        {state === 'uploading' ? (
          <div className="flex flex-col items-center py-1 pointer-events-none">
            <Loader2 className="h-8 w-8 text-node-tool animate-spin mb-2" />
            <span className="text-sm font-medium text-content-primary">{uploadedFile}</span>
            <span className="text-xs text-content-muted mt-1">{statusMessage}</span>
          </div>
        ) : state === 'success' ? (
          <div className="flex flex-col items-center py-1">
            <CheckCircle2 className="h-8 w-8 text-state-success mb-2 transition-transform duration-200 scale-110 pointer-events-none" />
            <span className="text-sm font-medium text-content-primary truncate max-w-[260px] pointer-events-none">
              {uploadedFile}
            </span>
            <span className="text-xs text-state-success font-medium mt-1 pointer-events-none">
              {statusMessage}
            </span>
            <button
              type="button"
              onClick={resetUpload}
              className="text-[11px] text-content-muted hover:text-content-primary underline mt-2 py-0.5 px-2 rounded hover:bg-surface transition-colors"
            >
              Upload another
            </button>
          </div>
        ) : state === 'error' ? (
          <div className="flex flex-col items-center py-1">
            <AlertCircle className="h-8 w-8 text-state-error mb-2 transition-transform duration-200 scale-110 pointer-events-none" />
            <span className="text-sm font-medium text-state-error pointer-events-none">Upload failed</span>
            <span className="text-xs text-state-error mt-1 max-w-[260px] pointer-events-none">
              {statusMessage}
            </span>
            <button
              type="button"
              onClick={resetUpload}
              className="text-[11px] text-content-muted hover:text-content-primary underline mt-2 py-0.5 px-2 rounded hover:bg-surface transition-colors"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center pointer-events-none">
            <UploadCloud
              className={`h-8 w-8 text-content-muted mb-2 transition-transform duration-300 ease-out group-hover:-translate-y-1 group-hover:text-content-primary ${
                state === 'dragging' ? '-translate-y-1 text-content-primary' : ''
              }`}
            />
            <span className="text-sm font-medium text-content-primary transition-colors duration-150">
              {state === 'dragging' ? 'Drop document here' : 'Upload document'}
            </span>
            <span className="text-xs text-content-muted mt-1">MD, YAML, JSON or JSONL supported</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadZone;
