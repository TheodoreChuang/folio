export function groupStagedItemsByDocument<T extends { sourceDocumentId: string }>(
  items: T[],
  docMap: Map<string, string>,
): Array<{ sourceDocumentId: string; documentFileName: string; items: T[] }> {
  const grouped = new Map<string, { sourceDocumentId: string; documentFileName: string; items: T[] }>()
  for (const item of items) {
    if (!grouped.has(item.sourceDocumentId)) {
      grouped.set(item.sourceDocumentId, {
        sourceDocumentId: item.sourceDocumentId,
        documentFileName: docMap.get(item.sourceDocumentId) ?? 'Unknown',
        items: [],
      })
    }
    grouped.get(item.sourceDocumentId)!.items.push(item)
  }
  return Array.from(grouped.values())
}
