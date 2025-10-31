import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Message {
  id: number;
  username: string;
  message: string;
  created_at: string;
  updated_at: string;
}

interface MessageListProps {
  readonly?: boolean;
  currentUsername?: string;
  onEdit?: (message: Message) => void;
}

export const MessageList = ({ readonly = true, currentUsername, onEdit }: MessageListProps) => {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const response = await api.getMessages();
        setMessages(response.data?.messages || []);
      } catch (error) {
        console.error('Failed to load messages:', error);
      }
    };

    fetchMessages();
    const interval = setInterval(fetchMessages, 10000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const handleDelete = async (id: number) => {
    try {
      await api.deleteMessage(id);
      toast.success("Message deleted");
      // Refresh messages
      const response = await api.getMessages();
      setMessages(response.data?.messages || []);
    } catch (error) {
      toast.error("Failed to delete message");
    }
  };

  if (messages.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No messages yet. {!readonly && "Be the first to write!"}
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
      {messages.map((message) => (
        <Card key={message.id} className="p-4">
          <div className="flex justify-between items-start gap-4">
            <div className="flex-1">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="font-semibold text-primary">{message.username}</span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(message.created_at), "HH:mm:ss")}
                </span>
              </div>
              <p className="text-foreground">{message.message}</p>
            </div>
            {!readonly && currentUsername === message.username && (
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit?.(message)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(message.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
};
