import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Settings, Bell, Shield, Zap, Lock, User, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/providers/trpc";
import { validatePhoneNumber } from "@contracts/validation";
import { PhoneNumberInput } from "@/components/PhoneNumberInput";
import { Globe } from "lucide-react";
import { useSearchParams } from "react-router-dom";

export default function SettingsPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("profile");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && ["profile", "security", "notifications", "feature-flags", "student-id"].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const isActualAdmin = ["super_admin", "admin"].includes(user?.role || "");
  const studentIdConfigQuery = trpc.admin.getStudentIdConfig.useQuery(undefined, {
    enabled: isActualAdmin,
  });

  const [prefix, setPrefix] = useState("STU");
  const [startingNumber, setStartingNumber] = useState(1);
  const [numberLength, setNumberLength] = useState(4);

  useEffect(() => {
    if (studentIdConfigQuery.data) {
      setPrefix(studentIdConfigQuery.data.prefix || "STU");
      setStartingNumber(studentIdConfigQuery.data.startingNumber || 1);
      setNumberLength(studentIdConfigQuery.data.numberLength || 4);
    }
  }, [studentIdConfigQuery.data]);

  const updateStudentIdConfigMutation = trpc.admin.updateStudentIdConfig.useMutation({
    onSuccess: () => {
      toast.success("Student ID configuration updated successfully");
      studentIdConfigQuery.refetch();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update configuration");
    },
  });

  const handleStudentIdConfigSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateStudentIdConfigMutation.mutate({
      prefix,
      startingNumber,
      numberLength,
    });
  };

  const isAdmin = ["super_admin", "admin", "academic_head"].includes(user?.role || "");
  const isStudent = user?.role === "student";

  const myProfileQuery = trpc.user.myProfile.useQuery();
  const profile = myProfileQuery.data;

  // Profile Form States
  const [profileName, setProfileName] = useState("");
  const [profileCountryCode, setProfileCountryCode] = useState("+91");
  const [profileCountryISO, setProfileCountryISO] = useState("IN");
  const [profilePhoneNumber, setProfilePhoneNumber] = useState("");
  const [profileUsername, setProfileUsername] = useState("");

  // Default country query (for admin only)
  const defaultCountryQuery = trpc.admin.getDefaultCountry.useQuery(undefined, {
    enabled: isAdmin,
  });
  const [defaultCountryCode, setDefaultCountryCode] = useState("+91");
  const [defaultCountryISO, setDefaultCountryISO] = useState("IN");

  useEffect(() => {
    if (defaultCountryQuery.data) {
      setDefaultCountryCode(defaultCountryQuery.data.code);
      setDefaultCountryISO(defaultCountryQuery.data.iso);
    }
  }, [defaultCountryQuery.data]);

  useEffect(() => {
    if (profile) {
      setProfileName(profile.name || "");
      setProfileCountryCode(profile.countryCode || "+91");
      setProfileCountryISO((profile as any).countryISO || "IN");
      setProfilePhoneNumber(profile.phoneNumber || "");
      setProfileUsername(profile.username || "");
    }
  }, [profile]);

  // Password Form States
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Notification States
  const [selectedDuration, setSelectedDuration] = useState<"1_hour" | "8_hours" | "24_hours" | "indefinite">("1_hour");

  // Feature flags — read from localStorage (env vars are server-side; show as read-only info)
  const [gamificationFlag, setGamificationFlag] = useState("false");
  const [aiInsightsFlag, setAiInsightsFlag] = useState("false");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setGamificationFlag(localStorage.getItem("FEATURE_GAMIFICATION") ?? "false");
      setAiInsightsFlag(localStorage.getItem("FEATURE_AI_INSIGHTS") ?? "false");
    }
  }, []);

  // Mutations
  const updateProfileMutation = trpc.user.updateMyProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile updated successfully");
      myProfileQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update profile");
    },
  });

  const changePasswordMutation = trpc.user.changeMyPassword.useMutation({
    onSuccess: () => {
      toast.success("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to change password");
    },
  });

  const updateNotificationPauseMutation = trpc.user.updateNotificationPause.useMutation({
    onSuccess: (data) => {
      if (data.pausedUntil) {
        const date = new Date(data.pausedUntil);
        const dateString = date.getFullYear() >= 2099 ? "indefinitely" : `until ${date.toLocaleString()}`;
        toast.success(`Notifications paused ${dateString}`);
      } else {
        toast.success("Notifications resumed");
      }
      myProfileQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update notifications");
    },
  });

  const updateDefaultCountryMutation = trpc.admin.updateDefaultCountry.useMutation({
    onSuccess: () => {
      toast.success("Default country updated");
      defaultCountryQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update default country");
    },
  });

  // Academic Rules
  const [classDurationThreshold, setClassDurationThreshold] = useState(20);
  const [absentConsecutiveThreshold, setAbsentConsecutiveThreshold] = useState(7);
  const [reconnectionWindow, setReconnectionWindow] = useState(5);
  const [courseValidityDays, setCourseValidityDays] = useState(60);
  const academicRulesQuery = trpc.admin.getAcademicRuleSettings.useQuery(undefined, {
    enabled: isActualAdmin,
  });
  useEffect(() => {
    if (academicRulesQuery.data) {
      setClassDurationThreshold(academicRulesQuery.data.class_duration_threshold ?? 20);
      setAbsentConsecutiveThreshold(academicRulesQuery.data.absent_consecutive_threshold ?? 7);
      setReconnectionWindow(academicRulesQuery.data.reconnection_window_minutes ?? 5);
      setCourseValidityDays(academicRulesQuery.data.course_validity_days ?? 60);
    }
  }, [academicRulesQuery.data]);
  const updateAcademicRulesMut = trpc.admin.updateAcademicRuleSettings.useMutation({
    onSuccess: () => {
      toast.success("Academic rules saved");
      academicRulesQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save academic rules");
    },
  });

  // Handlers
  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!profileUsername.trim()) {
      toast.error("Username is required");
      return;
    }
    const error = validatePhoneNumber(profileCountryCode, profilePhoneNumber, profileCountryISO);
    if (error) {
      toast.error(error);
      return;
    }

    updateProfileMutation.mutate({
      name: profileName,
      username: profileUsername,
      countryCode: profileCountryCode,
      countryISO: profileCountryISO,
      phoneNumber: profilePhoneNumber,
    });
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      toast.error("Current password is required");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    changePasswordMutation.mutate({
      currentPassword,
      newPassword,
      confirmPassword,
    });
  };

  const handlePauseNotifications = () => {
    updateNotificationPauseMutation.mutate({ pauseOption: selectedDuration });
  };

  const handleResumeNotifications = () => {
    updateNotificationPauseMutation.mutate({ pauseOption: "resume" });
  };

  const getPauseStatusText = () => {
    if (!profile?.notificationsPausedUntil) return "Active";
    const date = new Date(profile.notificationsPausedUntil);
    if (date.getTime() <= Date.now()) return "Active";
    if (date.getFullYear() >= 2099) return "Paused indefinitely";
    return `Paused until ${date.toLocaleString([], { dateStyle: "short", timeStyle: "short" })}`;
  };

  const isPaused = profile?.notificationsPausedUntil && new Date(profile.notificationsPausedUntil).getTime() > Date.now();

  const tabLabel = user?.role === "teacher" ? "Teacher Profile" : "Profile Settings";

  if (myProfileQuery.isLoading) {
    return <p className="text-sm text-gray-500">Loading settings...</p>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className={`grid w-full h-10 p-1 bg-gray-100 dark:bg-gray-900 rounded-lg ${isActualAdmin ? 'grid-cols-4 lg:grid-cols-6' : 'grid-cols-3 lg:grid-cols-4'}`}>
          <TabsTrigger value="profile" className="text-xs font-semibold flex items-center justify-center gap-1.5 py-1.5 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-gray-950">
            <User className="w-3.5 h-3.5" />
            {tabLabel}
          </TabsTrigger>
          <TabsTrigger value="security" className="text-xs font-semibold flex items-center justify-center gap-1.5 py-1.5 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-gray-950">
            <Lock className="w-3.5 h-3.5" />
            Security
          </TabsTrigger>
          <TabsTrigger value="notifications" className="text-xs font-semibold flex items-center justify-center gap-1.5 py-1.5 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-gray-950">
            <Bell className="w-3.5 h-3.5" />
            Notifications
          </TabsTrigger>
          {isActualAdmin && (
            <TabsTrigger value="student-id" className="text-xs font-semibold flex items-center justify-center gap-1.5 py-1.5 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-gray-950">
              <Settings className="w-3.5 h-3.5" />
              System Settings
            </TabsTrigger>
          )}
          {isActualAdmin && (
            <TabsTrigger value="academic-rules" className="hidden lg:flex text-xs font-semibold items-center justify-center gap-1.5 py-1.5 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-gray-950">
              <AlertTriangle className="w-3.5 h-3.5" />
              Rules
            </TabsTrigger>
          )}
          {isAdmin && user?.role !== "academic_head" && (
            <TabsTrigger value="feature-flags" className="hidden lg:flex text-xs font-semibold items-center justify-center gap-1.5 py-1.5 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-gray-950">
              <Zap className="w-3.5 h-3.5" />
              Flags
            </TabsTrigger>
          )}
        </TabsList>

        {/* ─── Profile Settings ────────────────────────────────────────────────── */}
        <TabsContent value="profile">
          <form onSubmit={handleProfileSubmit}>
            <Card className="border border-gray-100 dark:border-gray-900 shadow-sm rounded-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-gray-800 dark:text-gray-200">
                  <Settings className="w-5 h-5 text-emerald-600" />
                  {tabLabel}
                </CardTitle>
                <CardDescription>
                  Update your personal account information and contact details.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="profile-name">Full Name</Label>
                    <Input
                      id="profile-name"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                    />
                  </div>
                  <PhoneNumberInput
                    id="profile-phone"
                    label="Phone Number"
                    countryCode={profileCountryCode}
                    countryISO={profileCountryISO}
                    value={profilePhoneNumber}
                    onChange={(data) => {
                      setProfileCountryCode(data.countryCode);
                      setProfileCountryISO(data.countryISO);
                      setProfilePhoneNumber(data.phoneNumber);
                    }}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="profile-username">Username</Label>
                    <Input
                      id="profile-username"
                      value={profileUsername}
                      onChange={(e) => setProfileUsername(e.target.value)}
                      disabled={isStudent}
                      className={isStudent ? "bg-gray-50 dark:bg-gray-950 font-semibold opacity-70" : ""}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>User ID (Unique ID)</Label>
                    <Input
                      value={profile?.unionId || ""}
                      disabled
                      className="bg-gray-50 dark:bg-gray-950 font-mono font-semibold opacity-70"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 h-9 text-sm"
                  disabled={updateProfileMutation.isPending}
                >
                  {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </CardContent>
            </Card>
          </form>
        </TabsContent>

        {/* ─── Security ───────────────────────────────────────────────────────── */}
        <TabsContent value="security">
          <form onSubmit={handlePasswordSubmit}>
            <Card className="border border-gray-100 dark:border-gray-900 shadow-sm rounded-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-gray-800 dark:text-gray-200">
                  <Shield className="w-5 h-5 text-emerald-600" />
                  Security Settings
                </CardTitle>
                <CardDescription>
                  Change your password to maintain the safety of your account.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-pass">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="current-pass"
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-pass">New Password</Label>
                    <div className="relative">
                      <Input
                        id="new-pass"
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-pass">Confirm New Password</Label>
                    <div className="relative">
                      <Input
                        id="confirm-pass"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 h-9 text-sm"
                  disabled={changePasswordMutation.isPending}
                >
                  {changePasswordMutation.isPending ? "Updating..." : "Change Password"}
                </Button>
              </CardContent>
            </Card>
          </form>
        </TabsContent>

        {/* ─── Notification Pause ──────────────────────────────────────────────── */}
        <TabsContent value="notifications">
          <Card className="border border-gray-100 dark:border-gray-900 shadow-sm rounded-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-800 dark:text-gray-200">
                <Bell className="w-5 h-5 text-emerald-600" />
                Notification Settings
              </CardTitle>
              <CardDescription>
                Temporarily pause alerts and push notifications for classes, messaging, and announcements.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 rounded-xl border border-gray-100 dark:border-gray-900 bg-gray-50/50 dark:bg-gray-950/20">
                <div className="space-y-0.5">
                  <p className="font-semibold text-xs text-gray-400 uppercase tracking-wider">Current Status</p>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    {getPauseStatusText()}
                  </p>
                </div>
                <div>
                  <Badge className={isPaused ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-emerald-100 text-emerald-700 border-emerald-200"}>
                    {isPaused ? "Paused" : "Active"}
                  </Badge>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Select Pause Duration</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { value: "1_hour", label: "1 Hour" },
                      { value: "8_hours", label: "8 Hours" },
                      { value: "24_hours", label: "24 Hours" },
                      { value: "indefinite", label: "Indefinite" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSelectedDuration(opt.value as any)}
                        className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition-all ${
                          selectedDuration === opt.value
                            ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800"
                            : "bg-white dark:bg-gray-950 border-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    onClick={handlePauseNotifications}
                    disabled={updateNotificationPauseMutation.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 h-9 text-sm"
                  >
                    Pause Notifications
                  </Button>
                  {isPaused && (
                    <Button
                      variant="outline"
                      onClick={handleResumeNotifications}
                      disabled={updateNotificationPauseMutation.isPending}
                      className="border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 text-sm h-9 px-4 rounded-lg"
                    >
                      Resume Notifications
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex gap-2 p-3.5 rounded-lg border border-amber-100 bg-amber-50/20 dark:bg-amber-950/10 dark:border-amber-900/30">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                  <strong>Important Rule:</strong> Critical security notifications (e.g. password changes, account security alerts, login alerts) cannot be paused and will continue to alert you in real-time.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Feature Flags ──────────────────────────────────────────────────── */}
        {isAdmin && user?.role !== "academic_head" && (
          <TabsContent value="feature-flags">
            <Card className="border border-gray-100 dark:border-gray-900 shadow-sm rounded-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-gray-800 dark:text-gray-200">
                  <Zap className="w-5 h-5 text-emerald-600" />
                  Feature Flags
                </CardTitle>
                <CardDescription>
                  These flags are controlled via environment variables on the server. The values shown reflect the current localStorage overrides (for reference only).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">FEATURE_GAMIFICATION</p>
                    <p className="text-sm text-gray-500">Enables attendance streak badges and gamification features</p>
                  </div>
                  <Badge variant={gamificationFlag === "true" ? "default" : "secondary"} className={gamificationFlag === "true" ? "bg-emerald-100 text-emerald-700" : ""}>
                    {gamificationFlag === "true" ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">FEATURE_AI_INSIGHTS</p>
                    <p className="text-sm text-gray-500">Enables at-risk student detection and teacher performance flags</p>
                  </div>
                  <Badge variant={aiInsightsFlag === "true" ? "default" : "secondary"} className={aiInsightsFlag === "true" ? "bg-emerald-100 text-emerald-700" : ""}>
                    {aiInsightsFlag === "true" ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {isActualAdmin && (
          <TabsContent value="student-id">
            <form onSubmit={handleStudentIdConfigSubmit}>
              <Card className="border border-gray-100 dark:border-gray-900 shadow-sm rounded-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-gray-800 dark:text-gray-200">
                    <Shield className="w-5 h-5 text-emerald-600" />
                    Student ID Configuration
                  </CardTitle>
                  <CardDescription>
                    Configure the auto-generation settings for student enrollment IDs.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="id-prefix">Prefix</Label>
                      <Input
                        id="id-prefix"
                        value={prefix}
                        onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                        placeholder="STU"
                        maxLength={10}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="id-start">Starting Number</Label>
                      <Input
                        id="id-start"
                        type="number"
                        min={1}
                        value={startingNumber}
                        onChange={(e) => setStartingNumber(parseInt(e.target.value) || 1)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="id-length">Padding Length</Label>
                      <Input
                        id="id-length"
                        type="number"
                        min={1}
                        max={10}
                        value={numberLength}
                        onChange={(e) => setNumberLength(parseInt(e.target.value) || 4)}
                        required
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                      ID Format Preview
                    </span>
                    <span className="text-xl font-mono font-bold text-emerald-600">
                      {prefix}
                      {String(startingNumber).padStart(numberLength, "0")}
                    </span>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={updateStudentIdConfigMutation.isPending}
                  >
                    {updateStudentIdConfigMutation.isPending ? "Saving..." : "Save Configuration"}
                  </Button>
                </CardContent>
              </Card>
            </form>

            {/* Default Country Settings */}
            <Card className="mt-6 border border-gray-100 dark:border-gray-900 shadow-sm rounded-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-gray-800 dark:text-gray-200">
                  <Globe className="w-5 h-5 text-emerald-600" />
                  Default Country Settings
                </CardTitle>
                <CardDescription>
                  Set the default country code pre-selected in all phone number fields across the platform.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <PhoneNumberInput
                  label="Default Country"
                  description="This will be the pre-selected country for all new phone number inputs on the platform."
                  countryCode={defaultCountryCode}
                  countryISO={defaultCountryISO}
                  value=""
                  placeholder="(country selector only)"
                  onChange={(data) => {
                    setDefaultCountryCode(data.countryCode);
                    setDefaultCountryISO(data.countryISO);
                  }}
                />
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={updateDefaultCountryMutation.isPending}
                  onClick={() => {
                    updateDefaultCountryMutation.mutate({ code: defaultCountryCode, iso: defaultCountryISO });
                  }}
                >
                  {updateDefaultCountryMutation.isPending ? "Saving..." : "Save Default Country"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ─── Academic Rules ────────────────────────────────────────────────────── */}
        {isActualAdmin && (
          <TabsContent value="academic-rules">
            <Card className="border border-gray-100 dark:border-gray-900 shadow-sm rounded-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-gray-800 dark:text-gray-200">
                  <AlertTriangle className="w-4 h-4 text-orange-500" />
                  Academic Rules
                </CardTitle>
                <CardDescription>
                  Configure attendance rules that apply to all classes system-wide.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="dur-threshold" className="text-sm font-medium">
                    Class Duration Threshold (minutes)
                  </Label>
                  <p className="text-xs text-gray-500">
                    Minimum cumulative minutes a user must be in a class session for it to count as attended. Default: 20 min.
                  </p>
                  <Input
                    id="dur-threshold"
                    type="number"
                    min={1}
                    max={120}
                    value={classDurationThreshold}
                    onChange={(e) => setClassDurationThreshold(parseInt(e.target.value) || 20)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="absent-threshold" className="text-sm font-medium">
                    Consecutive Absence Alert Threshold
                  </Label>
                  <p className="text-xs text-gray-500">
                    Number of consecutive absent classes before alerting student, teacher, and admin. Default: 7.
                  </p>
                  <Input
                    id="absent-threshold"
                    type="number"
                    min={1}
                    max={30}
                    value={absentConsecutiveThreshold}
                    onChange={(e) => setAbsentConsecutiveThreshold(parseInt(e.target.value) || 7)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reconnect-window" className="text-sm font-medium">Reconnection Window (minutes)</Label>
                  <p className="text-xs text-gray-500">A dropped connection that returns within this time continues the same session. Default: 5 min.</p>
                  <Input id="reconnect-window" type="number" min={0} max={60} value={reconnectionWindow}
                    onChange={(e) => setReconnectionWindow(Math.max(0, parseInt(e.target.value) || 0))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="validity-days" className="text-sm font-medium">Course Validity (days)</Label>
                  <p className="text-xs text-gray-500">Days a student has to use their classes, counted from the first qualifying class. Default: 60.</p>
                  <Input id="validity-days" type="number" min={1} max={730} value={courseValidityDays}
                    onChange={(e) => setCourseValidityDays(parseInt(e.target.value) || 60)} />
                </div>
                <Button
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                  disabled={updateAcademicRulesMut.isPending}
                  onClick={() =>
                    updateAcademicRulesMut.mutate({
                      class_duration_threshold: classDurationThreshold,
                      absent_consecutive_threshold: absentConsecutiveThreshold,
                      reconnection_window_minutes: reconnectionWindow,
                      course_validity_days: courseValidityDays,
                    })
                  }
                >
                  {updateAcademicRulesMut.isPending ? "Saving..." : "Save Academic Rules"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
