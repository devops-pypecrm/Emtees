import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import * as trpcExpress from "@trpc/server/adapters/express";
import { appRouter } from "./router";
import { createContext } from "./context";
import { setIo } from "./lib/socketInstance";
import { setupSocketHandlers } from "./lib/socketHandlers";
import { startScheduler, runSchedulerTasks } from "./lib/scheduler";
import { applyMigrations } from "../db/apply-migrations";
import { webhookRouter } from "./routers/webhooks";
import { mobileRouter } from "./routers/mobile";
import "dotenv/config";

if (process.env.LOG_LEVEL === "error") {
  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
}

// Truncate long tRPC query params in server log outputs
const originalWrite = process.stdout.write;
process.stdout.write = function (chunk: any, encoding?: any, callback?: any): boolean {
  let str = typeof chunk === "string" ? chunk : chunk.toString();
  if (str.includes("/api/trpc/")) {
    str = str.replace(/(\/api\/trpc\/[^?\s]+)\?[^\s]*/g, "$1 ...");
  }
  return originalWrite.call(process.stdout, str, encoding, callback);
};

const app = express();

app.use(cors({ origin: "*", credentials: true }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use("/api/webhooks", webhookRouter);
app.use("/api/mobile", mobileRouter);

// tRPC express middleware
app.use(
  "/api/trpc",
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// Cron scheduler route
app.get("/api/cron/scheduler", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    await runSchedulerTasks();
    return res.json({ success: true, message: "Scheduler tasks completed successfully." });
  } catch (err: any) {
    console.error("[cron scheduler] error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Fallback for API
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: "Not Found" });
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 10 * 1024 * 1024,
});

setIo(io);
setupSocketHandlers(io);
console.log("[socket.io] WebSocket server attached to Express server");

const port = parseInt(process.env.PORT || "3000", 10);

async function start() {
  try {
    await applyMigrations();
    console.log("[migration] Manual migrations applied successfully");
  } catch (err) {
    console.error("[migration] Failed to run migrations on boot:", err);
  }

  startScheduler();
  console.log("[scheduler] Background scheduler started");

  httpServer.listen(port, () => {
    console.log(`Server is running and ready on http://localhost:${port}`);
  });
}

start().catch((err) => {
  console.error("Server boot failed:", err);
});
