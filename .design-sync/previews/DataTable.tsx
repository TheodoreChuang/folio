import {
  DataTable,
  DataTableHead,
  DataTableHeadCell,
  DataTableBody,
  DataTableRow,
  DataTableCell,
} from '@/components/ui/data-table'

export function Default() {
  return (
    <DataTable>
      <DataTableHead>
        <DataTableRow>
          <DataTableHeadCell>Property</DataTableHeadCell>
          <DataTableHeadCell numeric>Rent</DataTableHeadCell>
          <DataTableHeadCell numeric>Expenses</DataTableHeadCell>
        </DataTableRow>
      </DataTableHead>
      <DataTableBody>
        <DataTableRow>
          <DataTableCell>42 Wattle Street</DataTableCell>
          <DataTableCell numeric>$612</DataTableCell>
          <DataTableCell numeric muted>$210</DataTableCell>
        </DataTableRow>
        <DataTableRow>
          <DataTableCell>12 Marina Ave</DataTableCell>
          <DataTableCell numeric>$540</DataTableCell>
          <DataTableCell numeric muted>$180</DataTableCell>
        </DataTableRow>
      </DataTableBody>
    </DataTable>
  )
}
