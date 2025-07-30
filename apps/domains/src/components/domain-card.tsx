import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "~/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import type { DomainCardProps } from "~/lib/types";

export function DomainCard({ domain }: DomainCardProps) {
  const getBorderColor = () => {
    switch (domain.status) {
      case "available":
        return "border-pandan-600";
      case "unavailable":
        return "border-lychee-600";
      case "error":
        return "border-lychee-600";
      default:
        return "border-longan-600";
    }
  };

  return (
    <Card
      className={`group relative h-12 border-[1.5px] bg-longan-800 transition-all duration-200 hover:shadow-lg ${getBorderColor()}`}
    >
      <CardContent className="flex h-full items-center justify-between py-0">
        {domain.status === "unknown" ? (
          <div className="flex items-center space-x-2 text-rambutan-400">
            <div className="h-4 w-4 animate-spin rounded-full border-[1.5px] border-rambutan-400 border-t-transparent" />
            <span className="font-bold text-base">Checking...</span>
          </div>
        ) : (
          <h3
            className={`flex min-w-0 font-bold text-base leading-tight ${
              domain.status === "unavailable"
                ? "text-rambutan-400 line-through"
                : domain.status === "error"
                  ? "text-lychee-400"
                  : "text-rambutan-100"
            }`}
          >
            <span className="truncate">{domain.domain}</span>
            <span className="flex-shrink-0">{domain.tld}</span>
          </h3>
        )}

        {domain.status === "error" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="ml-2 flex-shrink-0 cursor-help text-lychee-400">
                <AlertTriangle size={16} />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Failed to check domain availability</p>
            </TooltipContent>
          </Tooltip>
        )}
      </CardContent>
    </Card>
  );
}
