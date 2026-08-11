import ExcelJS from "exceljs";

export type ExportColumn<T> = {
  header: string;
  key: keyof T | string;
  width?: number;
  value?: (row: T) => string | number | null | undefined;
};

function fileSafeName(value: string) {
  return value.replace(/[^\w.-]+/g, "_");
}

export async function buildXlsxResponse<T>({
  fileName,
  sheetName,
  columns,
  rows,
}: {
  fileName: string;
  sheetName: string;
  columns: ExportColumn<T>[];
  rows: T[];
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Inteligência ALC";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: String(column.key),
    width: column.width || 18,
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: "middle" };

  rows.forEach((row) => {
    const output: Record<string, string | number | null | undefined> = {};
    columns.forEach((column) => {
      output[String(column.key)] = column.value ? column.value(row) : (row as Record<string, string | number | null | undefined>)[String(column.key)];
    });
    sheet.addRow(output);
  });

  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${fileSafeName(fileName)}"`,
      "cache-control": "no-store",
    },
  });
}
