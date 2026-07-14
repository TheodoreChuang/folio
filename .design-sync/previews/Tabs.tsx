import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

export function Default() {
  return (
    <Tabs defaultValue="overview" className="w-[320px] p-6">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="ledger">Ledger</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="text-sm text-foreground-muted">
        Portfolio summary and key metrics.
      </TabsContent>
    </Tabs>
  )
}
