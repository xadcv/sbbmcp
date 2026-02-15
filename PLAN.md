# Plan: Swiss Public Transport MCP Server

## Overview

Build an MCP (Model Context Protocol) server that exposes the [Swiss Public Transport API](https://transport.opendata.ch/) as a set of tools usable by LLMs. The server will be implemented in TypeScript using the official MCP SDK with stdio transport, targeting local use with Claude Desktop, Claude Code, and similar MCP clients.

**API base URL:** `https://transport.opendata.ch/v1/`
**Rate limit:** 3 requests/second/IP

---

## 1. Project Setup

### 1.1 Initialize the project

```bash
npm init -y
```

### 1.2 Dependencies

| Package | Purpose |
|---|---|
| `@modelcontextprotocol/sdk` | Official MCP server SDK |
| `zod` | Schema validation (peer dep of SDK) |

### 1.3 Dev dependencies

| Package | Purpose |
|---|---|
| `typescript` | TypeScript compiler |
| `@types/node` | Node.js type definitions |
| `tsx` | Run TypeScript directly for development |

### 1.4 TypeScript configuration

Create `tsconfig.json` targeting ES2022/Node16 module resolution, outputting to `dist/`. Enable strict mode.

### 1.5 Package scripts

| Script | Command | Purpose |
|---|---|---|
| `build` | `tsc` | Compile TypeScript |
| `start` | `node dist/index.js` | Run compiled server |
| `dev` | `tsx src/index.ts` | Run in development |

### 1.6 Project structure

```
sbbmcp/
├── src/
│   ├── index.ts              # Entry point: create server, register tools, connect transport
│   ├── api.ts                # HTTP client for transport.opendata.ch
│   └── types.ts              # TypeScript interfaces for API responses
├── tsconfig.json
├── package.json
└── PLAN.md
```

---

## 2. API Client (`src/api.ts`)

A thin wrapper around `fetch()` (built into Node 18+) to call the three transport.opendata.ch endpoints. No external HTTP library needed.

### 2.1 Core function

```typescript
async function fetchTransportAPI(endpoint: string, params: Record<string, string | string[]>): Promise<unknown>
```

- Builds URL from `https://transport.opendata.ch/v1/{endpoint}` and query parameters
- Handles array parameters (e.g. `via[]`, `transportations[]`, `fields[]`) by appending multiple entries
- Returns parsed JSON
- Throws on non-2xx responses with status and body context

---

## 3. Type Definitions (`src/types.ts`)

TypeScript interfaces mirroring the API's JSON response objects.

### 3.1 Core types

| Type | Description | Key fields |
|---|---|---|
| `Coordinate` | Geographic position | `type` ("WGS84"), `x` (latitude), `y` (longitude) |
| `Location` | A station, POI, or address | `id`, `name`, `score`, `coordinate`, `distance` |
| `Prognosis` | Realtime delay/platform info | `platform`, `arrival`, `departure`, `capacity1st`, `capacity2nd` |
| `Checkpoint` | A stop on a journey | `station`, `arrival`, `arrivalTimestamp`, `departure`, `departureTimestamp`, `platform`, `prognosis` |
| `Journey` | A single leg's transport | `name`, `category`, `categoryCode`, `number`, `operator`, `to`, `passList`, `capacity1st`, `capacity2nd` |
| `Section` | One leg of a connection | `journey`, `walk`, `departure`, `arrival` |
| `Connection` | Full trip from A to B | `from`, `to`, `duration`, `transfers`, `sections`, `products` |

### 3.2 API response types

| Type | Wraps |
|---|---|
| `LocationsResponse` | `{ stations: Location[] }` |
| `ConnectionsResponse` | `{ connections: Connection[], from: Location, to: Location }` |
| `StationBoardResponse` | `{ station: Location, stationboard: StationBoardEntry[] }` |

---

## 4. MCP Tools (`src/index.ts`)

Three tools corresponding to the three API endpoints.

### 4.1 `search_locations`

Find stations, addresses, and points of interest by name or coordinates.

**Input schema:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | `string` | No* | Name of the location to search |
| `x` | `number` | No* | Latitude (WGS84) |
| `y` | `number` | No* | Longitude (WGS84) |
| `type` | `enum` | No | One of `all`, `station`, `poi`, `address`. Default: `all` |

*Either `query` or both `x` and `y` must be provided.

**Output:** List of matching locations with id, name, coordinates, and relevance score.

### 4.2 `search_connections`

Find connections (routes) between two locations.

**Input schema:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `from` | `string` | Yes | Departure station name or ID |
| `to` | `string` | Yes | Arrival station name or ID |
| `via` | `string[]` | No | Up to 5 intermediate stops |
| `date` | `string` | No | Travel date in `YYYY-MM-DD` format |
| `time` | `string` | No | Travel time in `HH:mm` format |
| `isArrivalTime` | `boolean` | No | If true, `date`/`time` refer to desired arrival. Default: false |
| `transportations` | `string[]` | No | Filter: `train`, `tram`, `ship`, `bus`, `cableway` |
| `limit` | `number` | No | Number of connections (1–6). Default: 4 |
| `page` | `number` | No | Page for pagination (0–10). Default: 0 |

**Output:** List of connections with departure/arrival times, duration, transfers, sections (legs), platform information, and realtime prognosis where available.

### 4.3 `get_stationboard`

Get the departure or arrival board for a specific station.

**Input schema:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `station` | `string` | No* | Station name |
| `id` | `string` | No* | Station ID (takes precedence over name) |
| `limit` | `number` | No | Max departures/arrivals to return (max 420). Default: 20 |
| `transportations` | `string[]` | No | Filter: `train`, `tram`, `ship`, `bus`, `cableway` |
| `datetime` | `string` | No | Date and time in `YYYY-MM-DD HH:mm` format |
| `type` | `enum` | No | `departure` or `arrival`. Default: `departure` |

*Either `station` or `id` must be provided.

**Output:** Station details and list of departures/arrivals with destination, scheduled/actual times, platform info, and transport category.

---

## 5. Server Initialization (`src/index.ts`)

### 5.1 Create and configure the server

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "swiss-transport",
  version: "1.0.0",
});
```

### 5.2 Register all three tools

Each tool is registered with `server.registerTool()` using Zod schemas for input validation. Tool annotations should include `readOnlyHint: true` since all tools only read data.

### 5.3 Connect via stdio transport

```typescript
const transport = new StdioServerTransport();
await server.connect(transport);
```

### 5.4 Tool handler pattern

Each handler:
1. Validates and transforms input parameters
2. Calls the API client
3. Formats the response as a human-readable text summary (not raw JSON) for LLM consumption
4. Returns `{ content: [{ type: "text", text: formattedResult }] }`

---

## 6. Response Formatting

LLMs work better with structured, readable text rather than raw JSON. Each tool handler should format its output.

### 6.1 `search_locations` format

```
Found 3 locations:

1. Zürich HB (ID: 8503000)
   Coordinates: 47.378177, 8.540192
   Type: station

2. Zürich Oerlikon (ID: 8503006)
   ...
```

### 6.2 `search_connections` format

```
Connections from Zürich HB to Bern:

1. Depart: 14:02 → Arrive: 14:58 (56 min, 0 transfers)
   Platform: 6
   IC 724 → Bern

2. Depart: 14:32 → Arrive: 15:28 (56 min, 0 transfers)
   ...
```

### 6.3 `get_stationboard` format

```
Departures from Zürich HB (2025-01-15 14:00):

1. 14:02  IC 724 → Bern          Platform 6
2. 14:04  S3     → Effretikon    Platform 43/44
3. 14:07  IR 35  → Chur          Platform 8
...
```

---

## 7. Error Handling

| Scenario | Handling |
|---|---|
| Invalid input (missing required params) | Zod validation rejects before handler runs; MCP SDK returns error |
| API returns non-2xx | Catch in API client, return `isError: true` content with descriptive message |
| API returns malformed JSON | Catch parse error, return `isError: true` with context |
| Network failure | Catch fetch error, return `isError: true` suggesting retry |
| Rate limited (429) | Return `isError: true` explaining the 3 req/s limit |

All errors should return `{ content: [{ type: "text", text: errorMessage }], isError: true }` so the LLM can understand and communicate the failure.

---

## 8. MCP Client Configuration

### 8.1 Claude Desktop / Claude Code config

After building, users add to their MCP settings:

```json
{
  "mcpServers": {
    "swiss-transport": {
      "command": "node",
      "args": ["/path/to/sbbmcp/dist/index.js"]
    }
  }
}
```

Or for development:

```json
{
  "mcpServers": {
    "swiss-transport": {
      "command": "npx",
      "args": ["tsx", "/path/to/sbbmcp/src/index.ts"]
    }
  }
}
```

---

## 9. Implementation Order

| Step | Task | Details |
|---|---|---|
| 1 | Project scaffolding | `npm init`, install deps, `tsconfig.json` |
| 2 | Type definitions | Create `src/types.ts` with all API response interfaces |
| 3 | API client | Create `src/api.ts` with fetch wrapper for all 3 endpoints |
| 4 | MCP server + tools | Create `src/index.ts`, register all 3 tools with Zod schemas |
| 5 | Response formatters | Implement human-readable output formatting per tool |
| 6 | Error handling | Add error handling in API client and tool handlers |
| 7 | Build and test | Compile, run manually, verify with MCP inspector or Claude |

---

## 10. Testing Strategy

### 10.1 Manual testing with MCP Inspector

Use `npx @modelcontextprotocol/inspector` to connect to the server via stdio and invoke each tool interactively.

### 10.2 Spot-check API calls

```bash
# Verify the API is reachable and responses match expectations
curl "https://transport.opendata.ch/v1/locations?query=Bern"
curl "https://transport.opendata.ch/v1/connections?from=Bern&to=Zürich"
curl "https://transport.opendata.ch/v1/stationboard?station=Bern&limit=5"
```

### 10.3 Edge cases to verify

- Location search with coordinates instead of name
- Connection search with via stops and transport filters
- Stationboard with station ID instead of name
- Missing required parameters (should fail gracefully)
- API returning empty results
- Non-existent station names

---

## Design Decisions

1. **TypeScript + stdio transport** — Simplest setup for local MCP use. No HTTP server needed; the MCP client spawns the process directly.
2. **Built-in `fetch()`** — Node 18+ provides `fetch()` natively. No need for `axios` or `node-fetch`.
3. **Three tools, not one** — Separate tools per endpoint gives the LLM clearer semantics about what each does, rather than one generic "call transport API" tool.
4. **Text formatting over raw JSON** — Formatted responses are more useful to LLMs for reasoning and user-facing output. Raw JSON can always be reconstructed from the structured fields if needed.
5. **`readOnlyHint` annotation** — All tools are read-only API calls; this tells MCP clients they're safe to call without confirmation prompts.
6. **Minimal dependencies** — Only the MCP SDK and Zod. No unnecessary abstractions.
