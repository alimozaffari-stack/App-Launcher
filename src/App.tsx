import React, { useState, useEffect } from "react";
import { Shortcut } from "./types";
import {
  Play,
  Plus,
  Search,
  Sparkles,
  Layers,
  Tag,
  Loader2,
  Terminal,
  HelpCircle,
  X,
  Copy,
  Download,
  Check,
  ExternalLink,
  Laptop,
  FolderPlus,
  Cpu,
  Trash2,
  LayoutGrid,
  List
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import ShortcutCard from "./components/ShortcutCard";
import ShortcutForm from "./components/ShortcutForm";
import EmptyState from "./components/EmptyState";
import FolderScanModal from "./components/FolderScanModal";

interface CategoryDoc {
  id: string;
  name: string;
}

export default function App() {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [categories, setCategories] = useState<CategoryDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  
  // View mode (grid or list)
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    const saved = localStorage.getItem("launcher_view_mode");
    return (saved === "grid" || saved === "list") ? saved : "grid";
  });
  
  // UI States
  const [showForm, setShowForm] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [editingShortcut, setEditingShortcut] = useState<Shortcut | null>(null);
  const [launchingShortcut, setLaunchingShortcut] = useState<Shortcut | null>(null);
  
  // Launching Modal status
  const [launchStatus, setLaunchStatus] = useState<"connecting" | "success" | "fallback" | "connecting_local">("connecting");
  const [launchError, setLaunchError] = useState("");
  const [copiedCmd, setCopiedCmd] = useState(false);

  // PWA and File Drag states
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Listen for PWA Install Prompt
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      console.log("PWA Installation accepted by the user");
    }
    setDeferredPrompt(null);
  };

  // Drag-and-drop file import handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer && e.dataTransfer.types.includes("Files")) {
      setIsDraggingFile(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Set dragging false only when we exit the screen bounds
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setIsDraggingFile(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Convert dropped files into shortcuts
    const newShortcutsList = files.map((file: File) => {
      let baseName = file.name;
      const dotIndex = baseName.lastIndexOf(".");
      const ext = dotIndex !== -1 ? baseName.substring(dotIndex + 1).toLowerCase() : "";
      if (dotIndex !== -1) {
        baseName = baseName.substring(0, dotIndex);
      }

      const prettifiedName = baseName
        .replace(/[-_.]/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());

      let suggestedPath = "";
      if (ext === "exe") {
        if (baseName.toLowerCase() === "chrome") {
          suggestedPath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
        } else if (baseName.toLowerCase() === "firefox") {
          suggestedPath = "C:\\Program Files\\Mozilla Firefox\\firefox.exe";
        } else if (baseName.toLowerCase() === "notepad") {
          suggestedPath = "C:\\Windows\\System32\\notepad.exe";
        } else if (baseName.toLowerCase() === "cmd") {
          suggestedPath = "C:\\Windows\\System32\\cmd.exe";
        } else {
          suggestedPath = `C:\\Program Files\\${prettifiedName}\\${file.name}`;
        }
      } else if (ext === "lnk" || ext === "url") {
        suggestedPath = `%USERPROFILE%\\Desktop\\${file.name}`;
      } else {
        suggestedPath = `C:\\Path\\To\\${file.name}`;
      }

      let cat = selectedCategory !== "All" ? selectedCategory : "Others";
      const hasCat = categories.some((c) => c.name === cat);
      if (!hasCat) {
        cat = "Others";
      }

      const tags = ["Imported"];
      if (ext) tags.push(ext.toUpperCase());

      return {
        name: prettifiedName,
        execPath: suggestedPath,
        category: cat,
        tags,
        description: `Dropped & imported local file (${file.name}).`,
      };
    });

    if (newShortcutsList.length === 1) {
      const firstItem = newShortcutsList[0];
      
      let extractedIconUrl: string | undefined = undefined;
      try {
        const response = await fetch("/api/extract-icon", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ execPath: firstItem.execPath }),
        });
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.iconUrl) {
            extractedIconUrl = data.iconUrl;
          }
        }
      } catch (err) {
        console.warn("Auto extraction on drop failed (expected on cloud sandbox):", err);
      }

      const newShortcut: Shortcut = {
        id: `sc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: firstItem.name,
        execPath: firstItem.execPath,
        category: firstItem.category,
        tags: firstItem.tags,
        description: firstItem.description,
        iconUrl: extractedIconUrl,
        createdAt: Date.now(),
      };
      setEditingShortcut(newShortcut);
      setShowForm(true);
    } else {
      const createdItems = newShortcutsList.map((item) => ({
        ...item,
        id: `sc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        createdAt: Date.now(),
      })) as Shortcut[];
      
      const updatedShortcuts = [...shortcuts, ...createdItems];
      setShortcuts(updatedShortcuts);
      localStorage.setItem("launcher_shortcuts", JSON.stringify(updatedShortcuts));
      alert(`Imported ${createdItems.length} shortcuts into the "${createdItems[0].category}" group!`);
    }
  };

  // Load shortcuts and categories from localStorage on mount
  useEffect(() => {
    // 1. Categories
    const storedCats = localStorage.getItem("launcher_categories");
    let currentCats: CategoryDoc[] = [];
    if (storedCats) {
      try {
        currentCats = JSON.parse(storedCats);
      } catch (e) {
        console.error("Error parsing stored categories:", e);
      }
    }
    if (currentCats.length === 0) {
      const defaults = ["Office", "AI", "Research", "Photography", "Books", "Gaming", "Others"];
      currentCats = defaults.map((name, i) => ({ id: `cat-${Date.now()}-${i}`, name }));
      localStorage.setItem("launcher_categories", JSON.stringify(currentCats));
    }
    setCategories(currentCats);

    // 2. Shortcuts
    const storedShortcuts = localStorage.getItem("launcher_shortcuts");
    let currentShortcuts: Shortcut[] = [];
    if (storedShortcuts) {
      try {
        currentShortcuts = JSON.parse(storedShortcuts);
      } catch (e) {
        console.error("Error parsing stored shortcuts:", e);
      }
    }
    // Sort loaded shortcuts by order if it exists, fallback to createdAt descending
    currentShortcuts.sort((a, b) => {
      const aOrder = a.order !== undefined ? a.order : 999999;
      const bOrder = b.order !== undefined ? b.order : 999999;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      return b.createdAt - a.createdAt;
    });

    setShortcuts(currentShortcuts);
    setLoading(false);
  }, []);

  // Save shortcut (Add / Update)
  const handleSaveShortcut = async (
    data: Omit<Shortcut, "id" | "createdAt"> & { id?: string }
  ) => {
    let updated: Shortcut[];
    if (data.id) {
      // Update
      updated = shortcuts.map((s) => {
        if (s.id === data.id) {
          return {
            ...s,
            name: data.name,
            execPath: data.execPath,
            category: data.category,
            tags: data.tags,
            description: data.description,
            iconUrl: data.iconUrl || undefined,
          };
        }
        return s;
      });
    } else {
      // Create
      const newShortcut: Shortcut = {
        id: `sc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: data.name,
        execPath: data.execPath,
        category: data.category,
        tags: data.tags,
        description: data.description,
        iconUrl: data.iconUrl || undefined,
        createdAt: Date.now(),
        order: -1,
      };
      
      // Place the new shortcut at the beginning and re-normalize orders
      updated = [newShortcut, ...shortcuts].map((s, index) => ({
        ...s,
        order: index,
      }));
    }
    setShortcuts(updated);
    localStorage.setItem("launcher_shortcuts", JSON.stringify(updated));
  };

  // Sensors configuration for dnd-kit
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Requires dragging 8px before drag begins so clicking buttons is not intercepted
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle manual drag and drop sorting
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setShortcuts((prevShortcuts) => {
      const activeIndex = prevShortcuts.findIndex((s) => s.id === active.id);
      const overIndex = prevShortcuts.findIndex((s) => s.id === over.id);

      if (activeIndex === -1 || overIndex === -1) return prevShortcuts;

      const newShortcuts = arrayMove(prevShortcuts, activeIndex, overIndex);

      // Re-assign order based on the new array sequence
      const updatedWithOrder = (newShortcuts as Shortcut[]).map((s, index) => ({
        ...s,
        order: index,
      }));

      localStorage.setItem("launcher_shortcuts", JSON.stringify(updatedWithOrder));
      return updatedWithOrder;
    });
  };

  // Add category dynamically
  const handleAddCategory = async (name: string): Promise<string> => {
    const trimmed = name.trim();
    if (!trimmed) return "";

    // Check if category already exists (case-insensitive)
    const existing = categories.find(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) {
      return existing.name;
    }

    const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    const newCategory: CategoryDoc = {
      id: `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: capitalized,
    };
    const updated = [...categories, newCategory];
    setCategories(updated);
    localStorage.setItem("launcher_categories", JSON.stringify(updated));
    return capitalized;
  };

  // Delete dynamic category
  const handleDeleteCategory = async (categoryObj: CategoryDoc) => {
    // Check if category is currently used by any shortcut
    const isUsed = shortcuts.some((s) => s.category === categoryObj.name);
    let confirmMsg = `Are you sure you want to delete the "${categoryObj.name}" category?`;
    if (isUsed) {
      confirmMsg = `The category "${categoryObj.name}" contains active shortcuts. Deleting this category will reassign these shortcuts to the "Others" category. Do you want to proceed?`;
    }

    if (confirm(confirmMsg)) {
      // Ensure "Others" category exists if we are going to reassign shortcuts
      let finalCategories = [...categories];
      if (isUsed && categoryObj.name !== "Others") {
        const hasOthers = categories.some((c) => c.name.toLowerCase() === "others");
        if (!hasOthers) {
          const newOthers: CategoryDoc = {
            id: `cat-${Date.now()}-others`,
            name: "Others",
          };
          finalCategories.push(newOthers);
        }
      }

      // Reassign shortcuts if needed
      let updatedShortcuts = [...shortcuts];
      if (isUsed) {
        updatedShortcuts = shortcuts.map((s) => {
          if (s.category === categoryObj.name) {
            return { ...s, category: "Others" };
          }
          return s;
        });
        setShortcuts(updatedShortcuts);
        localStorage.setItem("launcher_shortcuts", JSON.stringify(updatedShortcuts));
      }

      const updatedCats = finalCategories.filter((c) => c.id !== categoryObj.id);
      setCategories(updatedCats);
      localStorage.setItem("launcher_categories", JSON.stringify(updatedCats));
      if (selectedCategory === categoryObj.name) {
        setSelectedCategory("All");
      }
    }
  };

  // Delete shortcut
  const handleDeleteShortcut = async (id: string) => {
    if (confirm("Are you sure you want to remove this shortcut from your launcher?")) {
      const updated = shortcuts.filter((s) => s.id !== id);
      setShortcuts(updated);
      localStorage.setItem("launcher_shortcuts", JSON.stringify(updated));
    }
  };

  // Bulk import presets or scanned shortcuts
  const handleImportPresets = async (presets: Omit<Shortcut, "id" | "createdAt">[]) => {
    const newShortcuts = presets.map((preset, index) => ({
      ...preset,
      id: `sc-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
    }));
    const updated = [...newShortcuts, ...shortcuts].map((s, index) => ({
      ...s,
      order: index,
    }));
    setShortcuts(updated);
    localStorage.setItem("launcher_shortcuts", JSON.stringify(updated));
  };

  // Handle program launching
  const handleLaunch = async (shortcut: Shortcut) => {
    setLaunchingShortcut(shortcut);
    setLaunchStatus("connecting");
    setLaunchError("");

    try {
      const response = await fetch("/api/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ execPath: shortcut.execPath }),
      });

      const result = await response.json();
      if (response.ok && result.success) {
        setLaunchStatus("success");
        // Auto close success modal in 1.8 seconds
        setTimeout(() => {
          setLaunchingShortcut(null);
        }, 1800);
      } else {
        // Fallback launched when running remotely on cloud or custom failure
        setLaunchStatus("fallback");
        if (result.error && !result.error.includes("Direct local launching")) {
          setLaunchError(result.error);
        }
      }
    } catch (err: any) {
      console.error("Launch request failed:", err);
      setLaunchStatus("fallback");
    }
  };

  const copyLaunchCommand = (pathStr: string) => {
    const cmd = `start "" "${pathStr}"`;
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const downloadLaunchBat = (shortcut: Shortcut) => {
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

  // Get list of all unique tags to build a tag cloud or tag filters
  const allTags = Array.from(
    new Set(shortcuts.flatMap((s) => s.tags || []))
  ).sort();

  // Filtered Shortcuts
  const filteredShortcuts = shortcuts.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory =
      selectedCategory === "All" || s.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const categoryNamesList = categories.map((c) => c.name);

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="min-h-screen bg-neutral-950 font-sans text-neutral-200 selection:bg-amber-500/20 selection:text-amber-400 relative overflow-hidden"
    >
      
      {/* File Drag and Drop Overlay */}
      <AnimatePresence>
        {isDraggingFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md p-6 text-center border-4 border-dashed border-amber-500/40 m-4 rounded-3xl pointer-events-none"
          >
            <div className="h-16 w-16 flex items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/30 mb-4 animate-bounce">
              <Plus className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">Drop your shortcut / exe files here!</h2>
            <p className="text-sm text-neutral-400 mt-2 max-w-sm leading-relaxed">
              Drop any local .exe, .lnk, or executable file to instantly catalog it in the selected group!
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background radial ambient lights */}
      <div className="absolute top-0 left-1/4 h-[500px] w-[500px] rounded-full bg-amber-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 h-[600px] w-[600px] rounded-full bg-orange-600/5 blur-[150px] pointer-events-none" />

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16 relative z-10">
        
        {/* Navigation / Header */}
        <header className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between border-b border-neutral-800/80 pb-8 mb-8" id="main-header">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 shadow-md shadow-amber-500/10">
                <Play className="h-4.5 w-4.5 text-neutral-950 fill-neutral-950" />
              </div>
              <h1 className="font-display text-xl font-bold tracking-tight text-white">
                App Launcher
              </h1>
            </div>
            <p className="text-xs text-neutral-400 max-w-lg">
              A responsive, modular shopfront to catalog, organize, search, and launch your programs, shortcuts, and custom protocol links.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Quick stats */}
            <div className="hidden sm:flex items-center gap-4 bg-neutral-900/40 border border-neutral-800/80 rounded-xl px-4 py-2 text-xs text-neutral-400">
              <div className="flex items-center gap-1.5">
                <Laptop className="h-3.5 w-3.5 text-neutral-500" />
                <span><strong className="text-white font-semibold">{shortcuts.length}</strong> Shortcuts</span>
              </div>
              <div className="h-3 w-[1px] bg-neutral-800" />
              <div className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-neutral-500" />
                <span><strong className="text-white font-semibold">{categories.length}</strong> Groups</span>
              </div>
            </div>

            {/* Folder scanner button */}
            <button
              onClick={() => setShowScanModal(true)}
              className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-xs font-semibold text-neutral-300 hover:bg-neutral-900 active:scale-95 transition-all shadow-md"
              title="Scan and import all shortcuts from Windows folder"
            >
              <FolderPlus className="h-4 w-4 text-amber-400" />
              Import folder
            </button>

            {deferredPrompt && (
              <button
                onClick={handleInstallApp}
                className="flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 px-4 py-2.5 text-xs font-semibold active:scale-95 transition-all shadow-md shadow-emerald-500/10"
                title="Install Launcher to your Desktop as a Standalone App"
              >
                <Download className="h-4 w-4" />
                Install App
              </button>
            )}

            <button
              onClick={() => {
                setEditingShortcut(null);
                setShowForm(true);
              }}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-semibold text-neutral-950 hover:bg-amber-400 active:scale-95 transition-all shadow-md shadow-amber-500/5"
              id="btn-add-program"
            >
              <Plus className="h-4 w-4" />
              Add Shortcut
            </button>
          </div>
        </header>

        {/* Filters and Search Bar */}
        <div className="flex flex-col gap-4 mb-8">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            
            {/* Horizontal Categories with Custom Add */}
            <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 scrollbar-none">
              <button
                onClick={() => setSelectedCategory("All")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border ${
                  selectedCategory === "All"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-400 font-bold"
                    : "border-transparent bg-neutral-900/40 text-neutral-400 hover:text-white hover:bg-neutral-900/80"
                }`}
              >
                All
              </button>

              {categories.map((cat) => (
                <div key={cat.id} className="relative group shrink-0">
                  <button
                    onClick={() => setSelectedCategory(cat.name)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border ${
                      selectedCategory === cat.name
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-400 font-bold"
                        : "border-transparent bg-neutral-900/40 text-neutral-400 hover:text-white hover:bg-neutral-900/80"
                    }`}
                  >
                    {cat.name}
                  </button>
                  
                  {/* Delete button for any category */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCategory(cat);
                    }}
                    className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 focus:opacity-100 flex h-4 w-4 items-center justify-center rounded-full bg-red-600/90 text-white hover:bg-red-500 shadow-md transition-opacity duration-150"
                    title={`Delete ${cat.name} category`}
                  >
                    <X className="h-2 w-2" />
                  </button>
                </div>
              ))}

              {/* Add category inline shortcut button */}
              <button
                onClick={() => {
                  const newCat = prompt("Enter custom category name (e.g. Finance, Design):");
                  if (newCat) {
                    handleAddCategory(newCat);
                  }
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border border-dashed border-neutral-850 text-neutral-500 hover:text-amber-400 hover:border-amber-500 bg-neutral-950/40 flex items-center gap-1 shrink-0"
              >
                <Plus className="h-3 w-3" />
                Add Group
              </button>
            </div>

            {/* Search Input and View Toggle */}
            <div className="flex items-center gap-2.5 w-full md:w-auto shrink-0">
              {/* Search Input */}
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search shortcuts, tags, categories..."
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900/30 pl-10 pr-4 py-2 text-xs text-white placeholder-neutral-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all"
                  id="search-input"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* View Toggle Button Group */}
              <div className="flex items-center rounded-xl border border-neutral-800 bg-neutral-900/30 p-1 select-none shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode("grid");
                    localStorage.setItem("launcher_view_mode", "grid");
                  }}
                  className={`p-1.5 rounded-lg transition-all ${
                    viewMode === "grid"
                      ? "bg-amber-500 text-neutral-950 font-bold shadow"
                      : "text-neutral-400 hover:text-white"
                  }`}
                  title="Grid Layout"
                  id="toggle-view-grid"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode("list");
                    localStorage.setItem("launcher_view_mode", "list");
                  }}
                  className={`p-1.5 rounded-lg transition-all ${
                    viewMode === "list"
                      ? "bg-amber-500 text-neutral-950 font-bold shadow"
                      : "text-neutral-400 hover:text-white"
                  }`}
                  title="Compact List Layout"
                  id="toggle-view-list"
                >
                  <List className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Quick Tag Pills */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
              <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider mr-1.5">
                Popular tags:
              </span>
              {allTags.slice(0, 10).map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSearchQuery(tag)}
                  className="inline-flex items-center gap-1 rounded-md bg-neutral-900/50 hover:bg-neutral-800/80 px-2 py-0.5 text-[11px] text-neutral-400 border border-neutral-800 transition-colors"
                >
                  <Tag className="h-2.5 w-2.5 text-neutral-600" />
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Loading Spinner */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            <p className="text-xs text-neutral-500 font-mono">Syncing with launchpad database...</p>
          </div>
        ) : filteredShortcuts.length === 0 ? (
          searchQuery || selectedCategory !== "All" ? (
            /* Search results empty */
            <div className="text-center py-16 border border-neutral-800/50 rounded-2xl bg-neutral-900/20 max-w-md mx-auto">
              <HelpCircle className="h-8 w-8 text-neutral-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-white mb-1">No matching programs found</h3>
              <p className="text-xs text-neutral-400">
                Try adjusting your search criteria or category filter, or add a new shortcut for this search.
              </p>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("All");
                }}
                className="mt-4 inline-flex text-xs text-amber-400 hover:underline font-medium"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            /* Real empty state */
            <EmptyState
              onAddClick={() => {
                setEditingShortcut(null);
                setShowForm(true);
              }}
              onImportPresets={handleImportPresets}
            />
          )
        ) : (
          /* Main grid of cards grouped or list */
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={filteredShortcuts.map((s) => s.id)}
              strategy={rectSortingStrategy}
            >
              <motion.div
                layout
                className={
                  viewMode === "grid"
                    ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
                    : "flex flex-col gap-3"
                }
                id="shortcuts-container"
              >
                <AnimatePresence mode="popLayout">
                  {filteredShortcuts.map((shortcut) => (
                    <ShortcutCard
                      key={shortcut.id}
                      shortcut={shortcut}
                      viewMode={viewMode}
                      onEdit={(item) => {
                        setEditingShortcut(item);
                        setShowForm(true);
                      }}
                      onDelete={handleDeleteShortcut}
                      onLaunch={handleLaunch}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            </SortableContext>
          </DndContext>
        )}

        {/* Footer explaining desktop status */}
        <div className="mt-20 border-t border-neutral-900 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
          <div className="flex items-center gap-2.5">
            <Cpu className="h-4 w-4 text-amber-500/80 animate-pulse" />
            <span>
              Standalone Desktop App Mode: <strong className="text-neutral-300">Enabled</strong> (Fully installable, runs offline instantly)
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 bg-neutral-900 px-2.5 py-1 rounded-full border border-neutral-800">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
              100% Local Sandbox (Safe & Secure)
            </span>
          </div>
        </div>

      </div>

      {/* Forms Modal Overlay */}
      <AnimatePresence>
        {showForm && (
          <ShortcutForm
            initialShortcut={editingShortcut}
            categories={categoryNamesList}
            onAddCategory={handleAddCategory}
            onDeleteCategory={(catName) => {
              const catObj = categories.find((c) => c.name === catName);
              if (catObj) {
                handleDeleteCategory(catObj);
              }
            }}
            onSave={handleSaveShortcut}
            onClose={() => {
              setShowForm(false);
              setEditingShortcut(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Folder Scan Modal Overlay */}
      <AnimatePresence>
        {showScanModal && (
          <FolderScanModal
            categories={categoryNamesList}
            onImportShortcuts={handleImportPresets}
            onClose={() => setShowScanModal(false)}
          />
        )}
      </AnimatePresence>

      {/* Launching Overlay / Modal */}
      <AnimatePresence>
        {launchingShortcut && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl text-center"
            >
              {/* Close Button */}
              <button
                onClick={() => setLaunchingShortcut(null)}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800"
              >
                <X className="h-4 w-4" />
              </button>

              {launchStatus === "connecting" && (
                <div className="space-y-4 py-4">
                  <div className="relative h-12 w-12 mx-auto flex items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Launching program...</h3>
                    <p className="text-xs text-neutral-400 mt-1">
                      Attempting direct launch of <strong className="text-neutral-200">{launchingShortcut.name}</strong> on Windows.
                    </p>
                  </div>
                </div>
              )}

              {launchStatus === "success" && (
                <div className="space-y-4 py-4">
                  <div className="h-12 w-12 mx-auto flex items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Check className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Launched Successfully!</h3>
                    <p className="text-xs text-neutral-400 mt-1">
                      Enjoy your session on <strong className="text-neutral-200">{launchingShortcut.name}</strong>.
                    </p>
                  </div>
                </div>
              )}

              {launchStatus === "fallback" && (
                <div className="space-y-4">
                  <div className="h-12 w-12 mx-auto flex items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <Laptop className="h-5 w-5" />
                  </div>
                  <div className="text-left space-y-2">
                    <h3 className="font-semibold text-white text-center mb-1">Local Bridge Required</h3>
                    
                    <p className="text-xs text-neutral-400 leading-normal">
                      You are previewing this app in the AI Studio cloud sandbox. Direct local execution is restricted by web browsers for security.
                    </p>
                    
                    {launchError && (
                      <div className="p-2.5 rounded bg-red-950/20 border border-red-900/30 text-[11px] text-red-300 font-mono">
                        {launchError}
                      </div>
                    )}

                    <div className="bg-neutral-950 rounded-xl p-4 border border-neutral-800/60 space-y-3.5 mt-3">
                      <div>
                        <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider block mb-1">
                          Option 1: Download 1-Click Launch Script
                        </span>
                        <button
                          onClick={() => downloadLaunchBat(launchingShortcut)}
                          className="flex items-center gap-1.5 w-full justify-center rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-semibold py-1.5 text-neutral-200 transition-colors"
                        >
                          <Download className="h-3.5 w-3.5 text-amber-400" />
                          Download batch file (.bat)
                        </button>
                      </div>

                      <div className="border-t border-neutral-900 pt-3">
                        <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider block mb-1">
                          Option 2: Run Command Direct
                        </span>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            readOnly
                            value={`start "" "${launchingShortcut.execPath}"`}
                            className="flex-1 font-mono text-[10px] bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-neutral-300"
                          />
                          <button
                            onClick={() => copyLaunchCommand(launchingShortcut.execPath)}
                            className="p-1.5 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800"
                            title="Copy launch command"
                          >
                            {copiedCmd ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>

                      {launchingShortcut.execPath.includes("://") && (
                        <div className="border-t border-neutral-900 pt-3">
                          <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider block mb-1">
                            Option 3: Launch Native URI Protocol
                          </span>
                          <a
                            href={launchingShortcut.execPath}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 w-full justify-center rounded-lg bg-amber-500 text-neutral-950 hover:bg-amber-400 text-xs font-semibold py-1.5 transition-all"
                            onClick={() => setLaunchingShortcut(null)}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open via browser link
                          </a>
                        </div>
                      )}
                    </div>

                    <div className="p-3 bg-neutral-900/40 border border-neutral-800/80 rounded-xl mt-4">
                      <h4 className="text-[11px] font-bold text-white mb-0.5">💡 Direct Launching Tip:</h4>
                      <p className="text-[10px] text-neutral-400 leading-normal">
                        To enable direct 1-click launching, click the export/settings icon in AI Studio, download this project as a ZIP, open it on your PC, and run <code className="font-mono bg-neutral-950 px-1 py-0.5 rounded text-neutral-300">npm run dev</code>. The launch button will work automatically!
                      </p>
                    </div>

                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
