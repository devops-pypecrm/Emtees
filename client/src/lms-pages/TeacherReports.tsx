import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const todayStr = () => new Date().toISOString().slice(0, 10);
const monthStart = () => new Date().toISOString().slice(0, 8) + "01";
const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

/** Web-only reports for Admins (all teachers) and Academic Heads (own department only; enforced server-side). */
export default function TeacherReportsPage() {
  const { user } = useAuth();
  const [startDate, setStartDate] = useState(monthStart());
  const [endDate, setEndDate] = useState(todayStr());
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [studentId, setStudentId] = useState<number | null>(null);
  const [openTeacher, setOpenTeacher] = useState<number | null>(null);

  const range = trpc.teacherReports.rangeReport.useQuery({ startDate, endDate }, { refetchInterval: 60_000 });
  const daily = trpc.teacherReports.dailyReport.useQuery({ date: todayStr() }, { refetchInterval: 60_000 });
  const salary = trpc.teacherReports.salarySummary.useQuery({ month }, { refetchInterval: 60_000 });
  const student = trpc.teacherReports.studentReport.useQuery({ studentId: studentId! }, { enabled: studentId !== null });

  const scopeLabel = user?.role === "academic_head" ? "Your department" : "All departments";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Teacher Reports</h1>
        <p className="text-sm text-muted-foreground">{scopeLabel} · updates automatically after every valid class (≥ 25 min)</p>
      </div>

      <Tabs defaultValue="daily">
        <TabsList>
          <TabsTrigger value="daily">Today</TabsTrigger>
          <TabsTrigger value="range">Date range</TabsTrigger>
          <TabsTrigger value="salary">Salary</TabsTrigger>
        </TabsList>

        <TabsContent value="daily">
          <Card>
            <CardHeader><CardTitle>Today's classes</CardTitle><CardDescription>Completed vs pending per teacher</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Teacher</TableHead><TableHead>Assigned</TableHead><TableHead>Completed</TableHead>
                  <TableHead>Pending</TableHead><TableHead>Invalid (&lt;25 min)</TableHead><TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(daily.data ?? []).map((t) => (
                    <TableRow key={t.teacherId}>
                      <TableCell className="font-medium">{t.teacherName}</TableCell>
                      <TableCell>{t.assigned}</TableCell>
                      <TableCell>{t.completed}</TableCell>
                      <TableCell>{t.pending + t.ongoing}</TableCell>
                      <TableCell>{t.invalid}</TableCell>
                      <TableCell>{t.absent ? <Badge variant="destructive">Absent</Badge> : t.assigned === 0 ? <Badge variant="outline">No classes</Badge> : <Badge>On track</Badge>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="range">
          <Card>
            <CardHeader>
              <CardTitle>Custom date range</CardTitle>
              <div className="flex flex-wrap gap-4 items-end pt-2">
                <div><Label>From</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
                <div><Label>To</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Teacher</TableHead><TableHead>Students</TableHead><TableHead>Total classes</TableHead>
                  <TableHead>Completed</TableHead><TableHead>Pending</TableHead><TableHead>Absent days</TableHead><TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {(range.data ?? []).map((t) => (
                    <>
                      <TableRow key={t.teacherId}>
                        <TableCell className="font-medium">{t.teacherName}</TableCell>
                        <TableCell>{t.studentCount}</TableCell>
                        <TableCell>{t.totalClassesEntitled}</TableCell>
                        <TableCell>{t.completed}</TableCell>
                        <TableCell>{t.pending}</TableCell>
                        <TableCell>{t.absentDays.length}</TableCell>
                        <TableCell><Button size="sm" variant="ghost" onClick={() => setOpenTeacher(openTeacher === t.teacherId ? null : t.teacherId)}>{openTeacher === t.teacherId ? "Hide" : "Daily"}</Button></TableCell>
                      </TableRow>
                      {openTeacher === t.teacherId && t.days.filter((d) => d.assigned > 0 || d.absent).map((d) => (
                        <TableRow key={`${t.teacherId}-${d.date}`} className="bg-muted/40">
                          <TableCell className="pl-8">{d.date}</TableCell><TableCell />
                          <TableCell>{d.assigned} assigned</TableCell><TableCell>{d.completed}</TableCell>
                          <TableCell>{d.pending + d.ongoing}</TableCell>
                          <TableCell>{d.absent ? <Badge variant="destructive">Absent</Badge> : ""}</TableCell><TableCell />
                        </TableRow>
                      ))}
                    </>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="salary">
          <Card>
            <CardHeader>
              <CardTitle>{user?.role === "academic_head" ? "Department salary" : "Global salary report"}</CardTitle>
              <div className="pt-2"><Label>Month</Label><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-48" /></div>
              <CardDescription>₹75 / 30 min · ₹100 / 45 min · ₹125 / 60 min, counted for valid classes only</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Teacher</TableHead><TableHead>Classes</TableHead><TableHead>30m</TableHead>
                  <TableHead>45m</TableHead><TableHead>60m</TableHead><TableHead>Total</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(salary.data?.teachers ?? []).map((t) => (
                    <TableRow key={t.teacherId}>
                      <TableCell className="font-medium">{t.teacherName}</TableCell>
                      <TableCell>{t.classesTaken}</TableCell><TableCell>{t.count30}</TableCell>
                      <TableCell>{t.count45}</TableCell><TableCell>{t.count60}</TableCell>
                      <TableCell>{inr(t.totalAmount)}</TableCell>
                    </TableRow>
                  ))}
                  {salary.data && (
                    <TableRow className="font-bold">
                      <TableCell>Total</TableCell><TableCell>{salary.data.totals.classesTaken}</TableCell>
                      <TableCell colSpan={3} /><TableCell>{inr(salary.data.totals.totalAmount)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <StudentLookup onOpen={setStudentId} />

      <Dialog open={studentId !== null} onOpenChange={(o) => !o && setStudentId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Student report</DialogTitle></DialogHeader>
          {student.data && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-lg font-semibold">{student.data.name}</span>
                <Badge variant={student.data.isActive ? "default" : "destructive"}>{student.data.isActive ? "Active" : "Inactive"}</Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <Stat label="Taken (LMS)" v={student.data.completedInLms} />
                <Stat label="Already taken" v={student.data.alreadyTaken} />
                <Stat label="Pending" v={student.data.totalRemaining} />
                <Stat label="Invalid" v={student.data.invalid} />
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Length</TableHead><TableHead>Actual</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {student.data.sessions.slice(0, 20).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{new Date(s.scheduledAt).toLocaleString()}</TableCell>
                      <TableCell>{s.sessionLength}m</TableCell>
                      <TableCell>{s.actualDuration ?? "-"}</TableCell>
                      <TableCell>{s.valid === false ? "Invalid" : s.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, v }: { label: string; v: number }) {
  return <div className="rounded border p-2"><div className="text-muted-foreground">{label}</div><div className="text-xl font-bold">{v}</div></div>;
}

function StudentLookup({ onOpen }: { onOpen: (id: number) => void }) {
  const [id, setId] = useState("");
  return (
    <Card>
      <CardHeader><CardTitle>Student report</CardTitle><CardDescription>Enter a student ID to see their report and active/inactive status</CardDescription></CardHeader>
      <CardContent className="flex gap-2">
        <Input placeholder="Student user ID" value={id} onChange={(e) => setId(e.target.value)} className="w-48" />
        <Button onClick={() => (Number(id) > 0 ? onOpen(Number(id)) : toast.error("Enter a valid student ID"))}>Open</Button>
      </CardContent>
    </Card>
  );
}
