import React, { useState } from "react";
import { Shortcut } from "../types";
import { Play, Edit2, Trash2, Copy, Download, ExternalLink, Tag, Terminal, Check, GripVertical } from "lucide-react";
import { motion } from "motion/react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface ShortcutCardProps {
  key?: string;
  shortcut: Shortcut;
  onEdit: (shortcut: Shortcut) => void;
  onDelete: (id: string) => void | Promise<void>;
  onLaunch: (shortcut: Shortcut) => void | Promise<void>;
  viewMode?: "grid" | "list";
}

export default function ShortcutCard({ shortcut, onEdit, onDelete, onLaunch, viewMode = "grid" }: ShortcutCardProps) {
  const [copied, setCopied] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: shortcut.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const cmd = `start "" "${shortcut.execPath}"`;
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadBat = (e: React.MouseEvent) => {
    e.stopPropagation();
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

  if (viewMode === "list") {
    return (
      <motion.div
        ref={setNodeRef}
        style={style}
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: isDragging ? 0.5 : 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98 }}
        whileHover={isDragging ? undefined : { x: 4 }}
        transition={{ duration: 0.2 }}
        className={`group relative flex items-center gap-3 overflow-hidden rounded-xl border border-neutral-850 bg-neutral-900/40 py-2.5 px-4 backdrop-blur-md transition-all hover:border-neutral-700 hover:bg-neutral-900/60 ${
          isDragging ? "border-amber-500/50 bg-neutral-900/90 shadow-2xl ring-1 ring-amber-500/20" : ""
        }`}
        id={`shortcut-card-${shortcut.id}`}
      >
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="flex items-center justify-center p-1 text-neutral-600 hover:text-amber-400 cursor-grab active:cursor-grabbing shrink-0 transition-colors"
          title="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </div>

        {/* Shortcut Icon */}
        <div className="shrink-0">
          {shortcut.iconUrl ? (
            <img
              src={shortcut.iconUrl}
              alt={shortcut.name}
              referrerPolicy="no-referrer"
              className="h-9 w-9 rounded-lg object-cover border border-neutral-800 shadow-inner"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-neutral-800 to-neutral-950 border border-neutral-850 text-neutral-400 group-hover:text-amber-400 transition-colors">
              <Terminal className="h-4 w-4" />
            </div>
          )}
        </div>

        {/* Content: Title & details */}
        <div className="flex-1 min-w-0 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-sans text-xs font-semibold tracking-tight text-neutral-200 group-hover:text-white transition-colors truncate">
                {shortcut.name}
              </h3>
              <span className="shrink-0 px-1.5 py-0.5 rounded bg-neutral-950 text-[9px] font-mono uppercase text-neutral-500 tracking-wider">
                {shortcut.category}
              </span>
            </div>
            {shortcut.description && (
              <p className="text-[11px] text-neutral-400 truncate mt-0.5 max-w-xl">
                {shortcut.description}
              </p>
            )}
          </div>

          {/* Path & Tags (MD-Up) */}
          <div className="hidden lg:flex items-center gap-4 text-neutral-500 shrink-0">
            <span className="text-[10px] font-mono truncate max-w-[150px]" title={shortcut.execPath}>
              {shortcut.execPath}
            </span>
            {shortcut.tags && shortcut.tags.length > 0 && (
              <div className="flex gap-1">
                {shortcut.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-0.5 rounded bg-neutral-950 px-1.5 py-0.5 text-[9px] text-neutral-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions & Launch */}
          <div className="flex items-center gap-2 shrink-0 justify-end">
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onEdit(shortcut)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all"
                title="Edit Shortcut"
              >
                <Edit2 className="h-3 w-3" />
              </button>
              <button
                onClick={handleCopy}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-amber-400 hover:bg-neutral-800 transition-all"
                title="Copy Windows Launch Command"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              </button>
              <button
                onClick={() => onDelete(shortcut.id)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-red-950/30 transition-all"
                title="Delete Shortcut"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>

            <button
              onClick={() => onLaunch(shortcut)}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-neutral-950 shadow-md hover:bg-amber-400 transition-all active:scale-95 font-sans"
            >
              <Play className="h-3 w-3 fill-current" />
              Launch
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: isDragging ? 0.5 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={isDragging ? undefined : { y: -4 }}
      transition={{ duration: 0.25 }}
      className={`group relative flex items-stretch gap-2.5 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 backdrop-blur-md transition-colors hover:border-neutral-700 hover:bg-neutral-900/80 ${
        isDragging ? "border-amber-500/50 bg-neutral-900/90 shadow-2xl shadow-amber-500/5 ring-1 ring-amber-500/20" : ""
      }`}
      id={`shortcut-card-${shortcut.id}`}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-center px-1 text-neutral-600 hover:text-amber-400 cursor-grab active:cursor-grabbing shrink-0 transition-colors"
        title="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Main Card Content */}
      <div className="flex-1 flex flex-col justify-between min-w-0">
        <div>
          {/* Card Header & Icon */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              {shortcut.iconUrl ? (
                <img
                  src={shortcut.iconUrl}
                  alt={shortcut.name}
                  referrerPolicy="no-referrer"
                  className="h-12 w-12 rounded-xl object-cover border border-neutral-700/50 shadow-inner shrink-0"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-neutral-800 to-neutral-950 border border-neutral-800 text-neutral-400 group-hover:text-amber-400 group-hover:border-amber-500/30 transition-colors">
                  <Terminal className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0">
                <h3 className="font-sans text-sm font-semibold tracking-tight text-neutral-100 group-hover:text-white transition-colors truncate">
                  {shortcut.name}
                </h3>
                <span className="inline-block mt-0.5 text-[10px] font-mono uppercase tracking-wider text-neutral-500">
                  {shortcut.category}
                </span>
              </div>
            </div>

            {/* Quick Controls */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                onClick={() => onEdit(shortcut)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all"
                title="Edit Shortcut"
                id={`btn-edit-${shortcut.id}`}
              >
                <Edit2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onDelete(shortcut.id)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-red-950/30 transition-all"
                title="Delete Shortcut"
                id={`btn-delete-${shortcut.id}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Description */}
          {shortcut.description ? (
            <p className="text-xs text-neutral-400 line-clamp-2 min-h-[2rem] leading-relaxed mb-4">
              {shortcut.description}
            </p>
          ) : (
            <p className="text-xs text-neutral-500 italic min-h-[2rem] mb-4">
              No description provided.
            </p>
          )}

          {/* Tags */}
          {shortcut.tags && shortcut.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-5">
              {shortcut.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-0.5 rounded-md bg-neutral-950/80 px-2 py-0.5 text-[10px] font-medium text-neutral-400 border border-neutral-900"
                >
                  <Tag className="h-2 w-2 text-neutral-500" />
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Launcher Section */}
        <div className="border-t border-neutral-800/60 pt-4 mt-auto">
          <div className="flex flex-col gap-2">
            {/* Main Launch Button */}
            <button
              onClick={() => onLaunch(shortcut)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-xs font-semibold text-neutral-950 shadow-md transition-all hover:from-amber-400 hover:to-amber-500 hover:shadow-amber-500/10 active:scale-[0.98]"
              id={`btn-launch-${shortcut.id}`}
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              Launch Program
            </button>

            {/* Web / Command fallbacks */}
            <div className="flex items-center justify-between gap-1 text-[11px] text-neutral-500 px-1 mt-1">
              <span className="truncate max-w-[120px] font-mono text-[9px]" title={shortcut.execPath}>
                {shortcut.execPath}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                {isUriProtocol ? (
                  <a
                    href={shortcut.execPath}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 rounded text-neutral-400 hover:text-amber-400 hover:bg-neutral-800/50 transition-colors"
                    title="Open protocol link directly"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
                <button
                  onClick={handleCopy}
                  className="p-1 rounded text-neutral-400 hover:text-amber-400 hover:bg-neutral-800/50 transition-colors"
                  title="Copy Windows Launch Command"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </button>
                {!isUriProtocol && (
                  <button
                    onClick={handleDownloadBat}
                    className="p-1 rounded text-neutral-400 hover:text-amber-400 hover:bg-neutral-800/50 transition-colors"
                    title="Download .bat runner"
                  >
                    <Download className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
