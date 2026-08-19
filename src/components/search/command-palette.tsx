"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Search, UserPlus, Building2, CalendarPlus, BarChart3, Bell, Users, CornerDownLeft } from "lucide-react";
import type { SearchResultItem, ParsedFilterChip } from "@/lib/search";
import type { Role } from "@prisma/client";

interface StaticAction {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords: string;
  roles?: Role[];
}

const STATIC_ACTIONS: StaticAction[] = [
  { id: "create-lead", label: "Create Lead", href: "/leads?add=true", icon: UserPlus, keywords: "create new lead add", roles: ["ADMIN", "DATA_MANAGER"] },
  { id: "open-customers", label: "Open Customers", href: "/customers", icon: Users, keywords: "customers demand pool contacts requirements" },
  { id: "create-property", label: "Create Property", href: "/properties?add=true", icon: Building2, keywords: "create new property add listing", roles: ["ADMIN", "DATA_MANAGER"] },
  { id: "create-visit", label: "Create Visit", href: "/visits?add=true", icon: CalendarPlus, keywords: "create schedule new visit" },
  { id: "open-reports", label: "Open Reports", href: "/reports", icon: BarChart3, keywords: "open reports analytics" },
  { id: "open-notifications", label: "Open Notifications", href: "/notifications", icon: Bell, keywords: "open notifications alerts" },
  { id: "open-employees", label: "Open Employees", href: "/employees", icon: Users, keywords: "open employees team staff", roles: ["ADMIN", "DATA_MANAGER"] },
];

const DEBOUNCE_MS = 200;

/**
 * Global Cmd+K / Ctrl+K command palette. Keyboard-first: arrow keys move the
 * selection, Enter navigates, Escape closes (handled by the shared Dialog).
 * Static actions are always shown (filtered by a simple substring match on
 * their keywords); live search results come from the deterministic
 * GET /api/search endpoint (src/lib/search) once 2+ characters are typed.
 */
export function CommandPalette({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [chips, setChips] = useState<ParsedFilterChip[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setChips([]);
    setActiveIndex(0);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale results once the query drops below the minimum length
      setResults([]);
      setChips([]);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results ?? []);
          setChips(data.query?.chips ?? []);
        }
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const filteredActions = STATIC_ACTIONS.filter((a) => (!a.roles || a.roles.includes(role)) && (query.trim() === "" || a.keywords.includes(query.toLowerCase())));

  const items: { kind: "action" | "result"; action?: StaticAction; result?: SearchResultItem }[] = [
    ...filteredActions.map((action) => ({ kind: "action" as const, action })),
    ...results.map((result) => ({ kind: "result" as const, result })),
  ];

  function go(href: string) {
    closePalette();
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[activeIndex];
      if (!item) return;
      go(item.kind === "action" ? item.action!.href : item.result!.href);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative hidden w-full max-w-md items-center rounded-xl border border-[#E7ECF2] bg-[#FAFBFC] py-2 pl-9 pr-3 text-left text-sm text-[#8A94A6] hover:border-[#3366FF] transition-colors sm:flex"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A94A6]" />
        Search everything...
        <kbd className="ml-auto rounded border border-[#E7ECF2] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#8A94A6]">Ctrl K</kbd>
      </button>
      <button onClick={() => setOpen(true)} className="text-[#596579] hover:text-[#1B2430] sm:hidden" aria-label="Search">
        <Search className="h-5 w-5" />
      </button>

      <Dialog open={open} onClose={closePalette} title="Search everything" wide>
        <div onKeyDown={onKeyDown}>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A94A6]" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              placeholder="Try: Rahul, 2 bhk Rajouri Garden under 35000, followups today, employee rohit..."
              className="w-full rounded-xl border border-[#E7ECF2] bg-[#FAFBFC] py-2.5 pl-9 pr-3 text-sm text-[#1B2430] placeholder:text-[#8A94A6] focus:border-[#3366FF] focus:outline-none focus:ring-1 focus:ring-[#3366FF]"
            />
          </div>

          {chips.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {chips.map((c, i) => (
                <Badge key={`${c.key}-${i}`} tone="blue">
                  {c.label}
                </Badge>
              ))}
            </div>
          )}

          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {items.length === 0 && !loading && (
              <p className="px-2 py-6 text-center text-sm text-[#8A94A6]">{query.trim().length >= 2 ? "No matches found." : "Type at least 2 characters to search."}</p>
            )}

            {filteredActions.length > 0 && (
              <p className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[#8A94A6]">Actions</p>
            )}
            {filteredActions.map((action) => {
              const index = items.findIndex((i) => i.kind === "action" && i.action?.id === action.id);
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  onClick={() => go(action.href)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors ${activeIndex === index ? "bg-[#EFF4FF] text-[#1B2430]" : "text-[#596579] hover:bg-[#F3F6FA]"}`}
                >
                  <Icon className="h-4 w-4 text-[#3366FF]" />
                  {action.label}
                  {activeIndex === index && <CornerDownLeft className="ml-auto h-3.5 w-3.5 text-[#8A94A6]" />}
                </button>
              );
            })}

            {results.length > 0 && <p className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[#8A94A6]">Results</p>}
            {results.map((result) => {
              const index = items.findIndex((i) => i.kind === "result" && i.result?.id === result.id && i.result?.entity === result.entity);
              return (
                <button
                  key={`${result.entity}-${result.id}`}
                  onClick={() => go(result.href)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors ${activeIndex === index ? "bg-[#EFF4FF]" : "hover:bg-[#F3F6FA]"}`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#1B2430]">{result.title}</p>
                    <p className="truncate text-xs text-[#8A94A6]">{result.subtitle}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {result.badge && <Badge tone="slate">{result.badge.replace(/_/g, " ")}</Badge>}
                    <span className="text-[10px] font-semibold uppercase text-[#8A94A6]">{result.entity.replace(/_/g, " ")}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </Dialog>
    </>
  );
}
