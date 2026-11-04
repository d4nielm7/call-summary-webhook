export interface Column {
  label: string;
  numeric?: boolean;
}

export function DataTable({ columns, rows }: { columns: Column[]; rows: string[][] }) {
  return (
    <table className="table">
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.label} className={column.numeric ? "num" : undefined}>
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row[0]}>
            {row.map((cell, i) => (
              <td key={columns[i]?.label} className={columns[i]?.numeric ? "num" : undefined}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
