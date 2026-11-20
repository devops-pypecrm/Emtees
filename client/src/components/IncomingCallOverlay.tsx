import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { socket } from "@/lib/socket";
import { Phone, PhoneOff } from "lucide-react";

export default function IncomingCallOverlay() {
  const [incomingCall, setIncomingCall] = useState<{
    sessionId: number;
    title: string;
    teacherName: string;
    roomName: string;
  } | null>(null);

  const navigate = useNavigate();
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ringIntervalRef = useRef<any>(null);

  const startRinging = () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const audioCtx = audioCtxRef.current;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const playTone = () => {
        if (!audioCtxRef.current) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, audioCtx.currentTime); 
        osc.frequency.setValueAtTime(480, audioCtx.currentTime + 0.1); 
        
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.5, audioCtx.currentTime + 0.3);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.4);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
      };

      // Initial double ring
      playTone();
      setTimeout(playTone, 500);

      // Loop double ring every 3 seconds
      ringIntervalRef.current = setInterval(() => {
        playTone();
        setTimeout(playTone, 500);
      }, 3000);
    } catch (err) {
      console.warn("Could not play ringtone (browser policy restriction):", err);
    }
  };

  const stopRinging = () => {
    if (ringIntervalRef.current) {
      clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  useEffect(() => {
    const handleIncomingCall = (data: any) => {
      setIncomingCall(data);
      // Modern browsers require user interaction before playing audio.
      // If the user hasn't interacted, startRinging might fail or log a warning.
      startRinging();
    };

    socket.on("1to1:incoming_call", handleIncomingCall);

    return () => {
      socket.off("1to1:incoming_call", handleIncomingCall);
      stopRinging();
    };
  }, []);

  if (!incomingCall) return null;

  const handleAccept = () => {
    stopRinging();
    const sessionId = incomingCall.sessionId;
    setIncomingCall(null);
    // Redirect to classes/one-to-one with a query parameter to automatically join
    navigate(`/class/${sessionId}`);
  };

  const handleDecline = () => {
    stopRinging();
    setIncomingCall(null);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full mx-4 flex flex-col items-center text-center shadow-2xl transform animate-in zoom-in-95 duration-300">
        <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center mb-6 shadow-lg animate-pulse">
          <Phone className="w-12 h-12 text-white" />
        </div>
        
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Incoming Video Call</h2>
        <p className="text-lg text-gray-600 mb-1">{incomingCall.teacherName}</p>
        <p className="text-sm font-medium text-indigo-600 mb-8 bg-indigo-50 px-4 py-1 rounded-full">
          {incomingCall.title}
        </p>

        <div className="flex gap-6 w-full justify-center">
          <button
            onClick={handleDecline}
            className="flex flex-col items-center gap-2 group cursor-pointer"
          >
            <div className="w-14 h-14 bg-red-100 group-hover:bg-red-500 rounded-full flex items-center justify-center transition-colors shadow-sm">
              <PhoneOff className="w-6 h-6 text-red-600 group-hover:text-white transition-colors" />
            </div>
            <span className="text-sm font-medium text-red-600">Decline</span>
          </button>

          <button
            onClick={handleAccept}
            className="flex flex-col items-center gap-2 group cursor-pointer"
          >
            <div className="w-14 h-14 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center transition-colors shadow-lg animate-bounce">
              <Phone className="w-6 h-6 text-white" />
            </div>
            <span className="text-sm font-medium text-green-600">Accept</span>
          </button>
        </div>
      </div>
    </div>
  );
}
