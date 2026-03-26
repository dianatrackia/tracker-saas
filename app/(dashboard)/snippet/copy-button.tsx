'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function CopySnippetButton({ text, label = 'Copiar código' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={copy}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
        copied
          ? 'bg-green-100 text-green-700'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? '¡Copiado!' : label}
    </button>
  );
}
