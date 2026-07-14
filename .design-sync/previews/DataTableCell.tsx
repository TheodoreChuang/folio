import { DataTable, DataTableBody, DataTableRow, DataTableCell } from '@/components/ui/data-table'

export function Default() {
  return (
    <DataTable>
      <DataTableBody>
        <DataTableRow>
          <DataTableCell>42 Wattle Street</DataTableCell>
          <DataTableCell numeric muted>$612</DataTableCell>
        </DataTableRow>
      </DataTableBody>
    </DataTable>
  )
}
