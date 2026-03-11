interface MappingPreviewProps {
  columns: string[]
  mapping: Record<string, string>
}

export function MappingPreview({ columns, mapping }: MappingPreviewProps) {
  const mappedRows = columns.filter(
    (col) => !!mapping[col] && mapping[col] !== "",
  )

  if (mappedRows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No columns mapped — go back to adjust mappings
      </p>
    )
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b">
          <th className="pb-2 text-left font-medium text-muted-foreground">
            Source Column
          </th>
          <th className="pb-2 text-left font-medium text-muted-foreground">
            Voter Field
          </th>
        </tr>
      </thead>
      <tbody>
        {mappedRows.map((col) => (
          <tr key={col} className="border-b last:border-0">
            <td className="py-2 pr-4 font-mono text-xs">{col}</td>
            <td className="py-2 font-mono text-xs">{mapping[col]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
