export type DashboardStats = {
  successRate: number;
  approvedRate: number;
  badCaseTop3: { reason: string; count: number }[];
  totalJobs: number;
  totalReviews: number;
  totalStoryboards: number;
  totalShots: number;
  totalEstimatedCostCny: number;
  succeededEstimatedCostCny: number;
  unproducedCostCny: number;
  totalVideoSeconds: number;
  knownCostJobs: number;
};

const BASE = "/api/dashboard/stats";

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && (data.error || data.msg || data.message)) || `请求失败 (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : "请求失败");
  }
  return data as T;
}

export async function getStats(): Promise<DashboardStats> {
  const res = await fetch(BASE);
  return handleResponse<DashboardStats>(res);
}

const dashboardApi = { getStats };
export default dashboardApi;
