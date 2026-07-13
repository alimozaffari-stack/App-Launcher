import React, { useEffect, useMemo, useState } from "react";
import { Shortcut, TemporaryFolder } from "./types";
import {
  Play,
  Plus,
  Search,
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
  List,
  Star,
  Bookmark,
  ArrowDownAZ
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
import NominatedWorkspaceDropZone from "./components/NominatedWorkspaceDropZone";
import TemporaryFolderCard from "./components/TemporaryFolderCard";
import {
  NOMINATED_CARD_PREFIX,
  addShortcutToWorkspace,
  isNominatedDropTarget,
  isShortcutInWorkspace,
  readTemporaryFolders,
  removeShortcutFromWorkspace,
} from "./workspace.js";

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
  
  // Hover states for drop-expand popular tags
  const [isHeaderHovered, setIsHeaderHovered] = useState(false);
  const [isGroupsHovered, setIsGroupsHovered] = useState(false);
  const [isTagsHovered, setIsTagsHovered] = useState(false);

  // Nominated Group (pinned category) on the dashboard
  const [nominatedCategory, setNominatedCategory] = useState<string>(() => {
    return localStorage.getItem("launcher_nominated_category") || "Office";
  });
  const [temporaryFolders, setTemporaryFolders] = useState<TemporaryFolder[]>(() =>
    readTemporaryFolders(sessionStorage.getItem("launcher_temporary_folders")),
  );

  // Sort mode: "manual", "alphabetical", or "date"
  const [sortMode, setSortMode] = useState<"manual" | "alphabetical" | "date">(() => {
    const saved = localStorage.getItem("launcher_sort_mode");
    return (saved === "manual" || saved === "alphabetical" || saved === "date") ? saved : "manual";
  });

  const handleToggleFavorite = (id: string) => {
    const updated = shortcuts.map((s) => {
      if (s.id === id) {
        return { ...s, isFavorite: !s.isFavorite };
      }
      return s;
    });
    setShortcuts(updated);
    localStorage.setItem("launcher_shortcuts", JSON.stringify(updated));
  };

  useEffect(() => {
    sessionStorage.setItem("launcher_temporary_folders", JSON.stringify(temporaryFolders));
  }, [temporaryFolders]);

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

    // Convert dropped files into shortcuts. Electron exposes the real native
    // path through the isolated preload bridge; browsers do not expose it.
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

      let nativePath = "";
      try {
        nativePath = window.appLauncherDesktop?.getPathForFile(file) || "";
      } catch (error) {
        console.warn("The native dropped-file path could not be read:", error);
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
        execPath: nativePath,
        category: cat,
        tags,
        description: nativePath
          ? `Imported local file (${file.name}).`
          : `Dropped file (${file.name}); enter its full target path.`,
      };
    });

    if (
      newShortcutsList.length > 1 &&
      newShortcutsList.some((shortcut) => !shortcut.execPath)
    ) {
      alert("Bulk file dropping requires the installed desktop application so native paths can be read.");
      return;
    }

    if (newShortcutsList.length === 1) {
      const firstItem = newShortcutsList[0];
      
      let extractedIconUrl: string | undefined = undefined;
      if (firstItem.execPath) {
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
        } catch (error) {
          console.warn("Automatic icon extraction failed:", error);
        }
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

  // Recover older Electron storage when available, then load the current profile.
  useEffect(() => {
    let cancelled = false;

    const initialiseStoredData = async () => {
      try {
        const recovered = await window.appLauncherDesktop?.getRecoveredStorage();
        if (recovered) {
          let recoveredCount = 0;
          for (const [key, value] of Object.entries(recovered)) {
            if (localStorage.getItem(key) === null && value) {
              localStorage.setItem(key, value);
              recoveredCount += 1;
            }
          }
          if (recoveredCount > 0) {
            console.info(`Recovered ${recoveredCount} stored launcher settings.`);
          }
        }
      } catch (error) {
        console.warn("Older launcher data could not be recovered:", error);
      }

      if (cancelled) return;

      const storedViewMode = localStorage.getItem("launcher_view_mode");
      if (storedViewMode === "grid" || storedViewMode === "list") {
        setViewMode(storedViewMode);
      }
      const storedSortMode = localStorage.getItem("launcher_sort_mode");
      if (storedSortMode === "manual" || storedSortMode === "alphabetical" || storedSortMode === "date") {
        setSortMode(storedSortMode);
      }
      const storedNominatedCategory = localStorage.getItem("launcher_nominated_category");
      if (storedNominatedCategory) setNominatedCategory(storedNominatedCategory);

      const storedCats = localStorage.getItem("launcher_categories");
      let currentCats: CategoryDoc[] = [];
      if (storedCats) {
        try {
          const parsedCategories = JSON.parse(storedCats);
          if (Array.isArray(parsedCategories)) currentCats = parsedCategories;
        } catch (error) {
          console.error("Error parsing stored categories:", error);
        }
      }
      if (currentCats.length === 0) {
        const defaults = ["Office", "AI", "Research", "Photography", "Books", "Gaming", "Others"];
        currentCats = defaults.map((name, index) => ({ id: `cat-${Date.now()}-${index}`, name }));
        localStorage.setItem("launcher_categories", JSON.stringify(currentCats));
      }

      const storedShortcuts = localStorage.getItem("launcher_shortcuts");
      let currentShortcuts: Shortcut[] = [];
      if (storedShortcuts) {
        try {
          const parsedShortcuts = JSON.parse(storedShortcuts);
          if (Array.isArray(parsedShortcuts)) currentShortcuts = parsedShortcuts;
        } catch (error) {
          console.error("Error parsing stored shortcuts:", error);
        }
      }
      currentShortcuts.sort((a, b) => {
        const aOrder = a.order !== undefined ? a.order : 999999;
        const bOrder = b.order !== undefined ? b.order : 999999;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });

      if (cancelled) return;
      setCategories(currentCats);
      setShortcuts(currentShortcuts);
      setLoading(false);
    };

    void initialiseStoredData();
    return () => {
      cancelled = true;
    };
  }, []);

  // Save shortcut (Add / Update)
  const handleSaveShortcut = async (
    data: Omit<Shortcut, "id" | "createdAt"> & { id?: string }
  ) => {
    let updated: Shortcut[];
    const isExisting = data.id && shortcuts.some((s) => s.id === data.id);
    if (isExisting) {
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
            workspaceTags: (data.workspaceTags ?? s.workspaceTags ?? []).filter(
              (group) => group !== data.category,
            ),
          };
        }
        return s;
      });
    } else {
      // Create
      const newShortcut: Shortcut = {
        id: data.id || `sc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: data.name,
        execPath: data.execPath,
        category: data.category,
        tags: data.tags,
        description: data.description,
        iconUrl: data.iconUrl || undefined,
        workspaceTags: (data.workspaceTags || []).filter(
          (group) => group !== data.category,
        ),
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

  const handleAddShortcutToWorkspace = (id: string) => {
    setShortcuts((current) => {
      const updated = addShortcutToWorkspace(current, id, nominatedCategory);
      if (updated !== current) {
        localStorage.setItem("launcher_shortcuts", JSON.stringify(updated));
      }
      return updated;
    });
  };

  const handleRemoveShortcutFromWorkspace = (id: string) => {
    setShortcuts((current) => {
      const updated = removeShortcutFromWorkspace(current, id, nominatedCategory);
      if (updated !== current) {
        localStorage.setItem("launcher_shortcuts", JSON.stringify(updated));
      }
      return updated;
    });
  };

  const handleChooseTemporaryFolder = async () => {
    if (!window.appLauncherDesktop?.selectFolder) {
      alert("Temporary folders can be selected in the installed desktop application.");
      return;
    }

    const selected = await window.appLauncherDesktop.selectFolder();
    if (!selected) return;

    setTemporaryFolders((current) => {
      const alreadyAdded = current.some(
        (folder) =>
          folder.workspace === nominatedCategory &&
          folder.path.toLowerCase() === selected.path.toLowerCase(),
      );
      if (alreadyAdded) return current;
      return [
        {
          id: `temp-folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: selected.name,
          path: selected.path,
          workspace: nominatedCategory,
          createdAt: Date.now(),
        },
        ...current,
      ];
    });
  };

  const handleRemoveTemporaryFolder = (id: string) => {
    setTemporaryFolders((current) => current.filter((folder) => folder.id !== id));
  };

  const handlePinTemporaryFolder = async (folder: TemporaryFolder) => {
    await handleSaveShortcut({
      name: folder.name,
      execPath: folder.path,
      category: folder.workspace,
      tags: ["Folder", "Workspace"],
      description: `Workspace folder: ${folder.path}`,
    });
    handleRemoveTemporaryFolder(folder.id);
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
    if (!over) return;

    const activeId = String(active.id);
    if (isNominatedDropTarget(over.id)) {
      handleAddShortcutToWorkspace(activeId);
      return;
    }

    if (sortMode !== "manual" || active.id === over.id) return;

    setShortcuts((prevShortcuts) => {
      const activeIndex = prevShortcuts.findIndex((s) => s.id === activeId);
      const overIndex = prevShortcuts.findIndex((s) => s.id === String(over.id));

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
    const hasPrimaryMembers = shortcuts.some((s) => s.category === categoryObj.name);
    const hasAdditionalMembers = shortcuts.some((s) =>
      (s.workspaceTags || []).includes(categoryObj.name),
    );
    const isUsed = hasPrimaryMembers || hasAdditionalMembers;
    let confirmMsg = `Are you sure you want to delete the "${categoryObj.name}" category?`;
    if (isUsed) {
      confirmMsg = `The group "${categoryObj.name}" contains shortcut memberships. Primary members will be reassigned and additional memberships will be removed. Do you want to proceed?`;
    }

    if (confirm(confirmMsg)) {
      // Ensure "Others" category exists if we are going to reassign shortcuts
      let finalCategories = [...categories];
      if (hasPrimaryMembers && categoryObj.name !== "Others") {
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
        const fallbackCategory =
          categoryObj.name === "Others"
            ? finalCategories.find((category) => category.id !== categoryObj.id)?.name || "Office"
            : "Others";
        updatedShortcuts = shortcuts.map((s) => {
          const remainingGroups = (s.workspaceTags || []).filter(
            (group) => group !== categoryObj.name && group !== fallbackCategory,
          );
          return {
            ...s,
            category: s.category === categoryObj.name ? fallbackCategory : s.category,
            workspaceTags: remainingGroups.length > 0 ? remainingGroups : undefined,
          };
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
      setTemporaryFolders((current) =>
        current.filter((folder) => folder.workspace !== categoryObj.name),
      );
      if (nominatedCategory === categoryObj.name) {
        const fallbackNomination = updatedCats[0]?.name || "Others";
        setNominatedCategory(fallbackNomination);
        localStorage.setItem("launcher_nominated_category", fallbackNomination);
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

  const handleClearAllShortcuts = () => {
    if (confirm("Are you sure you want to clear all shortcuts? This will reset the launcher to a fresh, blank state.")) {
      setShortcuts([]);
      localStorage.removeItem("launcher_shortcuts");
    }
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
        // Record only successful launches in the recent-items panel.
        setShortcuts((current) => {
          const updated = current.map((item) =>
            item.id === shortcut.id
              ? { ...item, lastLaunchedAt: Date.now() }
              : item,
          );
          localStorage.setItem("launcher_shortcuts", JSON.stringify(updated));
          return updated;
        });
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

  const handleLaunchTemporaryFolder = (folder: TemporaryFolder) => {
    void handleLaunch({
      id: folder.id,
      name: folder.name,
      execPath: folder.path,
      category: folder.workspace,
      tags: ["Temporary", "Folder"],
      createdAt: folder.createdAt,
    });
  };

  const copyLaunchCommand = (pathStr: string) => {
    if (/["\r\n]/.test(pathStr)) {
      alert("This target contains characters that cannot be represented safely in a Windows command.");
      return;
    }
    const cmd = `start "" "${pathStr}"`;
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const downloadLaunchBat = (shortcut: Shortcut) => {
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

  // Get list of all unique tags to build a tag cloud or tag filters
  const allTags = useMemo(
    () => Array.from(new Set(shortcuts.flatMap((s) => s.tags || []))).sort(),
    [shortcuts],
  );

  // Shortcuts sorted based on mode
  const displayShortcuts = useMemo(
    () =>
      sortMode === "alphabetical"
        ? [...shortcuts].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
          )
        : sortMode === "date"
          ? [...shortcuts].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
          : shortcuts,
    [shortcuts, sortMode],
  );

  // Filtered Shortcuts
  const filteredShortcuts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return displayShortcuts.filter((shortcut) => {
      const matchesSearch =
        !normalizedQuery ||
        shortcut.name.toLowerCase().includes(normalizedQuery) ||
        shortcut.category.toLowerCase().includes(normalizedQuery) ||
        (shortcut.tags || []).some((tag) => tag.toLowerCase().includes(normalizedQuery)) ||
        (shortcut.workspaceTags || []).some((tag) =>
          tag.toLowerCase().includes(normalizedQuery),
        );
      const matchesCategory =
        selectedCategory === "All" || isShortcutInWorkspace(shortcut, selectedCategory);
      return matchesSearch && matchesCategory;
    });
  }, [displayShortcuts, searchQuery, selectedCategory]);

  const categoryNamesList = categories.map((c) => c.name);

  const favoriteItems = displayShortcuts.filter((s) => s.isFavorite);
  const nominatedItems = displayShortcuts.filter((s) =>
    isShortcutInWorkspace(s, nominatedCategory),
  );
  const currentTemporaryFolders = temporaryFolders.filter(
    (folder) => folder.workspace === nominatedCategory,
  );
  const lastUsedItems = [...shortcuts]
    .filter((s) => s.lastLaunchedAt !== undefined && s.lastLaunchedAt > 0)
    .sort((a, b) => (b.lastLaunchedAt || 0) - (a.lastLaunchedAt || 0))
    .slice(0, 4);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
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
        <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between border-b border-neutral-800/80 pb-4 mb-4 gap-4 select-none" id="main-header">
          <div className="group relative cursor-help flex items-center gap-2.5">
            <div className="flex h-8.5 w-8.5 items-center justify-center rounded-lg bg-gradient-to-tr from-amber-500 to-orange-600 shadow-md shadow-amber-500/10">
              <Play className="h-4 w-4 text-neutral-950 fill-neutral-950" />
            </div>
            <div>
              <h1 className="font-display text-base font-bold tracking-tight text-white flex items-center gap-1.5">
                App Launcher
                <span className="text-[9px] text-neutral-500 font-normal px-1.5 py-0.2 bg-neutral-900 border border-neutral-800 rounded">Info</span>
              </h1>
              {/* Explanatory text appearing on hover */}
              <div className="absolute top-full left-0 mt-2 w-80 p-3 bg-neutral-900/95 border border-neutral-800 rounded-xl shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 z-50 text-[11px] text-neutral-400 leading-relaxed backdrop-blur-md">
                A responsive, modular shopfront to catalog, organize, search, and launch your programs, shortcuts, and custom protocol links.
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Quick stats */}
            <div className="hidden sm:flex items-center gap-3 bg-neutral-900/40 border border-neutral-800/80 rounded-lg px-3 py-1.5 text-[11px] text-neutral-400">
              <div className="flex items-center gap-1">
                <Laptop className="h-3 w-3 text-neutral-500" />
                <span><strong className="text-white font-semibold">{shortcuts.length}</strong> Shortcuts</span>
              </div>
              <div className="h-3 w-[1px] bg-neutral-800" />
              <div className="flex items-center gap-1">
                <Layers className="h-3 w-3 text-neutral-500" />
                <span><strong className="text-white font-semibold">{categories.length}</strong> Groups</span>
              </div>
            </div>

            {/* Add Shortcut primary button */}
            <button
              onClick={() => {
                setEditingShortcut(null);
                setShowForm(true);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-semibold text-neutral-950 hover:bg-amber-400 active:scale-95 transition-all shadow-md shadow-amber-500/5"
              id="btn-add-program"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Shortcut
            </button>

            {/* Folder scanner button */}
            <button
              onClick={() => setShowScanModal(true)}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-[11px] font-semibold text-neutral-300 hover:bg-neutral-900 active:scale-95 transition-all shadow-md"
              title="Scan and import all shortcuts from Windows folder"
            >
              <FolderPlus className="h-3.5 w-3.5 text-amber-400" />
              Import folder
            </button>

            {shortcuts.length > 0 && (
              <button
                onClick={handleClearAllShortcuts}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-1.5 text-[11px] font-semibold text-red-400 hover:bg-red-600 hover:text-white active:scale-95 transition-all shadow-md"
                title="Remove all shortcuts to start fresh"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear All
              </button>
            )}

            {deferredPrompt && (
              <button
                onClick={handleInstallApp}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-neutral-950 px-3 py-1.5 text-[11px] font-semibold active:scale-95 transition-all shadow-md shadow-emerald-500/10"
                title="Install Launcher to your Desktop as a Standalone App"
              >
                <Download className="h-3.5 w-3.5" />
                Install App
              </button>
            )}
          </div>
        </header>

        {/* Filters and Search Bar Row */}
        <div className="flex flex-col xl:flex-row items-center xl:items-start justify-between gap-4 mb-4 select-none">
          <div className="flex flex-col md:flex-row items-center gap-4 flex-1">
            
            {/* Horizontal Categories with Custom Add (Now side-by-side, width 500px, expands on hover) */}
            <div 
              onMouseEnter={() => setIsGroupsHovered(true)}
              onMouseLeave={() => setIsGroupsHovered(false)}
              className="relative flex flex-wrap items-center gap-1.5 p-1 border border-neutral-800/60 bg-neutral-950/20 rounded-xl transition-all duration-300 ease-in-out overflow-hidden"
              style={{ 
                width: "500px", 
                maxHeight: isGroupsHovered ? "300px" : "40px" 
              }}
            >
              <button
                onClick={() => setSelectedCategory("All")}
                className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border ${
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
                    className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border ${
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
                className="px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border border-dashed border-neutral-800 text-neutral-500 hover:text-amber-400 hover:border-amber-500 bg-neutral-950/40 flex items-center gap-1 shrink-0"
              >
                <Plus className="h-3 w-3" />
                Add Group
              </button>
            </div>

            {/* Quick Tag Pills (Now side-by-side, width 500px, expands on hover) */}
            <div 
              onMouseEnter={() => setIsTagsHovered(true)}
              onMouseLeave={() => setIsTagsHovered(false)}
              className="relative flex flex-wrap items-center gap-1.5 p-1 border border-neutral-800/60 bg-neutral-950/20 rounded-xl transition-all duration-300 ease-in-out overflow-hidden"
              style={{ 
                width: "500px", 
                maxHeight: isTagsHovered ? "300px" : "40px" 
              }}
            >
              <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider mr-1.5 shrink-0 select-none pl-1">
                Popular tags:
              </span>
              {allTags.length > 0 ? (
                allTags.slice(0, 15).map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setSearchQuery(tag)}
                    className="inline-flex items-center gap-1 rounded-md bg-neutral-900/50 hover:bg-neutral-800/80 px-2 py-0.5 text-[11px] text-neutral-400 border border-neutral-800 transition-colors shrink-0"
                  >
                    <Tag className="h-2.5 w-2.5 text-neutral-600" />
                    {tag}
                  </button>
                ))
              ) : (
                <span className="text-[11px] text-neutral-600 font-mono select-none">No tags yet</span>
              )}
            </div>

          </div>

          {/* Pin dropdown to nominate a category to the dashboard */}
          <div className="relative shrink-0 flex items-center gap-1.5 bg-neutral-900/40 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-400 hover:border-neutral-750 transition-colors w-full xl:w-auto justify-between xl:justify-start h-[40px] self-start">
            <div className="flex items-center gap-1.5">
              <Bookmark className="h-3.5 w-3.5 text-amber-500 fill-amber-500/10" />
              <span className="text-[10px] uppercase font-mono text-neutral-500 tracking-wider">PIN:</span>
            </div>
            <select
              value={nominatedCategory}
              onChange={(e) => {
                setNominatedCategory(e.target.value);
                localStorage.setItem("launcher_nominated_category", e.target.value);
              }}
              className="bg-transparent border-none text-xs text-neutral-200 focus:outline-none cursor-pointer hover:text-white font-semibold pr-1"
              title="Select a category/group to pin/nominate to your dashboard"
            >
              {categoryNamesList.map((catName) => (
                <option key={catName} value={catName} className="bg-neutral-950 text-neutral-200">
                  {catName}
                </option>
              ))}
            </select>
          </div>
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
          <div className="space-y-8" id="shortcuts-container">
            {/* Custom Segmented Dashboard for All Categories & No Search Query */}
            {selectedCategory === "All" && !searchQuery ? (
              <>
                {/* Side-by-Side Three Windows with Fine Pale Frames */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5" id="dashboard-top-panels">
                  
                  {/* WINDOW 1: NOMINATED GROUP */}
                  <NominatedWorkspaceDropZone workspaceName={nominatedCategory}>
                    <div className="flex items-center justify-between border-b border-neutral-800 pb-2 select-none">
                      <div className="flex items-center gap-1.5">
                        <Bookmark className="h-4 w-4 text-amber-500 fill-amber-500/10" />
                        <h2 className="text-[11.5px] uppercase font-mono tracking-wider font-bold text-neutral-200">
                          Nominated: <span className="text-amber-400 font-sans tracking-tight font-semibold">{nominatedCategory}</span>
                        </h2>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleChooseTemporaryFolder()}
                          className="flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-500/5 px-1.5 py-0.5 text-[9px] font-semibold text-amber-400 transition-colors hover:border-amber-500/40 hover:bg-amber-500/10"
                          title={`Add a temporary folder to ${nominatedCategory}`}
                        >
                          <FolderPlus className="h-3 w-3" />
                          Folder
                        </button>
                        <span className="text-[10px] bg-neutral-900/80 border border-neutral-800 text-neutral-400 px-2 py-0.5 rounded-full font-mono font-semibold">
                          {nominatedItems.length + currentTemporaryFolders.length}
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto max-h-[340px] scrollbar-thin scrollbar-thumb-neutral-800 pr-1">
                      {nominatedItems.length > 0 || currentTemporaryFolders.length > 0 ? (
                        <div className={viewMode === "grid" ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-2 gap-2" : "flex flex-col gap-1.5"}>
                          {currentTemporaryFolders.map((folder) => (
                            <TemporaryFolderCard
                              key={folder.id}
                              folder={folder}
                              onLaunch={handleLaunchTemporaryFolder}
                              onPin={(item) => void handlePinTemporaryFolder(item)}
                              onRemove={handleRemoveTemporaryFolder}
                            />
                          ))}
                          {nominatedItems.map((shortcut) => (
                            <ShortcutCard
                              key={`nom-${shortcut.id}`}
                              dndId={`${NOMINATED_CARD_PREFIX}${shortcut.id}`}
                              shortcut={shortcut}
                              viewMode={viewMode}
                              sortMode={sortMode}
                              isCompact={true}
                              onEdit={(item) => {
                                setEditingShortcut(item);
                                setShowForm(true);
                              }}
                              onDelete={handleDeleteShortcut}
                              onLaunch={handleLaunch}
                              onToggleFavorite={handleToggleFavorite}
                              workspaceName={nominatedCategory}
                              isInWorkspace={true}
                              onRemoveFromWorkspace={
                                shortcut.category !== nominatedCategory &&
                                (shortcut.workspaceTags || []).includes(nominatedCategory)
                                  ? handleRemoveShortcutFromWorkspace
                                  : undefined
                              }
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center py-8">
                          <Bookmark className="h-7 w-7 text-neutral-700 mb-2 stroke-[1.5]" />
                          <p className="text-[10px] text-neutral-500 max-w-[200px] leading-relaxed">
                            Drag a shortcut here to nominate it in <span className="text-neutral-400">{nominatedCategory}</span>, or add a temporary folder.
                          </p>
                        </div>
                      )}
                    </div>
                  </NominatedWorkspaceDropZone>

                  {/* WINDOW 2: FAVOURITES */}
                  <div className="rounded-2xl border border-neutral-700/30 bg-neutral-950/15 p-4 flex flex-col gap-3 backdrop-blur-md shadow-sm" id="panel-favourites">
                    <div className="flex items-center justify-between border-b border-neutral-800 pb-2 select-none">
                      <div className="flex items-center gap-1.5">
                        <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                        <h2 className="text-[11.5px] uppercase font-mono tracking-wider font-bold text-neutral-200">
                          Favourites
                        </h2>
                      </div>
                      <span className="text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-mono font-bold">
                        {favoriteItems.length}
                      </span>
                    </div>
                    <div className="flex-1 overflow-y-auto max-h-[340px] scrollbar-thin scrollbar-thumb-neutral-800 pr-1">
                      {favoriteItems.length > 0 ? (
                        <div className={viewMode === "grid" ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-2 gap-2" : "flex flex-col gap-1.5"}>
                          {favoriteItems.map((shortcut) => (
                            <ShortcutCard
                              key={`fav-${shortcut.id}`}
                              shortcut={shortcut}
                              viewMode={viewMode}
                              sortMode={sortMode}
                              isCompact={true}
                              onEdit={(item) => {
                                setEditingShortcut(item);
                                setShowForm(true);
                              }}
                              onDelete={handleDeleteShortcut}
                              onLaunch={handleLaunch}
                              onToggleFavorite={handleToggleFavorite}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center py-8">
                          <Star className="h-7 w-7 text-neutral-700 mb-2 stroke-[1.5]" />
                          <p className="text-[10px] text-neutral-500 max-w-[200px] leading-relaxed">
                            No Favourites starred yet. Click the star icon on any card below to pin it here.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* WINDOW 3: LAST USED */}
                  <div className="rounded-2xl border border-neutral-700/30 bg-neutral-950/15 p-4 flex flex-col gap-3 backdrop-blur-md shadow-sm" id="panel-lastused">
                    <div className="flex items-center justify-between border-b border-neutral-800 pb-2 select-none">
                      <div className="flex items-center gap-1.5">
                        <Cpu className="h-4 w-4 text-amber-500/70" />
                        <h2 className="text-[11.5px] uppercase font-mono tracking-wider font-bold text-neutral-200">
                          Last Used
                        </h2>
                      </div>
                      <span className="text-[10px] bg-neutral-900/80 border border-neutral-800 text-neutral-400 px-2 py-0.5 rounded-full font-mono font-semibold">
                        {lastUsedItems.length}
                      </span>
                    </div>
                    <div className="flex-1 overflow-y-auto max-h-[340px] scrollbar-thin scrollbar-thumb-neutral-800 pr-1">
                      {lastUsedItems.length > 0 ? (
                        <div className={viewMode === "grid" ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-2 gap-2" : "flex flex-col gap-1.5"}>
                          {lastUsedItems.map((shortcut) => (
                            <ShortcutCard
                              key={`rec-${shortcut.id}`}
                              shortcut={shortcut}
                              viewMode={viewMode}
                              sortMode={sortMode}
                              isCompact={true}
                              onEdit={(item) => {
                                setEditingShortcut(item);
                                setShowForm(true);
                              }}
                              onDelete={handleDeleteShortcut}
                              onLaunch={handleLaunch}
                              onToggleFavorite={handleToggleFavorite}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center py-8">
                          <Cpu className="h-7 w-7 text-neutral-700 mb-2 stroke-[1.5]" />
                          <p className="text-[10px] text-neutral-500 max-w-[200px] leading-relaxed">
                            Programs you launch during this session will be listed here automatically.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                </div>

                {/* Normal Arrangement of All Shortcuts (Supports Drag and Drop) */}
                <motion.section
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.05 }}
                  className="space-y-3"
                  id="section-normal-layout"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-neutral-800/60 pb-2.5 gap-3 select-none">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-neutral-500" />
                      <h2 className="text-xs uppercase font-mono tracking-wider font-bold text-neutral-300">
                        Shortcuts
                      </h2>
                      <span className="text-[10px] bg-neutral-900 border border-neutral-800/60 text-neutral-400 px-1.5 py-0.5 rounded-full font-mono font-semibold">
                        {displayShortcuts.length}
                      </span>
                      {sortMode === "manual" && (
                        <span className="text-[9px] text-neutral-500 font-mono italic hidden xl:inline ml-1.5">
                          (Drag and drop to reorder)
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Search Input */}
                      <div className="relative w-40 sm:w-48">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-500" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search shortcuts..."
                          className="w-full rounded-lg border border-neutral-800 bg-neutral-900/30 pl-8 pr-7 py-1 text-[11px] text-white placeholder-neutral-500 focus:border-amber-500 focus:outline-none transition-all"
                          id="search-shortcuts"
                        />
                        {searchQuery && (
                          <button
                            onClick={() => setSearchQuery("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      {/* Sort Style */}
                      <div className="flex items-center rounded-lg border border-neutral-800 bg-neutral-900/30 p-0.5" title="Arrangement Style">
                        <button
                          type="button"
                          onClick={() => {
                            setSortMode("manual");
                            localStorage.setItem("launcher_sort_mode", "manual");
                          }}
                          className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-tight uppercase transition-all ${
                            sortMode === "manual"
                              ? "bg-amber-500 text-neutral-950 shadow-sm"
                              : "text-neutral-400 hover:text-white"
                          }`}
                        >
                          Manual
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSortMode("alphabetical");
                            localStorage.setItem("launcher_sort_mode", "alphabetical");
                          }}
                          className={`flex items-center gap-0.5 px-2 py-0.5 rounded text-[9px] font-bold tracking-tight uppercase transition-all ${
                            sortMode === "alphabetical"
                              ? "bg-amber-500 text-neutral-950 shadow-sm"
                              : "text-neutral-400 hover:text-white"
                          }`}
                        >
                          <ArrowDownAZ className="h-2.5 w-2.5" />
                          <span>A-Z</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSortMode("date");
                            localStorage.setItem("launcher_sort_mode", "date");
                          }}
                          className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-tight uppercase transition-all ${
                            sortMode === "date"
                              ? "bg-amber-500 text-neutral-950 shadow-sm"
                              : "text-neutral-400 hover:text-white"
                          }`}
                          title="Arrange by Date Created"
                        >
                          Date
                        </button>
                      </div>

                      {/* View Style */}
                      <div className="flex items-center rounded-lg border border-neutral-800 bg-neutral-900/30 p-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setViewMode("grid");
                            localStorage.setItem("launcher_view_mode", "grid");
                          }}
                          className={`p-1 rounded transition-all ${
                            viewMode === "grid"
                              ? "bg-amber-500 text-neutral-950 shadow-sm"
                              : "text-neutral-400 hover:text-white"
                          }`}
                          title="Grid View"
                        >
                          <LayoutGrid className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setViewMode("list");
                            localStorage.setItem("launcher_view_mode", "list");
                          }}
                          className={`p-1 rounded transition-all ${
                            viewMode === "list"
                              ? "bg-amber-500 text-neutral-950 shadow-sm"
                              : "text-neutral-400 hover:text-white"
                          }`}
                          title="List View"
                        >
                          <List className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <SortableContext
                      items={displayShortcuts.map((s) => s.id)}
                      strategy={rectSortingStrategy}
                    >
                      <div className={
                        viewMode === "grid"
                          ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"
                          : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5"
                      }>
                        <AnimatePresence mode="popLayout">
                          {displayShortcuts.map((shortcut) => (
                            <ShortcutCard
                              key={shortcut.id}
                              shortcut={shortcut}
                              viewMode={viewMode}
                              sortMode={sortMode}
                              onEdit={(item) => {
                                setEditingShortcut(item);
                                setShowForm(true);
                              }}
                              onDelete={handleDeleteShortcut}
                              onLaunch={handleLaunch}
                              onToggleFavorite={handleToggleFavorite}
                              onAddToWorkspace={handleAddShortcutToWorkspace}
                              workspaceName={nominatedCategory}
                              isInWorkspace={isShortcutInWorkspace(shortcut, nominatedCategory)}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                  </SortableContext>
                </motion.section>
              </>
            ) : (
              /* Flat Grid for Specific Categories or Active Search */
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-neutral-800/60 pb-2.5 gap-3 select-none">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-neutral-500" />
                    <h2 className="text-xs uppercase font-mono tracking-wider font-bold text-neutral-300">
                      {searchQuery ? "Search Results" : `Shortcuts : ${selectedCategory}`}
                    </h2>
                    <span className="text-[10px] bg-neutral-900 border border-neutral-800/60 text-neutral-400 px-1.5 py-0.5 rounded-full font-mono font-semibold">
                      {filteredShortcuts.length}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Search Input */}
                    <div className="relative w-40 sm:w-48">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-500" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search shortcuts..."
                        className="w-full rounded-lg border border-neutral-800 bg-neutral-900/30 pl-8 pr-7 py-1 text-[11px] text-white placeholder-neutral-500 focus:border-amber-500 focus:outline-none transition-all"
                        id="search-shortcuts-flat"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    {/* Sort Style */}
                    <div className="flex items-center rounded-lg border border-neutral-800 bg-neutral-900/30 p-0.5" title="Arrangement Style">
                      <button
                        type="button"
                        onClick={() => {
                          setSortMode("manual");
                          localStorage.setItem("launcher_sort_mode", "manual");
                        }}
                        className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-tight uppercase transition-all ${
                          sortMode === "manual"
                            ? "bg-amber-500 text-neutral-950 shadow-sm"
                            : "text-neutral-400 hover:text-white"
                        }`}
                      >
                        Manual
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSortMode("alphabetical");
                          localStorage.setItem("launcher_sort_mode", "alphabetical");
                        }}
                        className={`flex items-center gap-0.5 px-2 py-0.5 rounded text-[9px] font-bold tracking-tight uppercase transition-all ${
                          sortMode === "alphabetical"
                            ? "bg-amber-500 text-neutral-950 shadow-sm"
                            : "text-neutral-400 hover:text-white"
                        }`}
                      >
                        <ArrowDownAZ className="h-2.5 w-2.5" />
                        <span>A-Z</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSortMode("date");
                          localStorage.setItem("launcher_sort_mode", "date");
                        }}
                        className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-tight uppercase transition-all ${
                          sortMode === "date"
                            ? "bg-amber-500 text-neutral-950 shadow-sm"
                            : "text-neutral-400 hover:text-white"
                        }`}
                        title="Arrange by Date Created"
                      >
                        Date
                      </button>
                    </div>

                    {/* View Style */}
                    <div className="flex items-center rounded-lg border border-neutral-800 bg-neutral-900/30 p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setViewMode("grid");
                          localStorage.setItem("launcher_view_mode", "grid");
                        }}
                        className={`p-1 rounded transition-all ${
                          viewMode === "grid"
                            ? "bg-amber-500 text-neutral-950 shadow-sm"
                            : "text-neutral-400 hover:text-white"
                        }`}
                        title="Grid View"
                      >
                        <LayoutGrid className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setViewMode("list");
                          localStorage.setItem("launcher_view_mode", "list");
                        }}
                        className={`p-1 rounded transition-all ${
                          viewMode === "list"
                            ? "bg-amber-500 text-neutral-950 shadow-sm"
                            : "text-neutral-400 hover:text-white"
                        }`}
                        title="List View"
                      >
                        <List className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>

                <SortableContext
                    items={filteredShortcuts.map((s) => s.id)}
                    strategy={rectSortingStrategy}
                  >
                    <div className={
                      viewMode === "grid"
                        ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"
                        : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5"
                    }>
                      <AnimatePresence mode="popLayout">
                        {filteredShortcuts.map((shortcut) => (
                          <ShortcutCard
                            key={shortcut.id}
                            shortcut={shortcut}
                            viewMode={viewMode}
                            sortMode={sortMode}
                            onEdit={(item) => {
                              setEditingShortcut(item);
                              setShowForm(true);
                            }}
                            onDelete={handleDeleteShortcut}
                            onLaunch={handleLaunch}
                            onToggleFavorite={handleToggleFavorite}
                            onAddToWorkspace={handleAddShortcutToWorkspace}
                            workspaceName={nominatedCategory}
                            isInWorkspace={isShortcutInWorkspace(shortcut, nominatedCategory)}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                </SortableContext>
              </div>
            )}
          </div>
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
            isEdit={editingShortcut !== null && shortcuts.some((s) => s.id === editingShortcut.id)}
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
                    <h3 className="font-semibold text-white text-center mb-1">Target could not be launched</h3>
                    
                    <p className="text-xs text-neutral-400 leading-normal">
                      The target is unavailable, its protocol is not registered, or this interface is running in a browser rather than the Windows desktop application.
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
                      <h4 className="text-[11px] font-bold text-white mb-0.5">Launch check</h4>
                      <p className="text-[10px] text-neutral-400 leading-normal">
                        Confirm the saved path and ensure any custom protocol is installed. Direct launching requires the packaged Windows application or <code className="font-mono bg-neutral-950 px-1 py-0.5 rounded text-neutral-300">npm run desktop:start</code>.
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
    </DndContext>
  );
}
