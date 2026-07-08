/**
 * Excel Export Utility
 * Generates and downloads an XLSX file from data arrays.
 * Uses the xlsx library (already installed).
 */

/**
 * Export data to Excel (.xlsx) file.
 * 
 * @param data Array of objects to export
 * @param filename Filename without extension (e.g., "aging-report")
 * @param sheetName Sheet name inside the Excel file (e.g., "Aging Report")
 * @param columnWidths Optional column widths in characters
 */
export async function exportToExcel<T extends Record<string, unknown>>(
  data: T[],
  filename: string,
  sheetName: string = 'Report',
  columnWidths?: number[],
): Promise<void> {
  if (!data.length) return;

  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  // Convert data to worksheet
  const ws = XLSX.utils.json_to_sheet(data);
  
  // Set column widths if provided
  if (columnWidths && columnWidths.length > 0) {
    ws['!cols'] = columnWidths.map((w) => ({ wch: w }));
  }

  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // Generate and download
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
