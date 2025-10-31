import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Lock, Unlock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const SemaphoreIndicator = () => {
  const [semaphoreStatus, setSemaphoreStatus] = useState<{
    locked: boolean;
    username?: string;
  }>({ locked: false });

  useEffect(() => {
    const fetchSemaphoreStatus = async () => {
      try {
        const response = await api.getSemaphoreStatus();
        setSemaphoreStatus({
          locked: response.data.semaphore_value === 0,
          username: response.data.semaphore_value === 0 ? 'Writer Active' : undefined,
        });
      } catch (error) {
        console.error('Failed to fetch semaphore status:', error);
      }
    };

    fetchSemaphoreStatus();

    // Poll for updates every 10 seconds to avoid rate limiting
    const interval = setInterval(fetchSemaphoreStatus, 10000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex items-center justify-center gap-3 p-4 bg-muted rounded-lg">
      {semaphoreStatus.locked ? (
        <>
          <Lock className="h-5 w-5 text-destructive" />
          <Badge variant="destructive">
            Writer Locked
          </Badge>
          {semaphoreStatus.username && (
            <span className="text-sm text-muted-foreground">
              by <span className="font-semibold">{semaphoreStatus.username}</span>
            </span>
          )}
        </>
      ) : (
        <>
          <Unlock className="h-5 w-5 text-success" />
          <Badge className="bg-success text-success-foreground">
            Writer Available
          </Badge>
        </>
      )}
    </div>
  );
};
