import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Smartphone, Download, Loader2 } from "lucide-react";

type ReleaseManifest = {
  versionName: string;
  versionCode: number;
  releaseNotes: string;
  apkFileName: string;
  releasedAt: string;
};

export default function DownloadApp() {
  const [manifest, setManifest] = useState<ReleaseManifest | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "none" | "error">("loading");

  useEffect(() => {
    fetch("/api/mobile/app-releases/latest?platform=mobile")
      .then((res) => {
        if (res.status === 404) {
          setStatus("none");
          return null;
        }
        if (!res.ok) throw new Error("request failed");
        return res.json();
      })
      .then((data) => {
        if (data) {
          setManifest(data);
          setStatus("ready");
        }
      })
      .catch(() => setStatus("error"));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#091221] to-[#1D2A44] p-4">
      <Card className="w-full max-w-md shadow-2xl border-0 bg-white/95 backdrop-blur-md">
        <CardHeader className="text-center pb-2 flex flex-col items-center">
          <img src="/logo.jpg" alt="EMTEES Academy Logo" className="h-20 w-auto object-contain rounded-md mb-2" />
          <div className="flex items-center gap-2 text-[#1D2A44]">
            <Smartphone className="h-6 w-6" />
            <CardTitle className="text-2xl font-bold">EMTEES Mobile App</CardTitle>
          </div>
          <p className="text-sm text-gray-500">Live classes, chat, and more — on the go</p>
        </CardHeader>
        <CardContent>
          {status === "loading" && (
            <div className="flex flex-col items-center gap-3 py-6 text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Checking for the latest version...</p>
            </div>
          )}

          {status === "none" && (
            <p className="text-center text-sm text-gray-500 py-6">
              No app build has been published yet. Please check back soon.
            </p>
          )}

          {status === "error" && (
            <p className="text-center text-sm text-red-500 py-6">
              Couldn't reach the download service. Please try again later.
            </p>
          )}

          {status === "ready" && manifest && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm text-gray-500">Version {manifest.versionName}</p>
                {manifest.releaseNotes && (
                  <p className="text-sm text-gray-700 mt-2 whitespace-pre-line">{manifest.releaseNotes}</p>
                )}
              </div>

              <Button
                asChild
                className="w-full bg-[#C8102E] hover:bg-[#A50C22] text-white font-medium"
              >
                <a href="/api/mobile/app-releases/download/mobile" download>
                  <Download className="h-4 w-4 mr-2" />
                  Download for Android
                </a>
              </Button>

              <p className="text-xs text-gray-400 text-center">
                Android only for now. After downloading, open the file and allow
                installs from this source if prompted — the app checks for
                updates automatically from here on.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
