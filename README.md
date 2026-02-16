# sbbmcp

An [MCP](https://modelcontextprotocol.io/) server for the [Swiss Public Transport API](https://transport.opendata.ch/). Query stations, connections, and live departure boards through any MCP-compatible client.

Deployed on Vercel at:

```
https://sbbmcp.vercel.app/mcp
```

## Features

- **Station search** — Find stations, addresses, and points of interest by name or GPS coordinates
- **Connection search** — Look up routes between two locations with filters for date, time, transport type, and via stops
- **Station board** — Get real-time departure and arrival boards with delay information
- **LLM-optimized output** — Structured, readable text rather than raw JSON

## Connect to the Remote Server

### Claude Code

```bash
claude mcp add --transport http swiss-transport https://sbbmcp.vercel.app/mcp
```

Add `--scope user` for all projects:

```bash
claude mcp add --transport http --scope user swiss-transport https://sbbmcp.vercel.app/mcp
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "swiss-transport": {
      "url": "https://sbbmcp.vercel.app/mcp"
    }
  }
}
```

### Claude.ai

1. Go to **Settings > Integrations**
2. Click **Add integration > MCP Server**
3. Enter URL: `https://sbbmcp.vercel.app/mcp`

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "swiss-transport": {
      "url": "https://sbbmcp.vercel.app/mcp"
    }
  }
}
```

### Other clients

Any client supporting [Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) can connect at `https://sbbmcp.vercel.app/mcp`.

## Run Locally (stdio)

For local use with Claude Desktop or Claude Code without the remote server:

```bash
git clone https://github.com/xadcv/sbbmcp.git
cd sbbmcp
npm install
npm run build
```

Then register via stdio:

```bash
claude mcp add swiss-transport node /absolute/path/to/sbbmcp/dist/index.js
```

Or for development without building:

```bash
npm run dev
```

## Tools

Three tools wrapping the [transport.opendata.ch](https://transport.opendata.ch/) API endpoints.

### `search_locations`

Find Swiss public transport stations, addresses, and points of interest.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | `string` | No\* | Name of the location |
| `x` | `number` | No\* | Latitude (WGS84) |
| `y` | `number` | No\* | Longitude (WGS84) |
| `type` | `string` | No | `all`, `station`, `poi`, `address` (default: `all`) |

\*Either `query` or both `x` and `y` must be provided.

### `search_connections`

Find connections between two locations.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `from` | `string` | Yes | Departure station name or ID |
| `to` | `string` | Yes | Arrival station name or ID |
| `via` | `string[]` | No | Up to 5 intermediate stops |
| `date` | `string` | No | Travel date (`YYYY-MM-DD`) |
| `time` | `string` | No | Travel time (`HH:mm`) |
| `isArrivalTime` | `boolean` | No | Treat time as arrival (default: `false`) |
| `transportations` | `string[]` | No | `train`, `tram`, `ship`, `bus`, `cableway` |
| `limit` | `number` | No | Results 1-6 (default: 4) |
| `page` | `number` | No | Pagination 0-10 (default: 0) |

### `get_stationboard`

Get departures or arrivals for a station.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `station` | `string` | No\* | Station name |
| `id` | `string` | No\* | Station ID (takes precedence) |
| `limit` | `number` | No | Max entries 1-420 (default: 20) |
| `transportations` | `string[]` | No | `train`, `tram`, `ship`, `bus`, `cableway` |
| `datetime` | `string` | No | Date and time (`YYYY-MM-DD HH:mm`) |
| `type` | `string` | No | `departure` or `arrival` (default: `departure`) |

\*Either `station` or `id` must be provided.

## Project Structure

```
sbbmcp/
├── api/
│   └── mcp.ts        # Vercel serverless function (Streamable HTTP)
├── src/
│   ├── index.ts      # Local stdio entry point
│   ├── tools.ts      # Shared tool registration and formatters
│   ├── api.ts        # HTTP client for transport.opendata.ch
│   └── types.ts      # TypeScript interfaces for API responses
├── vercel.json       # Vercel routing and function config
├── tsconfig.json
└── package.json
```

## Deployment

Push to GitHub and connect the repo in the [Vercel dashboard](https://vercel.com/new). The `api/mcp.ts` serverless function is picked up automatically.

For best performance, enable [Fluid compute](https://vercel.com/docs/functions/fluid-compute) in your Vercel project settings.

## API Notes

- **Rate limit:** 3 requests/second/IP on transport.opendata.ch
- **No API key required** — the upstream API is free and open
- **Coverage:** SBB/CFF/FFS, PostBus, local transit, boats, and cableways

## License

ISC
