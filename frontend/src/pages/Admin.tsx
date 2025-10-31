import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, RefreshCw, ToggleLeft, ToggleRight, Shield } from "lucide-react";
import { toast } from "sonner";

interface LogEntry {
  id: number;
  ts: string;
  action: string;
  user: string;
  content: string;
  semaphore_value: number;
}

const Admin = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState<string>("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const response = await api.getLogs();
      setLogs(response.data?.logs || []);
    } catch (error: any) {
      console.error('Failed to load logs:', error);
      toast.error(error.message || 'Failed to load logs');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStatus = async () => {
    try {
      const response = await api.getStatus();
      setSystemStatus(response.data);
    } catch (error: any) {
      console.error('Failed to fetch status:', error);
      toast.error(error.message || 'Failed to fetch system status');
    }
  };

  const handleToggleWriter = async () => {
    try {
      const response = await api.toggleWriter();
      toast.success(response.message || 'Writer access toggled successfully');
      fetchStatus(); // Refresh status
      fetchLogs(); // Refresh logs
    } catch (error: any) {
      console.error('Failed to toggle writer:', error);
      toast.error(error.message || 'Failed to toggle writer access');
    }
  };

  useEffect(() => {
    const currentUser = api.getCurrentUser();
    const currentRole = api.getCurrentRole();
    
    if (currentRole !== 'admin') {
      toast.error('Admin access required');
      navigate('/role-selection');
      return;
    }
    
    if (currentUser) {
      setUsername(currentUser);
    }

    fetchLogs();
    fetchStatus();

    // Set up WebSocket for real-time updates
    const ws = api.connectWebSocket((data) => {
      if (data.type === 'system_status' || data.type === 'writer_changed') {
        fetchStatus();
        fetchLogs();
      }
    });

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [navigate]);

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'CREATE': return 'text-green-600';
      case 'UPDATE': return 'text-blue-600';
      case 'DELETE': return 'text-red-600';
      case 'ACQUIRE_MUTEX': return 'text-orange-600';
      case 'RELEASE_MUTEX': return 'text-purple-600';
      case 'ADMIN_ACTION': return 'text-indigo-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" />
                <CardTitle className="text-2xl">Admin Dashboard</CardTitle>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  Admin: <span className="font-semibold text-foreground">{username}</span>
                </span>
                <Button variant="outline" size="sm" onClick={() => navigate("/role-selection")}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Tabs defaultValue="status" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="status">System Status</TabsTrigger>
            <TabsTrigger value="users">User Management</TabsTrigger>
            <TabsTrigger value="logs">Transaction Logs</TabsTrigger>
          </TabsList>
          
          <TabsContent value="status" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>System Status</CardTitle>
                  <Button variant="outline" size="sm" onClick={fetchStatus}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {systemStatus ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card>
                        <CardContent className="pt-6">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Semaphore Status</span>
                            <div className="flex items-center gap-2">
                              <div className={`w-3 h-3 rounded-full ${systemStatus.semaphore === 1 ? 'bg-green-500' : 'bg-red-500'}`} />
                              <span className="text-sm">
                                {systemStatus.semaphore === 1 ? 'Available' : 'Locked'}
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardContent className="pt-6">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Current Writer</span>
                            <span className="text-sm font-mono">
                              {systemStatus.holder || 'None'}
                            </span>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardContent className="pt-6">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Writer Access</span>
                            <div className="flex items-center gap-2">
                              {systemStatus.writer_enabled ? (
                                <ToggleRight className="h-5 w-5 text-green-500" />
                              ) : (
                                <ToggleLeft className="h-5 w-5 text-red-500" />
                              )}
                              <span className="text-sm">
                                {systemStatus.writer_enabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="flex justify-center">
                      <Button 
                        onClick={handleToggleWriter}
                        variant={systemStatus.writer_enabled ? "destructive" : "default"}
                      >
                        {systemStatus.writer_enabled ? (
                          <>
                            <ToggleLeft className="h-4 w-4 mr-2" />
                            Disable Writer Access
                          </>
                        ) : (
                          <>
                            <ToggleRight className="h-4 w-4 mr-2" />
                            Enable Writer Access
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading system status...
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <p>User management features coming soon...</p>
                  <p className="text-sm mt-2">
                    For now, users are created with 'reader' role by default.
                  </p>
                  <p className="text-sm">
                    Default accounts: admin/admin123, writer1/writer123, reader1/reader123
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="logs" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Transaction Logs</CardTitle>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={fetchLogs}
                    disabled={isLoading}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {logs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {isLoading ? 'Loading logs...' : 'No logs available'}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {logs.map((log) => (
                      <Card key={log.id} className="p-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`font-medium text-sm ${getActionColor(log.action)}`}>
                                {log.action}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatTimestamp(log.ts)}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-muted-foreground">
                                User: <span className="text-foreground font-medium">{log.user || 'system'}</span>
                              </span>
                              <span className="text-muted-foreground">
                                Semaphore: <span className="text-foreground font-medium">{log.semaphore_value}</span>
                              </span>
                            </div>
                            {log.content && (
                              <p className="text-sm text-muted-foreground mt-1 truncate">
                                {log.content}
                              </p>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;