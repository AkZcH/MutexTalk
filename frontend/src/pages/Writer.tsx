import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Message {
  id: number;
  username: string;
  message: string;
  created_at: string;
  updated_at: string;
}

const Writer = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState<string>("");
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");

  useEffect(() => {
    const currentUser = api.getCurrentUser();
    if (currentUser) {
      setUsername(currentUser);
    }

    const acquireWriterSession = async () => {
      try {
        console.log('Attempting to acquire writer access...');
        const result = await api.acquireWriterAccess();
        console.log('Acquire result:', result);
        
        // Load messages after successful acquisition
        const response = await api.getMessages();
        setMessages(response.data?.messages || []);
        toast.success("Writer access acquired");
      } catch (error: any) {
        console.error('Acquire session error:', error);
        toast.error(error.message || "Another writer is currently active. Try again later.");
        navigate("/role-selection");
      }
    };

    acquireWriterSession();

    // Set up WebSocket for real-time updates
    const ws = api.connectWebSocket((data) => {
      if (data.type === 'semaphore_status') {
        console.log('Writer received semaphore status update:', data.data);
        // If semaphore is released by someone else, we might need to handle it
        if (data.data.semaphore === 1 && data.data.holder !== username) {
          // Semaphore was released, but we should still maintain our session
          // unless we were forcibly disconnected
        }
      } else if (data.type === 'message_created') {
        // Refresh messages when new ones are created
        api.getMessages().then(response => {
          setMessages(response.data?.messages || []);
        }).catch(console.error);
      }
    });

    // Handle page unload to release semaphore
    const handleBeforeUnload = async () => {
      try {
        // Use sendBeacon for reliable cleanup on page unload
        const token = localStorage.getItem('token');
        if (token) {
          navigator.sendBeacon('/api/writer/release', JSON.stringify({}));
        }
      } catch (error) {
        console.error('Error releasing semaphore on unload:', error);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup WebSocket and event listeners on unmount
    return () => {
      if (ws) {
        ws.close();
      }
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      // Try to release semaphore when component unmounts
      api.releaseWriterAccess().catch(console.error);
    };
  }, [navigate, username]);

  const handleSendMessage = async () => {
    if (!newMessage.trim()) {
      toast.error("Please enter a message");
      return;
    }

    try {
      await api.createMessage(newMessage.trim());
      setNewMessage("");
      toast.success("Message sent");
      // Refresh messages
      const response = await api.getMessages();
      setMessages(response.data?.messages || []);
    } catch (error: any) {
      toast.error(`Failed to send message: ${error.message}`);
    }
  };

  const handleDeleteMessage = async (id: number) => {
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

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-2xl">Writer Mode</CardTitle>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  User: <span className="font-semibold text-foreground">{username}</span>
                </span>
                <Button variant="outline" size="sm" onClick={async () => {
                  try {
                    await api.releaseWriterAccess();
                    toast.success("Writer access released");
                  } catch (error) {
                    console.error('Release error:', error);
                    toast.error("Failed to release writer access");
                  }
                  navigate("/role-selection");
                }}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Release & Back
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Chat Messages</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No messages yet. Be the first to write!
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((message: any) => (
                  <Card key={message.id} className="p-4">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="font-semibold text-primary">{message.username}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(message.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-foreground">{message.message}</p>
                      </div>
                      {username === message.username && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteMessage(message.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <Textarea
                placeholder="Type your message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                rows={3}
              />
              <Button onClick={handleSendMessage} className="w-full">
                <Send className="h-4 w-4 mr-2" />
                Send Message
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Writer;
