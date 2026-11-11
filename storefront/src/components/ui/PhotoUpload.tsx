'use client';

import { ImagePlus, Loader2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { errorMessage } from '@/lib/client';

export interface Uploaded {
  key: string;
  preview: string;
}

/** Customer photo uploads for returns (private) and reviews (public after moderation). */
export function PhotoUpload({ purpose, value, onChange, max = 6 }: { purpose: 'review' | 'return'; value: Uploaded[]; onChange: (v: Uploaded[]) => void; max?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (files: FileList) => {
    setError(null);
    setBusy(true);
    const next = [...value];
    for (const file of Array.from(files).slice(0, max - value.length)) {
      if (file.size > 8 * 1024 * 1024) {
        setError(`${file.name} is larger than 8 MB.`);
        continue;
      }
      const body = new FormData();
      body.append('file', file);
      try {
        const res = await fetch(`/api/me/uploads?purpose=${purpose}`, { method: 'POST', body, headers: { 'X-Requested-With': 'fetch' } });
        const json = await res.json();
        if (!res.ok) throw new Error(json.detail ?? 'Upload failed');
        next.push({ key: json.key, preview: URL.createObjectURL(file) });
      } catch (err) {
        setError(err instanceof Error ? err.message : errorMessage(err));
      }
    }
    onChange(next);
    setBusy(false);
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-3">
        {value.map((p) => (
          <div key={p.key} className="relative h-20 w-20 overflow-hidden rounded-md bg-paper-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.preview} alt="" className="h-full w-full object-cover" />
            <button type="button" onClick={() => onChange(value.filter((x) => x.key !== p.key))} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-ink/70 text-white" aria-label="Remove photo">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {value.length < max && (
          <button type="button" onClick={() => input.current?.click()} className="grid h-20 w-20 place-items-center rounded-md border border-dashed border-line-strong text-muted hover:border-ink hover:text-ink" aria-label="Add photos">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" strokeWidth={1.5} />}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />
      <p className="text-[0.78rem] text-muted">Up to {max} photos, 8 MB each. Location data is removed from every photo.</p>
      {error && <p className="text-[0.8rem] text-danger">{error}</p>}
    </div>
  );
}
