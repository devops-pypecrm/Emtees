"use client";

import { useRef, useState, useEffect } from "react";
import { JitsiMeeting } from "@jitsi/react-sdk";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { socket } from "@/lib/socket";
import { toast } from "sonner";

interface JitsiMeetProps {
  classId: number;
  onClose: () => void;
  onJoin?: () => void;
  onLeave?: (eventName?: string) => void | Promise<void>;
  classInfo?: {
    title: string;
    scheduledAt: string | Date;
    teacherName?: string;
  };
  isOneToOne?: boolean;
  roomName?: string;
  jwt?: string | null;
  forceClose?: boolean;
}

export default function JitsiMeet({
  classId,
  onClose,
  onJoin,
  onLeave,
  classInfo,
  isOneToOne = false,
  roomName: propRoomName,
  jwt: propJwt,
  forceClose = false,
}: JitsiMeetProps) {
  const { user } = useAuth();
  const apiRef = useRef<any>(null);
  const [showLobbyPanel, setShowLobbyPanel] = useState(true);
  const [apiReady, setApiReady] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [bothJoined, setBothJoined] = useState(false);
  const heartbeatCountRef = useRef(0);
  const handleLeaveRef = useRef<((eventName: string) => Promise<void>) | null>(null);

  const trackHeartbeat = trpc.class.trackOneToOneHeartbeat.useMutation();
  // Tell the server when this user actually enters / leaves the call (feeds attendance + reports)
  const reportPresence = trpc.class.reportPresence.useMutation();
  const presenceJoinedRef = useRef(false);
  const sendPresence = (eventType: "join" | "leave") => {
    if (eventType === "join" && presenceJoinedRef.current) return;
    if (eventType === "leave" && !presenceJoinedRef.current) return;
    presenceJoinedRef.current = eventType === "join";
    reportPresence.mutate(
      isOneToOne ? { sessionId: classId, eventType } : { classId, eventType }
    );
  };

  const isModerator = user?.role === "super_admin" || user?.role === "teacher";

  // Student waiting status state
  const [joinStatus, setJoinStatus] = useState<"none" | "pending" | "approved" | "declined">(
    isOneToOne || isModerator ? "approved" : "none"
  );

  // Host list of pending requests
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);

  // TRPC queries & mutations
  const statusQuery = trpc.class.getJoinStatus.useQuery(
    { classId },
    { enabled: !isOneToOne && !isModerator && !!user }
  );

  const requestJoinMutation = trpc.class.requestJoin.useMutation({
    onSuccess: (data) => {
      setJoinStatus(data.status);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to request entry.");
    },
  });

  const listRequestsQuery = trpc.class.listJoinRequests.useQuery(
    { classId },
    { enabled: !!isModerator && !isOneToOne }
  );

  const approveRequest = trpc.class.approveJoinRequest.useMutation({
    onSuccess: () => {
      toast.success("Student approved");
    },
    onError: (err) => toast.error(err.message),
  });

  const declineRequest = trpc.class.declineJoinRequest.useMutation({
    onSuccess: () => {
      toast.success("Student declined");
    },
    onError: (err) => toast.error(err.message),
  });

  const approveAll = trpc.class.approveAllJoinRequests.useMutation({
    onSuccess: () => {
      toast.success("Approved all pending students");
    },
    onError: (err) => toast.error(err.message),
  });

  // Details query (run once joinStatus is approved)
  const detailsQuery = trpc.class.getMeetingDetails.useQuery(
    { classId },
    { enabled: joinStatus === "approved" && !isOneToOne && !!user }
  );

  // Sync initial join status for student
  useEffect(() => {
    if (statusQuery.data) {
      setJoinStatus(statusQuery.data.status);
      // If none, automatically request join
      if (statusQuery.data.status === "none" && statusQuery.data.isEnrolled) {
        requestJoinMutation.mutate({ classId });
      }
    }
  }, [statusQuery.data]);

  // Sync initial pending list for host
  useEffect(() => {
    if (listRequestsQuery.data) {
      setPendingRequests(listRequestsQuery.data);
    }
  }, [listRequestsQuery.data]);

  // Heartbeat tracking for one-to-one sessions (ticks only when both are present)
  useEffect(() => {
    if (!isOneToOne || !apiReady || !apiRef.current) return;

    const interval = setInterval(() => {
      if (!apiRef.current) return;
      try {
        const count = apiRef.current.getNumberOfParticipants();
        const isBothPresent = count >= 2;

        if (isBothPresent) {
          setBothJoined(true);
          setElapsedSeconds((prev) => prev + 1);
        } else {
          setBothJoined(false);
        }

        if (count >= 1) {
          heartbeatCountRef.current += 1;
          if (heartbeatCountRef.current >= 60) {
            trackHeartbeat.mutate({ sessionId: classId, bothPresent: isBothPresent });
            heartbeatCountRef.current = 0;
          }
        }
      } catch (err) {
        console.error("Error reading Jitsi participants:", err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [apiReady, isOneToOne, classId]);

  // If the component is torn down without the Jitsi leave events firing, still record the leave
  useEffect(() => {
    return () => {
      if (presenceJoinedRef.current) {
        presenceJoinedRef.current = false;
        reportPresence.mutate(isOneToOne ? { sessionId: classId, eventType: "leave" } : { classId, eventType: "leave" });
      }
    };
  }, []);

  // Force close from parent (e.g. backend auto-closer)
  useEffect(() => {
    if (forceClose && apiReady && apiRef.current) {
      toast.info("This session has been ended by the host or timed out.");
      apiRef.current.executeCommand("hangup");
    }
  }, [forceClose, apiReady]);

  // Socket connection and listeners
  useEffect(() => {
    if (!socket || isOneToOne) return;

    // Join class room
    socket.emit("class:join", { classId });

    if (isModerator) {
      // Listen for new requests
      socket.on("class:join_request_new", (req: any) => {
        if (req.classId === classId) {
          setPendingRequests((prev) => {
            if (prev.some((p) => p.studentId === req.studentId)) return prev;
            return [req, ...prev];
          });
          toast.info(`${req.studentName} wants to join the class.`);
        }
      });

      // Listen for request updates
      socket.on("class:join_request_updated", (data: any) => {
        setPendingRequests((prev) => prev.filter((p) => p.studentId !== data.studentId));
      });

      // Listen for approved all
      socket.on("class:join_request_updated_all", () => {
        setPendingRequests([]);
      });
    } else {
      // Student listens for personal status update
      socket.on("class:join_request_status", (data: any) => {
        if (data.classId === classId) {
          setJoinStatus(data.status);
          if (data.status === "approved") {
            toast.success("You have been admitted into the class!");
          }
        }
      });
    }

    return () => {
      socket.off("class:join_request_new");
      socket.off("class:join_request_updated");
      socket.off("class:join_request_updated_all");
      socket.off("class:join_request_status");
      socket.emit("class:leave", { classId });
    };
  }, [socket, classId, isModerator, isOneToOne]);

  // If student is pending, render lobby screen
  if (joinStatus === "pending") {
    return (
      <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col items-center justify-center text-white">
        <div className="max-w-md w-full mx-4 p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl text-center space-y-6 shadow-2xl">
          <div className="relative w-20 h-20 mx-auto">
            <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20 animate-pulse"></div>
            <div className="absolute inset-0 rounded-full border-t-4 border-emerald-500 animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl">🎓</span>
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold tracking-tight">Waiting Room</h3>
            <p className="text-sm text-gray-400 font-light leading-relaxed">
              Waiting for the teacher to admit you into the class.<br />
              Please stay on this screen.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-white px-4 py-2 rounded-lg border border-white/10 hover:border-white/20 transition-all duration-300"
          >
            Cancel & Exit
          </button>
        </div>
      </div>
    );
  }

  // If student was declined, render declined screen
  if (joinStatus === "declined") {
    return (
      <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col items-center justify-center text-white">
        <div className="max-w-md w-full mx-4 p-8 rounded-2xl bg-white/5 border border-red-500/20 backdrop-blur-xl text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 mx-auto bg-red-500/10 rounded-full flex items-center justify-center text-red-500 text-3xl">
            ⚠️
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold tracking-tight text-red-400">Entry Declined</h3>
            <p className="text-sm text-gray-300 font-light leading-relaxed">
              Your request to join the class was declined by the host.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold text-sm py-2.5 px-4 rounded-xl transition-all duration-300 shadow-lg shadow-red-600/20"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // If none or loading status, show checking screen
  if (joinStatus === "none" || (joinStatus === "approved" && !isOneToOne && detailsQuery.isLoading)) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col items-center justify-center text-white">
        <p className="text-xs text-gray-400 animate-pulse">Requesting authorization to join class...</p>
      </div>
    );
  }

  // If details query error
  if (detailsQuery.isError) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col items-center justify-center text-white p-4">
        <div className="max-w-md w-full bg-white/5 border border-red-500/20 rounded-2xl p-6 text-center space-y-4">
          <p className="text-sm text-red-400">Failed to fetch meeting credentials: {detailsQuery.error.message}</p>
          <button onClick={onClose} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors">Close</button>
        </div>
      </div>
    );
  }

  const roomName = propRoomName || (isOneToOne ? `emtees-1on1-${classId}` : detailsQuery.data?.roomName || "");
  const jwt = propJwt !== undefined ? propJwt : (isOneToOne ? null : detailsQuery.data?.jwt);
  
  console.log("[JitsiMeet] Initializing...", { isOneToOne, propRoomName, propJwt, resolvedRoomName: roomName, resolvedJwt: jwt });
  const cleanRoomName = roomName.replace(/\s+/g, "-").toLowerCase();
  const displayName = user?.name || "Anonymous";
  const email = user?.email || "";

  const formatTime = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return [
      hrs > 0 ? String(hrs).padStart(2, "0") : null,
      String(mins).padStart(2, "0"),
      String(secs).padStart(2, "0"),
    ].filter(Boolean).join(":");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="font-semibold text-sm">📹 {classInfo?.title || roomName}</span>
            {classInfo && (
              <span className="text-gray-400 text-xs mt-0.5 font-light">
                Host: {classInfo.teacherName || "Not assigned"} | Scheduled: {new Date(classInfo.scheduledAt).toLocaleString()}
              </span>
            )}
          </div>
          {isOneToOne && (
            <div className="flex items-center gap-2 ml-4 bg-white/5 border border-white/10 px-3 py-1 rounded-xl">
              <span className={`h-2 w-2 rounded-full ${bothJoined ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
              <span className="text-xs font-mono font-bold text-white">
                {formatTime(elapsedSeconds)}
              </span>
              <span className="text-[9px] uppercase font-bold tracking-wider text-gray-400">
                {bothJoined ? "Active" : "Paused"}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isModerator && !isOneToOne && (
            <button
              onClick={() => setShowLobbyPanel(!showLobbyPanel)}
              className={`text-xs px-3 py-1.5 rounded border transition-colors flex items-center gap-1.5 ${
                showLobbyPanel
                  ? "bg-emerald-950/40 text-emerald-400 border-emerald-800 hover:bg-emerald-950/60"
                  : "text-gray-400 border-gray-600 hover:text-white hover:border-gray-400"
              }`}
            >
              👥 Waiting Lobby
              {pendingRequests.filter((r) => r.status === "pending").length > 0 && (
                <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold animate-pulse">
                  {pendingRequests.filter((r) => r.status === "pending").length}
                </span>
              )}
            </button>
          )}
          <button
            onClick={async () => {
              if (apiRef.current) {
                apiRef.current.executeCommand("hangup");
              }
              if (handleLeaveRef.current) {
                await handleLeaveRef.current("LeaveAndClose");
              } else {
                onClose();
              }
            }}
            className="text-gray-400 hover:text-white text-xs px-3 py-1.5 rounded border border-gray-600 hover:border-gray-400 transition-colors"
          >
            Leave & Close
          </button>
        </div>
      </div>

      {/* Jitsi container and panel */}
      <div className="flex-1 flex flex-row w-full bg-gray-950 relative overflow-hidden">
        {/* Left Panel: Jitsi Meeting */}
        <div className="flex-1 h-full relative">
          <JitsiMeeting
            domain="meet.gecouncil.com"
            roomName={cleanRoomName}
            jwt={jwt || undefined}
            userInfo={{
              displayName,
              email: email || "",
            }}
            configOverwrite={{
              startWithAudioMuted: false,
              startWithVideoMuted: false,
              // Force Jitsi to stay inside the browser on mobile, don't ask to download native app
              disableDeepLinking: true,
              // Prevent Jitsi from auto-hiding the PC user's self-view camera when there are only 2 people
              disableSelfView: false,
              disableSelfViewAutohide: true,
              prejoinPageEnabled: false,
              hideConferenceTimer: true,
              conferenceTimer: false,
              // P2P mode: better quality for 1-on-1 calls between phone & PC
              p2p: {
                enabled: true,
                preferH264: true,
              },
              // Improve mobile compatibility
              requireDisplayName: false,
              disableThirdPartyRequests: true,
              enableNoAudioDetection: true,
              enableNoisyMicDetection: true,
              // Use VP8 codec which has best mobile support
              preferredCodec: "VP8",
              toolbarButtons: [
                "microphone",
                "camera",
                "closedcaptions",
                "desktop",
                "fullscreen",
                "fodeviceselection",
                "hangup",
                "chat",
                ...(isModerator ? ["recording"] : []),
                "raisehand",
                "videoquality",
                "filmstrip",
                "tileview",
                "download",
                "help",
              ],
            }}
            interfaceConfigOverwrite={{
              SHOW_JITSI_WATERMARK: false,
              SHOW_WATERMARK_FOR_GUESTS: false,
              MOBILE_APP_PROMO: false,
            }}
            onApiReady={(externalApi) => {
              apiRef.current = externalApi;
              setApiReady(true);

              let leaving = false;
              const handleLeave = async (eventName: string) => {
                if (leaving) return;
                leaving = true;
                sendPresence("leave");
                if (onLeave) {
                  try {
                    await onLeave(eventName);
                  } catch (e) {
                    console.error("Error in onLeave:", e);
                  }
                }
                onClose();
              };
              handleLeaveRef.current = handleLeave;

              externalApi.addEventListener("readyToClose", () => handleLeave("readyToClose"));
              externalApi.addEventListener("videoConferenceLeft", () => handleLeave("videoConferenceLeft"));
              externalApi.addEventListener("videoConferenceDestroyed", () => handleLeave("videoConferenceDestroyed"));

              externalApi.addEventListener("videoConferenceJoined", () => {
                sendPresence("join");
                if (onJoin) onJoin();
              });
            }}
            getIFrameRef={(iframeRef) => {
              iframeRef.style.height = "100%";
              iframeRef.style.width = "100%";
              // Critical for mobile browsers: allow camera & microphone inside iFrame
              (iframeRef as unknown as HTMLIFrameElement).allow = "camera; microphone; display-capture; autoplay; fullscreen";
            }}
          />
        </div>

        {/* Lobby sidebar approval panel */}
        {isModerator && !isOneToOne && showLobbyPanel && (
          <div className="w-80 border-l border-gray-800 bg-gray-900 text-white flex flex-col h-full shrink-0">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="font-semibold text-xs text-gray-200">
                  Lobby Waiting Room ({pendingRequests.filter((r) => r.status === "pending").length})
                </span>
              </div>
              {pendingRequests.filter((r) => r.status === "pending").length > 0 && (
                <button
                  onClick={() => approveAll.mutate({ classId })}
                  className="text-[10px] bg-emerald-600 hover:bg-emerald-700 px-2 py-1 rounded font-medium text-white transition-colors"
                >
                  Accept All
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {pendingRequests.filter((r) => r.status === "pending").length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-2 text-gray-500 py-10">
                  <span className="text-2xl">⏳</span>
                  <p className="text-xs">No pending requests.</p>
                  <p className="text-[10px] text-gray-600 font-light px-4 leading-relaxed">
                    Enrolled students waiting for entry will show up here in real time.
                  </p>
                </div>
              ) : (
                pendingRequests
                  .filter((r) => r.status === "pending")
                  .map((req) => (
                    <div
                      key={req.studentId}
                      className="p-3 bg-gray-800/50 border border-gray-800 rounded-xl space-y-2.5"
                    >
                      <div>
                        <div className="font-medium text-xs text-gray-200 truncate">
                          {req.studentName}
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                          {req.studentUnionId}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => approveRequest.mutate({ classId, studentId: req.studentId })}
                          disabled={approveRequest.isPending}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-[11px] py-1.5 rounded-lg transition-colors"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => declineRequest.mutate({ classId, studentId: req.studentId })}
                          disabled={declineRequest.isPending}
                          className="flex-1 bg-gray-700 hover:bg-red-600 hover:text-white disabled:opacity-50 text-gray-300 font-semibold text-[11px] py-1.5 rounded-lg transition-all duration-300"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
