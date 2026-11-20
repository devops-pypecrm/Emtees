import { JitsiMeeting } from "@jitsi/react-sdk";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";

/** Video room for a demo class (SRS 4.2). Same Jitsi server as regular classes. */
export default function DemoRoom({ demoId, onClose }: { demoId: number; onClose: () => void }) {
  const q = trpc.salesExecutive.getDemoJoinToken.useQuery({ demoId }, { refetchOnWindowFocus: false });
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex justify-between items-center bg-slate-900 text-white px-4 py-2 text-sm"><span>Demo class</span><Button size="sm" variant="secondary" onClick={onClose}>Leave</Button></div>
      <div className="flex-1">
        {q.data ? (
          <JitsiMeeting domain={q.data.jitsiHost} roomName={q.data.room} jwt={q.data.token}
            configOverwrite={{ prejoinPageEnabled: false, disableDeepLinking: true }}
            getIFrameRef={(el) => { el.style.height = "100%"; el.style.width = "100%"; }}
            onReadyToClose={onClose} />
        ) : <div className="text-white p-6">{q.error ? q.error.message : "Connecting…"}</div>}
      </div>
    </div>
  );
}
