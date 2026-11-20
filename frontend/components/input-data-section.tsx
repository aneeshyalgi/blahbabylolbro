"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertTriangle, Braces, CalendarDays, Database, FileSpreadsheet, Hash, Info, LayoutGrid, Link2, Loader2, Maximize2, PenLine, RefreshCw,
  Save, Table2, ToggleLeft, Type, X,
} from "lucide-react";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ReleaseNotesWorkbookViewer, type ReleaseNoteSheet } from "@/components/release-notes-workbook-viewer";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { EYEBROW, EmptyState, IconAction, PANEL, PRIMARY_BUTTON, SECONDARY_BUTTON, Tag, formatDateTime } from "@/components/workspace/ui";
import type { DatasetSummary } from "@/components/datasets-section";

type Cell = string | number | boolean | null;
type Row = Record<string, Cell>;

interface TableColumn {
  name: string;
  index: number;
  data_type: string;
  sample_values: Cell[];
  null_count: number;
  total_count?: number;
}

interface InputTable {
  id: string;
  name: string;
  sheet: string;
  confidence: number;
  start_row: number;
  end_row: number;
  columns: TableColumn[];
}

/** The rows of a table: all of them, or (when they could not be loaded) the first few the dataset summary carries. */
type TableRows = { rows: Row[]; complete: boolean };
type Mapping = { field: string; description?: string; similarity?: number };

interface EditState {
  tableId: string;
  rows: Row[];
  names: string[];
  originalRows: Row[];
  originalNames: string[];
  dirty: Set<string>;
  saving: boolean;
  error: string | null;
}

interface InputDataSectionProps {
  isLoading?: boolean;
  datasetId?: string | null;
  dataset?: DatasetSummary | null;
  /** Whether a table has unsaved edits (the tab asks before switching datasets). */
  onDirtyChange?: (dirty: boolean) => void;
}

const ROW_LIMIT = 200;
const NUMERIC_TYPES = new Set(["number", "integer", "int", "float", "double", "decimal", "numeric"]);
const NUMBER_TEXT = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

function sampleRows(table: InputTable): Row[] {
  const count = Math.max(0, ...table.columns.map((column) => column.sample_values?.length ?? 0));
  return Array.from({ length: count }, (_, index) => Object.fromEntries(table.columns.map((column) => [column.name, column.sample_values?.[index] ?? null])));
}

const isNumeric = (column: TableColumn) => NUMERIC_TYPES.has(column.data_type.toLowerCase());
const isEmptyCell = (value: Cell | undefined) => value === null || value === undefined || (typeof value === "string" && !value.trim());

/** An edited cell as the table stores it: empty is null, a number in a numeric column stays a number. */
function coerce(raw: string, column: TableColumn): Cell {
  const text = raw.trim();
  if (!text) return null;
  if (isNumeric(column) && NUMBER_TEXT.test(text)) return Number(text);
  return raw;
}

const cellText = (value: Cell | undefined) => (isEmptyCell(value) ? "" : String(value));

/** The Data tab's viewer of the selected dataset: the tables detected in it (all rows, editable) or the original sheet. */
export function InputDataSection({ isLoading = false, datasetId, dataset, onDirtyChange }: InputDataSectionProps) {
  const t = useTranslations("dataTab");
  const locale = useLocale();
  const { toast } = useToast();
  const [tables, setTables] = useState<InputTable[]>([]);
  const [rowsByTable, setRowsByTable] = useState<Record<string, TableRows>>({});
  const [mappings, setMappings] = useState<Record<string, Mapping>>({});
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [view, setView] = useState<"tables" | "sheet">("tables");
  const [edit, setEdit] = useState<EditState | null>(null);
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [fullscreen, setFullscreen] = useState<string | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [sheet, setSheet] = useState<ReleaseNoteSheet | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  // A new dataset starts clean: edits, the full-screen table and the sheet view belong to the previous one (all
  // datasets name their first table "table_0", so edits must never carry over).
  useEffect(() => {
    setEdit(null);
    setFullscreen(null);
    setLimits({});
    setSheetNames([]);
    setSheetIndex(0);
    setSheet(null);
    setSheetError(null);
  }, [datasetId]);

  useEffect(() => {
    setTables([]);
    setRowsByTable({});
    setMappings({});
    setLoadFailed(false);
    if (!datasetId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const response = await fetch(API_ENDPOINTS.datasetById(datasetId));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const list: InputTable[] = (await response.json()).tables ?? [];
        // Every row of every table (the summary carries only the first five); editing needs all of them, or a save
        // would cut the table down to the rows shown.
        const loaded = await Promise.all(
          list.map(async (table): Promise<[string, TableRows]> => {
            try {
              const rows = await fetch(`${API_ENDPOINTS.datasetById(datasetId)}?table_id=${encodeURIComponent(table.id)}`);
              if (!rows.ok) throw new Error(`HTTP ${rows.status}`);
              return [table.id, { rows: ((await rows.json()).data ?? []) as Row[], complete: true }];
            } catch {
              const sample = sampleRows(table);
              const total = table.columns[0]?.total_count ?? Number.POSITIVE_INFINITY;
              return [table.id, { rows: sample, complete: sample.length >= total }];
            }
          }),
        );
        if (cancelled) return;
        setTables(list);
        setRowsByTable(Object.fromEntries(loaded));
      } catch {
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
      try {
        const response = await fetch(API_ENDPOINTS.datasetMappings(datasetId));
        if (!response.ok || cancelled) return;
        const payload = await response.json();
        const found: Record<string, Mapping> = {};
        for (const mapping of Object.values(payload.mappings ?? {}).flat() as { column_name: string; abacus_field?: string; abacus_description?: string; similarity_score?: number }[]) {
          if (mapping.abacus_field) found[mapping.column_name] = { field: mapping.abacus_field, description: mapping.abacus_description, similarity: mapping.similarity_score };
        }
        if (!cancelled) setMappings(found);
      } catch {
        // The Abacus field hints are optional.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [datasetId, reload]);

  // The original sheet (classic Excel view).
  useEffect(() => {
    if (view !== "sheet" || !datasetId) return;
    let cancelled = false;
    fetch(API_ENDPOINTS.datasetSheets(datasetId))
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail || t("sheetFailed"));
        if (!cancelled) setSheetNames(payload.sheets || []);
      })
      .catch((error) => {
        if (!cancelled) setSheetError(error instanceof Error ? error.message : t("sheetFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [view, datasetId, t]);

  useEffect(() => {
    if (view !== "sheet" || !datasetId) return;
    let cancelled = false;
    setSheetLoading(true);
    setSheetError(null);
    fetch(API_ENDPOINTS.datasetSheet(datasetId, sheetIndex))
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail || t("sheetFailed"));
        if (!cancelled) setSheet(payload);
      })
      .catch((error) => {
        if (!cancelled) {
          setSheet(null);
          setSheetError(error instanceof Error ? error.message : t("sheetFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) setSheetLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, datasetId, sheetIndex, t]);

  const renamed = edit ? edit.names.filter((name, index) => name.trim() !== edit.originalNames[index]).length : 0;
  const changes = edit ? edit.dirty.size + renamed : 0;

  useEffect(() => {
    onDirtyChange?.(changes > 0);
  }, [changes, onDirtyChange]);

  // Leaving the page with unsaved edits asks first.
  useEffect(() => {
    if (!changes) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changes]);

  useEffect(() => {
    if (!fullscreen) return;
    const close = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !(event.target instanceof HTMLInputElement)) setFullscreen(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [fullscreen]);

  const startEdit = (table: InputTable) => {
    const rows = rowsByTable[table.id]?.rows ?? [];
    setEdit({
      tableId: table.id,
      rows: rows.map((row) => ({ ...row })),
      originalRows: rows,
      names: table.columns.map((column) => column.name),
      originalNames: table.columns.map((column) => column.name),
      dirty: new Set(),
      saving: false,
      error: null,
    });
  };

  // An edited cell keeps the text as typed ("30000." while a decimal is being typed); it becomes a number on save.
  const changeCell = (rowIndex: number, column: TableColumn, raw: string) => {
    setEdit((current) => {
      if (!current) return current;
      const rows = current.rows.slice();
      rows[rowIndex] = { ...rows[rowIndex], [column.name]: raw === "" ? null : raw };
      const key = `${rowIndex}:${column.name}`;
      const dirty = new Set(current.dirty);
      if (cellText(current.originalRows[rowIndex]?.[column.name]) === raw.trim()) dirty.delete(key);
      else dirty.add(key);
      return { ...current, rows, dirty, error: null };
    });
  };

  const changeName = (index: number, value: string) => {
    setEdit((current) => {
      if (!current) return current;
      const names = current.names.slice();
      names[index] = value;
      return { ...current, names, error: null };
    });
  };

  const save = async (table: InputTable) => {
    if (!edit || !datasetId || edit.tableId !== table.id) return;
    const names = edit.names.map((name) => name.trim());
    if (names.some((name) => !name)) {
      setEdit({ ...edit, error: t("nameEmpty") });
      return;
    }
    if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) {
      setEdit({ ...edit, error: t("nameDuplicate") });
      return;
    }
    if (!changes) {
      setEdit(null);
      return;
    }
    const cells = edit.dirty.size;
    // Changed cells as the table stores them: empty is null, a number typed into a numeric column a number (a text
    // "30000" in a numeric column would break the code's arithmetic). Unchanged cells keep their original values.
    const byName = new Map(table.columns.map((column) => [column.name, column]));
    const data = edit.rows.map((row, rowIndex) => {
      const out: Row = { ...row };
      for (const [name, column] of byName) {
        if (edit.dirty.has(`${rowIndex}:${name}`)) out[name] = coerce(cellText(row[name]), column);
      }
      return out;
    });
    setEdit({ ...edit, saving: true, error: null });
    try {
      const response = await fetch(API_ENDPOINTS.datasetTableData(datasetId, table.id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, column_names: names }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload?.detail === "string" ? payload.detail : `HTTP ${response.status}`);
      const invalidated = Number(payload?.invalidated_cluster_execution_links || 0);
      toast({
        title: t("saved"),
        description: [t("savedDesc", { cells, columns: renamed }), invalidated ? t("savedInvalidated", { count: invalidated }) : ""].filter(Boolean).join(" "),
      });
      setEdit(null);
      setReload((value) => value + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("saveFailed");
      setEdit((current) => (current ? { ...current, saving: false, error: message } : current));
      toast({ title: t("saveFailed"), description: message, variant: "destructive" });
    }
  };

  const fullscreenTable = tables.find((table) => table.id === fullscreen) ?? null;
  const name = dataset?.user_name || dataset?.filename || "";

  const tableCard = (table: InputTable, mode: "inline" | "fullscreen") => {
    const loaded = rowsByTable[table.id] ?? { rows: sampleRows(table), complete: false };
    const editing = edit?.tableId === table.id ? edit : null;
    const total = Math.max(loaded.rows.length, table.columns[0]?.total_count ?? 0);
    const empties = table.columns.reduce((sum, column) => sum + (column.null_count ?? 0), 0);
    const confidence = Math.round((table.confidence ?? 0) * 100);
    const limit = limits[table.id] ?? ROW_LIMIT;
    return (
      <div className={cn("overflow-hidden rounded-xl border border-[#1f252e] bg-[#0d1218]", mode === "fullscreen" && "flex min-h-0 flex-1 flex-col")}>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#1f252e] px-4 py-3">
          <Table2 className="h-4 w-4 shrink-0 text-[#f5c400]" />
          <span className="mr-1 text-[13.5px] font-semibold text-white">{table.name}</span>
          <Tag>{t("sheet", { name: table.sheet })}</Tag>
          <Tag>{t("size", { rows: total, columns: table.columns.length })}</Tag>
          <Tag tone={confidence >= 90 ? "green" : confidence >= 70 ? "amber" : "rose"} title={t("confidenceHint")}>{t("confidence", { value: confidence })}</Tag>
          <Tag title={t("emptiesHint")}>{t("empties", { count: empties })}</Tag>
          <div className="ml-auto flex items-center gap-1.5">
            {editing ? (
              <>
                {changes ? <span className="mr-1 flex items-center gap-1.5 text-[11.5px] text-[#c9a400]"><span className="h-1.5 w-1.5 rounded-full bg-[#f5c400]" />{t("unsaved")}</span> : null}
                <button type="button" className={cn(SECONDARY_BUTTON, "h-8")} onClick={() => setEdit(null)} disabled={editing.saving}>
                  <X className="h-3.5 w-3.5" />
                  {t("cancelEdit")}
                </button>
                <button type="button" className={cn(PRIMARY_BUTTON, "h-8 px-3")} onClick={() => void save(table)} disabled={!changes || editing.saving}>
                  {editing.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {editing.saving ? t("saving") : changes ? t("saveCount", { count: changes }) : t("save")}
                </button>
              </>
            ) : (
              <button
                type="button"
                className={cn(SECONDARY_BUTTON, "h-8")}
                onClick={() => startEdit(table)}
                disabled={!loaded.complete || Boolean(edit)}
                title={!loaded.complete ? t("editDisabledPartial") : edit ? t("otherTableEditing") : undefined}
              >
                <PenLine className="h-3.5 w-3.5" />
                {t("edit")}
              </button>
            )}
            {mode === "inline" ? (
              <IconAction label={t("fullscreen")} onClick={() => setFullscreen(table.id)}>
                <Maximize2 className="h-4 w-4" />
              </IconAction>
            ) : (
              <IconAction label={t("exitFullscreen")} onClick={() => setFullscreen(null)}>
                <X className="h-4 w-4" />
              </IconAction>
            )}
          </div>
        </div>
        {editing ? (
          <div className="border-b border-[#f5c400]/15 bg-[#f5c400]/[0.04] px-4 py-2 text-[12px] text-[#d8b830]">{t("editingHint")}</div>
        ) : null}
        {editing?.error ? (
          <p role="alert" className="border-b border-rose-400/20 bg-rose-400/[0.06] px-4 py-2 text-[12.5px] text-rose-200">{editing.error}</p>
        ) : null}
        {!loaded.complete ? (
          <p className="flex items-center gap-2 border-b border-[#1f252e] px-4 py-2 text-[12px] text-[#8c96a8]">
            <Info className="h-3.5 w-3.5 shrink-0" />
            {t("editDisabledPartial")}
          </p>
        ) : null}
        <div className={cn("p-3", mode === "fullscreen" && "min-h-0 flex-1")}>
          <DataGrid
            table={table}
            rows={editing ? editing.rows : loaded.rows}
            edit={editing}
            mappings={mappings}
            limit={limit}
            maxHeight={mode === "fullscreen" ? "calc(100vh - 210px)" : "440px"}
            onCell={changeCell}
            onName={changeName}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[#1f252e] px-4 py-2.5 text-[11.5px] text-[#687386]">
          <span className="flex items-center gap-1.5"><Hash className="h-3 w-3" />{t("typeNumber")}</span>
          <span className="flex items-center gap-1.5"><Type className="h-3 w-3" />{t("typeString")}</span>
          <span className="flex items-center gap-1.5"><span className="text-[#3f4957]">—</span>{t("legendEmpty")}</span>
          <span className="flex items-center gap-1.5"><Link2 className="h-3 w-3 text-[#f5c400]" />{t("legendMapped")}</span>
          {loaded.rows.length > limit ? (
            <span className="ml-auto flex items-center gap-2">
              {t("showing", { shown: limit, total: loaded.rows.length })}
              <button type="button" className="font-medium text-[#f5c400] hover:underline" onClick={() => setLimits((current) => ({ ...current, [table.id]: Number.POSITIVE_INFINITY }))}>
                {t("showAll")}
              </button>
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  let body: ReactNode;
  if (!datasetId) {
    body = <EmptyState icon={Database} title={t("selectTitle")} hint={t("selectHint")} />;
  } else if (view === "sheet") {
    body = (
      <div className="space-y-3">
        {sheetNames.length > 1 ? (
          <div role="tablist" aria-label={t("viewSheet")} className="flex flex-wrap gap-1.5">
            {sheetNames.map((sheetName, index) => (
              <button
                key={`${sheetName}-${index}`}
                type="button"
                role="tab"
                aria-selected={index === sheetIndex}
                onClick={() => setSheetIndex(index)}
                className={cn(
                  "h-8 rounded-md border px-3 text-[12.5px] transition-colors",
                  index === sheetIndex ? "border-[#f5c400]/40 bg-[#f5c400]/10 text-[#f5c400]" : "border-[#252a33] text-[#aab3c2] hover:text-white",
                )}
              >
                {sheetName}
              </button>
            ))}
          </div>
        ) : null}
        <div className="max-h-[560px] overflow-auto rounded-lg border border-[#1f252e]">
          <ReleaseNotesWorkbookViewer sheet={sheet} loading={sheetLoading} error={sheetError} />
        </div>
      </div>
    );
  } else if (loading || isLoading) {
    body = (
      <div className="space-y-2">
        <Skeleton className="h-11 w-full bg-[#121821]" />
        {[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-8 w-full bg-[#10161e]" />)}
      </div>
    );
  } else if (loadFailed) {
    body = (
      <EmptyState icon={AlertTriangle} title={t("dataFailed")}>
        <button type="button" className={SECONDARY_BUTTON} onClick={() => setReload((value) => value + 1)}>
          <RefreshCw className="h-4 w-4" />
          {t("retry")}
        </button>
      </EmptyState>
    );
  } else if (!tables.length) {
    body = <EmptyState icon={FileSpreadsheet} title={t("noTables")} hint={t("noTablesHint")} />;
  } else {
    body = <div className="space-y-4">{tables.map((table) => <div key={table.id}>{tableCard(table, "inline")}</div>)}</div>;
  }

  return (
    <section className={PANEL} aria-label={t("inputData")}>
      <div className="flex flex-wrap items-center gap-3 border-b border-[#1f252e] px-5 py-3.5">
        <div className="mr-auto min-w-0">
          <p className={EYEBROW}>{t("inputData")}</p>
          {datasetId && name ? (
            <>
              <p className="mt-1 truncate text-[15px] font-semibold text-white" title={name}>{name}</p>
              <p className="mt-0.5 truncate text-[12px] text-[#8c96a8]">
                <span className="font-mono">{dataset?.filename}</span>
                {dataset?.version ? <> · <span className="font-mono">{dataset.version}</span></> : null}
                {dataset?.upload_date ? <> · {t("uploadedOn", { date: formatDateTime(dataset.upload_date, locale) })}</> : null}
              </p>
            </>
          ) : null}
        </div>
        {datasetId ? (
          <div className="flex items-center gap-2">
            <div role="tablist" aria-label={t("viewLabel")} className="flex rounded-lg border border-[#252a33] bg-[#0f141b] p-0.5">
              {([["tables", LayoutGrid, t("viewTables")], ["sheet", FileSpreadsheet, t("viewSheet")]] as const).map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={view === value}
                  onClick={() => setView(value)}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors",
                    view === value ? "bg-[#f5c400]/12 text-[#f5c400] shadow-[inset_0_0_0_1px_rgba(245,196,0,0.3)]" : "text-[#8c96a8] hover:text-white",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} aria-label={t("viewHint")} className="flex h-7 w-7 items-center justify-center rounded-md text-[#687386] outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-[#f5c400]/50">
                  <Info className="h-4 w-4" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">{t("viewHint")}</TooltipContent>
            </Tooltip>
          </div>
        ) : null}
      </div>
      <div className="p-4">{body}</div>

      {fullscreenTable && view === "tables" ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/70 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={fullscreenTable.name}>
          {tableCard(fullscreenTable, "fullscreen")}
        </div>
      ) : null}
    </section>
  );
}

const TYPE_ICONS: Record<string, typeof Hash> = { number: Hash, integer: Hash, int: Hash, float: Hash, double: Hash, decimal: Hash, numeric: Hash, string: Type, text: Type, date: CalendarDays, datetime: CalendarDays, boolean: ToggleLeft, bool: ToggleLeft };

/** The rows of a table as a spreadsheet: sticky header (type, Abacus match, how full each column is) and row numbers;
 *  in edit mode every cell and column name is an input. Enter moves down a row, Esc restores the cell. */
function DataGrid({ table, rows, edit, mappings, limit, maxHeight, onCell, onName }: {
  table: InputTable;
  rows: Row[];
  edit: EditState | null;
  mappings: Record<string, Mapping>;
  limit: number;
  maxHeight: string;
  onCell: (rowIndex: number, column: TableColumn, raw: string) => void;
  onName: (index: number, value: string) => void;
}) {
  const t = useTranslations("dataTab");
  const grid = useRef<HTMLDivElement | null>(null);
  const visible = useMemo(() => rows.slice(0, limit), [rows, limit]);

  const focusCell = (row: number, column: number) => grid.current?.querySelector<HTMLInputElement>(`[data-cell="${row}:${column}"]`)?.focus();

  const onCellKey = (event: KeyboardEvent<HTMLInputElement>, rowIndex: number, columnIndex: number, column: TableColumn) => {
    if (event.key === "Enter") {
      event.preventDefault();
      focusCell(event.shiftKey ? rowIndex - 1 : rowIndex + 1, columnIndex);
    } else if (event.key === "Escape" && edit) {
      event.preventDefault();
      onCell(rowIndex, column, cellText(edit.originalRows[rowIndex]?.[column.name]));
    }
  };

  return (
    <div ref={grid} className="overflow-auto rounded-lg border border-[#1f252e] bg-[#0a0e13]" style={{ maxHeight }}>
      <table className="w-max min-w-full border-separate border-spacing-0 text-[12.5px]">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-20 w-11 border-b border-r border-[#1f252e] bg-[#0f141b] px-2 text-right text-[10.5px] font-medium text-[#4a5464]">#</th>
            {table.columns.map((column, index) => {
              const Icon = TYPE_ICONS[column.data_type.toLowerCase()] ?? Braces;
              const total = column.total_count ?? rows.length;
              const filled = Math.max(0, total - (column.null_count ?? 0));
              const ratio = total ? filled / total : 0;
              const mapping = mappings[column.name];
              return (
                <th key={column.index} className="sticky top-0 z-10 min-w-[128px] border-b border-r border-[#1f252e] bg-[#0f141b] px-3 pb-1.5 pt-2 text-left align-bottom font-normal">
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3 w-3 shrink-0 text-[#687386]" aria-label={column.data_type} />
                    {edit ? (
                      <input
                        value={edit.names[index] ?? column.name}
                        onChange={(event) => onName(index, event.target.value)}
                        aria-label={t("columnName", { index: index + 1 })}
                        className={cn(
                          "h-7 min-w-[110px] flex-1 rounded border bg-[#0b0f15] px-1.5 text-[12px] font-semibold text-white outline-none focus:border-[#f5c400]/60",
                          (edit.names[index] ?? "").trim() !== edit.originalNames[index] ? "border-[#f5c400]/50" : "border-[#2a313c]",
                        )}
                      />
                    ) : (
                      <span className="truncate text-[12px] font-semibold text-white" title={column.name}>{column.name}</span>
                    )}
                    {mapping ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span tabIndex={0} className="shrink-0 rounded outline-none focus-visible:ring-2 focus-visible:ring-[#f5c400]/50" aria-label={t("mappedField", { field: mapping.field })}>
                            <Link2 className="h-3 w-3 text-[#f5c400]" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-sm">
                          <p className="text-xs font-semibold">{t("mappedField", { field: mapping.field })}</p>
                          {mapping.description ? <p className="mt-1 text-xs">{mapping.description}</p> : null}
                          {typeof mapping.similarity === "number" ? <p className="mt-1 text-xs opacity-70">{t("mappedMatch", { value: Math.round(mapping.similarity * 100) })}</p> : null}
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5" title={t("filled", { filled, total })}>
                    <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-[#1c232d]">
                      <div className={cn("h-full rounded-full", ratio >= 1 ? "bg-emerald-400/70" : ratio > 0 ? "bg-amber-400/70" : "bg-transparent")} style={{ width: `${Math.round(ratio * 100)}%` }} />
                    </div>
                    <span className={cn("text-[10px] tabular-nums", ratio > 0 ? "text-[#687386]" : "text-[#4a5464]")}>{ratio > 0 ? `${filled}/${total}` : t("emptyColumn")}</span>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {visible.map((row, rowIndex) => (
            <tr key={rowIndex} className="group">
              <td className="sticky left-0 z-[5] border-b border-r border-[#151b23] bg-[#0b0f15] px-2 text-right text-[11px] tabular-nums text-[#4a5464] group-hover:text-[#8c96a8]">{rowIndex + 1}</td>
              {table.columns.map((column, columnIndex) => {
                const value = row[column.name];
                const numeric = isNumeric(column) || typeof value === "number";
                const dirty = Boolean(edit?.dirty.has(`${rowIndex}:${column.name}`));
                return (
                  <td key={column.index} className={cn("border-b border-r border-[#151b23] p-0 group-hover:bg-white/[0.02]", isEmptyCell(value) && !edit && "bg-white/[0.012]")}>
                    {edit ? (
                      <input
                        data-cell={`${rowIndex}:${columnIndex}`}
                        value={cellText(value)}
                        onChange={(event) => onCell(rowIndex, column, event.target.value)}
                        onKeyDown={(event) => onCellKey(event, rowIndex, columnIndex, column)}
                        aria-label={`${column.name} ${rowIndex + 1}`}
                        className={cn(
                          "h-8 w-full min-w-[120px] bg-transparent px-3 text-[12.5px] text-white outline-none focus:bg-[#f5c400]/[0.06] focus:shadow-[inset_0_0_0_1px_rgba(245,196,0,0.55)]",
                          numeric && "text-right tabular-nums",
                          dirty && "bg-[#f5c400]/[0.09] shadow-[inset_2px_0_0_#f5c400]",
                        )}
                      />
                    ) : (
                      <div className={cn("max-w-[320px] truncate px-3 py-[7px]", numeric ? "text-right tabular-nums text-[#e5e9f0]" : "text-[#dbe2ec]")} title={isEmptyCell(value) ? undefined : String(value)}>
                        {isEmptyCell(value) ? <span className="text-[#3f4957]">—</span> : String(value)}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
