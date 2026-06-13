import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import {
  ApiKeyCreatedResponseSchema,
  ApiKeyRevokedResponseSchema,
  ApiKeysListResponseSchema,
  LedgerFyResponseSchema,
  PortfolioSummaryResponseSchema,
} from './schemas'

extendZodWithOpenApi(z)

const registry = new OpenAPIRegistry()

registry.registerComponent('securitySchemes', 'BearerAuth', {
  type: 'http',
  scheme: 'bearer',
  description: 'API key generated from Folio Settings → API Keys. Prefix: sk_live_',
})

// ── Shared schemas ────────────────────────────────────────────────────────────

const ErrorSchema = registry.register('Error', z.object({
  error: z.string().openapi({ description: 'Human-readable error message' }),
}))

const UUIDParam = z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' })

// ── Properties ────────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/api/v1/properties',
  tags: ['Properties'],
  summary: 'List properties for the authenticated user',
  description: 'Returns all properties owned by the authenticated user. Optionally filter by owning entity. Use this to get an overview of the investment portfolio.',
  security: [{ BearerAuth: [] }],
  request: {
    query: z.object({
      entityId: z.string().uuid().optional().openapi({
        description: 'Filter properties by owning entity UUID',
      }),
    }),
  },
  responses: {
    200: {
      description: 'List of properties',
      content: { 'application/json': { schema: z.object({ properties: z.array(z.unknown()) }) } },
    },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/properties',
  tags: ['Properties'],
  summary: 'Create a new property',
  description: 'Add a new investment property to the portfolio. Requires at minimum an address and start date.',
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            address: z.string().min(1).max(500).openapi({ description: 'Full street address' }),
            startDate: z.string().openapi({ description: 'Date the property was acquired (YYYY-MM-DD)' }),
            nickname: z.string().nullable().optional().openapi({ description: 'Optional short label' }),
            endDate: z.string().nullable().optional().openapi({ description: 'Date the property was sold (YYYY-MM-DD)' }),
            entityId: z.string().uuid().nullable().optional().openapi({ description: 'Owning entity UUID' }),
            propertyType: z.enum(['house', 'unit', 'townhouse', 'land']).nullable().optional(),
            purchasePriceCents: z.number().int().nonnegative().nullable().optional().openapi({ description: 'Purchase price in cents (e.g. 65000000 = $650,000)' }),
          }),
        },
      },
    },
  },
  responses: {
    201: { description: 'Property created', content: { 'application/json': { schema: z.object({ property: z.unknown() }) } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

// ── Loans ─────────────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/api/v1/loans',
  tags: ['Loans'],
  summary: 'List all loans for the authenticated user',
  description: 'Returns all installment loans (mortgages, investment loans) for the user. Filter by entity, lender, or loan type.',
  security: [{ BearerAuth: [] }],
  request: {
    query: z.object({
      entityId: z.string().uuid().optional().openapi({ description: 'Filter by owning entity' }),
      lender: z.string().optional().openapi({ description: 'Filter by lender name' }),
      loanType: z.enum(['interest_only', 'principal_and_interest', 'line_of_credit']).optional(),
    }),
  },
  responses: {
    200: { description: 'List of loans', content: { 'application/json': { schema: z.object({ loans: z.array(z.unknown()) }) } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

// ── Entities ──────────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/api/v1/entities',
  tags: ['Entities'],
  summary: 'List ownership entities for the authenticated user',
  description: 'Returns all ownership structures (individual, trust, company, etc.) that own properties and loans. Use this to understand the holding structure of the portfolio.',
  security: [{ BearerAuth: [] }],
  responses: {
    200: { description: 'List of entities', content: { 'application/json': { schema: z.object({ entities: z.array(z.unknown()) }) } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

// ── Portfolio aggregation ─────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/api/v1/portfolio/summary',
  tags: ['Portfolio'],
  summary: 'Get portfolio-level LVR and equity summary',
  description: 'Returns aggregate portfolio metrics: total property value, total debt, LVR percentage, and net equity across all (or entity-filtered) properties. Use this to answer "what is my overall LVR?" or "how much equity do I have?"',
  security: [{ BearerAuth: [] }],
  request: {
    query: z.object({
      entityId: z.string().uuid().optional().openapi({ description: 'Scope to a specific ownership entity' }),
    }),
  },
  responses: {
    200: {
      description: 'Portfolio summary',
      content: { 'application/json': { schema: PortfolioSummaryResponseSchema } },
    },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/portfolio/return',
  tags: ['Portfolio'],
  summary: 'Calculate investment return over a date range',
  description: 'Returns total return, capital gain, and income return percentages for the portfolio or a specific entity over a given period. Use this to answer "what was my return last financial year?"',
  security: [{ BearerAuth: [] }],
  request: {
    query: z.object({
      from: z.string().openapi({ description: 'Start date (YYYY-MM-DD)', example: '2025-07-01' }),
      to: z.string().openapi({ description: 'End date (YYYY-MM-DD)', example: '2026-06-30' }),
      entityId: z.string().uuid().optional().openapi({ description: 'Scope to a specific entity' }),
    }),
  },
  responses: {
    200: { description: 'Return metrics', content: { 'application/json': { schema: z.unknown() } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

// ── Ledger ────────────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/api/v1/ledger/summary',
  tags: ['Ledger'],
  summary: 'Get cashflow summary for a date range',
  description: 'Returns aggregated income and expense totals (rent, management fees, repairs, mortgage payments) plus health flags (missing statements, missing mortgage entries) for the specified period. The primary endpoint for cashflow questions.',
  security: [{ BearerAuth: [] }],
  request: {
    query: z.object({
      from: z.string().openapi({ description: 'Start date (YYYY-MM-DD)', example: '2026-01-01' }),
      to: z.string().openapi({ description: 'End date (YYYY-MM-DD)', example: '2026-06-30' }),
      propertyId: z.string().uuid().optional(),
      entityId: z.string().uuid().optional(),
    }),
  },
  responses: {
    200: { description: 'Cashflow summary with health flags', content: { 'application/json': { schema: z.unknown() } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/ledger/fy',
  tags: ['Ledger'],
  summary: 'Resolve an Australian financial year to a date range',
  description: 'Converts an Australian financial year notation (e.g. 2025-26) to its ISO date range (July 1 – June 30). Use the returned from/to values as inputs to other endpoints such as /api/v1/ledger/summary.',
  security: [{ BearerAuth: [] }],
  request: {
    query: z.object({
      year: z.string().openapi({ description: 'Financial year in YYYY-YY format', example: '2025-26' }),
    }),
  },
  responses: {
    200: {
      description: 'Date range for the requested financial year',
      content: { 'application/json': { schema: LedgerFyResponseSchema } },
    },
    400: { description: 'Invalid or missing year param', content: { 'application/json': { schema: ErrorSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

// ── Reports ───────────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/api/v1/reports/trends',
  tags: ['Reports'],
  summary: 'Get 12-month cashflow trend data',
  description: 'Returns monthly cashflow (income, expenses, net) for the trailing 12 months. Use this to plot or summarise cashflow over time.',
  security: [{ BearerAuth: [] }],
  request: {
    query: z.object({
      from: z.string().openapi({ description: 'Start date (YYYY-MM-DD)', example: '2025-07-01' }),
      to: z.string().openapi({ description: 'End date (YYYY-MM-DD)', example: '2026-06-30' }),
      entityId: z.string().uuid().optional().openapi({ description: 'Scope to a specific entity' }),
    }),
  },
  responses: {
    200: { description: 'Monthly trend data', content: { 'application/json': { schema: z.unknown() } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

// ── API Keys ──────────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/api/v1/api-keys',
  tags: ['API Keys'],
  summary: 'List API keys for the authenticated user',
  description: 'Returns all active (non-revoked) API keys. The secret key value is never returned after creation.',
  security: [{ BearerAuth: [] }],
  responses: {
    200: {
      description: 'List of API keys',
      content: { 'application/json': { schema: ApiKeysListResponseSchema } },
    },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/api-keys',
  tags: ['API Keys'],
  summary: 'Create a new API key',
  description: 'Generate a new API key. The full key value (sk_live_...) is returned ONCE in this response and cannot be retrieved again. Store it securely.',
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string().min(1).max(100).openapi({ description: 'Label for this key, e.g. "Claude Projects"', example: 'Claude Projects' }),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'API key created — key value shown once',
      content: { 'application/json': { schema: ApiKeyCreatedResponseSchema } },
    },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'delete',
  path: '/api/v1/api-keys/{id}',
  tags: ['API Keys'],
  summary: 'Revoke an API key',
  description: 'Permanently revoke an API key. Any requests using the revoked key will immediately return 401.',
  security: [{ BearerAuth: [] }],
  request: { params: z.object({ id: UUIDParam }) },
  responses: {
    200: { description: 'Key revoked', content: { 'application/json': { schema: ApiKeyRevokedResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorSchema } } },
    404: { description: 'Key not found', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

// ── Spec generator ────────────────────────────────────────────────────────────

let cachedSpec: ReturnType<OpenApiGeneratorV31['generateDocument']> | null = null

export function generateOpenApiSpec() {
  if (cachedSpec) return cachedSpec
  const generator = new OpenApiGeneratorV31(registry.definitions)
  cachedSpec = generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Folio API',
      version: 'v1',
      description: `
The Folio API gives programmatic access to your property investment portfolio.
Use it with AI tools (Claude, Custom GPT), scripts, or any HTTP client.

**Authentication:** Include your API key as a Bearer token:
\`\`\`
Authorization: Bearer sk_live_your_key_here
\`\`\`

Generate API keys from Folio Settings → API Keys.
      `.trim(),
      contact: { url: 'https://folio.app' },
    },
    servers: [{ url: 'https://folio.app', description: 'Production' }],
  })
  return cachedSpec
}
