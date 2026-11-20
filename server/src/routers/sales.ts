import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, or, and, gte, lte, desc, sql, asc, inArray } from "drizzle-orm";
import { createRouter, authedQuery, strictAdminQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { salesClosures, salesGroups, salesExecutives, users } from "@db/schema";

// Sales Executive middleware: checks if user is super_admin, admin, or sales_executive
const salesExecQuery = authedQuery.use(async ({ ctx, next }) => {
  const allowedRoles = ["super_admin", "admin", "sales_executive"];
  if (!allowedRoles.includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sales Executive or Admin access required" });
  }
  return next({ ctx });
});

export const salesRouter = createRouter({
  // ----------------------------------------------------
  // GROUPS / TEAMS
  // ----------------------------------------------------
  listGroups: salesExecQuery.query(async () => {
    const db = getDb();
    return db.query.salesGroups.findMany({
      with: {
        // We'll just return the basics for now
      },
      orderBy: asc(salesGroups.name),
    });
  }),

  createGroup: strictAdminQuery
    .input(z.object({ name: z.string().min(1), asmId: z.number().optional(), managerId: z.number().optional(), description: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      return db.insert(salesGroups).values({
        name: input.name,
        asmId: input.asmId,
        managerId: input.managerId,
        description: input.description,
      }).returning();
    }),

  updateGroup: strictAdminQuery
    .input(z.object({ id: z.number(), name: z.string(), asmId: z.number().nullable().optional(), managerId: z.number().nullable().optional(), description: z.string().optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      return db.update(salesGroups)
        .set({
          name: input.name,
          asmId: input.asmId,
          managerId: input.managerId,
          description: input.description,
          isActive: input.isActive,
          updatedAt: new Date(),
        })
        .where(eq(salesGroups.id, input.id))
        .returning();
    }),

  deleteGroup: strictAdminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      return db.delete(salesGroups)
        .where(eq(salesGroups.id, input.id))
        .returning();
    }),

  getTeamDetails: salesExecQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const group = await db.query.salesGroups.findFirst({
        where: eq(salesGroups.id, input.id)
      });
      if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });

      const members = await db.query.salesExecutives.findMany({
        where: eq(salesExecutives.groupId, input.id),
      });

      const closures = await db.query.salesClosures.findMany({
        where: eq(salesClosures.groupId, input.id),
      });

      let totalPoints = 0;
      let totalSales = 0;
      for (const closure of closures) {
        totalPoints += Number(closure.points || 0);
        totalSales += Number(closure.totalFee || 0);
      }

      return {
        group,
        members,
        performance: {
          totalClosures: closures.length,
          totalPoints,
          totalSales,
        }
      };
    }),

  getDashboardStats: salesExecQuery.query(async ({ ctx }) => {
    const db = getDb();
    const allClosures = await db.query.salesClosures.findMany({
      where: eq(salesClosures.isDeleted, false)
    });

    let filteredClosures = allClosures;
    
    // Apply CA / Role restrictions
    if (ctx.user.role === "sales_executive") {
      const dbUser = await db.query.users.findFirst({
        where: eq(users.id, ctx.user.id)
      });
      if (dbUser?.salesExecutiveId) {
        const profile = await db.query.salesExecutives.findFirst({
          where: eq(salesExecutives.id, dbUser.salesExecutiveId)
        });

        if (profile?.designation === "Manager") {
          const managedGroups = await db.query.salesGroups.findMany({
            where: eq(salesGroups.managerId, profile.id)
          });
          const groupIds = managedGroups.map(g => g.id);
          filteredClosures = allClosures.filter(c => c.groupId && groupIds.includes(c.groupId));
        } else if (profile?.isASM && profile?.groupId) {
          filteredClosures = allClosures.filter(c => c.groupId === profile.groupId);
        } else {
          filteredClosures = allClosures.filter(c => c.caId === dbUser.salesExecutiveId);
        }
      }
    }

    const currentMonth = new Date().toISOString().substring(0, 7);
    const thisMonthClosures = filteredClosures.filter(c => c.closingDate && c.closingDate.toISOString().startsWith(currentMonth));

    const totalRevenue = thisMonthClosures.reduce((acc, curr) => acc + Number(curr.firstInst || 0), 0);
    const totalPipeline = thisMonthClosures.reduce((acc, curr) => acc + Number(curr.totalFee || 0), 0);
    const outstanding = totalPipeline - totalRevenue;

    // Group by month for graph
    const monthlyData: Record<string, { month: string; closures: number; revenue: number }> = {};
    
    // Get last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const mStr = d.toISOString().substring(0, 7);
      monthlyData[mStr] = { month: mStr, closures: 0, revenue: 0 };
    }

    filteredClosures.forEach(c => {
      if (!c.closingDate) return;
      const mStr = c.closingDate.toISOString().substring(0, 7);
      if (monthlyData[mStr]) {
        monthlyData[mStr].closures += 1;
        monthlyData[mStr].revenue += Number(c.firstInst || 0);
      }
    });

    return {
      totalClosures: thisMonthClosures.length,
      totalRevenue,
      totalPipeline,
      outstanding,
      trendData: Object.values(monthlyData)
    };
  }),

  // ----------------------------------------------------
  // CLOSURES
  // ----------------------------------------------------
  listClosures: salesExecQuery
    .input(z.object({
      monthStr: z.string().optional(),
      caId: z.number().optional(),
      asmId: z.number().optional(),
      groupId: z.number().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const filters = [eq(salesClosures.isDeleted, false)];

      // Apply CA / Role restrictions
      if (ctx.user.role === "sales_executive") {
        const dbUser = await db.query.users.findFirst({
          where: eq(users.id, ctx.user.id)
        });
        if (!dbUser?.salesExecutiveId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sales profile missing" });
        }
        
        // Find if user is ASM
        const profile = await db.query.salesExecutives.findFirst({
          where: eq(salesExecutives.id, dbUser.salesExecutiveId)
        });

        if (profile?.designation === "Manager") {
          const managedGroups = await db.query.salesGroups.findMany({
            where: eq(salesGroups.managerId, profile.id)
          });
          const groupIds = managedGroups.map(g => g.id);
          if (groupIds.length > 0) {
            filters.push(inArray(salesClosures.groupId, groupIds));
          } else {
            filters.push(eq(salesClosures.id, -1)); // impossible condition to return nothing
          }
        } else if (profile?.isASM && profile?.groupId) {
          // ASM sees their group
          filters.push(eq(salesClosures.groupId, profile.groupId));
        } else {
          // CA sees only their own
          filters.push(eq(salesClosures.caId, dbUser.salesExecutiveId));
        }
      }

      if (input?.monthStr) filters.push(eq(salesClosures.monthStr, input.monthStr));
      if (input?.caId) filters.push(eq(salesClosures.caId, input.caId));
      if (input?.asmId) filters.push(eq(salesClosures.asmId, input.asmId));
      if (input?.groupId) filters.push(eq(salesClosures.groupId, input.groupId));

      return db.query.salesClosures.findMany({
        where: and(...filters),
        orderBy: desc(salesClosures.closingDate),
      });
    }),

  createClosure: salesExecQuery
    .input(z.object({
      closingDate: z.string().or(z.date()),
      caId: z.number().optional(),
      courseName: z.string().min(1),
      type: z.string().min(1), // New Closure, Old Balance, etc
      admNo: z.string().optional(),
      studentName: z.string().optional(),
      totalFee: z.number(),
      firstInst: z.number().default(0),
      secondInst: z.number().default(0),
      thirdInst: z.number().default(0),
      bank: z.string().optional(),
      verificationStatus: z.string().optional(),
      obNumber: z.string().optional(),
      leadStatus: z.string().optional(),
      remarks: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();

      let finalCaId = input.caId;
      if (ctx.user.role === "sales_executive") {
        const dbUser = await db.query.users.findFirst({
          where: eq(users.id, ctx.user.id)
        });
        finalCaId = dbUser?.salesExecutiveId || undefined;
      }

      if (!finalCaId) throw new TRPCError({ code: "BAD_REQUEST", message: "CA ID required" });

      const caProfile = await db.query.salesExecutives.findFirst({
        where: eq(salesExecutives.id, finalCaId)
      });
      if (!caProfile) throw new TRPCError({ code: "NOT_FOUND", message: "CA not found" });

      // Calculate totals
      const totalPaid = input.firstInst + input.secondInst + input.thirdInst;
      const balance = input.totalFee - totalPaid;

      // Ensure closingDate is Date
      const dateObj = typeof input.closingDate === 'string' ? new Date(input.closingDate) : input.closingDate;

      // Month strings
      const monthStr = dateObj.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      const cleanMonthStr = dateObj.toLocaleDateString("en-US", { month: "long" });

      const points = 0; // points engine removed (not part of the SRS)

      return db.insert(salesClosures).values({
        closingDate: dateObj,
        monthStr,
        cleanMonthStr,
        caCategory: "CORE_STRENGTH",
        caId: finalCaId,
        groupId: caProfile.groupId,
        asmId: null, // You'd need to look up who the ASM is for this group
        courseName: input.courseName,
        admNo: input.admNo,
        studentName: input.studentName,
        type: input.type,
        totalFee: input.totalFee.toString(),
        firstInst: input.firstInst.toString(),
        secondInst: input.secondInst.toString(),
        thirdInst: input.thirdInst.toString(),
        balance: balance.toString(),
        points: points.toString(),
        baseAmountForPoints: input.firstInst.toString(),
        bank: input.bank,
        verificationStatus: input.verificationStatus,
        obNumber: input.obNumber,
        leadStatus: input.leadStatus,
        remarks: input.remarks,
        createdBy: ctx.user.id,
      }).returning();
    }),

  // ----------------------------------------------------
  // REPORTS
  // ----------------------------------------------------
  generateReport: salesExecQuery
    .input(z.object({
      monthStr: z.string().optional(),
      groupBy: z.enum(["ca", "asm", "group", "week"]).default("ca"),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const filters = [eq(salesClosures.isDeleted, false)];

      // Apply CA / Role restrictions
      if (ctx.user.role === "sales_executive") {
        const dbUser = await db.query.users.findFirst({
          where: eq(users.id, ctx.user.id)
        });
        if (!dbUser?.salesExecutiveId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sales profile missing" });
        }
        const profile = await db.query.salesExecutives.findFirst({
          where: eq(salesExecutives.id, dbUser.salesExecutiveId)
        });
        if (profile?.designation === "Manager") {
          const managedGroups = await db.query.salesGroups.findMany({
            where: eq(salesGroups.managerId, profile.id)
          });
          const groupIds = managedGroups.map(g => g.id);
          if (groupIds.length > 0) {
            filters.push(inArray(salesClosures.groupId, groupIds));
          } else {
            filters.push(eq(salesClosures.id, -1));
          }
        } else if (profile?.isASM && profile?.groupId) {
          filters.push(eq(salesClosures.groupId, profile.groupId));
        } else {
          filters.push(eq(salesClosures.caId, dbUser.salesExecutiveId));
        }
      }

      if (input.monthStr) {
        filters.push(eq(salesClosures.monthStr, input.monthStr));
      }
      
      const allClosures = await db.query.salesClosures.findMany({
        where: and(...filters),
      });

      const allExecs = await db.query.salesExecutives.findMany();
      const allGroups = await db.query.salesGroups.findMany();

      const execMap = new Map(allExecs.map(e => [e.id?.toString(), e.name]));
      const groupMap = new Map(allGroups.map(g => [g.id?.toString(), g.name]));

      // Simple aggregation in memory for now
      const report: Record<string, { totalClosures: number, totalFee: number, totalPoints: number, collected: number }> = {};

      for (const closure of allClosures) {
        let key = "Unknown";
        if (input.groupBy === "ca") {
          const id = closure.caId?.toString();
          key = id ? (execMap.get(id) || `CA #${id}`) : "Unassigned";
        }
        if (input.groupBy === "asm") {
          const id = closure.asmId?.toString();
          key = id ? (execMap.get(id) || `ASM #${id}`) : "Unassigned";
        }
        if (input.groupBy === "group") {
          const id = closure.groupId?.toString();
          key = id ? (groupMap.get(id) || `Group #${id}`) : "Unassigned";
        }

        if (!report[key]) {
          report[key] = { totalClosures: 0, totalFee: 0, totalPoints: 0, collected: 0 };
        }
        report[key].totalClosures += 1;
        report[key].totalFee += parseFloat(closure.totalFee || "0");
        report[key].totalPoints += parseFloat(closure.points || "0");
        const collected = parseFloat(closure.firstInst || "0") + parseFloat(closure.secondInst || "0") + parseFloat(closure.thirdInst || "0");
        report[key].collected += collected;
      }

      return report;
    }),

  getAsmPerformance: salesExecQuery
    .input(z.object({
      monthStr: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const filters = [eq(salesClosures.isDeleted, false)];

      if (input.monthStr) {
        filters.push(eq(salesClosures.monthStr, input.monthStr));
      }

      // 1. Fetch all closures for the given month
      const allClosures = await db.query.salesClosures.findMany({
        where: and(...filters),
      });

      // 2. Fetch required entities for mapping
      const allExecs = await db.query.salesExecutives.findMany();
      const execMap = new Map(allExecs.map(e => [e.id?.toString(), e.name]));

      const allGroups = await db.query.salesGroups.findMany();

      // 3. Group by GroupId
      // Result structure: map of groupId -> data
      const groupStats = new Map<string, {
        caSet: Set<string>;
        groupName: string;
        managerName: string | null;
        asmName: string;
        firstPayment: number;
        oldBalance: number;
        renewal: number;
        closures: number;
      }>();

      for (const group of allGroups) {
        if (!group.id) continue;
        groupStats.set(group.id.toString(), {
          caSet: new Set<string>(),
          groupName: group.name,
          managerName: group.managerId ? (execMap.get(group.managerId.toString()) || null) : null,
          asmName: group.asmId ? (execMap.get(group.asmId.toString()) || "N/A") : "N/A",
          firstPayment: 0,
          oldBalance: 0,
          renewal: 0,
          closures: 0,
        });
      }

      // Add a fallback group for unassigned closures
      groupStats.set("unassigned", {
        caSet: new Set<string>(),
        groupName: "Unassigned",
        managerName: null,
        asmName: "N/A",
        firstPayment: 0,
        oldBalance: 0,
        renewal: 0,
        closures: 0,
      });

      // 4. Process closures
      for (const closure of allClosures) {
        const groupId = closure.groupId?.toString() || "unassigned";
        let stats = groupStats.get(groupId);
        if (!stats) {
          stats = {
            caSet: new Set<string>(),
            groupName: `Group #${groupId}`,
            managerName: null,
            asmName: "N/A",
            firstPayment: 0,
            oldBalance: 0,
            renewal: 0,
            closures: 0,
          };
          groupStats.set(groupId, stats);
        }

        if (closure.caId) {
          const caName = execMap.get(closure.caId.toString());
          if (caName) stats.caSet.add(caName);
        }

        const collected = parseFloat(closure.firstInst || "0") + parseFloat(closure.secondInst || "0") + parseFloat(closure.thirdInst || "0");
        const type = closure.type || "New Closure";

        if (type === "New Closure") {
          stats.firstPayment += collected;
          stats.closures += 1;
        } else if (type === "Old Balance") {
          stats.oldBalance += collected;
        } else if (type === "Renewal") {
          stats.renewal += collected;
        } else {
          // fallback to firstPayment if unknown
          stats.firstPayment += collected;
        }
      }

      // 5. Convert to array and format caList
      const result = Array.from(groupStats.values())
        .filter(s => s.firstPayment > 0 || s.oldBalance > 0 || s.renewal > 0 || s.closures > 0)
        .map(s => ({
          ...s,
          caList: s.caSet.size > 0 ? Array.from(s.caSet).join(", ") : "—",
        }))
        // Filter out the Set so it's clean for tRPC
        .map(({ caSet, ...rest }) => rest);

      return result;
    }),

  generateDetailedReport: salesExecQuery
    .input(z.object({
      monthStr: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const filters = [eq(salesClosures.isDeleted, false)];

      // if not admin, strict visibility
      if (ctx.user.role === "sales_executive") {
        const dbUser = await db.query.users.findFirst({
          where: eq(users.id, ctx.user.id)
        });
        if (!dbUser?.salesExecutiveId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sales profile missing" });
        }
        const profile = await db.query.salesExecutives.findFirst({
          where: eq(salesExecutives.id, dbUser.salesExecutiveId)
        });
        if (profile?.designation === "Manager") {
          const managedGroups = await db.query.salesGroups.findMany({
            where: eq(salesGroups.managerId, profile.id)
          });
          const groupIds = managedGroups.map(g => g.id);
          if (groupIds.length > 0) {
            filters.push(inArray(salesClosures.groupId, groupIds));
          } else {
            filters.push(eq(salesClosures.id, -1));
          }
        } else if (profile?.isASM && profile?.groupId) {
          filters.push(eq(salesClosures.groupId, profile.groupId));
        } else {
          filters.push(eq(salesClosures.caId, dbUser.salesExecutiveId));
        }
      }

      if (input.monthStr) {
        filters.push(eq(salesClosures.monthStr, input.monthStr));
      }
      
      const allClosures = await db.query.salesClosures.findMany({
        where: and(...filters),
        orderBy: (salesClosures: any, { asc }: any) => [asc(salesClosures.closingDate)],
      });

      const allExecs = await db.query.salesExecutives.findMany();
      const execMap = new Map(allExecs.map((e: any) => [e.id?.toString(), e.name]));

      const allGroups = await db.query.salesGroups.findMany();
      const groupMap = new Map(allGroups.map((g: any) => [g.id?.toString(), g]));

      const detailedReport = allClosures.map((c: any) => {
        const caName = c.caId ? (execMap.get(c.caId.toString()) || "Unknown") : "Unknown";
        const group = c.groupId ? groupMap.get(c.groupId.toString()) : null;
        const teamName = group ? group.name : "Unassigned";
        const asmName = group?.asmId ? (execMap.get(group.asmId.toString()) || "N/A") : "N/A";
        const managerName = group?.managerId ? (execMap.get(group.managerId.toString()) || "N/A") : "N/A";
        
        return {
          id: c.id,
          closingDate: c.closingDate,
          monthStr: c.monthStr || "",
          managerName: managerName,
          asmName: asmName,
          teamName: teamName,
          caCategory: c.caCategory || "",
          caName: caName,
          courseName: c.courseName || "",
          admNo: c.admNo || "",
          closure: 1, // typically 1 per row
          studentName: c.studentName || "",
          totalFee: parseFloat(c.totalFee || "0"),
          firstInst: parseFloat(c.firstInst || "0"),
          secondInst: parseFloat(c.secondInst || "0"),
          thirdInst: parseFloat(c.thirdInst || "0"),
          balance: parseFloat(c.balance || "0"),
          bank: c.bank || "",
          isVerified: c.isVerified,
          verificationStatus: c.verificationStatus || "",
        };
      });

      return detailedReport;
    }),
});

