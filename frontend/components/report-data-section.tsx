"use client";

import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ReportDataSectionProps {
  isLoading?: boolean;
  datasetId?: string | null;
}

interface ReportRow {
  category: string;
  metric: string;
  value: number | null;
}

export function ReportDataSection({ isLoading = false, datasetId }: ReportDataSectionProps) {
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (datasetId) {
      generateReport(datasetId);
    } else {
      setReportData([]);
    }
  }, [datasetId]);
  
  const generateReport = async (id: string) => {
    try {
      setLoading(true);
      const response = await fetch(API_ENDPOINTS.datasetById(id));
      const data = await response.json();
      
      if (!data.tables || data.tables.length === 0) {
        setReportData([]);
        return;
      }
      
      const report: ReportRow[] = [];
      
      // Add dataset overview
      report.push({
        category: 'Dataset',
        metric: 'Total Tables',
        value: data.tables.length
      });
      
      // Add statistics for each table
      data.tables.forEach((table: any, idx: number) => {
        const tableName = table.name || `Table ${idx + 1}`;
        
        report.push(
          { category: tableName, metric: 'Sheet', value: null },
          { category: tableName, metric: 'Rows', value: table.end_row - table.start_row },
          { category: tableName, metric: 'Columns', value: table.columns?.length || 0 },
          { category: tableName, metric: 'Confidence', value: table.confidence * 100 }
        );
        
        // Count null values across all columns
        const totalNulls = table.columns?.reduce((sum: number, col: any) => sum + (col.null_count || 0), 0) || 0;
        report.push({ category: tableName, metric: 'Missing Values', value: totalNulls });
      });
      
      setReportData(report);
    } catch (error) {
      console.error('Error generating report:', error);
      setReportData([]);
    } finally {
      setLoading(false);
    }
  };
  const formatValue = (value: number | null) => {
    if (value === null) return '';
    if (value < 1 && value > 0) return value.toFixed(4);
    if (Number.isInteger(value)) return value.toLocaleString();
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Group data by category
  const groupedData = reportData.reduce(
    (acc, row) => {
      if (!acc[row.category]) {
        acc[row.category] = [];
      }
      acc[row.category].push(row);
      return acc;
    },
    {} as Record<string, typeof reportData>
  );

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base font-semibold">Report Data</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Aggregated reporting output
            </p>
          </div>
          <div className="flex gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm">
                    <FileText className="mr-2 h-4 w-4" />
                    Generate Report
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Generate aggregated report</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Download className="mr-2 h-4 w-4" />
                    Export to Excel
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Download report as Excel file</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading || isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : reportData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium text-foreground">
              No report data available
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Generate a report to view aggregated data
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Metric</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(groupedData).map(([category, rows]) => (
                  rows.map((row, rowIndex) => (
                    <TableRow
                      key={`${category}-${row.metric}`}
                      className={cn(
                        category === "Dataset" && "bg-muted/50 font-medium"
                      )}
                    >
                      <TableCell
                        className={cn(
                          "font-medium",
                          rowIndex > 0 && "text-transparent"
                        )}
                      >
                        {row.category}
                      </TableCell>
                      <TableCell>{row.metric}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatValue(row.value)}
                      </TableCell>
                    </TableRow>
                  ))
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
