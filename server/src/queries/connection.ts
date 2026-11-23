import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import fs from "fs";
import path from "path";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

let instance: ReturnType<typeof drizzle<typeof fullSchema>>;

export function getDb() {
  if (!instance) {
    const isLocal = env.databaseUrl.includes("localhost") || env.databaseUrl.includes("127.0.0.1");
    
    let sslConfig: any = false;
    if (!isLocal) {
      try {
        const caPath = path.resolve(__dirname, "../../global-bundle.pem"); // resolve to server root
        if (fs.existsSync(caPath)) {
          sslConfig = { ca: fs.readFileSync(caPath).toString(), rejectUnauthorized: true };
        } else {
          sslConfig = { rejectUnauthorized: false };
        }
      } catch (e) {
        sslConfig = { rejectUnauthorized: false };
      }
    }

    const pool = new pg.Pool({
      connectionString: env.databaseUrl,
      max: 10,
      connectionTimeoutMillis: 10000, // fail fast on a dead network path
      query_timeout: 30000,
      idleTimeoutMillis: 20000,       // drop idle connections before RDS / the network silently kills them
      keepAlive: true,                // TCP keep-alive so half-open connections are detected
      keepAliveInitialDelayMillis: 10000,
      ssl: sslConfig,
    });
    // A dropped idle connection must not crash or poison the pool; pg discards it and opens a new one.
    pool.on("error", (e) => console.error("[pg pool] idle client error:", e.message));
    instance = drizzle(pool, { schema: fullSchema });
  }
  return instance;
}
