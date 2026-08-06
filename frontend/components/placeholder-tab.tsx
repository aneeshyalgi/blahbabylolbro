"use client";

import { Construction } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface PlaceholderTabProps {
  tabName: string;
}

export function PlaceholderTab({ tabName }: PlaceholderTabProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-24">
        <Construction className="mb-4 h-16 w-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold text-foreground">
          {tabName}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This section is under development
        </p>
      </CardContent>
    </Card>
  );
}
