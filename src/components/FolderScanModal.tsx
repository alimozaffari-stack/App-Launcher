import React, { useState } from "react";
import { X, Loader2, CheckSquare, Square, Folder, AlertTriangle } from "lucide-react";
import { Shortcut } from "../types";

interface ScannedShortcut {
  name: string;
  execPath: string;
  description: string;
  category: string;
  tags: string[];
  iconUrl?: string;
  selected?: boolean;
}

interface FolderScanModalProps {
  categories: string[];
  onImportShortcuts: (shortcuts: Omit<Shortcut, "id" | "createdAt">[]) => Promise<void>;
  onClose: () => void;
}

export default function FolderScanModal({ categories, onImportShortcuts, onClose }: FolderScanModalProps) {
  const [folderPath, setFolderPath] = useState("%USERPROFILE%\\Desktop");
  const [loading, setLoading] = useState(false);
  const [scannedItems, setScannedItems] = useState<ScannedShortcut[]>([]);
  const [scanMessage, setScanMessage] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderPath.trim()) return;

    setLoading(true);
    setError("");
    setScanMessage("");
    setScannedItems([]);

    try {
      const response = await fetch("/api/scan-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderPath: folderPath.trim() }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to scan directory");
      }

      const data = await response.json();
      if (data.success) {
        const items = (data.shortcuts || []).map((item: any) => ({
          ...item,
          category: item.category || categories[0] || "Office",
          selected: true,
        }));
        setScannedItems(items);
        setScanMessage(
          items.length === 1
            ? "Found 1 launchable item."
            : `Found ${items.length} launchable items.`,
        );
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred during scan.");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelectAll = () => {
    const allSelected = scannedItems.every((item) => item.selected);
    setScannedItems(
      scannedItems.map((item) => ({ ...item, selected: !allSelected }))
    );
  };

  const toggleSelectItem = (index: number) => {
    setScannedItems(
      scannedItems.map((item, idx) =>
        idx === index ? { ...item, selected: !item.selected } : item
      )
    );
  };

  const handleCategoryChange = (index: number, cat: string) => {
    setScannedItems(
      scannedItems.map((item, idx) =>
        idx === index ? { ...item, category: cat } : item
      )
    );
  };

  const handleNameChange = (index: number, name: string) => {
    setScannedItems(
      scannedItems.map((item, idx) =>
        idx === index ? { ...item, name } : item
      )
    );
  };

  const handleImport = async () => {
    const selected = scannedItems.filter((item) => item.selected);
    if (selected.length === 0) return;

    setImporting(true);
    try {
      const shortcutsToImport = selected.map((item) => ({
        name: item.name,
        execPath: item.execPath,
        category: item.category,
        tags: item.tags,
        description: item.description,
        iconUrl: item.iconUrl,
      }));
      await onImportShortcuts(shortcutsToImport);
      onClose();
    } catch (err) {
      console.error("Bulk import failed:", err);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Folder className="h-5 w-5 text-amber-400" />
            <h2 className="text-sm font-bold text-white">Import Existing Desktop/Folder Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Input Form */}
        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <form onSubmit={handleScan} className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider block mb-1.5">
                Windows Folder Path / Shortcut Source
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  placeholder="e.g. C:\Users\Username\Desktop"
                  className="flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white placeholder-neutral-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all font-mono"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 disabled:opacity-50 text-xs font-bold text-neutral-950 px-5 py-2 transition-all"
                >
                  {loading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "Scan Folder"
                  )}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-[10px] text-neutral-400">
              <span className="font-semibold text-neutral-500">Quick suggestions:</span>
              <button
                type="button"
                onClick={() => setFolderPath("%USERPROFILE%\\Desktop")}
                className="hover:text-white underline font-mono"
              >
                Windows Desktop (personal + public)
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => setFolderPath("C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs")}
                className="hover:text-white underline font-mono"
              >
                Start Menu Programs
              </button>
            </div>
          </form>

          {/* Error message */}
          {error && (
            <div className="p-3 rounded-xl bg-red-950/20 border border-red-900/30 text-xs text-red-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          {/* Info message */}
          {scanMessage && (
            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-300">
              <p>{scanMessage}</p>
            </div>
          )}

          {/* Scan results list */}
          {scannedItems.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white font-medium"
                >
                  {scannedItems.every((item) => item.selected) ? (
                    <CheckSquare className="h-4 w-4 text-amber-500" />
                  ) : (
                    <Square className="h-4 w-4 text-neutral-600" />
                  )}
                  Select All
                </button>
                <span className="text-xs text-neutral-500 font-mono">
                  Found {scannedItems.length} shortcuts
                </span>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {scannedItems.map((item, index) => (
                  <div
                    key={index}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-3 transition-colors ${
                      item.selected
                        ? "border-amber-500/30 bg-neutral-950/60"
                        : "border-neutral-800 bg-neutral-950/20 opacity-55"
                    }`}
                  >
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleSelectItem(index)}
                        className="p-0.5 mt-0.5 text-neutral-400 hover:text-white"
                      >
                        {item.selected ? (
                          <CheckSquare className="h-4 w-4 text-amber-500" />
                        ) : (
                          <Square className="h-4 w-4 text-neutral-600" />
                        )}
                      </button>

                      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
                        {item.iconUrl ? (
                          <img
                            src={item.iconUrl}
                            alt=""
                            className="h-full w-full object-contain p-1"
                          />
                        ) : (
                          <Folder className="h-4 w-4 text-neutral-500" />
                        )}
                      </div>

                      <div className="space-y-1 flex-1 min-w-0">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => handleNameChange(index, e.target.value)}
                          className="bg-transparent text-xs font-semibold text-white focus:outline-none focus:border-b focus:border-amber-500/50 pb-0.5 w-full font-sans"
                        />
                        <div className="text-[10px] text-neutral-500 font-mono truncate" title={item.execPath}>
                          {item.execPath}
                        </div>
                      </div>
                    </div>

                    {/* Category assignment */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      <span className="text-[10px] text-neutral-400 font-semibold uppercase">Category:</span>
                      <select
                        value={item.category}
                        onChange={(e) => handleCategoryChange(index, e.target.value)}
                        className="rounded-lg bg-neutral-900 border border-neutral-800 px-2 py-1 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                      >
                        {categories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-neutral-800 bg-transparent px-4 py-2 text-xs font-semibold text-neutral-300 hover:bg-neutral-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing || !scannedItems.some((i) => i.selected)}
                  className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-5 py-2 text-xs font-bold text-neutral-950 hover:bg-amber-400 active:scale-95 disabled:opacity-50 transition-colors"
                >
                  {importing && <Loader2 className="h-3 w-3 animate-spin" />}
                  Import {scannedItems.filter((i) => i.selected).length} Selected
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
