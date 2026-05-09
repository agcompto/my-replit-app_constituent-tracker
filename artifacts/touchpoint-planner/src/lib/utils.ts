import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function normalizeDonorId(input: string): string | null {
  if (!input) return null;
  const digitsOnly = input.replace(/\D/g, "");
  if (!digitsOnly) return null;
  return digitsOnly.padStart(8, "0");
}

export function hasPiiPatterns(text: string): boolean {
  if (!text) return false;
  // Basic email pattern
  if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text)) return true;
  // Basic phone pattern
  if (/(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/.test(text)) return true;
  // Basic SSN pattern
  if (/\d{3}-\d{2}-\d{4}/.test(text)) return true;
  return false;
}

export function downloadCSV(filename: string, rows: Record<string, any>[]) {
  if (!rows || !rows.length) return;

  const headers = Object.keys(rows[0]);
  
  const escapeCell = (cell: any) => {
    if (cell === null || cell === undefined) return '""';
    let str = String(cell);
    
    // Formula injection prevention
    if (str.startsWith('=') || str.startsWith('+') || str.startsWith('-') || str.startsWith('@') || str.startsWith('\t') || str.startsWith('\r')) {
      str = "'" + str;
    }

    // Escape quotes and wrap in quotes
    return `"${str.replace(/"/g, '""')}"`;
  };

  const csvContent = [
    headers.map(escapeCell).join(','),
    ...rows.map(row => headers.map(h => escapeCell(row[h])).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
