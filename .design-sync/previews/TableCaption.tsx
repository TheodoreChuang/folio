import { Table, TableCaption, TableBody, TableRow, TableCell } from '@/components/ui/table'

export function Default() {
  return (
    <Table>
      <TableCaption>Properties updated this month</TableCaption>
      <TableBody>
        <TableRow>
          <TableCell>42 Wattle Street</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  )
}
