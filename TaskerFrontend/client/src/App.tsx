import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Web3Provider } from "@/providers/Web3Provider";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import CreateTask from "@/pages/create-task";
import MyTasks from "@/pages/my-tasks";
import ExecutorDashboard from "@/pages/executor-dashboard";
import Leaderboard from "@/pages/leaderboard";
import Analytics from "@/pages/analytics";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/create" component={CreateTask} />
      <Route path="/my-tasks" component={MyTasks} />
      <Route path="/execute" component={ExecutorDashboard} />
      <Route path="/leaderboard" component={Leaderboard} />
      <Route path="/analytics" component={Analytics} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <Web3Provider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </Web3Provider>
  );
}

export default App;
