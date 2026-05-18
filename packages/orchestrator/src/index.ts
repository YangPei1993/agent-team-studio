export type TaskStrategy = "fast" | "parallel_consensus" | "debate" | "review_then_act";
export type RuntimeStrategy = "single_agent" | "parallel_consensus" | "debate" | "review_then_act";

export interface ConductorPlanPlaceholder {
  strategy: TaskStrategy;
  nodes: string[];
}
