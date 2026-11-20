"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import NewClosureForm from "@/components/Sales/NewClosureForm";
import ClosuresList from "@/components/Sales/ClosuresList";
import SalesReportsView from "@/components/Sales/SalesReportsView";
import HierarchyManager from "@/components/Sales/HierarchyManager";
import DashboardView from "@/components/Sales/DashboardView";
import AsmPerformanceReport from "@/components/Sales/AsmPerformanceReport";

export default function SalesDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");

  const isAdmin = ["super_admin", "admin"].includes(user?.role || "");

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Sales & Account Module</h1>
        <p className="text-slate-500 dark:text-slate-400">Manage closures, team hierarchy, points calculation, and dynamic reports.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 h-auto justify-start">
          <TabsTrigger value="dashboard" className="data-[state=active]:bg-white dark:data-[state=active]:bg-indigo-600 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-white data-[state=active]:shadow">Dashboard</TabsTrigger>
          <TabsTrigger value="closures" className="data-[state=active]:bg-white dark:data-[state=active]:bg-indigo-600 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-white data-[state=active]:shadow">Closures</TabsTrigger>
          <TabsTrigger value="new-closure" className="data-[state=active]:bg-white dark:data-[state=active]:bg-indigo-600 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-white data-[state=active]:shadow">New Closure (Data Entry)</TabsTrigger>
          <TabsTrigger value="reports" className="data-[state=active]:bg-white dark:data-[state=active]:bg-indigo-600 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-white data-[state=active]:shadow">Closures List</TabsTrigger>
          <TabsTrigger value="asm-report" className="data-[state=active]:bg-white dark:data-[state=active]:bg-indigo-600 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-white data-[state=active]:shadow">ASM Report</TabsTrigger>
          {isAdmin && (
            <>
              <TabsTrigger value="hierarchy" className="data-[state=active]:bg-white dark:data-[state=active]:bg-indigo-600 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-white data-[state=active]:shadow">Hierarchy & Teams</TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="dashboard" className="mt-6">
          <DashboardView />
        </TabsContent>



        <TabsContent value="closures" className="mt-6">
          <ClosuresList />
        </TabsContent>


        <TabsContent value="new-closure" className="mt-6">
          <NewClosureForm onSuccess={() => setActiveTab("closures")} />
        </TabsContent>

        <TabsContent value="reports" className="mt-6">
          <SalesReportsView />
        </TabsContent>

        <TabsContent value="asm-report" className="mt-6">
          <AsmPerformanceReport />
        </TabsContent>

        {isAdmin && (
          <>
            <TabsContent value="hierarchy" className="mt-6">
              <HierarchyManager />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
