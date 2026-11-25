import ExcelJS from 'exceljs';

export interface ParsedRow {
  [key: string]: string;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export async function parseSpreadsheetBuffer(
  buffer: Buffer,
  filename: string
): Promise<ParsedRow[]> {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv')) {
    const text = buffer.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];
    const headers = parseCsvLine(lines[0]).map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const cells = parseCsvLine(line);
      const row: ParsedRow = {};
      headers.forEach((h, idx) => {
        if (h) row[h] = (cells[idx] ?? '').trim();
      });
      return row;
    });
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) return [];

  const headers: string[] = [];
  sheet.getRow(1).eachCell((cell, colNum) => {
    headers[colNum] = String(cell.value ?? '').trim();
  });

  const rows: ParsedRow[] = [];
  sheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const obj: ParsedRow = {};
    let hasValue = false;
    headers.forEach((header, colNum) => {
      if (!header) return;
      const val = row.getCell(colNum).value;
      const str = val === null || val === undefined ? '' : String(val).trim();
      if (str) hasValue = true;
      obj[header] = str;
    });
    if (hasValue) rows.push(obj);
  });
  return rows;
}

export function generateCsvString(headers: string[], rows: Array<Array<string | number>>): string {
  const escape = (val: string | number) => {
    let str = String(val ?? '');
    if (
      typeof val !== 'number' &&
      /^[=+\-@\t\r]/.test(str) &&
      !/^-\d+(\.\d+)?$/.test(str)
    ) {
      str = `'${str}`;
    }
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  return [
    headers.map(escape).join(','),
    ...rows.map((r) => r.map(escape).join(',')),
  ].join('\n');
}

export async function generateExcelBuffer(
  sheetName: string,
  headers: string[],
  rows: Array<Array<string | number>>
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  rows.forEach((r) => sheet.addRow(r));
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
