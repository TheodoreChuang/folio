import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'

export function Default() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Property</TableHead>
          <TableHead>Rent</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>42 Wattle Street</TableCell>
          <TableCell>$612/wk</TableCell>
          <TableCell>Complete</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>12 Marina Ave</TableCell>
          <TableCell>$540/wk</TableCell>
          <TableCell>Missing</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  )
}
