import { DataTable, DataTableHead, DataTableRow, DataTableHeadCell } from '@/components/ui/data-table'

export function Default() {
  return (
    <DataTable>
      <DataTableHead>
        <DataTableRow>
          <DataTableHeadCell>Property</DataTableHeadCell>
          <DataTableHeadCell numeric>Rent</DataTableHeadCell>
        </DataTableRow>
      </DataTableHead>
    </DataTable>
  )
}
