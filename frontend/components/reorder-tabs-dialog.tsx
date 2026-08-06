"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTabOrder } from "@/context/tab-order-context";
import { getTabLabel, TAB_ID_TO_MESSAGE_KEY } from "@/lib/tabs";

interface ReorderTabsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReorderTabsDialog({ open, onOpenChange }: ReorderTabsDialogProps) {
  const t = useTranslations("reorderDialog");
  const tTabs = useTranslations("tabs");
  const tCommon = useTranslations("common");
  const { tabOrder, setTabOrder } = useTabOrder();
  const [order, setOrder] = useState<string[]>([]);

  useEffect(() => {
    if (open && tabOrder.length > 0) {
      setOrder([...tabOrder]);
    }
  }, [open, tabOrder]);

  const getLabel = (id: string) => {
    const key = TAB_ID_TO_MESSAGE_KEY[id];
    if (key) {
      try {
        return tTabs(key);
      } catch {
        return getTabLabel(id);
      }
    }
    return getTabLabel(id);
  };

  const move = (index: number, direction: "up" | "down") => {
    const next = [...order];
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
  };

  const handleDone = () => {
    setTabOrder(order);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1 py-2 max-h-[60vh] overflow-y-auto">
          {order.map((id, index) => (
            <li
              key={id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2"
            >
              <span className="text-sm font-medium text-foreground truncate">
                {getLabel(id)}
              </span>
              <div className="flex items-center gap-0.5 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => move(index, "up")}
                  disabled={index === 0}
                  aria-label={`Move ${getLabel(id)} up`}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => move(index, "down")}
                  disabled={index === order.length - 1}
                  aria-label={`Move ${getLabel(id)} down`}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={handleDone}>{t("done")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
