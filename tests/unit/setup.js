import { vi } from "vitest";

// Mock Prisma client
export const mockPrisma = {
  drop: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  },
  dropProduct: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  setting: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
  session: {
    deleteMany: vi.fn(),
  },
  $transaction: vi.fn((fns) => Promise.all(fns)),
};

// Mock admin GraphQL client
export const mockAdmin = {
  graphql: vi.fn(),
};

// Mock session
export const mockSession = {
  shop: "test-shop.myshopify.com",
  accessToken: "test-token",
};

// Mock authenticate
export const mockAuthenticate = {
  admin: vi.fn().mockResolvedValue({
    session: mockSession,
    admin: mockAdmin,
  }),
  webhook: vi.fn(),
};

// Apply mocks
vi.mock("../app/db.server", () => ({
  default: mockPrisma,
}));

vi.mock("../app/shopify.server", () => ({
  default: {},
  authenticate: mockAuthenticate,
  apiVersion: "2025-10",
  addDocumentResponseHeaders: vi.fn(),
  login: vi.fn(),
  registerWebhooks: vi.fn(),
  sessionStorage: {},
  unauthenticated: {},
}));

// Helper to create a mock Request with form data
export function createFormRequest(data, method = "POST") {
  const formData = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    formData.append(key, value);
  }
  return new Request("http://localhost/test", {
    method,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });
}

// Helper to create a mock Request with JSON body
export function createJsonRequest(data, method = "POST") {
  return new Request("http://localhost/test", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// Helper to create a GET request with query params
export function createGetRequest(url = "http://localhost/test") {
  return new Request(url, { method: "GET" });
}

// Helper for GraphQL mock responses
export function mockGraphqlResponse(data) {
  return vi.fn().mockResolvedValue({
    json: () => Promise.resolve({ data }),
  });
}

// Reset all mocks between tests
export function resetMocks() {
  vi.clearAllMocks();
  mockAuthenticate.admin.mockResolvedValue({
    session: mockSession,
    admin: mockAdmin,
  });
}
