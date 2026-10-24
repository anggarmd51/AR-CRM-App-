import React, { useState } from 'react';
import {
  Code2,
  Copy,
  Check,
  Download,
  FolderGit2,
  Layers,
  Database,
  Globe,
  Cpu,
  Smartphone,
} from 'lucide-react';
import { ANDROID_KOTLIN_PROJECT } from '../data/androidKotlinCode.ts';

export const AndroidCodeExplorer: React.FC = () => {
  const [selectedFilePath, setSelectedFilePath] = useState<string>(
    ANDROID_KOTLIN_PROJECT[0].path
  );
  const [copied, setCopied] = useState(false);

  const selectedFile =
    ANDROID_KOTLIN_PROJECT.find((f) => f.path === selectedFilePath) ||
    ANDROID_KOTLIN_PROJECT[0];

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedFile.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([selectedFile.code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedFile.path.split('/').pop() || 'code.kt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'database':
        return <Database className="w-3.5 h-3.5 text-[#ff4800]" />;
      case 'network':
        return <Globe className="w-3.5 h-3.5 text-[#1f1f1f]" />;
      case 'worker':
        return <Cpu className="w-3.5 h-3.5 text-[#ff4800]" />;
      case 'ui':
        return <Smartphone className="w-3.5 h-3.5 text-[#155e3c]" />;
      default:
        return <Layers className="w-3.5 h-3.5 text-[#1f1f1f]" />;
    }
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#1f1f1f] tracking-tight flex items-center gap-2 font-serif-heading">
            <Code2 className="w-5 h-5 text-[#ff4800]" />
            Android Native Architecture (Kotlin & Jetpack Compose)
          </h2>
          <p className="text-xs text-[#6b665c]">
            Production-grade native Android code with Room SQLite, Retrofit API, WorkManager offline sync, and M3 UI
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 bg-[#f8f5ee] hover:bg-[#eae4d5] text-[#1f1f1f] text-xs font-bold px-3.5 py-2 rounded-[8px] border border-[#1f1f1f] transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#ff4800]" />
                <span className="text-[#ff4800]">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy File</span>
              </>
            )}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 bg-[#ff4800] hover:bg-[#e03f00] text-white text-xs font-bold px-3.5 py-2 rounded-[8px] border border-[#1f1f1f] transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </button>
        </div>
      </div>

      {/* Explorer Layout: 16px radius, 1px hairline borders */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: File Tree / File List */}
        <div className="lg:col-span-4 bg-[#f8f5ee] border border-[#1f1f1f] rounded-[16px] p-3 space-y-2">
          <div className="text-xs font-bold text-[#1f1f1f] uppercase tracking-wider px-2 py-1 flex items-center gap-1.5">
            <FolderGit2 className="w-4 h-4 text-[#ff4800]" />
            <span>Android Project Files</span>
          </div>

          <div className="space-y-1">
            {ANDROID_KOTLIN_PROJECT.map((file) => {
              const isSelected = file.path === selectedFilePath;
              return (
                <button
                  key={file.path}
                  onClick={() => setSelectedFilePath(file.path)}
                  className={`w-full text-left p-2.5 rounded-[8px] text-xs font-medium transition-all flex items-start gap-2.5 ${
                    isSelected
                      ? 'bg-[#1f1f1f] text-white font-bold'
                      : 'text-[#1f1f1f] hover:bg-[#eae4d5] border border-transparent'
                  }`}
                >
                  <div className="mt-0.5">{getCategoryIcon(file.category)}</div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">
                      {file.title}
                    </div>
                    <div className={`text-[10px] truncate font-mono ${isSelected ? 'text-[#f8f5ee]' : 'text-[#6b665c]'}`}>
                      {file.path}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Code Viewer */}
        <div className="lg:col-span-8 bg-[#1f1f1f] border border-[#1f1f1f] rounded-[16px] overflow-hidden flex flex-col">
          {/* File description header */}
          <div className="bg-[#2a2a2a] px-4 py-3 border-b border-[#3a3a3a] flex items-center justify-between">
            <div className="min-w-0">
              <span className="font-mono text-xs text-[#ff4800] font-bold block truncate">
                {selectedFile.path}
              </span>
              <p className="text-[11px] text-[#a09a8f] truncate">
                {selectedFile.description}
              </p>
            </div>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-[#1f1f1f] text-[#f8f5ee] rounded-[4px] border border-[#3a3a3a] shrink-0 font-bold">
              {selectedFile.category}
            </span>
          </div>

          {/* Syntax Highlighted Code Area */}
          <div className="p-4 overflow-x-auto max-h-[600px] overflow-y-auto font-mono text-xs text-[#f8f5ee] leading-relaxed bg-[#1f1f1f]">
            <pre>
              <code>{selectedFile.code}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
