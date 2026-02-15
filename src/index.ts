#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { Request, Response } from "express";
import { z } from "zod";
import { fetchTransportAPI, TransportAPIError } from "./api.js";
import type {
  LocationsResponse,
  ConnectionsResponse,
  StationBoardResponse,
  Location,
  Checkpoint,
  Section,
  Connection,
  StationBoardEntry,
} from "./types.js";

// --- Response formatters ---

function formatLocation(loc: Location, index: number): string {
  const lines: string[] = [];
  lines.push(`${index}. ${loc.name ?? "Unknown"}${loc.id ? ` (ID: ${loc.id})` : ""}`);
  if (loc.coordinate) {
    lines.push(`   Coordinates: ${loc.coordinate.x}, ${loc.coordinate.y}`);
  }
  if (loc.type) {
    lines.push(`   Type: ${loc.type}`);
  }
  if (loc.distance != null) {
    lines.push(`   Distance: ${loc.distance}m`);
  }
  return lines.join("\n");
}

function formatTime(datetime: string | null): string {
  if (!datetime) return "?";
  // API returns ISO-ish strings like "2025-01-15T14:02:00+0100"
  const match = datetime.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : datetime;
}

function formatCheckpoint(cp: Checkpoint, label: string): string {
  const time = formatTime(cp.departure ?? cp.arrival);
  const platform = cp.platform ? ` (Platform ${cp.platform})` : "";
  const station = cp.station?.name ?? "?";
  const prognosis = cp.prognosis;
  let delay = "";
  if (prognosis) {
    const progTime = prognosis.departure ?? prognosis.arrival;
    if (progTime) {
      delay = ` [expected: ${formatTime(progTime)}]`;
    }
  }
  return `${label}: ${time} ${station}${platform}${delay}`;
}

function formatSection(section: Section): string {
  if (section.walk) {
    const dur = section.walk.duration;
    return `   Walk${dur ? ` (${Math.ceil(dur / 60)} min)` : ""}`;
  }
  const journey = section.journey;
  if (!journey) return "   (unknown section)";
  const name = journey.name?.trim() ?? "";
  const to = journey.to ?? "";
  return `   ${name} → ${to}`;
}

function formatConnection(conn: Connection, index: number): string {
  const dep = formatTime(conn.from.departure);
  const arr = formatTime(conn.to.arrival);
  const duration = conn.duration ?? "?";
  const transfers = conn.transfers;

  const lines: string[] = [];
  lines.push(`${index}. Depart: ${dep} → Arrive: ${arr} (${duration}, ${transfers} transfer${transfers !== 1 ? "s" : ""})`);

  if (conn.from.platform) {
    lines.push(`   Departure platform: ${conn.from.platform}`);
  }

  for (const section of conn.sections) {
    lines.push(formatSection(section));
  }

  return lines.join("\n");
}

function formatStationBoardEntry(entry: StationBoardEntry, index: number): string {
  const time = formatTime(entry.stop.departure ?? entry.stop.arrival);
  const category = entry.category ?? "";
  const number = entry.number ?? "";
  const label = `${category} ${number}`.trim();
  const to = entry.to ?? "?";
  const platform = entry.stop.platform ? `Platform ${entry.stop.platform}` : "";

  let delay = "";
  if (entry.stop.prognosis) {
    const progTime = entry.stop.prognosis.departure ?? entry.stop.prognosis.arrival;
    if (progTime) {
      delay = ` [exp: ${formatTime(progTime)}]`;
    }
  }

  const parts = [`${index}. ${time}`, label, `→ ${to}`, platform, delay].filter(Boolean);
  return parts.join("  ");
}

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

async function handleAPICall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof TransportAPIError) {
      if (err.status === 429) {
        throw new Error("Rate limited by transport.opendata.ch (max 3 requests/second). Please try again shortly.");
      }
      throw new Error(`Transport API returned HTTP ${err.status}: ${err.body}`);
    }
    if (err instanceof TypeError && (err as Error).message.includes("fetch")) {
      throw new Error("Network error contacting transport.opendata.ch. Please check connectivity.");
    }
    throw err;
  }
}

// --- MCP Server factory ---

function createServer(): McpServer {
  const server = new McpServer({
    name: "swiss-transport",
    version: "1.0.0",
  });

  // Tool 1: search_locations
  server.registerTool(
    "search_locations",
    {
      title: "Search Locations",
      description:
        "Search for Swiss public transport stations, addresses, and points of interest by name or coordinates. Returns matching locations with IDs that can be used in other tools.",
      inputSchema: {
        query: z.string().optional().describe("Name of the location to search for"),
        x: z.number().optional().describe("Latitude (WGS84)"),
        y: z.number().optional().describe("Longitude (WGS84)"),
        type: z
          .enum(["all", "station", "poi", "address"])
          .optional()
          .describe("Filter by location type. Default: all"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ query, x, y, type }) => {
      if (!query && (x === undefined || y === undefined)) {
        return errorResult("Either 'query' or both 'x' and 'y' coordinates must be provided.");
      }

      try {
        const params: Record<string, string | undefined> = {
          query,
          x: x !== undefined ? String(x) : undefined,
          y: y !== undefined ? String(y) : undefined,
          type,
        };

        const data = await handleAPICall(() =>
          fetchTransportAPI<LocationsResponse>("locations", params),
        );

        if (!data.stations || data.stations.length === 0) {
          return { content: [{ type: "text", text: "No locations found." }] };
        }

        const header = `Found ${data.stations.length} location${data.stations.length !== 1 ? "s" : ""}:\n`;
        const body = data.stations.map((loc, i) => formatLocation(loc, i + 1)).join("\n\n");

        return { content: [{ type: "text", text: header + "\n" + body }] };
      } catch (err) {
        return errorResult(String((err as Error).message));
      }
    },
  );

  // Tool 2: search_connections
  server.registerTool(
    "search_connections",
    {
      title: "Search Connections",
      description:
        "Find public transport connections (routes) between two locations in Switzerland. Returns schedules with departure/arrival times, platforms, transfers, and transport details.",
      inputSchema: {
        from: z.string().describe("Departure station name or ID"),
        to: z.string().describe("Arrival station name or ID"),
        via: z.array(z.string()).optional().describe("Up to 5 intermediate stops"),
        date: z.string().optional().describe("Travel date in YYYY-MM-DD format"),
        time: z.string().optional().describe("Travel time in HH:mm format"),
        isArrivalTime: z
          .boolean()
          .optional()
          .describe("If true, date/time refer to desired arrival time. Default: false"),
        transportations: z
          .array(z.enum(["train", "tram", "ship", "bus", "cableway"]))
          .optional()
          .describe("Filter by transport type"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(6)
          .optional()
          .describe("Number of connections to return (1-6). Default: 4"),
        page: z
          .number()
          .int()
          .min(0)
          .max(10)
          .optional()
          .describe("Page for pagination (0-10). Default: 0"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ from, to, via, date, time, isArrivalTime, transportations, limit, page }) => {
      try {
        const params: Record<string, string | string[] | undefined> = {
          from,
          to,
          via,
          date,
          time,
          isArrivalTime: isArrivalTime !== undefined ? (isArrivalTime ? "1" : "0") : undefined,
          transportations,
          limit: limit !== undefined ? String(limit) : undefined,
          page: page !== undefined ? String(page) : undefined,
        };

        const data = await handleAPICall(() =>
          fetchTransportAPI<ConnectionsResponse>("connections", params),
        );

        if (!data.connections || data.connections.length === 0) {
          return { content: [{ type: "text", text: "No connections found." }] };
        }

        const fromName = data.from?.name ?? from;
        const toName = data.to?.name ?? to;
        const header = `Connections from ${fromName} to ${toName}:\n`;
        const body = data.connections
          .map((conn, i) => formatConnection(conn, i + 1))
          .join("\n\n");

        return { content: [{ type: "text", text: header + "\n" + body }] };
      } catch (err) {
        return errorResult(String((err as Error).message));
      }
    },
  );

  // Tool 3: get_stationboard
  server.registerTool(
    "get_stationboard",
    {
      title: "Get Station Board",
      description:
        "Get the departure or arrival board for a Swiss public transport station. Shows upcoming departures/arrivals with destinations, times, platforms, and delay information.",
      inputSchema: {
        station: z.string().optional().describe("Station name"),
        id: z.string().optional().describe("Station ID (takes precedence over station name)"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(420)
          .optional()
          .describe("Max number of entries to return. Default: 20"),
        transportations: z
          .array(z.enum(["train", "tram", "ship", "bus", "cableway"]))
          .optional()
          .describe("Filter by transport type"),
        datetime: z
          .string()
          .optional()
          .describe("Date and time in 'YYYY-MM-DD HH:mm' format"),
        type: z
          .enum(["departure", "arrival"])
          .optional()
          .describe("Board type: 'departure' or 'arrival'. Default: departure"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ station, id, limit, transportations, datetime, type }) => {
      if (!station && !id) {
        return errorResult("Either 'station' name or 'id' must be provided.");
      }

      try {
        const params: Record<string, string | string[] | undefined> = {
          station,
          id,
          limit: limit !== undefined ? String(limit) : undefined,
          transportations,
          datetime,
          type,
        };

        const data = await handleAPICall(() =>
          fetchTransportAPI<StationBoardResponse>("stationboard", params),
        );

        if (!data.stationboard || data.stationboard.length === 0) {
          const stationName = data.station?.name ?? station ?? id ?? "Unknown";
          return {
            content: [{ type: "text", text: `No ${type ?? "departure"}s found for ${stationName}.` }],
          };
        }

        const stationName = data.station?.name ?? station ?? id ?? "Unknown";
        const boardType = type ?? "departure";
        const header = `${boardType === "arrival" ? "Arrivals" : "Departures"} at ${stationName}:\n`;
        const body = data.stationboard
          .map((entry, i) => formatStationBoardEntry(entry, i + 1))
          .join("\n");

        return { content: [{ type: "text", text: header + "\n" + body }] };
      } catch (err) {
        return errorResult(String((err as Error).message));
      }
    },
  );

  return server;
}

// --- Start server ---

async function main() {
  const port = process.env.PORT;

  if (port) {
    // HTTP mode for remote deployment (Render, etc.)
    const app = createMcpExpressApp({ host: "0.0.0.0" });

    app.post("/mcp", async (req: Request, res: Response) => {
      const server = createServer();
      try {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        res.on("close", () => {
          transport.close();
          server.close();
        });
      } catch (error) {
        console.error("Error handling MCP request:", error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Internal server error",
            },
            id: null,
          });
        }
      }
    });

    app.get("/mcp", async (_req: Request, res: Response) => {
      res.writeHead(405).end(JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed. Use POST to interact with the MCP server.",
        },
        id: null,
      }));
    });

    app.delete("/mcp", async (_req: Request, res: Response) => {
      res.writeHead(405).end(JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed.",
        },
        id: null,
      }));
    });

    app.get("/health", (_req: Request, res: Response) => {
      res.json({ status: "ok" });
    });

    const portNum = parseInt(port, 10);
    app.listen(portNum, "0.0.0.0", () => {
      console.log(`MCP Streamable HTTP server listening on port ${portNum}`);
    });

    process.on("SIGINT", () => {
      console.log("Shutting down server...");
      process.exit(0);
    });
  } else {
    // Stdio mode for local usage (Claude Desktop, Claude Code, etc.)
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((err) => {
  console.error("Fatal error starting MCP server:", err);
  process.exit(1);
});
