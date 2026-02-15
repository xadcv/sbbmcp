# sbbmcp

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that exposes the [Swiss Public Transport API](https://transport.opendata.ch/) as tools for LLMs. Query stations, connections, and live departure boards through Claude Code, Claude Desktop, Claude.ai, or any MCP-compatible client.

## Features

- **Station search** — Find stations, addresses, and points of interest by name or GPS coordinates
- **Connection search** — Look up routes between two locations with filters for date, time, transport type, and via stops
- **Station board** — Get real-time departure and arrival boards for any Swiss station, including delay information
- **LLM-optimized output** — Responses are formatted as structured, readable text rather than raw JSON
- **Minimal footprint** — Three runtime dependencies (`@modelcontextprotocol/sdk`, `zod`, `express`); uses Node's built-in `fetch()`

## Quick Start (no local install)

Run directly from GitHub using `npx` — no clone or build step required:

### Claude Code (terminal)

```bash
claude mcp add swiss-transport -- npx -y github:xadcv/sbbmcp
```

This registers the server for your current project (stored in `.mcp.json`). To make it available across all projects, add the `--scope user` flag:

```bash
claude mcp add --scope user swiss-transport -- npx -y github:xadcv/sbbmcp
```

Verify it was added:

```bash
claude mcp list
```

### Claude Desktop

Add to your Claude Desktop MCP configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "swiss-transport": {
      "command": "npx",
      "args": ["-y", "github:xadcv/sbbmcp"]
    }
  }
}
```

`npx` will fetch the repository, run `npm install` (which triggers the `prepare` script to auto-build), and start the server. Node.js 18+ is required.

## Local Installation

If you prefer a local checkout:

```bash
git clone https://github.com/xadcv/sbbmcp.git
cd sbbmcp
npm install
npm run build
```

Then configure your MCP client to point at the built output:

### Claude Code (terminal)

```bash
claude mcp add swiss-transport node /absolute/path/to/sbbmcp/dist/index.js
```

Or with `--scope user` to make it available in all projects:

```bash
claude mcp add --scope user swiss-transport node /absolute/path/to/sbbmcp/dist/index.js
```

### Claude Desktop

```json
{
  "mcpServers": {
    "swiss-transport": {
      "command": "node",
      "args": ["/absolute/path/to/sbbmcp/dist/index.js"]
    }
  }
}
```

### Development mode

Run directly from TypeScript without a build step:

```bash
npm run dev
```

Or in an MCP client config:

```json
{
  "mcpServers": {
    "swiss-transport": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/sbbmcp/src/index.ts"]
    }
  }
}
```

## Remote MCP Server (hosted)

A public instance is deployed at:

```
https://sbbmcp.onrender.com/mcp
```

No install or API key required — connect any MCP-compatible client to this URL.

### Claude Code

```bash
claude mcp add --transport http swiss-transport https://sbbmcp.onrender.com/mcp
```

Add `--scope user` to make it available across all projects:

```bash
claude mcp add --transport http --scope user swiss-transport https://sbbmcp.onrender.com/mcp
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "swiss-transport": {
      "url": "https://sbbmcp.onrender.com/mcp"
    }
  }
}
```

### Claude.ai (browser)

1. Open [claude.ai](https://claude.ai) and go to **Settings**
2. Navigate to the **Integrations** section
3. Click **Add integration** and select **MCP Server**
4. Enter the URL: `https://sbbmcp.onrender.com/mcp`
5. Save — the three Swiss transport tools will now appear in your conversations

### Zapier MCP Client

1. In Zapier, add a new **MCP Client** action to your Zap
2. Set the MCP Server URL to `https://sbbmcp.onrender.com/mcp`
3. Select the tool you want to use (`search_locations`, `search_connections`, or `get_stationboard`)
4. Map the tool parameters from your trigger data

### Other MCP clients

Any client that supports the [Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) can connect using the URL `https://sbbmcp.onrender.com/mcp`.

> **Note:** The transport.opendata.ch API has a rate limit of 3 requests/second/IP. All remote clients share the server's outbound IP, so the limit applies collectively. The server runs on Render's free tier, which spins down after inactivity — the first request after idle may take a few seconds.

## Tools

The server exposes three tools corresponding to the three [transport.opendata.ch](https://transport.opendata.ch/) API endpoints.

### `search_locations`

Find Swiss public transport stations, addresses, and points of interest.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | `string` | No\* | Name of the location to search for |
| `x` | `number` | No\* | Latitude (WGS84) |
| `y` | `number` | No\* | Longitude (WGS84) |
| `type` | `string` | No | Filter: `all`, `station`, `poi`, `address` (default: `all`) |

\*Either `query` or both `x` and `y` must be provided.

**Example output:**

```
Found 3 locations:

1. Zürich HB (ID: 8503000)
   Coordinates: 47.378177, 8.540192
   Type: station

2. Zürich Oerlikon (ID: 8503006)
   Coordinates: 47.411297, 8.544066
   Type: station
```

### `search_connections`

Find public transport connections between two locations.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `from` | `string` | Yes | Departure station name or ID |
| `to` | `string` | Yes | Arrival station name or ID |
| `via` | `string[]` | No | Up to 5 intermediate stops |
| `date` | `string` | No | Travel date (`YYYY-MM-DD`) |
| `time` | `string` | No | Travel time (`HH:mm`) |
| `isArrivalTime` | `boolean` | No | If `true`, date/time refer to desired arrival (default: `false`) |
| `transportations` | `string[]` | No | Filter: `train`, `tram`, `ship`, `bus`, `cableway` |
| `limit` | `number` | No | Number of connections, 1-6 (default: 4) |
| `page` | `number` | No | Pagination page, 0-10 (default: 0) |

**Example output:**

```
Connections from Zürich HB to Bern:

1. Depart: 14:02 → Arrive: 14:58 (00d00:56:00, 0 transfers)
   Departure platform: 6
   IC 724 → Bern

2. Depart: 14:32 → Arrive: 15:28 (00d00:56:00, 0 transfers)
   Departure platform: 8
   IC 728 → Bern
```

### `get_stationboard`

Get the departure or arrival board for a specific station.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `station` | `string` | No\* | Station name |
| `id` | `string` | No\* | Station ID (takes precedence over name) |
| `limit` | `number` | No | Max entries, 1-420 (default: 20) |
| `transportations` | `string[]` | No | Filter: `train`, `tram`, `ship`, `bus`, `cableway` |
| `datetime` | `string` | No | Date and time (`YYYY-MM-DD HH:mm`) |
| `type` | `string` | No | `departure` or `arrival` (default: `departure`) |

\*Either `station` or `id` must be provided.

**Example output:**

```
Departures at Zürich HB:

1. 14:02  IC 724  → Bern          Platform 6
2. 14:04  S3      → Effretikon    Platform 43/44
3. 14:07  IR 35   → Chur          Platform 8
```

## Project Structure

```
sbbmcp/
├── src/
│   ├── index.ts     # MCP server setup, tool registration, and response formatters
│   ├── api.ts       # HTTP client for transport.opendata.ch
│   └── types.ts     # TypeScript interfaces for API responses
├── dist/            # Compiled JavaScript (generated by `npm run build`)
├── Dockerfile       # Multi-stage Docker build for deployment
├── render.yaml      # Render deployment blueprint
├── tsconfig.json
└── package.json
```

## Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm run build` | `tsc` | Compile TypeScript to `dist/` |
| `npm start` | `node dist/index.js` | Run the compiled MCP server |
| `npm run dev` | `tsx src/index.ts` | Run from source without building |
| `npm run prepare` | `npm run build` | Auto-build on `npm install` from git |

## API Notes

This server wraps the [transport.opendata.ch v1 API](https://transport.opendata.ch/). Key details:

- **Rate limit:** 3 requests per second per IP address. The server returns a descriptive error if rate-limited.
- **No API key required.** The API is free and open.
- **Data coverage:** Swiss public transport including SBB/CFF/FFS, PostBus, local transit, boats, and cableways.

## Testing

### With the MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

### Manual API verification

```bash
curl "https://transport.opendata.ch/v1/locations?query=Bern"
curl "https://transport.opendata.ch/v1/connections?from=Bern&to=Zürich"
curl "https://transport.opendata.ch/v1/stationboard?station=Bern&limit=5"
```

## License

ISC
