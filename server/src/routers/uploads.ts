import { Router } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import express from "express";
import { eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { admissions } from "@db/srs-schema";

/** Where receipts live. Outside the deploy-replaced code is better; set UPLOAD_DIR in .env to move it. */
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
const RECEIPTS = path.join(UPLOAD_DIR, "receipts");
fs.mkdirSync(RECEIPTS, { recursive: true });

const ALLOWED = new Set([".png", ".jpg", ".jpeg", ".webp", ".pdf"]);
const MAX_BYTES = 5 * 1024 * 1024;

export const uploadsRouter = Router();

// Receipts: filenames are random and unguessable; they are only linked from the admission record.
uploadsRouter.use("/receipts", express.static(RECEIPTS, { index: false, dotfiles: "deny", maxAge: "7d" }));

/** Student uploads a payment receipt while filling the registration form (SRS 3.2). Link-token gated. */
uploadsRouter.post("/receipt/:token", async (req, res) => {
  try {
    const db = getDb();
    const [a] = await db.select().from(admissions).where(eq(admissions.token, req.params.token));
    if (!a || a.status !== "link_generated") return res.status(403).json({ error: "This registration link is not valid" });
    const { filename, dataBase64 } = req.body || {};
    const ext = path.extname(String(filename || "")).toLowerCase();
    if (!ALLOWED.has(ext)) return res.status(400).json({ error: "Upload a PNG, JPG, WEBP or PDF file" });
    const buf = Buffer.from(String(dataBase64 || "").replace(/^data:[^;]+;base64,/, ""), "base64");
    if (!buf.length || buf.length > MAX_BYTES) return res.status(400).json({ error: "File must be under 5 MB" });
    const name = `${crypto.randomBytes(16).toString("hex")}${ext}`;
    fs.writeFileSync(path.join(RECEIPTS, name), buf);
    return res.json({ url: `/api/uploads/receipts/${name}` });
  } catch (e: any) {
    console.error("[upload] receipt failed:", e);
    return res.status(500).json({ error: "Upload failed" });
  }
});
