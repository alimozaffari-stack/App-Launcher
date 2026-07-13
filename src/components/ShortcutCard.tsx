import React, { useState, useEffect } from "react";
import { Shortcut } from "../types";
import { Play, Edit2, Trash2, Copy, Download, ExternalLink, Tag, Terminal, Check, GripVertical, Folder, Star, BookmarkPlus, BookmarkMinus } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface ShortcutCardProps {
  key?: string;
  shortcut: Shortcut;
  onEdit: (shortcut: Shortcut) => void;
  onDelete: (id: string) => void | Promise<void>;
  onLaunch: (shortcut: Shortcut) => void | Promise<void>;
  onToggleFavorite?: (id: string) => void;
  onAddToWorkspace?: (id: string) => void;
  onRemoveFromWorkspace?: (id: string) => void;
  workspaceName?: string;
  isInWorkspace?: boolean;
  dndId?: string;
  viewMode?: "grid" | "list";
  sortMode?: "manual" | "alphabetical" | "date";
  isCompact?: boolean;
}

export default function ShortcutCard({ 
  shortcut, 
  onEdit, 
  onDelete, 
  onLaunch, 
  onToggleFavorite, 
  onAddToWorkspace,
  onRemoveFromWorkspace,
  workspaceName,
  isInWorkspace = false,
  dndId,
  viewMode = "grid", 
  sortMode = "manual",
  isCompact = false 
}: ShortcutCardProps) {
  const [copied, setCopied] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Close context menu on click elsewhere
  useEffect(() => {
    if (!contextMenu) return;
    const handleGlobalClick = () => setContextMenu(null);
    window.addEventListener("click", handleGlobalClick);
    window.addEventListener("resize", handleGlobalClick);
    return () => {
      window.removeEventListener("click", handleGlobalClick);
      window.removeEventListener("resize", handleGlobalClick);
    };
  }, [contextMenu]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: dndId || shortcut.id,
    disabled: isCompact,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (/["\r\n]/.test(shortcut.execPath)) {
      alert("This target contains characters that cannot be represented safely in a Windows command.");
      return;
    }
    const cmd = `start "" "${shortcut.execPath}"`;
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadBat = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (/["\r\n]/.test(shortcut.execPath)) {
      alert("This target contains characters that cannot be represented safely in a batch file.");
      return;
    }
    const content = `@echo off\nstart "" "${shortcut.execPath}"\nexit`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = shortcut.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
    a.href = url;
    a.download = `launch-${safeName}.bat`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const isUriProtocol = shortcut.execPath.includes("://");
  const isFolder = !isUriProtocol && !/\.[a-zA-Z0-9]{2,4}$/.test(shortcut.execPath.split(/[/\\]/).pop() || "");

  const renderContextMenu = () => {
    if (!contextMenu) return null;
    return (
      <>
        <div 
          className="fixed inset-0 z-[998] cursor-default"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setContextMenu(null);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setContextMenu(null);
          }}
        />
        <div 
          className="fixed z-[999] min-w-[170px] bg-neutral-900/95 border border-neutral-800 rounded-xl p-1 shadow-2xl shadow-black/95 flex flex-col gap-0.5 select-none text-[11px] text-neutral-300 backdrop-blur-md"
          style={{ 
            top: `${contextMenu.y}px`, 
            left: `${contextMenu.x}px` 
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2.5 py-1.5 border-b border-neutral-800 text-neutral-500 font-mono text-[9px] uppercase tracking-wider">
            {shortcut.name}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setContextMenu(null);
              onLaunch(shortcut);
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-amber-400 hover:bg-neutral-800/80 transition-all font-semibold text-left w-full"
          >
            <Play className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            Launch Program
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setContextMenu(null);
              onEdit(shortcut);
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-neutral-800/80 hover:text-white transition-all text-left w-full"
          >
            <Edit2 className="h-3.5 w-3.5 text-neutral-400" />
            Edit Details
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setContextMenu(null);
              onToggleFavorite?.(shortcut.id);
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-neutral-800/80 hover:text-white transition-all text-left w-full"
          >
            <Star className={`h-3.5 w-3.5 ${shortcut.isFavorite ? "fill-amber-400 text-amber-400" : "text-neutral-400"}`} />
            {shortcut.isFavorite ? "Remove Favorite" : "Add Favorite"}
          </button>
          {onAddToWorkspace && !isInWorkspace && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setContextMenu(null);
                onAddToWorkspace(shortcut.id);
              }}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-neutral-800/80 hover:text-white transition-all text-left w-full"
            >
              <BookmarkPlus className="h-3.5 w-3.5 text-amber-400" />
              Add to {workspaceName || "workspace"}
            </button>
          )}
          {onRemoveFromWorkspace && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setContextMenu(null);
                onRemoveFromWorkspace(shortcut.id);
              }}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-neutral-800/80 hover:text-white transition-all text-left w-full"
            >
              <BookmarkMinus className="h-3.5 w-3.5 text-amber-400" />
              Remove from {workspaceName || "workspace"}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setContextMenu(null);
              handleCopy(e);
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-neutral-800/80 hover:text-white transition-all text-left w-full"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-neutral-400" />}
            Copy Command
          </button>
          {!isUriProtocol && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setContextMenu(null);
                handleDownloadBat(e);
              }}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-neutral-800/80 hover:text-white transition-all text-left w-full"
            >
              <Download className="h-3.5 w-3.5 text-neutral-400" />
              Download .bat
            </button>
          )}
          <div className="h-[1px] bg-neutral-850 my-1" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              setContextMenu(null);
              onDelete(shortcut.id);
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-red-450 hover:bg-red-950/40 transition-all text-left w-full"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Shortcut
          </button>
        </div>
      </>
    );
  };

  if (viewMode === "list") {
    return (
      <>
        <motion.div
          ref={setNodeRef}
          style={style}
          layout
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: isDragging ? 0.5 : 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98 }}
          whileHover={isDragging ? undefined : { x: 3 }}
          transition={{ duration: 0.15 }}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY });
          }}
          className={`group relative flex items-center gap-2 overflow-hidden rounded-lg border border-neutral-850 bg-neutral-900/40 py-1.5 px-2.5 backdrop-blur-md transition-all hover:border-neutral-700 hover:bg-neutral-900/60 ${
            isDragging ? "border-amber-500/50 bg-neutral-900/90 shadow-2xl ring-1 ring-amber-500/20" : ""
          }`}
          id={`shortcut-card-${shortcut.id}`}
        >
          {/* Drag Handle */}
          <div
            {...attributes}
            {...listeners}
            className="flex items-center justify-center p-0.5 text-neutral-600 hover:text-amber-400 cursor-grab active:cursor-grabbing shrink-0 transition-colors"
            title={sortMode === "manual" ? "Drag to reorder or nominate" : "Drag to nominated workspace"}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </div>

          {/* Shortcut Icon (Clickable to Launch!) */}
          <div className="shrink-0">
            <div 
              onClick={() => onLaunch(shortcut)}
              className="relative shrink-0 cursor-pointer group/icon overflow-hidden rounded-md border border-neutral-800 bg-gradient-to-br from-neutral-800 to-neutral-950 flex h-8 w-8 items-center justify-center transition-all duration-200 hover:border-amber-500/50 hover:scale-105 active:scale-95 shadow-inner"
              title={`Click to Launch ${shortcut.name}`}
            >
              {shortcut.iconUrl ? (
                <img
                  src={shortcut.iconUrl}
                  alt={shortcut.name}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover transition-transform duration-200 group-hover/icon:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-neutral-400 group-hover/icon:text-amber-400 transition-colors">
                  {isFolder ? <Folder className="h-4 w-4 text-amber-500/80" /> : <Terminal className="h-3.5 w-3.5" />}
                </div>
              )}
              {/* Floating Play Overlay */}
              <div className="absolute inset-0 bg-neutral-950/40 opacity-0 group-hover/icon:opacity-100 flex items-center justify-center transition-opacity duration-150">
                <Play className="h-3 w-3 text-amber-400 fill-amber-400" />
              </div>
            </div>
          </div>

          {/* Content: Title & details */}
          <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="font-sans text-[11px] font-bold tracking-tight text-neutral-200 group-hover:text-white transition-colors break-words">
                  {shortcut.name}
                </h3>
                <span className="shrink-0 px-1 py-0.2 rounded bg-neutral-950 text-[8px] font-mono uppercase text-neutral-500 tracking-wider">
                  {shortcut.category}
                </span>
                {(shortcut.workspaceTags || []).length > 0 && (
                  <span className="shrink-0 px-1 py-0.2 rounded bg-amber-500/10 text-[8px] font-mono uppercase text-amber-400 tracking-wider">
                    {1 + (shortcut.workspaceTags || []).length} groups
                  </span>
                )}
              </div>
              {shortcut.description && (
                <p className="text-[9.5px] text-neutral-400 truncate mt-0.2 max-w-[180px]">
                  {shortcut.description}
                </p>
              )}
            </div>

            {/* Quick Actions & Launch */}
            <div className="flex items-center gap-1.5 shrink-0 justify-end">
              {onAddToWorkspace && !isInWorkspace && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddToWorkspace(shortcut.id);
                  }}
                  className="p-1 rounded text-neutral-500 hover:text-amber-400 hover:bg-neutral-800 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                  title={`Add to ${workspaceName || "nominated workspace"}`}
                >
                  <BookmarkPlus className="h-3 w-3" />
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite?.(shortcut.id);
                }}
                className={`p-1 rounded transition-all ${
                  shortcut.isFavorite
                    ? "text-amber-400 hover:scale-110"
                    : "text-neutral-500 hover:text-amber-400 opacity-0 group-hover:opacity-100"
                }`}
                title={shortcut.isFavorite ? "Remove from Favourites" : "Add to Favourites"}
              >
                <Star className={`h-3 w-3 ${shortcut.isFavorite ? "fill-amber-400 text-amber-400" : ""}`} />
              </button>

              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onEdit(shortcut)}
                  className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all"
                  title="Edit Shortcut"
                >
                  <Edit2 className="h-2.5 w-2.5" />
                </button>
                <button
                  onClick={handleCopy}
                  className="p-1 rounded text-neutral-400 hover:text-amber-400 hover:bg-neutral-800 transition-all"
                  title="Copy Windows Launch Command"
                >
                  {copied ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : <Copy className="h-2.5 w-2.5" />}
                </button>
                <button
                  onClick={() => onDelete(shortcut.id)}
                  className="p-1 rounded text-neutral-400 hover:text-red-400 hover:bg-red-950/30 transition-all"
                  title="Delete Shortcut"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
        {renderContextMenu()}
      </>
    );
  }



  if (isCompact) {
    return (
      <>
        <motion.div
          ref={setNodeRef}
          style={style}
          layout
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: isDragging ? 0.5 : 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          whileHover={isDragging ? undefined : { y: -2, scale: 1.015 }}
          transition={{ duration: 0.15 }}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY });
          }}
          className={`group relative flex flex-col justify-center overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/40 p-2.5 backdrop-blur-md transition-all hover:border-neutral-700/80 hover:bg-neutral-900/70 hover:shadow-md ${
            isDragging ? "border-amber-500/50 bg-neutral-900/90 shadow-2xl" : ""
          }`}
          id={`shortcut-card-compact-${shortcut.id}`}
        >
          {/* Action overlay inside card - visible on hover or if favorited */}
          <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5">
            {onRemoveFromWorkspace && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveFromWorkspace(shortcut.id);
                }}
                className="p-1 rounded text-neutral-500 hover:text-amber-400 hover:bg-neutral-800 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                title={`Remove from ${workspaceName || "nominated workspace"}`}
              >
                <BookmarkMinus className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite?.(shortcut.id);
              }}
              className={`p-1 rounded transition-all ${
                shortcut.isFavorite
                  ? "text-amber-400 hover:scale-110 opacity-100"
                  : "text-neutral-500 hover:text-amber-400 opacity-0 group-hover:opacity-100"
              }`}
              title={shortcut.isFavorite ? "Remove from Favourites" : "Add to Favourites"}
            >
              <Star className={`h-3 w-3 ${shortcut.isFavorite ? "fill-amber-400 text-amber-400" : ""}`} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(shortcut);
              }}
              className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all opacity-0 group-hover:opacity-100"
              title="Edit Shortcut"
            >
              <Edit2 className="h-2.5 w-2.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(shortcut.id);
              }}
              className="p-1 rounded text-neutral-400 hover:text-red-400 hover:bg-red-950/30 transition-all opacity-0 group-hover:opacity-100"
              title="Delete Shortcut"
            >
              <Trash2 className="h-2.5 w-2.5" />
            </button>
          </div>

          {/* Compact Click-to-Launch Body */}
          <div 
            onClick={() => onLaunch(shortcut)}
            className="flex items-center gap-2.5 flex-1 cursor-pointer select-none"
          >
            {/* Icon */}
            <div className="shrink-0">
              <div className="relative overflow-hidden rounded-lg border border-neutral-850 bg-gradient-to-br from-neutral-800 to-neutral-950 flex h-9 w-9 items-center justify-center transition-all duration-200 hover:border-amber-500/30 shadow-inner">
                {shortcut.iconUrl ? (
                  <img
                    src={shortcut.iconUrl}
                    alt={shortcut.name}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-neutral-400">
                    {isFolder ? <Folder className="h-4.5 w-4.5 text-amber-500/80" /> : <Terminal className="h-3.5 w-3.5" />}
                  </div>
                )}
                {/* Overlay Play Indicator */}
                <div className="absolute inset-0 bg-neutral-950/40 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity duration-150">
                  <Play className="h-3 w-3 text-amber-400 fill-amber-400" />
                </div>
              </div>
            </div>

            {/* Title and Category */}
            <div className="min-w-0 flex-1 pr-6 group-hover:pr-14 transition-all duration-150">
              <h3 className="font-sans text-[11px] font-bold tracking-tight text-neutral-200 group-hover:text-white transition-colors leading-snug truncate" title={shortcut.name}>
                {shortcut.name}
              </h3>
              <span className="inline-block mt-0.5 text-[8px] font-mono uppercase tracking-wider text-neutral-500 bg-neutral-950/60 px-1 py-0.2 rounded">
                {shortcut.category}
              </span>
            </div>
          </div>
        </motion.div>
        {renderContextMenu()}
      </>
    );
  }

  return (
    <>
      <motion.div
        ref={setNodeRef}
        style={style}
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: isDragging ? 0.5 : 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        whileHover={isDragging ? undefined : { y: -3 }}
        transition={{ duration: 0.2 }}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY });
        }}
        className={`group relative flex flex-col justify-between overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/50 p-3 backdrop-blur-md transition-all hover:border-neutral-700 hover:bg-neutral-900/85 hover:shadow-lg ${
          isDragging ? "border-amber-500/50 bg-neutral-900/90 shadow-2xl shadow-amber-500/5 ring-1 ring-amber-500/20" : ""
        }`}
        id={`shortcut-card-${shortcut.id}`}
      >
        {/* Top Controls Header */}
        <div className="flex items-center justify-between gap-1 text-neutral-500 h-5 shrink-0 select-none">
          <div
            {...attributes}
            {...listeners}
            className="flex items-center justify-center p-0.5 text-neutral-600 hover:text-amber-400 cursor-grab active:cursor-grabbing transition-colors shrink-0"
            title={sortMode === "manual" ? "Drag to reorder or nominate" : "Drag to nominated workspace"}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {onAddToWorkspace && !isInWorkspace && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToWorkspace(shortcut.id);
                }}
                className="p-1 rounded text-neutral-500 hover:text-amber-400 opacity-0 group-hover:opacity-100 focus:opacity-100"
                title={`Add to ${workspaceName || "nominated workspace"}`}
              >
                <BookmarkPlus className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite?.(shortcut.id);
              }}
              className={`p-1 rounded transition-all ${
                shortcut.isFavorite
                  ? "text-amber-400 hover:scale-110 opacity-100 animate-pulse"
                  : "text-neutral-500 hover:text-amber-400 opacity-0 group-hover:opacity-100"
              }`}
              title={shortcut.isFavorite ? "Remove from Favourites" : "Add to Favourites"}
            >
              <Star className={`h-3 w-3 ${shortcut.isFavorite ? "fill-amber-400 text-amber-400" : ""}`} />
            </button>

            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onEdit(shortcut)}
                className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all"
                title="Edit Shortcut"
                id={`btn-edit-${shortcut.id}`}
              >
                <Edit2 className="h-2.5 w-2.5" />
              </button>
              <button
                onClick={() => onDelete(shortcut.id)}
                className="p-1 rounded text-neutral-400 hover:text-red-400 hover:bg-red-950/30 transition-all"
                title="Delete Shortcut"
                id={`btn-delete-${shortcut.id}`}
              >
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Main compact vertical layout */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-0 mt-1">
          {/* Icon/Thumbnail placed above the title - Clicking it launches! */}
          <div className="shrink-0">
            <div 
              onClick={() => onLaunch(shortcut)}
              className="relative shrink-0 cursor-pointer group/icon overflow-hidden rounded-xl border border-neutral-800 bg-gradient-to-br from-neutral-800 to-neutral-950 flex h-11 w-11 items-center justify-center transition-all duration-200 hover:border-amber-500/50 hover:scale-105 active:scale-95 shadow-inner"
              title={`Click to Launch ${shortcut.name}`}
            >
              {shortcut.iconUrl ? (
                <img
                  src={shortcut.iconUrl}
                  alt={shortcut.name}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover transition-transform duration-200 group-hover/icon:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-neutral-400 group-hover/icon:text-amber-400 transition-colors">
                  {isFolder ? <Folder className="h-5 w-5 text-amber-500/80" /> : <Terminal className="h-3.5 w-3.5" />}
                </div>
              )}
              {/* Floating Play Overlay */}
              <div className="absolute inset-0 bg-neutral-950/45 opacity-0 group-hover/icon:opacity-100 flex items-center justify-center transition-opacity duration-150 rounded-xl">
                <Play className="h-4.5 w-4.5 text-amber-400 fill-amber-400 drop-shadow-md" />
              </div>
            </div>
          </div>

          {/* Title and Category (with line wrap!) */}
          <div className="min-w-0">
            <h3 className="font-sans text-[11.5px] font-bold tracking-tight text-neutral-100 group-hover:text-white transition-colors leading-snug break-words">
              {shortcut.name}
            </h3>
            <span className="inline-block mt-0.5 text-[8.5px] font-mono uppercase tracking-wider text-neutral-500 bg-neutral-950 px-1 py-0.2 rounded">
              {shortcut.category}
            </span>
          </div>

          {/* Explanations (Description) */}
          <div className="min-h-[1.5rem]">
            {shortcut.description ? (
              <p className="text-[10px] text-neutral-400 line-clamp-2 leading-snug">
                {shortcut.description}
              </p>
            ) : (
              <p className="text-[10px] text-neutral-500 italic leading-snug">
                No description.
              </p>
            )}
          </div>

          {/* Tags */}
          {((shortcut.workspaceTags || []).length > 0 || (shortcut.tags && shortcut.tags.length > 0)) && (
            <div className="flex flex-wrap gap-1">
              {(shortcut.workspaceTags || []).slice(0, 2).map((workspace) => (
                <span
                  key={`workspace-${workspace}`}
                  className="inline-flex items-center gap-0.5 rounded border border-amber-500/15 bg-amber-500/10 px-1 py-0.2 text-[8px] font-medium text-amber-400"
                  title={`Additional group: ${workspace}`}
                >
                  <BookmarkPlus className="h-2 w-2" />
                  {workspace}
                </span>
              ))}
              {(shortcut.tags || []).slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-0.5 rounded bg-neutral-950 px-1 py-0.2 text-[8px] font-medium text-neutral-400 border border-neutral-900"
                >
                  <Tag className="h-2 w-2 text-neutral-500" />
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Action/Launcher Command details under title layout */}
        <div className="border-t border-neutral-850 pt-2 mt-2 select-none">
          {/* Web/Command Fallbacks */}
          <div className="flex items-center justify-between gap-1 text-[8.5px] text-neutral-500 px-0.5">
            <span className="truncate max-w-[85px] font-mono text-[7.5px]" title={shortcut.execPath}>
              {shortcut.execPath}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {isUriProtocol ? (
                <a
                  href={shortcut.execPath}
                  target="_blank"
                  rel="noreferrer"
                  className="p-0.5 rounded text-neutral-400 hover:text-amber-400 transition-colors"
                  title="Open protocol link directly"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              ) : null}
              <button
                onClick={handleCopy}
                className="p-0.5 rounded text-neutral-400 hover:text-amber-400 transition-colors"
                title="Copy Windows Launch Command"
              >
                {copied ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : <Copy className="h-2.5 w-2.5" />}
              </button>
              {!isUriProtocol && (
                <button
                  onClick={handleDownloadBat}
                  className="p-0.5 rounded text-neutral-400 hover:text-amber-400 transition-colors"
                  title="Download .bat runner"
                >
                  <Download className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
      {renderContextMenu()}
    </>
  );
}
