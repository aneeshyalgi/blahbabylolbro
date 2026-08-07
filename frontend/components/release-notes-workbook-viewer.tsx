"use client";

import type { CSSProperties } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";

export type ReleaseNoteCell = {
  row: number;
  column: number;
  display: string;
  row_span?: number;
  col_span?: number;
  style?: {
    bold?: boolean;
    italic?: boolean;
    font_color?: string;
    font_size?: number;
    fill_color?: string;
    horizontal?: CSSProperties["textAlign"];
    vertical?: CSSProperties["verticalAlign"];
    wrap_text?: boolean;
  };
};

export type ReleaseNoteSheet = {
  name: string;
  max_row: number;
  max_column: number;
  truncated: boolean;
  column_widths: Record<string, number>;
  row_heights: Record<string, number>;
  cells: ReleaseNoteCell[];
};

type Props = { sheet: ReleaseNoteSheet | null; loading: boolean; error: string | null };

export function ReleaseNotesWorkbookViewer({ sheet, loading, error }: Props) {
  if (loading) {
    return <div className="flex min-h-[440px] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading worksheet</div>;
  }
  if (error) return <div className="flex min-h-[440px] items-center justify-center text-sm text-destructive">{error}</div>;
  if (!sheet) {
    return <div className="flex min-h-[440px] flex-col items-center justify-center text-center text-muted-foreground"><FileSpreadsheet className="mb-3 h-10 w-10" /><p className="text-sm">Select a workbook to view it.</p></div>;
  }

  const cells = new Map(sheet.cells.map((cell) => [`${cell.row}:${cell.column}`, cell]));
  const covered = new Set<string>();
  for (const cell of sheet.cells) {
    for (let row = cell.row; row < cell.row + (cell.row_span ?? 1); row += 1) {
      for (let column = cell.column; column < cell.column + (cell.col_span ?? 1); column += 1) {
        if (row !== cell.row || column !== cell.column) covered.add(`${row}:${column}`);
      }
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-white text-black">
      <table className="border-collapse text-xs">
        <colgroup>
          {Array.from({ length: sheet.max_column }, (_item, index) => <col key={index + 1} style={{ width: `${Math.max((sheet.column_widths[String(index + 1)] ?? 10) * 7, 32)}px` }} />)}
        </colgroup>
        <tbody>
          {Array.from({ length: sheet.max_row }, (_item, rowIndex) => {
            const row = rowIndex + 1;
            return (
              <tr key={row} style={{ height: `${sheet.row_heights[String(row)] ?? 20}px` }}>
                {Array.from({ length: sheet.max_column }, (_columnItem, columnIndex) => {
                  const column = columnIndex + 1;
                  const key = `${row}:${column}`;
                  if (covered.has(key)) return null;
                  const cell = cells.get(key);
                  const style: CSSProperties = {
                    backgroundColor: cell?.style?.fill_color,
                    color: cell?.style?.font_color,
                    fontWeight: cell?.style?.bold ? 700 : undefined,
                    fontStyle: cell?.style?.italic ? "italic" : undefined,
                    fontSize: cell?.style?.font_size ? `${cell.style.font_size}px` : undefined,
                    textAlign: cell?.style?.horizontal,
                    verticalAlign: cell?.style?.vertical,
                    whiteSpace: cell?.style?.wrap_text ? "pre-wrap" : "nowrap",
                  };
                  return <td key={key} rowSpan={cell?.row_span} colSpan={cell?.col_span} style={style} className="border border-neutral-300 px-1.5 py-1">{cell?.display ?? ""}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {sheet.truncated && <div className="sticky bottom-0 border-t bg-amber-50 px-3 py-2 text-xs text-amber-900">Preview limited to 500 rows and 100 columns.</div>}
    </div>
  );
}