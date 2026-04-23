// Vendored from /Users/christiankatzmann/Dev/reuse-kit/ready/exceljs-workbook-kit/src/workbook.ts
//
// Small ExcelJS workbook helpers — the ExcelJS module is passed in
// dynamically so the bundler doesn't statically pull in ~800KB of code.
// Call site:
//   const ExcelJS = (await import('exceljs')).default;
//   const wb = createWorkbook(ExcelJS, 'Title');

import type ExcelJS from 'exceljs';

const MAX_SHEET_NAME = 31;

export const DEFAULT_NUMBER_FORMATS: Required<NumberFormats> = {
  number: '#,##0.0',
  integer: '#,##0',
  percent: '0.0%',
};

export interface NumberFormats {
  number?: string;
  integer?: string;
  percent?: string;
}

export interface WorkbookMeta {
  creator?: string;
  created?: Date;
}

export function createWorkbook(
  ExcelJSLib: typeof ExcelJS,
  title: string,
  meta: WorkbookMeta = {},
): ExcelJS.Workbook {
  const wb = new ExcelJSLib.Workbook();
  wb.title = title;
  wb.created = meta.created ?? new Date();
  if (meta.creator) wb.creator = meta.creator;
  return wb;
}

export function addSheet(
  wb: ExcelJS.Workbook,
  name: string,
): ExcelJS.Worksheet {
  return wb.addWorksheet(safeSheetName(name));
}

export function safeSheetName(name: string): string {
  const clean = name.replace(/[\\/?*[\]]/g, '');
  return clean.length > MAX_SHEET_NAME
    ? clean.slice(0, MAX_SHEET_NAME - 1) + '…'
    : clean;
}

export function addHeaderRow(
  sheet: ExcelJS.Worksheet,
  headers: string[],
): void {
  const row = sheet.addRow(headers);
  row.font = { bold: true };
  row.alignment = { vertical: 'middle' };

  headers.forEach((header, i) => {
    const col = sheet.getColumn(i + 1);
    col.width = Math.max(header.length + 4, 12);
  });
}

export interface AddDataRowsOptions {
  numericColumns?: readonly number[];
  integerColumns?: readonly number[];
  percentColumns?: readonly number[];
  formats?: NumberFormats;
  maxColumnWidth?: number;
}

export function addDataRows(
  sheet: ExcelJS.Worksheet,
  rows: readonly (readonly (string | number | null | undefined)[])[],
  options: AddDataRowsOptions = {},
): void {
  const numCols = new Set(options.numericColumns ?? []);
  const intCols = new Set(options.integerColumns ?? []);
  const pctCols = new Set(options.percentColumns ?? []);
  const formats = { ...DEFAULT_NUMBER_FORMATS, ...options.formats };
  const maxWidth = options.maxColumnWidth ?? 40;

  for (const rowData of rows) {
    const row = sheet.addRow(rowData.map((v) => (v == null ? '' : v)));

    rowData.forEach((val, colIdx) => {
      if (val == null) return;
      const cell = row.getCell(colIdx + 1);

      if (pctCols.has(colIdx) && typeof val === 'number') {
        cell.numFmt = formats.percent;
      } else if (intCols.has(colIdx) && typeof val === 'number') {
        cell.numFmt = formats.integer;
      } else if (numCols.has(colIdx) && typeof val === 'number') {
        cell.numFmt = formats.number;
      }

      const col = sheet.getColumn(colIdx + 1);
      const contentWidth = String(val).length + 2;
      if (contentWidth > (col.width ?? 0)) {
        col.width = Math.min(contentWidth, maxWidth);
      }
    });
  }
}

export interface FooterLine {
  text: string;
  italic?: boolean;
  colorArgb?: string;
}

export function addFooter(
  sheet: ExcelJS.Worksheet,
  lines: readonly FooterLine[],
): void {
  sheet.addRow([]);
  for (const line of lines) {
    const row = sheet.addRow([line.text]);
    row.font = {
      italic: line.italic ?? true,
      color: { argb: line.colorArgb ?? 'FF888888' },
    };
  }
}

export async function workbookToBuffer(
  wb: ExcelJS.Workbook,
): Promise<ArrayBuffer> {
  // ExcelJS returns a Buffer-like; cast to ArrayBuffer for Response().
  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}
