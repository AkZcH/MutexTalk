import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, PenTool, LogOut, Shield } from "lucide-react";
import { toast } from "sonner";

const RoleSelection = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState<string>("");
  const [userRole, setUserRole] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<"reader" | "writer" | "admin" | null>(null);
  const [semaphoreStatus, setSemaphoreStatus] = useState<any>(null);

  useEffect(() => {
    const checkAuth = () => {
      if (!api.isAuthenticated()) {
        navigate("/");
        return;
      }

      const currentUser = api.getCurrentUser();
      const currentRole = api.getCurrentRole();
      if (currentUser) {
        setUsername(currentUser);
        setUserRole(currentRole || 'reader');
      }
    };

    const fetchStatus = async () => {
      try {
        const response = await api.getStatus();
        setSemaphoreStatus(response.data);
      } catch (error) {
        console.error('Failed to fetch status:', error);
      }
    };

    checkAuth();
    fetchStatus();

    // Set up WebSocket for real-time updates
    const ws = api.connectWebSocket((data) => {
      if (data.type === 'semaphore_status') {
        console.log('Received semaphore status update:', data.data);
        setSemaphoreStatus(data.data);
      }
    });

    // Cleanup WebSocket on unmount
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await api.logout();
      toast.success("Logged out successfully");
      navigate("/");
    } catch (error) {
      toast.error("Logout failed");
    }
  };

  const handleSubmit = () => {
    if (!selectedRole) {
      toast.error("Please select a role");
      return;
    }

    if (selectedRole === "reader") {
      navigate("/reader");
    } else if (selectedRole === "writer") {
      navigate("/writer");
    } else if (selectedRole === "admin") {
      navigate("/admin");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-3xl">Choose Your Mode</CardTitle>
              <CardDescription className="mt-2">
                Logged in as: <span className="font-semibold text-foreground">{username}</span>
                {userRole && (
                  <span className="ml-2 px-2 py-1 bg-primary/10 text-primary rounded-md text-xs">
                    {userRole.charAt(0).toUpperCase() + userRole.slice(1)}
                  </span>
                )}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {semaphoreStatus && (
            <Card className="bg-muted/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">System Status:</span>
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${semaphoreStatus.semaphore === 1 ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-sm">
                      {semaphoreStatus.semaphore === 1 ? 'Available' : `Writer: ${semaphoreStatus.holder}`}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {userRole === 'reader' && (
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-blue-700">
                    You currently have <strong>Reader</strong> permissions. 
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    Contact an administrator to request Writer or Admin access.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card
              className={`cursor-pointer transition-all hover:shadow-lg ${
                selectedRole === "reader" ? "ring-2 ring-primary" : ""
              }`}
              onClick={() => setSelectedRole("reader")}
            >
              <CardHeader>
                <div className="flex flex-col items-center space-y-2">
                  <BookOpen className="h-12 w-12 text-primary" />
                  <CardTitle>Reader</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-center text-muted-foreground">
                  View chat messages in read-only mode
                </p>
                <p className="text-center text-xs text-green-600 mt-2">
                  Available to all users
                </p>
              </CardContent>
            </Card>

            <Card
              className={`cursor-pointer transition-all hover:shadow-lg ${
                selectedRole === "writer" ? "ring-2 ring-primary" : ""
              } ${userRole !== 'writer' && userRole !== 'admin' ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => {
                if (userRole === 'writer' || userRole === 'admin') {
                  setSelectedRole("writer");
                } else {
                  toast.error("You don't have writer permissions");
                }
              }}
            >
              <CardHeader>
                <div className="flex flex-col items-center space-y-2">
                  <PenTool className="h-12 w-12 text-primary" />
                  <CardTitle>Writer</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-center text-muted-foreground">
                  Add, edit, and delete chat messages
                </p>
                {userRole === 'writer' || userRole === 'admin' ? (
                  <p className="text-center text-xs text-green-600 mt-2">
                    Available to you
                  </p>
                ) : (
                  <p className="text-center text-xs text-red-500 mt-2">
                    Requires writer permissions
                  </p>
                )}
              </CardContent>
            </Card>

            {userRole === 'admin' && (
              <Card
                className={`cursor-pointer transition-all hover:shadow-lg ${
                  selectedRole === "admin" ? "ring-2 ring-primary" : ""
                }`}
                onClick={() => setSelectedRole("admin")}
              >
                <CardHeader>
                  <div className="flex flex-col items-center space-y-2">
                    <Shield className="h-12 w-12 text-primary" />
                    <CardTitle>Admin</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-center text-muted-foreground">
                    System administration and logs
                  </p>
                  <p className="text-center text-xs text-green-600 mt-2">
                    Admin access
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          <Button onClick={handleSubmit} className="w-full" size="lg" disabled={!selectedRole}>
            {selectedRole ? `Enter ${selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)} Mode` : "Select a mode to continue"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default RoleSelection;
