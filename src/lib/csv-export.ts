/**
 * CSV Export Utility
 * Generates and downloads a CSV file from data arrays.
 */

export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  filename: string,
  headers: string[],
): void {
  if (!data.length) return;

  // Extract values using the headers as keys
  const csvRows: string[] = [];

  // Add header row
  csvRows.push(headers.map(escapeCSV).join(','));

  // Add data rows
  for (const row of data) {
    const values = headers.map((header) => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      return String(value);
    });
    csvRows.push(values.map(escapeCSV).join(','));
  }

  // Create blob and download
  const csvContent = csvRows.join('\n');
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Escapes a value for CSV: wraps in quotes if it contains commas, quotes, or newlines.
 */
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
