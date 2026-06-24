export interface WorkspaceMember {
  userExternalId: string
  email: string
  role: string
  isAccepted: boolean
}
export interface WorkspaceInfo {
  externalId: string
  name: string
  defaultLanguage: string
  defaultCurrency: string
  budget: number
  tasksCount: number
  members?: WorkspaceMember[]
}

export type MainTaskStatus = 'toDo' | 'inProgress' | 'done' | 'delayed'

export interface SubtaskDto {
  externalId: string
  title: string
  isCompleted: boolean
  dueDate: string | null
}
export interface MainTaskDetail {
  externalId: string
  title: string
  description: string
  status: MainTaskStatus
  dueDate: string | null
  beginDate: string | null
  endDate: string | null
  subtasksCount: number
  completedSubtasksCount: number
  totalCostValue: number
  totalCostCurrency: string
  subtasks: SubtaskDto[]
  dependsOnTaskExternalIds: string[]
}

export type Currency = 'pln' | 'eur' | 'usd'
export interface CostItem {
  externalId: string
  name: string
  amount: number
  currency: Currency
  paid: boolean
  mainTask?: { externalId: string; title: string } | null
}
export interface CostDashboard {
  totalCost: number
  currency: Currency
  totalBudget: number
  spentBudget: number
  remainingBudget: number
  paidCosts: number
  unpaidCosts: number
  budgetExceeded: boolean
  costByTasks: Array<{ taskExternalId: string; taskTitle: string; taskCost: number }>
}

export interface IssueReportSummary {
  externalId: string
  title: string
  reportDate: string
  status: string
  taskName: string
  totalIssues: number
  openIssues: number
}
export interface IssueReportDetail extends IssueReportSummary {
  issues: Array<{
    externalId: string
    sequenceNumber: number
    title: string
    description: string
    severity: string
    status: string
    resolution: string
  }>
}

export interface ActivityItem {
  occurredAt: string
  category: string
  description: string
  params: Record<string, string>
  actorName: string
}
export interface ActivityFeed {
  items: ActivityItem[]
  nextCursor: string | null
}

export interface TimelineTask {
  id: string
  name: string
  start: string | null
  end: string | null
  progress: number
  status: string
  dependencies: string[]
  subtasks: Array<{ id: string; title: string; dueDate: string; isCompleted: boolean }>
}
export interface ProjectTimeline {
  workspaceId: string
  timelineData: Array<{
    categoryId: string | null
    categoryName: string
    tasks: TimelineTask[]
  }>
}
