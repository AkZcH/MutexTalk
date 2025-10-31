import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const Reader = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState<string>("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchMessages = async () => {
    setIsLoading(true);
    try {
      const response = await api.getMessages();
      setMessages(response.data?.messages || []);
    } catch (error: any) {
      console.error('Failed to load messages:', error);
      toast.error(error.message || 'Failed to load messages');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const currentUser = api.getCurrentUser();
    if (currentUser) {
      setUsername(currentUser);
    }

    fetchMessages();

    // Set up WebSocket for real-time updates
    const ws = api.connectWebSocket((data) => {
      if (data.type === 'message_created' || data.type === 'message_updated' || data.type === 'message_deleted') {
        fetchMessages(); // Refresh messages on any change
      }
    });

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-2xl">Reader Mode</CardTitle>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  User: <span className="font-semibold text-foreground">{username}</span>
                </span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={fetchMessages}
                  disabled={isLoading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate("/role-selection")}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Chat Messages</CardTitle>
          </CardHeader>
          <CardContent>
            {messages.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No messages yet.
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((message: any) => (
                  <Card key={message.id} className="p-4">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="font-semibold text-primary">{message.username}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(message.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-foreground">{message.message}</p>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Reader;
