import { createMcpHandler } from "mcp-handler";
import { registerTools } from "../src/tools.js";

const handler = createMcpHandler(
  (server) => {
    registerTools(server);
  },
  {
    serverInfo: {
      name: "swiss-transport",
      version: "1.0.0",
    },
  },
);

export { handler as GET, handler as POST, handler as DELETE };
