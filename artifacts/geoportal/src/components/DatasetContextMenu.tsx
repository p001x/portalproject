/**
 * DatasetContextMenu — ArcGIS Pro–style right-click context menu.
 * 
 * Uses React Portal so it can be rendered from ANY element (including <tr>)
 * without breaking HTML semantics. The menu floats above everything at the
 * document body level.
 * 
 * Usage:
 *   const ctx = useDatasetContextMenu();
 *   <tr onContextMenu={ctx.open(menuItems, record)}>...</tr>
 *   {ctx.render()}
 */
import { useState, useEffect, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Eye,
  Settings2,
  Download,
  Copy,
  Scissors,
  Code2,
  Trash2,
  Edit3,
  ExternalLink,
  FolderOpen,
} from "lucide-react";
import { DatasetTypeIcon } from "@/components/DatasetTypeIcon";
import type { DatasetRecord } from "@/lib/api";

export interface ContextMenuItem {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
  dividerAfter?: boolean;
}

interface MenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
  dataset: DatasetRecord | null;
}

/**
 * Hook-based context menu — returns .open() handler + .render() portal.
 * Attach .open() to onContextMenu on any element. Call .render() once in JSX.
 */
export function useDatasetContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);

  const close = useCallback(() => setMenu(null), []);

  // Close on Escape or scroll
  useEffect(() => {
    if (!menu) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const handleScroll = () => close();

    window.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [menu, close]);

  /** Returns an onContextMenu handler. Attach to <tr>, <div>, etc. */
  const open = useCallback(
    (items: ContextMenuItem[], dataset?: DatasetRecord) =>
      (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // Calculate position within viewport
        const x = Math.min(e.clientX, window.innerWidth - 240);
        const y = Math.min(e.clientY, window.innerHeight - (items.length * 36 + 60));
        setMenu({ x: Math.max(4, x), y: Math.max(4, y), items, dataset: dataset ?? null });
      },
    []
  );

  /** Renders the portal. Call once in JSX at any level. */
  const render = useCallback(() => {
    if (!menu) return null;
    return createPortal(
      <>
        {/* Transparent backdrop overlay that captures outside clicks and closes the menu */}
        <div
          className="fixed inset-0 z-[9998] bg-transparent"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            close();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            close();
          }}
        />

        {/* Floating Context Menu */}
        <div
          className="fixed z-[9999] min-w-[220px] py-1 rounded-xl border border-border/80 bg-popover/98 backdrop-blur-xl shadow-2xl animate-in fade-in-0 zoom-in-95 duration-100"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Header with dataset icon + name */}
          {menu.dataset && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60 mb-0.5 select-none">
              <DatasetTypeIcon fileType={menu.dataset.file_type || "other"} size={20} />
              <span className="text-xs font-semibold text-foreground truncate max-w-[160px]">
                {menu.dataset.name}
              </span>
            </div>
          )}

          {menu.items.map((item, i) => (
            <div key={i}>
              <button
                type="button"
                className={`w-full flex items-center gap-2.5 px-3 py-[7px] text-[13px] transition-colors text-left cursor-pointer ${
                  item.disabled
                    ? "text-muted-foreground/40 cursor-not-allowed"
                    : item.variant === "danger"
                    ? "text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                    : "text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!item.disabled) {
                    const action = item.onClick;
                    close();
                    action();
                  }
                }}
                disabled={item.disabled}
              >
                <span className="w-4 h-4 shrink-0 flex items-center justify-center opacity-80 pointer-events-none">
                  {item.icon}
                </span>
                <span className="font-medium pointer-events-none">{item.label}</span>
              </button>
              {item.dividerAfter && <div className="my-0.5 mx-2 border-t border-border/40" />}
            </div>
          ))}
        </div>
      </>,
      document.body
    );
  }, [menu, close]);

  return { open, render, close, isOpen: !!menu };
}

// Re-export icons for convenience
export { Eye, Settings2, Download, Copy, Scissors, Code2, Trash2, Edit3, ExternalLink, FolderOpen };
