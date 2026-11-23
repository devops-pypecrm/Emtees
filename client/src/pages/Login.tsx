import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function Login() {
  const router = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [reset, setReset] = useState(false);
  const [rid, setRid] = useState(""); const [code, setCode] = useState(""); const [np, setNp] = useState(""); const [sent, setSent] = useState(false);
  const forgot = trpc.auth.forgotPassword.useMutation({ onSuccess: (r) => { setSent(true); toast.success(r.message, { duration: 7000 }); }, onError: (e) => toast.error(e.message) });
  const doReset = trpc.auth.resetPassword.useMutation({ onSuccess: () => { toast.success("Password changed. You can sign in now."); setReset(false); setSent(false); setCode(""); setNp(""); }, onError: (e) => toast.error(e.message) });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reason = params.get("reason");
    if (reason) {
      toast.error(reason, { duration: 5000 });
      // Remove query parameter without reload
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
  }, []);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      login(data);
      toast.success("Logged in successfully");
      router("/");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    const deviceToken = `device_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    loginMutation.mutate({ username, password, deviceToken });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#091221] to-[#1D2A44] p-4">
      <Card className="w-full max-w-md shadow-2xl border-0 bg-white/95 backdrop-blur-md">
        <CardHeader className="text-center pb-2 flex flex-col items-center">
          <img src="/logo.jpg" alt="EMTEES Academy Logo" className="h-20 w-auto object-contain rounded-md mb-2" />
          <CardTitle className="text-2xl font-bold text-[#1D2A44]">EMTEES Academy</CardTitle>
          <p className="text-sm text-gray-500">Learning Management System</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <Input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            <div className="relative">
              <Input 
                type={showPassword ? "text" : "password"} 
                placeholder="Password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                autoComplete="current-password" 
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Button type="submit" className="w-full bg-[#C8102E] hover:bg-[#A50C22] text-white font-medium" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? "Logging in..." : "Login"}
            </Button>
          </form>
          <button type="button" onClick={() => { setReset(true); setRid(username); }} className="mt-4 w-full text-center text-sm text-[#1D2A44] hover:underline">Forgot password?</button>
        </CardContent>
      </Card>
      <Dialog open={reset} onOpenChange={setReset}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reset password</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Username, email or mobile number" value={rid} onChange={(e) => setRid(e.target.value)} />
            {!sent ? (
              <Button className="w-full" disabled={forgot.isPending || rid.trim().length < 3} onClick={() => forgot.mutate({ identifier: rid })}>Send reset code</Button>
            ) : (
              <>
                <Input placeholder="6-digit code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
                <Input type="password" placeholder="New password (min 6 characters)" value={np} onChange={(e) => setNp(e.target.value)} />
                <Button className="w-full" disabled={doReset.isPending || code.length !== 6 || np.length < 6} onClick={() => doReset.mutate({ identifier: rid, code, newPassword: np })}>Change password</Button>
              </>
            )}
            <p className="text-xs text-gray-500">No email on your account? Ask an administrator to reset it for you.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
