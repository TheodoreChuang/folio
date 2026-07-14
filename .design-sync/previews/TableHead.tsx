import { Table, TableHeader, TableRow, TableHead } from '@/components/ui/table'

export function Default() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Property</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
    </Table>
  )
}
