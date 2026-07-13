import React, { useState, useEffect } from "react";
import { Shortcut } from "../types";
import { X, Sparkles, Loader2, Image as ImageIcon, Plus, Check } from "lucide-react";

interface ShortcutFormProps {
  initialShortcut?: Shortcut | null;
  categories: string[];
  onAddCategory: (category: string) => Promise<string>;
  onDeleteCategory?: (category: string) => void;
  onSave: (shortcut: Omit<Shortcut, "id" | "createdAt"> & { id?: string }) => Promise<void>;
  onClose: () => void;
  isEdit?: boolean;
}

export default function ShortcutForm({
  initialShortcut,
  categories,
  onAddCategory,
  onDeleteCategory,
  onSave,
  onClose,
  isEdit = false,
}: ShortcutFormProps) {
  const [name, setName] = useState("");
  const [execPath, setExecPath] = useState("");
  const [category, setCategory] = useState("Office");
  const [tagsInput, setTagsInput] = useState("");
  const [description, setDescription] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState("");
  const [extractingIcon, setExtractingIcon] = useState(false);
  const [extractIconError, setExtractIconError] = useState("");

  // Custom category addition inline
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [addingCat, setAddingCat] = useState(false);

  // Load initial data if editing
  useEffect(() => {
    if (initialShortcut) {
      setName(initialShortcut.name);
      setExecPath(initialShortcut.execPath);
      setCategory(initialShortcut.category);
      setTagsInput(initialShortcut.tags.join(", "));
      setDescription(initialShortcut.description || "");
      setIconUrl(initialShortcut.iconUrl || "");
    } else if (categories.length > 0) {
      // Pick first available category as default
      const defaultCat = categories.includes("Office") ? "Office" : categories[0];
      setCategory(defaultCat);
    }
  }, [initialShortcut, categories]);

  // Handle local image upload to base64
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          setIconUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Helper to extract icon from path
  const handleExtractIcon = async (targetPath?: string) => {
    const pathValue = targetPath || execPath.trim();
    if (!pathValue) {
      setExtractIconError("Please enter an executable path first.");
      return;
    }
    setExtractingIcon(true);
    setExtractIconError("");
    try {
      const response = await fetch("/api/extract-icon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ execPath: pathValue }),
      });
      if (!response.ok) {
        throw new Error("Failed to extract icon from path.");
      }
      const data = await response.json();
      if (data.success && data.iconUrl) {
        setIconUrl(data.iconUrl);
      } else {
        throw new Error(data.error || "Icon extraction returned no data.");
      }
    } catch (err: any) {
      console.error(err);
      setExtractIconError(err.message || "Failed to extract icon from the specified path.");
    } finally {
      setExtractingIcon(false);
    }
  };

  // Call backend Gemini suggest API
  const handleAiSuggest = async () => {
    if (!name.trim()) {
      setSuggestError("Please enter a program name first to get recommendations.");
      return;
    }

    setSuggesting(true);
    setSuggestError("");

    try {
      const response = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        throw new Error("Failed to get suggestion from backend server");
      }

      const data = await response.json();
      if (data.category) {
        // Look for existing category matching suggest
        let matchedCat = categories.find(
          (c) => c.toLowerCase() === data.category.toLowerCase()
        );
        if (!matchedCat) {
          // Auto add the category suggested if not exists
          matchedCat = await onAddCategory(data.category);
        }
        setCategory(matchedCat);
      }
      if (data.tags && Array.isArray(data.tags)) {
        setTagsInput(data.tags.join(", "));
      }
      if (data.description) {
        setDescription(data.description);
      }

      // If they have an executable path entered but no icon, auto-trigger icon extraction as a bonus!
      if (execPath.trim() && !iconUrl) {
        handleExtractIcon(execPath.trim());
      }
    } catch (err: any) {
      console.error(err);
      setSuggestError(err.message || "Failed to contact Gemini API. Please make sure GEMINI_API_KEY is configured.");
    } finally {
      setSuggesting(false);
    }
  };

  const handleAddNewCategoryInline = async () => {
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    
    setAddingCat(true);
    try {
      const addedName = await onAddCategory(trimmed);
      setCategory(addedName);
      setNewCatName("");
      setShowNewCatInput(false);
    } catch (err) {
      console.error("Error adding category inline:", err);
    } finally {
      setAddingCat(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !execPath.trim()) return;

    setLoading(true);
    const parsedTags = tagsInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    try {
      await onSave({
        id: initialShortcut?.id,
        name: name.trim(),
        execPath: execPath.trim(),
        category,
        tags: parsedTags,
        description: description.trim(),
        iconUrl: iconUrl || undefined,
      });
      onClose();
    } catch (error) {
      console.error("Error saving shortcut:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <h2 className="text-sm font-bold text-white">
            {isEdit ? "Edit Program Shortcut" : "Add Program Shortcut"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
          {/* Program Name with AI recommendation */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider">Program / Game Name</label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Cyberpunk 2077, Blender, Slack"
                className="flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white placeholder-neutral-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all"
              />
              <button
                type="button"
                onClick={handleAiSuggest}
                disabled={suggesting}
                className="flex items-center gap-1.5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 active:scale-95 disabled:opacity-50 transition-all"
              >
                {suggesting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                Auto-Suggest
              </button>
            </div>
            {suggestError && (
              <p className="text-[10px] text-red-400 font-medium">{suggestError}</p>
            )}
          </div>

          {/* Executable Path or URI */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider">Target Path (Executable / Folder / URI)</label>
            <input
              type="text"
              required
              value={execPath}
              onChange={(e) => setExecPath(e.target.value)}
              placeholder="e.g. C:\Users\YourName\Projects\MyProject, C:\Program Files\Game.exe, steam://run/1091500"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white placeholder-neutral-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all"
            />
            <p className="text-[10px] text-neutral-500 leading-normal">
              Enter the full Windows path (to a folder directory or executable file), website URL, or custom launcher protocol.
            </p>
          </div>

          {/* Group Category */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider">Group Category</label>
              <button
                type="button"
                onClick={() => setShowNewCatInput(!showNewCatInput)}
                className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1"
              >
                <Plus className="h-3 w-3" />
                Add Category
              </button>
            </div>

            {/* Inline New Category Add Input */}
            {showNewCatInput && (
              <div className="flex gap-2 p-2 rounded-xl bg-neutral-950 border border-neutral-800 animate-in slide-in-from-top-1 duration-150">
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="New category name (e.g. Design, Work)"
                  className="flex-1 bg-transparent border-none text-xs text-white focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddNewCategoryInline();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddNewCategoryInline}
                  disabled={addingCat}
                  className="rounded-lg bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-neutral-950 hover:bg-amber-400"
                >
                  {addingCat ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                </button>
              </div>
            )}

            <div className="grid grid-cols-3 gap-1.5">
              {categories.map((cat) => (
                <div key={cat} className="relative group/cat shrink-0">
                  <button
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`w-full rounded-xl py-2 px-1 text-[10px] font-semibold border transition-all ${
                      category === cat
                        ? "border-amber-500 bg-amber-500/15 text-amber-400 font-bold"
                        : "border-neutral-850 bg-neutral-950 text-neutral-400 hover:border-neutral-700 hover:text-white"
                    }`}
                  >
                    {cat}
                  </button>
                  {onDeleteCategory && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteCategory(cat);
                        // If selected category was deleted, fallback to another
                        if (category === cat) {
                          const remaining = categories.filter((c) => c !== cat);
                          if (remaining.length > 0) {
                            setCategory(remaining[0]);
                          }
                        }
                      }}
                      className="absolute -top-1 -right-1 opacity-0 group-hover/cat:opacity-100 focus:opacity-100 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-600/95 text-white hover:bg-red-500 shadow transition-opacity duration-150"
                      title={`Delete ${cat} category`}
                    >
                      <X className="h-1.5 w-1.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider">Tags / Keywords (comma separated)</label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. sci-fi, design, edit, social"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white placeholder-neutral-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider">Description / Launch Notes (Optional)</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short note to help you remember its specific features or configuration."
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white placeholder-neutral-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all resize-none"
            />
          </div>

          {/* Icon Upload / Select */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider">Program Icon / Thumbnail</label>
            <div className="flex items-center gap-4">
              <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-neutral-950 border border-neutral-800 overflow-hidden">
                {iconUrl ? (
                  <img src={iconUrl} alt="Preview" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-neutral-500" />
                )}
              </div>
              <div className="flex-1">
                <input
                  type="file"
                  id="image-file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <div className="flex flex-wrap gap-2">
                  <label
                    htmlFor="image-file"
                    className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-900 active:scale-95 transition-all"
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    Upload Shortcut Icon
                  </label>
                  <button
                    type="button"
                    onClick={() => handleExtractIcon()}
                    disabled={extractingIcon || !execPath.trim()}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-2 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 active:scale-95 disabled:opacity-50 transition-all"
                    title="Attempt fetching the icon from the executable path"
                  >
                    {extractingIcon ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    Extract Path Icon
                  </button>
                </div>
                {extractIconError && (
                  <p className="text-[10px] text-red-400 mt-1 font-medium">{extractIconError}</p>
                )}
                {iconUrl && (
                  <button
                    type="button"
                    onClick={() => setIconUrl("")}
                    className="ml-3 text-[10px] text-red-400 hover:underline font-medium"
                  >
                    Remove Icon
                  </button>
                )}
                <p className="text-[10px] text-neutral-500 mt-1 leading-normal">
                  Upload any image or keep blank to auto-use standard Fallback.
                </p>
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-neutral-800 bg-transparent px-4 py-2 text-xs font-semibold text-neutral-300 hover:bg-neutral-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-neutral-950 hover:bg-amber-400 active:scale-95 disabled:opacity-50 transition-colors"
            >
              {loading && <Loader2 className="h-3 w-3 animate-spin" />}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
