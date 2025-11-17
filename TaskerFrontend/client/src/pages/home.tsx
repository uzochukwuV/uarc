import { Navigation } from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Layers, Users, Zap, DollarSign } from "lucide-react";
import { Link } from "wouter";
import { useGlobalRegistry, useExecutorHub, useTasksByStatus } from "@/lib/hooks";
import heroImage from "@assets/generated_images/Hero_automation_network_illustration_0a6aa66f.png";

export default function Home() {
  // Get analytics data from blockchain
  const { totalTasks, isLoading: isLoadingRegistry } = useGlobalRegistry();
  const { executorCount, isLoading: isLoadingExecutors } = useExecutorHub();
  const { tasks: activeTasks, isLoading: isLoadingActiveTasks } = useTasksByStatus(1); // Status 1 = Active

  const isLoading = isLoadingRegistry || isLoadingExecutors || isLoadingActiveTasks;

  // For now, TVL calculation would require iterating through all tasks
  // We'll show a placeholder and implement this later with a custom hook
  const totalValueLocked = 0; // TODO: Implement TVL calculation
  const totalExecutions = 0; // TODO: Track from events

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 z-0">
          <img
            src={heroImage}
            alt="Automation Network"
            className="w-full h-full object-cover opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 pt-32 pb-24 text-center">
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
            <span className="text-foreground">Automate </span>
            <span className="text-primary">DeFi Tasks</span>
            <br />
            <span className="text-foreground">Onchain</span>
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-12">
            The decentralized automation marketplace. Create limit orders, DCA strategies,
            and auto-compounding tasks. Execute and earn rewards.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/create">
              <Button size="lg" className="group" data-testid="button-create-task-hero">
                Create Task
                <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link href="/execute">
              <Button size="lg" variant="outline" data-testid="button-become-executor-hero">
                Become Executor
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Statistics Section */}
      <section className="relative z-20 max-w-7xl mx-auto px-6 -mt-24 mb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-6 bg-card rounded-lg border border-border">
                <Skeleton className="h-4 w-24 mb-4" />
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))
          ) : (
            <>
              <StatCard
                title="Total Value Locked"
                value={`${totalValueLocked.toFixed(2)} ETH`}
                icon={DollarSign}
              />
              <StatCard
                title="Active Tasks"
                value={(activeTasks?.length || 0).toString()}
                icon={Layers}
              />
              <StatCard
                title="Total Executors"
                value={executorCount.toString()}
                icon={Users}
              />
              <StatCard
                title="Total Executions"
                value={totalExecutions.toString()}
                icon={Zap}
              />
            </>
          )}
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold tracking-tight mb-4">
            How It Works
          </h2>
          <p className="text-xl text-muted-foreground">
            Three simple steps to automate your DeFi strategy
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center p-8 rounded-lg bg-card border border-border hover-elevate transition-all">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
              <span className="text-2xl font-bold text-primary">1</span>
            </div>
            <h3 className="text-xl font-semibold mb-3">Create Task</h3>
            <p className="text-muted-foreground">
              Choose from templates like limit orders, DCA, or auto-compound.
              Set your parameters and fund the task.
            </p>
          </div>

          <div className="text-center p-8 rounded-lg bg-card border border-border hover-elevate transition-all">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
              <span className="text-2xl font-bold text-primary">2</span>
            </div>
            <h3 className="text-xl font-semibold mb-3">Executors Monitor</h3>
            <p className="text-muted-foreground">
              Decentralized executors watch for your task conditions to be met.
              They compete for the best execution.
            </p>
          </div>

          <div className="text-center p-8 rounded-lg bg-card border border-border hover-elevate transition-all">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
              <span className="text-2xl font-bold text-primary">3</span>
            </div>
            <h3 className="text-xl font-semibold mb-3">Automatic Execution</h3>
            <p className="text-muted-foreground">
              When conditions are met, executors run your task. You get results,
              they earn rewards.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 p-12 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Automate?
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Join thousands of users automating their DeFi strategies with TaskerOnchain
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/create">
              <Button size="lg" data-testid="button-get-started">
                Get Started
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
            <Link href="/analytics">
              <Button size="lg" variant="outline" data-testid="button-view-analytics">
                View Analytics
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border mt-24">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="text-center text-muted-foreground">
            <p>© 2025 TaskerOnchain. Decentralized automation for DeFi.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
