export const PAGE_PROMPTS: Record<string, string[]> = {
  '/dashboard': [
    'How is my portfolio performing this month?',
    'Which property has the lowest cashflow?',
    'What is my blended LVR across all loans?',
    'Am I positively or negatively geared?',
  ],
  '/properties': [
    'Which property has the highest yield?',
    'Compare my properties by net cashflow',
    'Which property has the highest expense ratio?',
    'What is the equity in each property?',
  ],
  '/loans': [
    'What is my blended interest rate across all loans?',
    'Which loan has the highest balance?',
    'How much principal have I repaid this year?',
    'When do my fixed-rate periods expire?',
  ],
  '/entities': [
    'What does each entity hold?',
    'Summarise my portfolio structure',
    'How is ownership distributed across entities?',
  ],
  '/plan': [
    'What does my cashflow look like over the next 12 months?',
    'Can I afford to buy another property?',
    'What would happen if interest rates rose by 1%?',
  ],
  '/insights': [
    'What are my portfolio return metrics?',
    'How has my cashflow trended over the past year?',
    'Which properties are underperforming?',
  ],
}

export const FIRST_RUN_PROMPTS: string[] = [
  'What can you help me with?',
  'How do I add my first property?',
  'What does Folio track?',
  'What information do I need to get started?',
]

export const DEFAULT_PROMPTS: string[] = [
  'How is my portfolio performing?',
  'What should I focus on today?',
  'Summarise my financial position',
]

export function getStarterPrompts(pathname: string, hasData: boolean): string[] {
  if (!hasData) return FIRST_RUN_PROMPTS
  return PAGE_PROMPTS[pathname] ?? DEFAULT_PROMPTS
}
