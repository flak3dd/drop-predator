/**
 * Integration test setup — re-exports from the canonical test setup.
 * The global setupFile (tests/setup.js) handles all mocking;
 * this file exists so integration tests can `import { ... } from "./setup.js"`.
 */
export {
  mockPrisma,
  mockAdmin,
  mockSession,
  mockAuthenticate,
  createFormRequest,
  createJsonRequest,
  createGetRequest,
  mockGraphqlResponse,
  resetMocks,
} from "../setup.js";
