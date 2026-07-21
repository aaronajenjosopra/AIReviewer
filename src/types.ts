export enum Platform {
  GITLAB = "gitlab",
  AZURE_DEVOPS = "azure_devops",
  MANUAL = "manual"
}

export interface PRDetails {
  id: string;
  title: string;
  description: string;
  authorName: string;
  authorAvatar?: string;
  sourceBranch: string;
  targetBranch: string;
  state: string;
  webUrl: string;
  platform: Platform;
  repoName: string;
  projectName?: string;
  organizationName?: string;
  instanceUrl?: string;
}

export interface FileDiff {
  oldPath: string;
  newPath: string;
  diff: string;
  additions: number;
  deletions: number;
  isNew: boolean;
  isDeleted: boolean;
  isRename: boolean;
  content?: string; // Optional full content of the file
}

export enum IssueCategory {
  BUG = "bug",
  SECURITY = "security",
  PERFORMANCE = "performance",
  STYLE = "style",
  REFACTOR = "refactor"
}

export enum IssueSeverity {
  CRITICAL = "critical",
  WARNING = "warning",
  SUGGESTION = "suggestion"
}

export interface FileAnnotation {
  filePath: string;
  line: number; // 1-indexed, relative to the NEW file content
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  comment: string;
  originalCode?: string;
  suggestedCode?: string;
}

export interface ReviewReport {
  score: number; // 0 to 100
  summary: string;
  riskLevel: "low" | "medium" | "high";
  generalRecommendations: string[];
  annotations: FileAnnotation[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  openPRCount: number;
  webUrl: string;
  platform: Platform;
  owner?: string;
}

export interface TaskIssue {
  id: string;
  title: string;
  description: string;
  state: string;
  type: string; // e.g. "Task", "User Story", "Bug"
  assignee?: string;
  assigneeAvatar?: string;
  subtasks?: string[];
  functionalSpecs?: string;
}

export interface SprintInfo {
  name: string;
  startDate?: string;
  endDate?: string;
  state: "active" | "future" | "past";
  totalPoints?: number;
}


export interface PRAnalysisResult {
  prDetails: PRDetails;
  files: FileDiff[];
  report: ReviewReport;
}

export interface AnalysisStep {
  id: string;
  label: string;
  description: string;
  status: "idle" | "running" | "success" | "error";
  errorMsg?: string;
}
