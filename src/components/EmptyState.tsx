import React, { useState } from "react";
import { Plus, Sparkles, Loader2, Play } from "lucide-react";
import { Shortcut } from "../types";

interface EmptyStateProps {
  onAddClick: () => void;
  onImportPresets: (presets: Omit<Shortcut, "id" | "createdAt">[]) => Promise<void>;
}

const PRESET_PROGRAMS: Omit<Shortcut, "id" | "createdAt">[] = [
  {
    name: "Microsoft Word",
    execPath: "C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE",
    category: "Office",
    tags: ["office", "word", "document", "microsoft"],
    description: "Create, edit, and polish professional documents and reports.",
    iconUrl: "https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=120&auto=format&fit=crop&q=60"
  },
  {
    name: "Google Gemini Desktop",
    execPath: "https://gemini.google.com",
    category: "AI",
    tags: ["ai", "assistant", "gemini", "google"],
    description: "Collaborate with Gemini to brainstorm, learn, and write code.",
    iconUrl: "https://images.unsplash.com/photo-1677442136019-21780efad99a?w=120&auto=format&fit=crop&q=60"
  },
  {
    name: "Google Scholar",
    execPath: "https://scholar.google.com",
    category: "Research",
    tags: ["research", "papers", "academic", "search"],
    description: "Search across a wide variety of disciplines and academic literature.",
    iconUrl: "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=120&auto=format&fit=crop&q=60"
  },
  {
    name: "Adobe Photoshop",
    execPath: "C:\\Program Files\\Adobe\\Adobe Photoshop 2024\\Photoshop.exe",
    category: "Photography",
    tags: ["design", "photo", "adobe", "editing"],
    description: "The world's leading image editor and graphic design platform.",
    iconUrl: "https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=120&auto=format&fit=crop&q=60"
  },
  {
    name: "Calibre E-Book Reader",
    execPath: "C:\\Program Files\\Calibre2\\calibre.exe",
    category: "Books",
    tags: ["books", "reading", "epub", "pdf"],
    description: "Manage, catalog, and read your entire electronic book collection.",
    iconUrl: "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=120&auto=format&fit=crop&q=60"
  },
  {
    name: "Steam Launcher",
    execPath: "C:\\Program Files (x86)\\Steam\\steam.exe",
    category: "Gaming",
    tags: ["gaming", "steam", "launcher"],
    description: "Access and launch your desktop video game collection and connect with friends.",
    iconUrl: "https://images.unsplash.com/photo-1612287230202-1bf1d85d1bdf?w=120&auto=format&fit=crop&q=60"
  }
];

export default function EmptyState({ onAddClick, onImportPresets }: EmptyStateProps) {
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    setImporting(true);
    try {
      await onImportPresets(PRESET_PROGRAMS);
    } catch (err) {
      console.error(err);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center text-center max-w-2xl mx-auto py-16 px-4">
      {/* Visual Launcher Badge */}
      <div className="relative mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500/20 to-amber-600/10 border border-amber-500/30 text-amber-400">
        <Play className="h-7 w-7" />
        <div className="absolute -inset-1 rounded-2xl border border-amber-500/10 animate-ping opacity-30" />
      </div>

      <h2 className="text-xl font-bold tracking-tight text-white mb-2 font-sans">
        Your Personal Launchpad Storefront is Empty
      </h2>
      <p className="text-sm text-neutral-400 max-w-md leading-relaxed mb-8">
        Group, tag, and organize all of your favorite Windows shortcuts, executables, or custom app protocol URIs into a simplified, fast interface.
      </p>

      {/* Primary Actions */}
      <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center mb-12">
        <button
          onClick={onAddClick}
          className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-semibold text-neutral-950 hover:bg-amber-400 active:scale-95 transition-all shadow-lg shadow-amber-500/5 w-full sm:w-auto justify-center"
        >
          <Plus className="h-4 w-4" />
          Add Custom Shortcut
        </button>

        <button
          onClick={handleImport}
          disabled={importing}
          className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-5 py-2.5 text-xs font-semibold text-neutral-300 hover:bg-neutral-900 active:scale-95 disabled:opacity-50 transition-all w-full sm:w-auto justify-center"
        >
          {importing ? (
            <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
          ) : (
            <Sparkles className="h-4 w-4 text-amber-400" />
          )}
          Load Starter Presets
        </button>
      </div>

      {/* Preset Preview Box */}
      <div className="w-full border border-neutral-800 bg-neutral-950/40 rounded-2xl p-5">
        <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 block mb-3.5 text-left">
          Includes starter templates for:
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {PRESET_PROGRAMS.map((program) => (
            <div
              key={program.name}
              className="flex items-center gap-2.5 rounded-xl border border-neutral-900 bg-neutral-900/20 p-2.5 text-left text-xs text-neutral-400"
            >
              <div className="h-6 w-6 rounded bg-neutral-800 overflow-hidden shrink-0">
                <img src={program.iconUrl} alt="" className="h-full w-full object-cover grayscale opacity-60" />
              </div>
              <span className="truncate font-medium">{program.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
