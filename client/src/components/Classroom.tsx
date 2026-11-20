import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import JitsiMeet from "@/components/JitsiMeet";

type Room = { group?: boolean; id: number; roomName: string; jwt: string | null; title: string; scheduledAt: any; teacherName?: string };

/**
 * One way to enter any 1-to-1 classroom (SRS 8.1). Teachers start the session first; students join once it is live.
 * Join/leave events are reported by the video component itself, so attendance is automatic.
 */
export function useClassroom(onDone?: () => void) {
  const { user } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const start = trpc.class.startOneToOne.useMutation();
  const join = trpc.class.joinOneToOne.useMutation();
  const end = trpc.class.endOneToOne.useMutation();
  const startGroup = trpc.class.start.useMutation();
  const endGroup = trpc.class.end.useMutation();
  const utils = trpc.useUtils();
  const isTeacherLike = user?.role === "teacher" || user?.role === "super_admin";

  const open = async (session: { id: number; title?: string; scheduledAt?: any; status?: string; teacherName?: string }) => {
    try {
      let d: any;
      if (isTeacherLike) {
        d = await start.mutateAsync({ sessionId: session.id });
        setRoom({ id: session.id, roomName: d.roomName, jwt: d.jwt, title: session.title || "Class", scheduledAt: session.scheduledAt, teacherName: user?.name });
      } else {
        d = await join.mutateAsync({ sessionId: session.id });
        setRoom({ id: session.id, roomName: d.roomName, jwt: d.jwt, title: d.title || session.title || "Class", scheduledAt: d.scheduledAt || session.scheduledAt, teacherName: d.teacherName || session.teacherName });
      }
    } catch (e: any) {
      toast.error(e.message || "Could not open the classroom");
    }
  };

  /** Group classes (2-3 students): teacher starts, students are admitted by the teacher as usual. */
  const openGroup = async (c: { id: number; title?: string; scheduledAt?: any }) => {
    try {
      if (isTeacherLike || user?.role === "admin" || user?.role === "academic_head") { if (isTeacherLike) await startGroup.mutateAsync({ id: c.id }); }
      const d: any = await utils.class.getMeetingDetails.fetch({ classId: c.id });
      setRoom({ group: true, id: c.id, roomName: d.roomName, jwt: d.jwt, title: d.title || c.title || "Group class", scheduledAt: d.scheduledAt || c.scheduledAt, teacherName: d.teacherName });
    } catch (e: any) { toast.error(e.message || "Could not open the classroom"); }
  };

  const element = room ? (
    <JitsiMeet
      classId={room.id}
      isOneToOne={!room.group}
      roomName={room.roomName}
      jwt={room.jwt}
      classInfo={{ title: room.title, scheduledAt: room.scheduledAt, teacherName: room.teacherName }}
      onLeave={async (eventName?: string) => {
        if (room.group) { if (isTeacherLike && (eventName === "videoConferenceDestroyed" || eventName === "LeaveAndClose")) await endGroup.mutateAsync({ id: room.id }).catch(() => {}); return; }
        if (isTeacherLike && (eventName === "videoConferenceDestroyed" || eventName === "LeaveAndClose")) await end.mutateAsync({ sessionId: room.id }).catch(() => {});
      }}
      onClose={() => { setRoom(null); onDone?.(); }}
    />
  ) : null;
  return { open, openGroup, element, busy: start.isPending || join.isPending || startGroup.isPending };
}
