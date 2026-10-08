import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { systemSettings } from "@db/schema";

// In-app update system (mirrors the pypecrm APK self-update mechanism):
// - manifest for a platform stored as a systemSettings row keyed "app_release_<platform>"
// - GET /latest?platform=mobile -> manifest JSON (or 404)
// - GET /download/:platform -> streams current APK
// - POST /publish (admin, multipart) -> uploads new APK + upserts manifest

export const appReleaseRouterExpress = Router();

const releasesDir = path.join(process.cwd(), "storage", "app-releases");
fs.mkdirSync(releasesDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req: any, _file: any, cb: any) => cb(null, releasesDir),
    filename: (req: any, _file: any, cb: any) => cb(null, `${req.body.platform}-${Date.now()}.apk`),
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
});

type ReleaseManifest = {
  versionName: string;
  versionCode: number;
  releaseNotes: string;
  apkFileName: string;
  releasedAt: string;
};

function settingKey(platform: string) {
  return `app_release_${platform}`;
}

appReleaseRouterExpress.get("/latest", async (req: Request, res: Response) => {
  try {
    const platform = String(req.query.platform || "mobile");
    const db = getDb();
    const row = await db.query.systemSettings.findFirst({ where: eq(systemSettings.key, settingKey(platform)) });
    if (!row) return res.status(404).json({ error: "No release published for this platform" });
    const manifest: ReleaseManifest = JSON.parse(row.value);
    res.json(manifest);
  } catch (err: any) {
    console.error("[app-releases/latest] error:", err?.message || err);
    res.status(500).json({ error: "Failed to fetch latest release" });
  }
});

appReleaseRouterExpress.get("/download/:platform", async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const db = getDb();
    const row = await db.query.systemSettings.findFirst({ where: eq(systemSettings.key, settingKey(platform)) });
    if (!row) return res.status(404).json({ error: "No release published for this platform" });
    const manifest: ReleaseManifest = JSON.parse(row.value);
    const filePath = path.join(releasesDir, manifest.apkFileName);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Release file missing on server" });
    const { size } = fs.statSync(filePath);
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader("Content-Disposition", `attachment; filename="emtees-app-${manifest.versionName}.apk"`);
    // Without an explicit Content-Length, Express falls back to chunked
    // transfer encoding and clients (Dio's onReceiveProgress) never learn
    // the total size, so download progress can never show a real percentage.
    res.setHeader("Content-Length", size);
    fs.createReadStream(filePath).pipe(res);
  } catch (err: any) {
    console.error("[app-releases/download] error:", err?.message || err);
    res.status(500).json({ error: "Failed to download release" });
  }
});

// Publish a new release. Protected by a shared secret header (RELEASE_PUBLISH_SECRET env var)
// rather than a user JWT, so it can be called from a CI/deploy script like pypecrm's publish_release.sh.
appReleaseRouterExpress.post("/publish", upload.single("apk"), async (req: Request & { file?: any }, res: Response) => {
  try {
    const secret = process.env.RELEASE_PUBLISH_SECRET;
    if (secret && req.headers["x-publish-secret"] !== secret) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { platform, versionName, versionCode, releaseNotes } = req.body;
    if (!platform || !versionName || !versionCode || !req.file) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "platform, versionName, versionCode and apk file are required" });
    }

    const manifest: ReleaseManifest = {
      versionName,
      versionCode: parseInt(versionCode, 10),
      releaseNotes: releaseNotes || "",
      apkFileName: req.file.filename,
      releasedAt: new Date().toISOString(),
    };

    const db = getDb();
    const key = settingKey(platform);

    // Grab the outgoing manifest before overwriting it, so its APK file can
    // be deleted once the new one is safely published — otherwise every
    // release leaves its predecessor's (100MB+) file behind on disk forever.
    const previousRow = await db.query.systemSettings.findFirst({ where: eq(systemSettings.key, key) });
    let previousApkFileName: string | undefined;
    if (previousRow) {
      try {
        previousApkFileName = (JSON.parse(previousRow.value) as ReleaseManifest).apkFileName;
      } catch {
        previousApkFileName = undefined;
      }
    }

    await db
      .insert(systemSettings)
      .values({ key, value: JSON.stringify(manifest) })
      .onConflictDoUpdate({ target: systemSettings.key, set: { value: JSON.stringify(manifest), updatedAt: new Date() } });

    if (previousApkFileName && previousApkFileName !== manifest.apkFileName) {
      const previousPath = path.join(releasesDir, previousApkFileName);
      fs.promises.unlink(previousPath).catch((err) => {
        console.error("[app-releases/publish] failed to remove previous release file:", err?.message || err);
      });
    }

    res.json({ success: true, manifest });
  } catch (err: any) {
    console.error("[app-releases/publish] error:", err?.message || err);
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: "Failed to publish release" });
  }
});
