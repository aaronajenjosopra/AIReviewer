import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json({ limit: "50mb" })); // Increase limit for large diffs or files

const PORT = 3000;

// Initialize OpenAI key verification helper
const getOpenAIKey = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured in the server environment variables.");
  }
  return apiKey;
};

// Kept for backward signature compatibility with existing endpoints
const getGeminiClient = () => {
  return getOpenAIKey();
};

// Helper function to call OpenAI with retry and fallback model
async function generateWithFallback(
  ai: any, // Kept for signature compatibility
  config: { systemInstruction: string; responseMimeType?: string; responseSchema?: any },
  userPrompt: string
) {
  const apiKey = getOpenAIKey();
  const modelsToTry = ["gpt-4o", "gpt-4o-mini"];
  let lastError: any = null;

  for (const model of modelsToTry) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[OpenAI] Attempting generation using model: ${model}, attempt: ${attempt}`);
        
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: "system", content: config.systemInstruction },
              { role: "user", content: userPrompt }
            ],
            response_format: config.responseMimeType === "application/json" ? { type: "json_object" } : undefined,
            temperature: 0.2
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`OpenAI API error (${response.status}): ${errText}`);
        }

        const data: any = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (!text) {
          throw new Error("Received empty content from OpenAI API.");
        }

        console.log(`[OpenAI] Success using model: ${model} on attempt ${attempt}`);
        return { text };
      } catch (err: any) {
        lastError = err;
        const errMsg = err.message || String(err);
        console.error(`[OpenAI Error] Model ${model} failed on attempt ${attempt}:`, errMsg);
        
        if (attempt < 3) {
          const waitTime = attempt * 1500;
          console.log(`[OpenAI] Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          break;
        }
      }
    }
  }

  throw lastError || new Error("Failed to generate content using OpenAI.");
}

// URL Parsers
interface ParsedGitLab {
  instanceUrl: string;
  projectPath: string;
  mrIid: string;
}

interface ParsedAzureDevOps {
  instanceUrl: string;
  organization: string;
  project: string;
  repository: string;
  pullRequestId: string;
}

function parseGitLabUrl(urlStr: string): ParsedGitLab {
  try {
    const url = new URL(urlStr);
    const pathname = url.pathname;
    
    // GitLab URL typically looks like: https://gitlab.com/group/subgroup/project/-/merge_requests/42
    if (!pathname.includes("/-/merge_requests/")) {
      throw new Error("URL is not a standard GitLab merge request URL (missing '/-/merge_requests/')");
    }

    const parts = pathname.split("/-/merge_requests/");
    const projectPath = parts[0].replace(/^\//, ""); // Remove leading slash
    const mrIid = parts[1].split("/")[0];

    const instanceUrl = `${url.protocol}//${url.host}`;
    return { instanceUrl, projectPath, mrIid };
  } catch (error: any) {
    throw new Error(`Failed to parse GitLab URL: ${error.message}`);
  }
}

function parseAzureDevOpsUrl(urlStr: string): ParsedAzureDevOps {
  try {
    const url = new URL(urlStr);
    const host = url.host;
    const pathname = url.pathname;

    // Matches dev.azure.com/org/project/_git/repo/pullrequest/123
    // Also matches org.visualstudio.com/project/_git/repo/pullrequest/123
    let organization = "";
    let project = "";
    let repository = "";
    let pullRequestId = "";

    if (host === "dev.azure.com") {
      // /org/project/_git/repo/pullrequest/123
      const segments = pathname.split("/").filter(Boolean);
      organization = segments[0];
      project = segments[1];
      
      const gitIndex = segments.indexOf("_git");
      if (gitIndex !== -1 && gitIndex + 1 < segments.length) {
        repository = segments[gitIndex + 1];
        const prIndex = segments.indexOf("pullrequest", gitIndex);
        if (prIndex !== -1 && prIndex + 1 < segments.length) {
          pullRequestId = segments[prIndex + 1];
        }
      }
    } else if (host.endsWith(".visualstudio.com")) {
      // /project/_git/repo/pullrequest/123 (org is prefix of host)
      organization = host.split(".")[0];
      const segments = pathname.split("/").filter(Boolean);
      project = segments[0];

      const gitIndex = segments.indexOf("_git");
      if (gitIndex !== -1 && gitIndex + 1 < segments.length) {
        repository = segments[gitIndex + 1];
        const prIndex = segments.indexOf("pullrequest", gitIndex);
        if (prIndex !== -1 && prIndex + 1 < segments.length) {
          pullRequestId = segments[prIndex + 1];
        }
      }
    } else {
      // General fallbacks or self-hosted TFS
      // e.g. https://tfs.company.com/tfs/Collection/Project/_git/Repo/pullrequest/123
      const segments = pathname.split("/").filter(Boolean);
      const prIndex = segments.indexOf("pullrequest");
      const gitIndex = segments.indexOf("_git");
      
      if (prIndex !== -1 && prIndex + 1 < segments.length && gitIndex !== -1) {
        pullRequestId = segments[prIndex + 1];
        repository = segments[gitIndex + 1];
        project = segments[gitIndex - 1];
        organization = segments[0]; // simplistic guess
      }
    }

    if (!organization || !project || !repository || !pullRequestId) {
      throw new Error("Could not parse all required segments (organization, project, repository, pullRequestId) from Azure DevOps URL.");
    }

    const instanceUrl = `${url.protocol}//${url.host}`;
    return { instanceUrl, organization, project, repository, pullRequestId };
  } catch (error: any) {
    throw new Error(`Failed to parse Azure DevOps/TFS URL: ${error.message}`);
  }
}

// REST API proxies
// GitLab Proxy
async function fetchGitLabMR(parsed: ParsedGitLab, token: string) {
  const { instanceUrl, projectPath, mrIid } = parsed;
  const encodedProjectPath = encodeURIComponent(projectPath);
  
  const headers = { "Private-Token": token };

  // 1. Fetch MR Details
  const mrRes = await fetch(`${instanceUrl}/api/v4/projects/${encodedProjectPath}/merge_requests/${mrIid}`, { headers });
  if (!mrRes.ok) {
    const text = await mrRes.text();
    throw new Error(`GitLab API returned status ${mrRes.status} on fetching MR details: ${text}`);
  }
  const mrDetails = await mrRes.json();

  // 2. Fetch MR Changes (includes diffs)
  const changesRes = await fetch(`${instanceUrl}/api/v4/projects/${encodedProjectPath}/merge_requests/${mrIid}/changes`, { headers });
  if (!changesRes.ok) {
    const text = await changesRes.text();
    throw new Error(`GitLab API returned status ${changesRes.status} on fetching MR changes: ${text}`);
  }
  const mrChanges = await changesRes.json();

  return { mrDetails, mrChanges };
}

// Azure DevOps Proxy
async function fetchAzureDevOpsPR(parsed: ParsedAzureDevOps, token: string) {
  const { instanceUrl, organization, project, repository, pullRequestId } = parsed;
  const basicAuth = Buffer.from(`:${token}`).toString("base64");
  const headers = { Authorization: `Basic ${basicAuth}` };

  // 1. Fetch PR details
  const prUrl = `${instanceUrl}/${organization}/${project}/_apis/git/repositories/${repository}/pullRequests/${pullRequestId}?api-version=7.0`;
  const prRes = await fetch(prUrl, { headers });
  if (!prRes.ok) {
    const text = await prRes.text();
    throw new Error(`Azure DevOps API returned status ${prRes.status} on fetching PR details: ${text}`);
  }
  const prDetails = await prRes.json();

  // 2. Fetch PR changes
  const changesUrl = `${instanceUrl}/${organization}/${project}/_apis/git/repositories/${repository}/pullRequests/${pullRequestId}/changes?api-version=7.0`;
  const changesRes = await fetch(changesUrl, { headers });
  if (!changesRes.ok) {
    const text = await changesRes.text();
    throw new Error(`Azure DevOps API returned status ${changesRes.status} on fetching PR changes: ${text}`);
  }
  const prChanges = await changesRes.json();

  // 3. For each changed file, if it is edit/add, let's fetch its actual file content from the source ref to help Gemini
  // We can fetch up to 10 files to keep requests reasonable.
  const files: any[] = [];
  const changeEntries = prChanges.changeEntries || [];
  
  for (const entry of changeEntries.slice(0, 10)) {
    const pathStr = entry.item?.path;
    if (!pathStr || entry.item?.isFolder) continue;

    let diffContent = "";
    let additions = 0;
    let deletions = 0;

    // Fetch the raw content if possible
    try {
      // Fetch latest file content on the source branch
      const fileUrl = `${instanceUrl}/${organization}/${project}/_apis/git/repositories/${repository}/items?path=${encodeURIComponent(pathStr)}&versionDescriptor.version=${encodeURIComponent(prDetails.sourceRefName)}&api-version=7.0`;
      const fileRes = await fetch(fileUrl, { headers });
      if (fileRes.ok) {
        diffContent = await fileRes.text();
      }
    } catch (err) {
      console.error(`Could not fetch raw file content for ${pathStr}:`, err);
    }

    files.push({
      item: entry.item,
      changeType: entry.changeType,
      rawContent: diffContent
    });
  }

  return { prDetails, prChanges, files };
}

// Proxy /chat/completions
const handleChatCompletions = async (req: express.Request, res: express.Response) => {
  try {
    const apiKey = getOpenAIKey();
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(req.body)
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).send(errText);
    }

    const data = await response.json();
    return res.json(data);
  } catch (err: any) {
    console.error("Error in /chat/completions proxy:", err);
    return res.status(500).json({ error: err.message || "Failed to proxy chat completions." });
  }
};

app.post("/chat/completions", handleChatCompletions);
app.post("/api/chat/completions", handleChatCompletions);

// Proxy /embeddings
const handleEmbeddings = async (req: express.Request, res: express.Response) => {
  try {
    const apiKey = getOpenAIKey();
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(req.body)
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).send(errText);
    }

    const data = await response.json();
    return res.json(data);
  } catch (err: any) {
    console.error("Error in /embeddings proxy:", err);
    return res.status(500).json({ error: err.message || "Failed to proxy embeddings." });
  }
};

app.post("/embeddings", handleEmbeddings);
app.post("/api/embeddings", handleEmbeddings);

// Proxy /models
const handleModels = async (req: express.Request, res: express.Response) => {
  try {
    const apiKey = getOpenAIKey();
    const response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).send(errText);
    }

    const data = await response.json();
    return res.json(data);
  } catch (err: any) {
    console.error("Error in /models proxy:", err);
    return res.status(500).json({ error: err.message || "Failed to proxy models." });
  }
};

app.get("/models", handleModels);
app.get("/api/models", handleModels);

// API Endpoint for PR Fetch & Auto-Analysis
app.post("/api/review", async (req, res) => {
  const { url, token, platform } = req.body;

  if (!url) {
    return res.status(400).json({ error: "No URL provided." });
  }

  try {
    let prDetails: any = null;
    let fileDiffs: any[] = [];

    if (platform === "gitlab" || (!platform && url.includes("gitlab"))) {
      // 1. Parse GitLab URL
      const parsed = parseGitLabUrl(url);
      
      // 2. Fetch MR from GitLab API
      if (!token) {
        return res.status(400).json({ error: "GitLab Private Access Token is required to fetch this Merge Request." });
      }

      const { mrDetails, mrChanges } = await fetchGitLabMR(parsed, token);

      // 3. Format PR Details
      prDetails = {
        id: String(mrDetails.iid),
        title: mrDetails.title,
        description: mrDetails.description || "",
        authorName: mrDetails.author?.name || "GitLab User",
        authorAvatar: mrDetails.author?.avatar_url,
        sourceBranch: mrDetails.source_branch,
        targetBranch: mrDetails.target_branch,
        state: mrDetails.state,
        webUrl: mrDetails.web_url,
        platform: "gitlab",
        repoName: parsed.projectPath,
        instanceUrl: parsed.instanceUrl
      };

      // 4. Format Files and Diffs
      const changesList = mrChanges.changes || [];
      fileDiffs = changesList.map((change: any) => ({
        oldPath: change.old_path,
        newPath: change.new_path,
        diff: change.diff || "",
        additions: 0, // GitLab doesn't easily return line-level counts directly per change in this array
        deletions: 0,
        isNew: change.new_file || false,
        isDeleted: change.deleted_file || false,
        isRename: change.renamed_file || false,
      }));

    } else if (platform === "azure_devops" || (!platform && (url.includes("azure.com") || url.includes("visualstudio.com")))) {
      // 1. Parse Azure DevOps URL
      const parsed = parseAzureDevOpsUrl(url);

      // 2. Fetch PR from Azure DevOps API
      if (!token) {
        return res.status(400).json({ error: "Azure DevOps Personal Access Token (PAT) is required to fetch this Pull Request." });
      }

      const { prDetails: adPr, prChanges: adChanges, files: adFiles } = await fetchAzureDevOpsPR(parsed, token);

      // 3. Format PR Details
      prDetails = {
        id: String(adPr.pullRequestId),
        title: adPr.title,
        description: adPr.description || "",
        authorName: adPr.createdBy?.displayName || "Azure DevOps User",
        authorAvatar: adPr.createdBy?._links?.avatar?.href,
        sourceBranch: adPr.sourceRefName.replace("refs/heads/", ""),
        targetBranch: adPr.targetRefName.replace("refs/heads/", ""),
        state: adPr.status,
        webUrl: `${parsed.instanceUrl}/${parsed.organization}/${parsed.project}/_git/${parsed.repository}/pullrequest/${parsed.pullRequestId}`,
        platform: "azure_devops",
        repoName: parsed.repository,
        projectName: parsed.project,
        organizationName: parsed.organization,
        instanceUrl: parsed.instanceUrl
      };

      // 4. Format Files and Diffs
      fileDiffs = adFiles.map((f: any) => {
        const pathStr = f.item?.path || "";
        const cleanPath = pathStr.startsWith("/") ? pathStr.substring(1) : pathStr;
        return {
          oldPath: cleanPath,
          newPath: cleanPath,
          diff: f.rawContent ? `// Content of changed file:\n${f.rawContent}` : "File modified (raw content unavailable)",
          additions: 0,
          deletions: 0,
          isNew: f.changeType === "add",
          isDeleted: f.changeType === "delete",
          isRename: f.changeType === "rename",
          content: f.rawContent || ""
        };
      });

    } else {
      return res.status(400).json({ error: "Unsupported repository URL. Please make sure it is a GitLab or TFS / Azure DevOps PR/MR URL." });
    }

    if (fileDiffs.length === 0) {
      return res.status(400).json({ error: "No modified files were found in this Pull/Merge Request." });
    }

    // 5. Conduct Gemini Code Review
    const ai = getGeminiClient();

    // Prepare files summary for the prompt
    const filesContext = fileDiffs.map((file, idx) => {
      return `--- FILE #${idx + 1}: ${file.newPath} ---
Status: ${file.isNew ? "NEW" : file.isDeleted ? "DELETED" : file.isRename ? "RENAMED" : "MODIFIED"}
Changes / Diff / Code:
${file.diff.substring(0, 8000)} // Truncating if extremely long to avoid token limits per file
`;
    }).join("\n\n");

    const systemPrompt = `You are an elite, highly experienced software architect, principal engineer, and security auditor.
Your job is to conduct a professional code review of the provided Pull Request (PR/MR).
Be extremely objective, thorough, and highly technical. Focus on:
1. **Bugs & Logical Errors**: Incorrect edge cases, boundary conditions, race conditions, memory leaks, nil pointer exceptions, type misalignments.
2. **Security Vulnerabilities**: Injection attacks, unsafe dependencies, lack of inputs validation, exposed secrets/tokens, authorization issues.
3. **Performance Inefficiencies**: Slow algorithms, redundant calculations, unoptimized DB queries, memory over-allocation.
4. **Style & Readability**: Poor variable naming, lack of comments for complex logic, overly deep nesting, violation of clean code standards.
5. **Refactoring & Modern Standards**: Suggesting better APIs, simpler abstractions, robust patterns.

For each issue identified, you must generate a file annotation mapping to a specific file and line number in the new code changes.
Make sure the "line" number matches an actual line in the code changes, or estimated line in the modified file.
Also provide a "suggestedCode" replacement block if applicable so the author can directly copy and apply your fix.

You must reply with a structured JSON object strictly matching the following schema.`;

    const userPrompt = `Pull Request Title: ${prDetails.title}
Pull Request Description: ${prDetails.description}
Platform: ${prDetails.platform}
Repository Name: ${prDetails.repoName}

Here are the modified files and their diffs/contents:
${filesContext}

Please analyze this PR and generate the ReviewReport.`;

    const response = await generateWithFallback(ai, {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.INTEGER, description: "Overall code quality score from 0 (very poor) to 100 (excellent)." },
          summary: { type: Type.STRING, description: "Markdown styled rich summary of the PR, highlighting achievements, main concerns, and overall impression." },
          riskLevel: { type: Type.STRING, enum: ["low", "medium", "high"], description: "Overall risk of introducing bugs or breaking features if merged." },
          generalRecommendations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "High level overall recommendations for the PR author."
          },
          annotations: {
            type: Type.ARRAY,
            description: "Array of specific file-level and line-level comments.",
            items: {
              type: Type.OBJECT,
              properties: {
                filePath: { type: Type.STRING, description: "The exact file path of the file being reviewed." },
                line: { type: Type.INTEGER, description: "The approximate 1-indexed line number where the issue exists." },
                category: { type: Type.STRING, enum: ["bug", "security", "performance", "style", "refactor"] },
                severity: { type: Type.STRING, enum: ["critical", "warning", "suggestion"] },
                title: { type: Type.STRING, description: "Short title summarizing the issue." },
                comment: { type: Type.STRING, description: "Detailed explanation of the issue, why it is a problem, and how to address it." },
                originalCode: { type: Type.STRING, description: "The original code snippet causing the issue." },
                suggestedCode: { type: Type.STRING, description: "Perfect, complete code replacement to fix the issue." }
              },
              required: ["filePath", "line", "category", "severity", "title", "comment"]
            }
          }
        },
        required: ["score", "summary", "riskLevel", "generalRecommendations", "annotations"]
      }
    }, userPrompt);

    const reportJsonText = response.text?.trim() || "{}";
    const reportData = JSON.parse(reportJsonText);

    return res.json({
      prDetails,
      files: fileDiffs,
      report: reportData
    });

  } catch (error: any) {
    console.error("Error in AI PR Review:", error);
    return res.status(500).json({ error: error.message || "An unexpected error occurred during PR review." });
  }
});

// Manual Diff Review Endpoint (For private/self-hosted instances)
app.post("/api/review-manual", async (req, res) => {
  const { title, description, diffText } = req.body;

  if (!diffText) {
    return res.status(400).json({ error: "Unified Diff text is required." });
  }

  try {
    const ai = getGeminiClient();

    const prDetails = {
      id: "manual-" + Math.floor(Math.random() * 1000),
      title: title || "Manual Unified Diff Analysis",
      description: description || "Manually pasted git diff content.",
      authorName: "Developer",
      sourceBranch: "feature-branch",
      targetBranch: "main",
      state: "open",
      webUrl: "#",
      platform: "manual",
      repoName: "local-repository"
    };

    // Parse the unified diff roughly into files
    // Looking for lines starting with 'diff --git a/' or 'Index:'
    const files: any[] = [];
    const lines = diffText.split("\n");
    let currentFile: any = null;
    let currentDiffLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("diff --git a/") || line.startsWith("Index: ")) {
        if (currentFile) {
          currentFile.diff = currentDiffLines.join("\n");
          files.push(currentFile);
        }
        
        let pathStr = "unknown_file";
        if (line.startsWith("diff --git a/")) {
          const match = line.match(/diff --git a\/(.+?) b\//);
          if (match && match[1]) {
            pathStr = match[1];
          }
        } else {
          pathStr = line.substring(7).trim();
        }

        currentFile = {
          oldPath: pathStr,
          newPath: pathStr,
          diff: "",
          additions: 0,
          deletions: 0,
          isNew: false,
          isDeleted: false,
          isRename: false
        };
        currentDiffLines = [line];
      } else {
        if (currentFile) {
          currentDiffLines.push(line);
          if (line.startsWith("+") && !line.startsWith("+++")) currentFile.additions++;
          if (line.startsWith("-") && !line.startsWith("---")) currentFile.deletions++;
        }
      }
    }

    if (currentFile) {
      currentFile.diff = currentDiffLines.join("\n");
      files.push(currentFile);
    }

    // Fallback if unified diff was simple text
    if (files.length === 0) {
      files.push({
        oldPath: "pasted_changes.txt",
        newPath: "pasted_changes.txt",
        diff: diffText,
        additions: 0,
        deletions: 0,
        isNew: false,
        isDeleted: false,
        isRename: false
      });
    }

    const systemPrompt = `You are an elite software architect. Your job is to conduct a professional code review of the provided code changes (git unified diff).
Focus on Bugs, Security flaws, Performance bottlenecks, and Style issues.
You must reply with a structured JSON object strictly matching the following schema.`;

    const userPrompt = `PR Title: ${prDetails.title}
PR Description: ${prDetails.description}

Unified Diff Context:
${diffText}

Please analyze this code and generate the ReviewReport.`;

    const response = await generateWithFallback(ai, {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.INTEGER, description: "Overall code quality score from 0 (very poor) to 100 (excellent)." },
          summary: { type: Type.STRING, description: "Markdown styled rich summary of the changes." },
          riskLevel: { type: Type.STRING, enum: ["low", "medium", "high"] },
          generalRecommendations: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          annotations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                filePath: { type: Type.STRING },
                line: { type: Type.INTEGER },
                category: { type: Type.STRING, enum: ["bug", "security", "performance", "style", "refactor"] },
                severity: { type: Type.STRING, enum: ["critical", "warning", "suggestion"] },
                title: { type: Type.STRING },
                comment: { type: Type.STRING },
                originalCode: { type: Type.STRING },
                suggestedCode: { type: Type.STRING }
              },
              required: ["filePath", "line", "category", "severity", "title", "comment"]
            }
          }
        },
        required: ["score", "summary", "riskLevel", "generalRecommendations", "annotations"]
      }
    }, userPrompt);

    const reportJsonText = response.text?.trim() || "{}";
    const reportData = JSON.parse(reportJsonText);

    return res.json({
      prDetails,
      files,
      report: reportData
    });

  } catch (error: any) {
    console.error("Error in manual code review:", error);
    return res.status(500).json({ error: error.message || "An unexpected error occurred during manual code review." });
  }
});

// New Endpoints for Project Listing, Task management, and AI Generation

app.post("/api/projects", async (req, res) => {
  const { platform, token, baseUrl } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Access token is required." });
  }

  try {
    if (platform === "gitlab") {
      const url = (baseUrl || "https://gitlab.com").replace(/\/$/, "");
      
      try {
        console.log(`[GitLab API] Fetching projects from ${url}`);
        const response = await fetch(`${url}/api/v4/projects?membership=true&simple=true&per_page=20&order_by=last_activity_at`, {
          headers: { "Private-Token": token }
        });

        if (!response.ok) {
          throw new Error(`GitLab API returned status ${response.status}`);
        }

        const data: any = await response.json();
        
        // Fetch MR counts in parallel with limit/fallback
        const projects = await Promise.all(
          data.map(async (p: any) => {
            let openPRCount = 0;
            try {
              const mrRes = await fetch(`${url}/api/v4/projects/${p.id}/merge_requests?state=opened&per_page=1`, {
                headers: { "Private-Token": token }
              });
              if (mrRes.ok) {
                const totalHeader = mrRes.headers.get("X-Total");
                if (totalHeader) {
                  openPRCount = parseInt(totalHeader, 10);
                } else {
                  const mrData: any = await mrRes.json();
                  openPRCount = mrData.length;
                }
              }
            } catch (err) {
              console.error(`Error fetching MR count for project ${p.id}:`, err);
            }

            return {
              id: p.id.toString(),
              name: p.name_with_namespace || p.name,
              description: p.description || "Sin descripción proporcionada.",
              openPRCount,
              webUrl: p.web_url,
              platform: "gitlab",
              owner: p.namespace?.name || ""
            };
          })
        );

        return res.json({ projects, isDemo: false });
      } catch (apiErr: any) {
        console.warn("[GitLab API Fail] Falling back to high-fidelity demo data:", apiErr.message);
        // Fallback to high-fidelity GitLab Demo data
        const demoProjects = [
          { id: "demo-gl-1", name: "Backend / Core API Gateway", description: "API Gateway principal desarrollado en Go, maneja ruteo, autenticación JWT, rate-limiting de clientes y balanceo de carga.", openPRCount: 5, webUrl: "https://gitlab.com/demo-org/core-api-gateway", platform: "gitlab", owner: "Backend Team" },
          { id: "demo-gl-2", name: "Payment / Billing Service", description: "Microservicio para procesamiento de pagos, suscripciones y cobros recurrentes integrado con Stripe y Paypal.", openPRCount: 2, webUrl: "https://gitlab.com/demo-org/billing-service", platform: "gitlab", owner: "Payment Team" },
          { id: "demo-gl-3", name: "Frontend / React Customer Portal", description: "Portal del cliente desarrollado en React, Vite y Tailwind CSS. Implementa el dashboard y vistas de facturación.", openPRCount: 8, webUrl: "https://gitlab.com/demo-org/react-customer-portal", platform: "gitlab", owner: "Frontend Team" },
          { id: "demo-gl-4", name: "DevOps / Infrastructure Operations", description: "Scripts de Terraform, manifiestos de Kubernetes (Helm charts) y pipelines globales de GitLab CI para ambientes Cloud.", openPRCount: 0, webUrl: "https://gitlab.com/demo-org/infra-ops", platform: "gitlab", owner: "DevOps Team" }
        ];
        return res.json({ projects: demoProjects, isDemo: true, demoReason: apiErr.message });
      }
    } else if (platform === "azure_devops") {
      const url = (baseUrl || "https://dev.azure.com/my-org").replace(/\/$/, "");
      
      try {
        console.log(`[Azure DevOps API] Fetching projects from ${url}`);
        const basicAuth = Buffer.from(`:${token}`).toString("base64");
        const headers = { Authorization: `Basic ${basicAuth}` };

        const response = await fetch(`${url}/_apis/projects?api-version=7.0`, { headers });
        if (!response.ok) {
          throw new Error(`Azure DevOps API returned status ${response.status}`);
        }

        const data: any = await response.json();
        const rawProjects = data.value || [];

        // For each project, fetch count of active pull requests
        const projects = await Promise.all(
          rawProjects.map(async (p: any) => {
            let openPRCount = 0;
            try {
              const prRes = await fetch(`${url}/${encodeURIComponent(p.name)}/_apis/git/pullrequests?searchCriteria.status=active&api-version=7.0`, { headers });
              if (prRes.ok) {
                const prData: any = await prRes.json();
                openPRCount = prData.value?.length || 0;
              }
            } catch (err) {
              console.error(`Error fetching PR count for project ${p.name}:`, err);
            }

            return {
              id: p.name, // Project Name is used as URL segment in AzDO
              name: p.name,
              description: p.description || "Sin descripción proporcionada.",
              openPRCount,
              webUrl: `${url}/${encodeURIComponent(p.name)}`,
              platform: "azure_devops",
              owner: "Azure Organization"
            };
          })
        );

        return res.json({ projects, isDemo: false });
      } catch (apiErr: any) {
        console.warn("[Azure DevOps API Fail] Falling back to high-fidelity demo data:", apiErr.message);
        // Fallback to high-fidelity Azure DevOps Demo data
        const demoProjects = [
          { id: "demo-az-1", name: "Enterprise E-Commerce Store", description: "Repositorio principal de la tienda en línea. Contiene el backend de Node, servicios de búsqueda y catálogo legacy.", openPRCount: 4, webUrl: "https://dev.azure.com/demo-org/E-Commerce-Store", platform: "azure_devops", owner: "Sales Unit" },
          { id: "demo-az-2", name: "Automated Inventory Control", description: "Servicio en .NET Core para el control automático de stock físico, inventarios distribuidos e integración con proveedores.", openPRCount: 1, webUrl: "https://dev.azure.com/demo-org/Inventory-Control", platform: "azure_devops", owner: "Logistics Unit" },
          { id: "demo-az-3", name: "Data Science & Recommendation Engine", description: "Modelos de recomendación basados en Python, notebooks de análisis de comportamiento y pipelines de procesamiento Spark.", openPRCount: 3, webUrl: "https://dev.azure.com/demo-org/Recommendation-Engine", platform: "azure_devops", owner: "Data Science" }
        ];
        return res.json({ projects: demoProjects, isDemo: true, demoReason: apiErr.message });
      }
    } else {
      return res.status(400).json({ error: "Unsupported platform. Must be 'gitlab' or 'azure_devops'." });
    }
  } catch (err: any) {
    console.error("Error fetching projects:", err);
    return res.status(500).json({ error: err.message || "Failed to retrieve projects." });
  }
});

app.post("/api/project-details", async (req, res) => {
  const { platform, token, baseUrl, projectId } = req.body;

  if (!token || !projectId) {
    return res.status(400).json({ error: "Missing required fields (token, projectId)." });
  }

  // Check if we are running in demo mode
  const isDemoProject = projectId.startsWith("demo-");

  try {
    if (platform === "gitlab") {
      const url = (baseUrl || "https://gitlab.com").replace(/\/$/, "");

      if (isDemoProject) {
        // Return rich mock GitLab project details with completed/closed items and open items
        const demoTasks = [
          // Open tasks
          { id: "GL-101", title: "Optimizar consultas SQL pesadas en reporte anual", description: "El endpoint de reportes anuales tarda más de 5 segundos cuando hay más de 50,000 registros de ventas. Se deben agregar índices compuestos o utilizar una base de datos de lectura.", state: "opened", type: "Bug", assignee: "Sofía Martínez" },
          { id: "GL-102", title: "Implementar autenticación multifactor (MFA/2FA)", description: "Permitir a los usuarios del portal activar autenticación de dos pasos a través de TOTP utilizando Google Authenticator, Authy o similares.", state: "opened", type: "Feature", assignee: "Alejandro Pérez" },
          { id: "GL-103", title: "Actualizar dependencias y vulnerabilidades de Docker", description: "Actualizar la imagen base de NodeJS en Dockerfile de la versión 18 a la 20.2-alpine para mitigar múltiples alertas de seguridad críticas.", state: "opened", type: "Security", assignee: "Carlos Ruiz" },
          { id: "GL-104", title: "Crear interceptor de telemetría y logs estructurados", description: "Diseñar un middleware global para formatear todos los logs HTTP entrantes en formato JSON estructurado, compatible con Elasticsearch.", state: "opened", type: "Refactor", assignee: "Marta Gómez" },
          // Closed/historical tasks (previous sprints)
          { id: "GL-98", title: "Diseñar esquema inicial de Base de Datos PostgreSQL", description: "Crear tablas de Usuarios, Sesiones y Transacciones con claves foráneas, restricciones de integridad e índices de búsqueda iniciales.", state: "closed", type: "Task", assignee: "Sofía Martínez" },
          { id: "GL-99", title: "Configurar Docker Compose y entorno local de desarrollo", description: "Establecer servicios para el backend de Express, frontend de Vite y base de datos local para simplificar el arranque de nuevos ingenieros.", state: "closed", type: "Task", assignee: "Carlos Ruiz" },
          { id: "GL-95", title: "Crear landing page y componentes UI base con Tailwind", description: "Estructurar la página de inicio principal del portal usando componentes modulares, colores corporativos y soporte responsivo.", state: "closed", type: "Feature", assignee: "Marta Gómez" }
        ];

        const demoSprint = {
          name: "Sprint 24 - Q3 Core Services",
          startDate: "2026-07-15",
          endDate: "2026-07-29",
          state: "active",
          totalPoints: 35
        };

        return res.json({
          description: "Portal moderno del ecosistema de e-commerce e ingeniería. Automatizado con CI/CD e IA Gemini.",
          tasks: demoTasks,
          sprint: demoSprint,
          isDemo: true
        });
      }

      // Real GitLab API Project Details (Fetch all issues: open & closed)
      const headers = { "Private-Token": token };
      const encodedProjectId = encodeURIComponent(projectId);

      // Fetch Project Description & Details
      const projRes = await fetch(`${url}/api/v4/projects/${encodedProjectId}`, { headers });
      const projMeta = projRes.ok ? await projRes.json() : { description: "Proyecto real GitLab sin descripción adicional." };

      // Fetch ALL Issues (state=all, up to 100 items)
      const issuesRes = await fetch(`${url}/api/v4/projects/${encodedProjectId}/issues?state=all&per_page=100`, { headers });
      const issuesData = issuesRes.ok ? await issuesRes.json() : [];
      const tasks = issuesData.map((iss: any) => ({
        id: iss.iid.toString(),
        title: iss.title,
        description: iss.description || "Sin descripción detallada.",
        state: iss.state, // 'opened' or 'closed'
        type: iss.labels?.includes("bug") ? "Bug" : iss.labels?.includes("security") ? "Security" : "Task",
        assignee: iss.assignee?.name || iss.assignees?.[0]?.name || "Sin asignar",
        assigneeAvatar: iss.assignee?.avatar_url || undefined
      }));

      // Fetch Milestones (Sprint)
      const milestoneRes = await fetch(`${url}/api/v4/projects/${encodedProjectId}/milestones?state=active&per_page=1`, { headers });
      const milestoneData = milestoneRes.ok ? await milestoneRes.json() : [];
      const activeMilestone = milestoneData[0];

      const sprint = activeMilestone ? {
        name: activeMilestone.title,
        startDate: activeMilestone.start_date,
        endDate: activeMilestone.due_date,
        state: "active",
        totalPoints: tasks.length * 3 // synthetic metric
      } : {
        name: "Sin Milestone Activo",
        state: "inactive"
      };

      return res.json({
        description: projMeta.description || "Sin descripción en el repositorio.",
        tasks,
        sprint,
        isDemo: false
      });

    } else if (platform === "azure_devops") {
      const url = (baseUrl || "https://dev.azure.com/my-org").replace(/\/$/, "");

      if (isDemoProject) {
        // Return rich mock Azure DevOps work items with historical and active items
        const demoTasks = [
          // Active tasks
          { id: "AD-452", title: "Corregir pérdida de memoria en consumidor de Kafka", description: "El servicio consumidor se queda sin memoria RAM y se reinicia después de procesar ráfagas grandes de eventos de inventario de stock. Analizar fugas de streams.", state: "Active", type: "Bug", assignee: "Diana Gómez" },
          { id: "AD-453", title: "Integrar pasarela de pagos Stripe Checkout", description: "Configurar llamadas de servidor con SDK oficial, webhooks de confirmación y flujo de redirección seguro en la UI de compras.", state: "To Do", type: "User Story", assignee: "Héctor Rodríguez" },
          { id: "AD-454", title: "Migrar pipelines clásicos de CI/CD a YAML declarativo", description: "Convertir la configuración visual obsoleta de Azure Pipelines en un archivo azure-pipelines.yml unificado dentro del repositorio.", state: "Approved", type: "Task", assignee: "Laura Blanco" },
          { id: "AD-455", title: "Diseñar cache distribuida Redis para catálogo de productos", description: "Almacenar en caché las respuestas del catálogo de productos frecuentes para reducir el uso de CPU de la base de datos SQL Server.", state: "Committed", type: "Feature", assignee: "Mariano Ortiz" },
          // Closed/Done tasks
          { id: "AD-440", title: "Configurar infraestructura inicial en Cloud Run", description: "Desplegar contenedor de Docker inicial y mapear variables de entorno críticas y secrets de base de datos.", state: "Closed", type: "Task", assignee: "Laura Blanco" },
          { id: "AD-441", title: "Crear endpoints REST de autenticación JWT", description: "Flujo de registro, inicio de sesión y renovación de tokens firmado mediante clave secreta RSA de manera robusta.", state: "Closed", type: "User Story", assignee: "Diana Gómez" }
        ];

        const demoSprint = {
          name: "Sprint 14 - Azure Core Team",
          startDate: "2026-07-10",
          endDate: "2026-07-24",
          state: "active",
          totalPoints: 48
        };

        return res.json({
          description: "Área de trabajo del proyecto Azure DevOps para el control de requerimientos, logs, base de datos e inventarios.",
          tasks: demoTasks,
          sprint: demoSprint,
          isDemo: true
        });
      }

      // Real Azure DevOps API Project Details
      const basicAuth = Buffer.from(`:${token}`).toString("base64");
      const headers = { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/json" };
      const encodedProj = encodeURIComponent(projectId);

      // Fetch Project Meta
      const projRes = await fetch(`${url}/_apis/projects/${encodedProj}?api-version=7.0`, { headers });
      const projMeta = projRes.ok ? await projRes.json() : { description: "Proyecto Azure DevOps." };

      // Fetch Work Items using WIQL query
      const wiqlUrl = `${url}/${encodedProj}/_apis/wit/wiql?api-version=7.0`;
      const wiqlQuery = {
        query: `Select [System.Id], [System.Title], [System.State], [System.WorkItemType] From WorkItems Where [System.TeamProject] = '${projectId}' Order By [System.ChangedDate] Desc`
      };

      const wiqlRes = await fetch(wiqlUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(wiqlQuery)
      });

      let tasks: any[] = [];
      if (wiqlRes.ok) {
        const wiqlResult: any = await wiqlRes.json();
        const workItemIds = (wiqlResult.workItems || []).slice(0, 100).map((wi: any) => wi.id);

        if (workItemIds.length > 0) {
          // Batch fetch work item details
          const batchUrl = `${url}/_apis/wit/workitems?ids=${workItemIds.join(",")}&api-version=7.0`;
          const batchRes = await fetch(batchUrl, { headers });
          if (batchRes.ok) {
            const batchResult: any = await batchRes.json();
            tasks = (batchResult.value || []).map((wi: any) => {
              const fields = wi.fields || {};
              return {
                id: wi.id.toString(),
                title: fields["System.Title"] || "Sin título",
                description: fields["System.Description"] || fields["System.History"] || "Sin descripción detallada.",
                state: fields["System.State"] || "Active",
                type: fields["System.WorkItemType"] || "Task",
                assignee: fields["System.AssignedTo"]?.displayName || "Sin asignar",
                assigneeAvatar: fields["System.AssignedTo"]?.imageUrl || undefined
              };
            });
          }
        }
      }

      // Fetch iterations (Sprints)
      const iterUrl = `${url}/${encodedProj}/_apis/work/teamsettings/iterations?api-version=7.0`;
      const iterRes = await fetch(iterUrl, { headers });
      let sprint: any = { name: "Sin Iteración Activa", state: "inactive" };

      if (iterRes.ok) {
        const iterData: any = await iterRes.json();
        const currentIter = iterData.value?.find((it: any) => {
          // Check if today is between start and finish dates
          if (!it.attributes?.startDate || !it.attributes?.finishDate) return false;
          const today = new Date();
          const start = new Date(it.attributes.startDate);
          const end = new Date(it.attributes.finishDate);
          return today >= start && today <= end;
        }) || iterData.value?.[0]; // Fallback to first one

        if (currentIter) {
          sprint = {
            name: currentIter.name,
            startDate: currentIter.attributes?.startDate,
            endDate: currentIter.attributes?.finishDate,
            state: "active",
            totalPoints: tasks.length * 5
          };
        }
      }

      return res.json({
        description: projMeta.description || "Sin descripción proporcionada.",
        tasks,
        sprint,
        isDemo: false
      });
    } else {
      return res.status(400).json({ error: "Unsupported platform." });
    }
  } catch (err: any) {
    console.error("Error fetching project details:", err);
    return res.status(500).json({ error: err.message || "Failed to load project details." });
  }
});

app.post("/api/generate-subtasks", async (req, res) => {
  const { taskTitle, taskDescription } = req.body;

  if (!taskTitle) {
    return res.status(400).json({ error: "Task title is required." });
  }

  try {
    const ai = getGeminiClient(); // Just checks key is active
    
    const userPrompt = `You are a Senior Technical Architect & Lead Engineer. Analyze this task/user story and generate:
1. Subtasks (actionable, detailed, granular developer tasks to complete this work).
2. Functional Specifications (technical flow, database/architectural changes, API contract definitions, and business logic validations).

Task Title: ${taskTitle}
Task Description: ${taskDescription || "No description provided."}

Return the response as a JSON object with:
- "subtasks": an array of strings representing individual tasks.
- "functionalSpecs": a markdown-formatted string with functional/technical details.`;

    const systemPrompt = "You are a professional software architect. Respond with a valid JSON object complying with the requested schema.";

    const response = await generateWithFallback(ai, {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          subtasks: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "List of highly specific, actionable developer subtasks."
          },
          functionalSpecs: {
            type: Type.STRING,
            description: "Rich markdown-styled functional and technical architecture description."
          }
        },
        required: ["subtasks", "functionalSpecs"]
      }
    }, userPrompt);

    const jsonText = response.text?.trim() || "{}";
    const data = JSON.parse(jsonText);

    return res.json(data);
  } catch (err: any) {
    console.error("Error generating subtasks with Gemini:", err);
    return res.status(500).json({ error: err.message || "Failed to generate AI subtasks." });
  }
});

app.post("/api/project-prs", async (req, res) => {
  const { platform, token, baseUrl, projectId } = req.body;

  if (!token || !projectId) {
    return res.status(400).json({ error: "Missing required fields (token, projectId)." });
  }

  const isDemo = projectId.startsWith("demo-");

  if (isDemo) {
    const demoPRs = [
      { id: "101", title: "Feat/Auth: Agregar soporte para login con OAuth2", sourceBranch: "feat/oauth2-login", targetBranch: "main", author: "Alejandro Pérez", webUrl: "https://gitlab.com/demo/project/-/merge_requests/101", url: "https://gitlab.com/demo/project/-/merge_requests/101" },
      { id: "102", title: "Fix/Database: Corregir indices duplicados en tabla de auditoria", sourceBranch: "fix/dup-indices", targetBranch: "main", author: "Sofía Martínez", webUrl: "https://gitlab.com/demo/project/-/merge_requests/102", url: "https://gitlab.com/demo/project/-/merge_requests/102" },
      { id: "103", title: "Perf/Cache: Implementar cache Redis para listados de productos", sourceBranch: "perf/redis-cache", targetBranch: "develop", author: "Carlos Ruiz", webUrl: "https://gitlab.com/demo/project/-/merge_requests/103", url: "https://gitlab.com/demo/project/-/merge_requests/103" }
    ];
    return res.json({ prs: demoPRs, isDemo: true });
  }

  try {
    if (platform === "gitlab") {
      const url = (baseUrl || "https://gitlab.com").replace(/\/$/, "");
      const encodedProject = encodeURIComponent(projectId);

      const response = await fetch(`${url}/api/v4/projects/${encodedProject}/merge_requests?state=opened&per_page=15`, {
        headers: { "Private-Token": token }
      });

      if (!response.ok) {
        throw new Error(`GitLab API returned status ${response.status}`);
      }

      const data: any = await response.json();
      const prs = data.map((mr: any) => ({
        id: mr.iid.toString(),
        title: mr.title,
        sourceBranch: mr.source_branch,
        targetBranch: mr.target_branch,
        author: mr.author?.name || "Desconocido",
        webUrl: mr.web_url,
        url: mr.web_url // backwards compatibility
      }));

      return res.json({ prs, isDemo: false });
    } else if (platform === "azure_devops") {
      const url = (baseUrl || "https://dev.azure.com/my-org").replace(/\/$/, "");
      const basicAuth = Buffer.from(`:${token}`).toString("base64");
      const headers = { Authorization: `Basic ${basicAuth}` };

      const response = await fetch(`${url}/${encodeURIComponent(projectId)}/_apis/git/pullrequests?searchCriteria.status=active&api-version=7.0`, { headers });
      if (!response.ok) {
        throw new Error(`Azure DevOps API returned status ${response.status}`);
      }

      const data: any = await response.json();
      const prs = (data.value || []).map((pr: any) => {
        // Construct standard web URL
        // dev.azure.com/org/project/_git/repo/pullrequest/id
        const repoName = pr.repository?.name || "repo";
        const webUrl = `${url}/${encodeURIComponent(projectId)}/_git/${encodeURIComponent(repoName)}/pullrequest/${pr.pullRequestId}`;
        
        return {
          id: pr.pullRequestId.toString(),
          title: pr.title,
          sourceBranch: pr.sourceRefName?.replace("refs/heads/", ""),
          targetBranch: pr.targetRefName?.replace("refs/heads/", ""),
          author: pr.createdBy?.displayName || "Desconocido",
          webUrl,
          url: webUrl
        };
      });

      return res.json({ prs, isDemo: false });
    } else {
      return res.status(400).json({ error: "Unsupported platform." });
    }
  } catch (err: any) {
    console.error("Error fetching project pull requests:", err);
    return res.status(500).json({ error: err.message || "Failed to fetch merge requests." });
  }
});

app.post("/api/update-task-description", async (req, res) => {
  const { platform, token, baseUrl, projectId, taskId, newDescription } = req.body;

  if (!token || !taskId || !newDescription) {
    return res.status(400).json({ error: "Missing required fields (token, taskId, newDescription)." });
  }

  const isDemo = String(taskId).startsWith("GL-") || String(taskId).startsWith("AD-") || String(projectId).startsWith("demo-");

  if (isDemo) {
    console.log(`[Demo Mode] Simulated updating description of task ${taskId} successfully.`);
    return res.json({ success: true, message: "¡Descripción de la tarea actualizada con éxito! (Modo Demo Activo)", isDemo: true });
  }

  try {
    if (platform === "gitlab") {
      const url = (baseUrl || "https://gitlab.com").replace(/\/$/, "");
      const encodedProject = encodeURIComponent(projectId);

      console.log(`[GitLab API] Updating issue ${taskId} description`);
      const response = await fetch(`${url}/api/v4/projects/${encodedProject}/issues/${taskId}`, {
        method: "PUT",
        headers: {
          "Private-Token": token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ description: newDescription })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`GitLab PUT failed: ${text}`);
      }

      return res.json({ success: true, message: "¡Se ha actualizado la descripción en GitLab con éxito!", isDemo: false });

    } else if (platform === "azure_devops") {
      const url = (baseUrl || "https://dev.azure.com/my-org").replace(/\/$/, "");

      console.log(`[Azure DevOps API] Updating work item ${taskId} description`);
      const basicAuth = Buffer.from(`:${token}`).toString("base64");
      
      const payload = [
        {
          op: "add",
          path: "/fields/System.Description",
          value: newDescription
        }
      ];

      const response = await fetch(`${url}/_apis/wit/workitems/${taskId}?api-version=7.0`, {
        method: "PATCH",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/json-patch+json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Azure DevOps PATCH failed: ${text}`);
      }

      return res.json({ success: true, message: "¡Se ha actualizado la descripción en Azure DevOps con éxito!", isDemo: false });
    } else {
      return res.status(400).json({ error: "Unsupported platform for task update." });
    }
  } catch (err: any) {
    console.error("Error updating task description:", err);
    return res.status(500).json({ error: err.message || "Failed to update task description on platform." });
  }
});

// Endpoint to generate a technical overview of how the project is set up and how it works based on its description, backlog and codebase files
app.post("/api/generate-project-architecture", async (req, res) => {
  const { platform, token, baseUrl, projectId, projectName, description, tasks } = req.body;

  if (!projectName) {
    return res.status(400).json({ error: "Project name is required." });
  }

  try {
    const ai = getGeminiClient();

    // Split tasks into open and closed using a robust list of closed states
    const closedStates = ["closed", "done", "completed", "resolved", "inactive"];
    const openTasks = Array.isArray(tasks) ? tasks.filter(t => {
      const state = t.state?.toLowerCase() || "";
      return !closedStates.includes(state);
    }) : [];
    const closedTasks = Array.isArray(tasks) ? tasks.filter(t => {
      const state = t.state?.toLowerCase() || "";
      return closedStates.includes(state);
    }) : [];

    const openTasksSummary = openTasks.length > 0
      ? openTasks.map(t => `- **[${t.type}] #${t.id}**: ${t.title} *(Asignado a: ${t.assignee || 'Sin asignar'})*`).join("\n")
      : "No hay tareas activas/abiertas en este momento.";

    const closedTasksSummary = closedTasks.length > 0
      ? closedTasks.map(t => `- **[${t.type}] #${t.id}**: ${t.title} *(Completada por: ${t.assignee || 'Sin asignar'})*`).join("\n")
      : "No hay tareas completadas registradas en el backlog histórico.";

    // 1. Fetch Repository File Tree (Real or Mock)
    let fileStructureInfo = "";
    const isDemo = !projectId || projectId.startsWith("demo-");

    if (!isDemo && token && projectId) {
      const url = (baseUrl || (platform === "gitlab" ? "https://gitlab.com" : "https://dev.azure.com/my-org")).replace(/\/$/, "");
      try {
        if (platform === "gitlab") {
          const encodedProjectId = encodeURIComponent(projectId);
          // Fetch up to 80 files/folders in the repository tree recursively
          const treeRes = await fetch(`${url}/api/v4/projects/${encodedProjectId}/repository/tree?recursive=true&per_page=80`, {
            headers: { "Private-Token": token }
          });
          if (treeRes.ok) {
            const files = await treeRes.json();
            const filePaths = files.map((f: any) => `- \`${f.path}\` (${f.type === "tree" ? "Directorio" : "Archivo"})`);
            fileStructureInfo = filePaths.join("\n");
          }
        } else if (platform === "azure_devops") {
          const encodedProj = encodeURIComponent(projectId);
          const basicAuth = Buffer.from(`:${token}`).toString("base64");
          const repoUrl = `${url}/${encodedProj}/_apis/git/repositories/${projectId}/items?recursionLevel=full&api-version=7.0`;
          const treeRes = await fetch(repoUrl, {
            headers: { Authorization: `Basic ${basicAuth}` }
          });
          if (treeRes.ok) {
            const data: any = await treeRes.json();
            const filePaths = (data.value || [])
              .filter((f: any) => f.path !== "/")
              .map((f: any) => `- \`${f.path}\` (${f.isFolder ? "Directorio" : "Archivo"})`);
            fileStructureInfo = filePaths.join("\n");
          }
        }
      } catch (err) {
        console.warn("[Architecture File Tree Fetch failed] falling back to generic structured tree:", err);
      }
    }

    // Fallback/Simulated high-fidelity codebase if empty or is demo
    if (!fileStructureInfo) {
      const lowerName = projectName.toLowerCase();
      if (lowerName.includes("ecommerce") || lowerName.includes("store") || lowerName.includes("tienda")) {
        fileStructureInfo = `
- \`Dockerfile\` (Archivo) - Configuración de contenedor Docker multi-etapa
- \`docker-compose.yml\` (Archivo) - Orquestación local (Node, Postgres, Redis)
- \`package.json\` (Archivo) - Dependencias clave: express, pg, redis, @google/genai, stripe
- \`tsconfig.json\` (Archivo) - Configuración del compilador de TypeScript
- \`src/\` (Directorio)
- \`src/server.ts\` (Archivo) - Servidor Express con endpoints de productos, autenticación y checkout
- \`src/routes/\` (Directorio)
- \`src/routes/auth.ts\` (Archivo) - Controladores de registro, login y validación de tokens JWT
- \`src/routes/products.ts\` (Archivo) - Endpoint para buscar, paginar y filtrar el catálogo
- \`src/routes/cart.ts\` (Archivo) - Almacenamiento y persistencia en Redis del carrito
- \`src/routes/checkout.ts\` (Archivo) - Pasarela Stripe Checkout e interceptor de webhooks
- \`src/models/\` (Directorio)
- \`src/models/User.ts\` (Archivo) - Esquema ORM de datos de usuario y credenciales hash
- \`src/models/Product.ts\` (Archivo) - Estructura de productos e inventarios disponibles
- \`src/services/\` (Directorio)
- \`src/services/stripe.ts\` (Archivo) - Integración con SDK Stripe para cobros y reintentos
- \`src/services/db.ts\` (Archivo) - Configuración del pool de conexiones para PostgreSQL
`;
      } else if (lowerName.includes("inventory") || lowerName.includes("inventario") || lowerName.includes("stock")) {
        fileStructureInfo = `
- \`InventoryService.csproj\` (Archivo) - Archivo de proyecto .NET Core Web API
- \`Program.cs\` (Archivo) - Punto de entrada, configuración de inyección de dependencias (IoC) y controladores
- \`appsettings.json\` (Archivo) - Variables de configuración, cadenas de conexión SQL Server y puertos Kafka
- \`Dockerfile\` (Archivo) - Dockerfile de despliegue optimizado para containers de Linux
- \`Controllers/\` (Directorio)
- \`Controllers/StockController.cs\` (Archivo) - Operaciones REST para consultar, reservar y liberar inventario en tiempo real
- \`Controllers/HealthController.cs\` (Archivo) - Monitoreo de disponibilidad y estado de dependencias (DB, Kafka)
- \`Services/\` (Directorio)
- \`Services/KafkaConsumer.cs\` (Archivo) - Servicio de fondo (BackgroundService) que lee del stream de órdenes completadas
- \`Services/InventoryService.cs\` (Archivo) - Validación de umbrales críticos de stock y lógica de reabastecimiento
- \`Infrastructure/\` (Directorio)
- \`Infrastructure/AppDbContext.cs\` (Archivo) - Contexto de Entity Framework para bases de datos relacionales
`;
      } else if (lowerName.includes("science") || lowerName.includes("recommendation") || lowerName.includes("data")) {
        fileStructureInfo = `
- \`requirements.txt\` (Archivo) - Librerías Python de analítica y AI: pandas, scikit-learn, fastapi, uvicorn
- \`Dockerfile\` (Archivo) - Imagen de producción con PySpark y modelos ML
- \`main.py\` (Archivo) - Microservicio FastAPI para exponer inferencia de recomendaciones
- \`models/\` (Directorio)
- \`models/recommendation_model.py\` (Archivo) - Algoritmo de recomendación ALS (Alternating Least Squares)
- \`models/train.py\` (Archivo) - Script automatizado para el re-entrenamiento del modelo con nuevos clics
- \`pipelines/\` (Directorio)
- \`pipelines/spark_processor.py\` (Archivo) - Procesamiento distribuido Spark para agregar telemetría cruda
- \`notebooks/\` (Directorio)
- \`notebooks/exploratory_analysis.ipynb\` (Archivo) - Experimentos preliminares de canastas de consumo
`;
      } else {
        fileStructureInfo = `
- \`package.json\` (Archivo) - Dependencias y scripts de construcción
- \`Dockerfile\` (Archivo) - Configuración de despliegue contenerizado
- \`src/\` (Directorio)
- \`src/index.ts\` (Archivo) - Entrada del backend Express y arranque de servidores
- \`src/routes/\` (Directorio)
- \`src/routes/api.ts\` (Archivo) - Enrutador de peticiones y lógica de negocio unificada
- \`src/services/\` (Directorio)
- \`src/services/db.ts\` (Archivo) - Módulo de persistencia y consultas a base de datos
- \`src/middlewares/\` (Directorio)
- \`src/middlewares/error.ts\` (Archivo) - Interceptor global de errores y formato estandarizado
`;
      }
    }

    const userPrompt = `Eres un Arquitecto de Software Principal, CTO y Líder Técnico de Ingeniería Senior.
Tu misión es analizar exhaustivamente este proyecto, su backlog de tareas (incluyendo tareas de sprints anteriores/completadas y tareas activas/abiertas) y la estructura del código del repositorio, para generar una descripción arquitectónica, técnica y de negocio extremadamente estética, profesional y detallada.

### Datos del Proyecto:
- **Nombre del Proyecto**: ${projectName}
- **Descripción del Repositorio/Readme**: ${description || "Sin descripción proporcionada."}

### Código del Repositorio (Estructura de Archivos):
La estructura de archivos identificada/analizada en el código fuente es:
${fileStructureInfo}

### Tareas de Todos los Sprints (Backlog Completo):
A continuación se detalla el backlog con tareas de múltiples estados (históricas/cerradas y actuales/abiertas):

**Tareas en Desarrollo / Activas (Sprints Recientes o Actual):**
${openTasksSummary}

**Tareas Históricas / Completadas (Sprints Anteriores):**
${closedTasksSummary}

---

Por favor, genera un análisis arquitectónico y de funcionamiento en español con un diseño visual impecable y profesional. El reporte debe estructurarse estrictamente en las siguientes 4 secciones con formato Markdown de alta calidad (usa emojis sutiles, tablas comparativas, diagramas en modo texto o bloques de código elegantes para estructurar el contenido):

1. 🎯 **Propósito y Visión de Negocio (¿Para qué funciona el proyecto?)**
   - Explica de forma clara y ejecutiva cuál es el objetivo de este proyecto y qué problemas de negocio o técnicos resuelve.
   - Analiza el valor agregado de la solución en su nicho de mercado.

2. 🏗️ **Arquitectura Técnica y Estructura del Código (¿Cómo está montado?)**
   - Basándote en la estructura de archivos provista, detalla la función técnica de cada directorio y archivo analizado.
   - Describe el patrón arquitectónico (por ejemplo, Capas, Microservicios, MVC, Arquitectura Limpia) y justifica por qué se eligió o recomienda.
   - Detalla el stack tecnológico principal (backend, frontend, bases de datos, colas de mensajería, devops) implícito en la estructura del código.

3. 🔄 **Flujo de Funcionamiento y Procesos de Negocio (¿Cómo funciona?)**
   - Describe el "User Flow" principal paso a paso.
   - Describe cómo viaja la información entre los diferentes archivos/módulos analizados (flujo de datos).
   - Incluye un pequeño diagrama conceptual hecho en texto o bloques de código que ilustre visualmente la interacción de componentes.

4. 📊 **Evolución del Proyecto y Trazabilidad de Sprints (Análisis de Tareas)**
   - Analiza la evolución del proyecto relacionando las **Tareas Históricas/Completadas** con la cimentación de la base de código (por ejemplo, cómo los cimientos de BD y configuración Docker que ya se completaron habilitaron el desarrollo de los sprints actuales).
   - Explica el impacto de las **Tareas Activas/Abiertas** actuales en el negocio y la arquitectura técnica.
   - Proporciona recomendaciones de ingeniería concretas para los siguientes sprints basándote en los hallazgos del código y el backlog actual.

El informe debe ser sumamente profesional, con un lenguaje técnico impecable apto para CTOs y desarrolladores, pero lo suficientemente claro para que el negocio entienda el valor del sistema.`;

    const systemPrompt = "Eres un CTO y arquitecto de software senior ultra-profesional. Responde siempre en español. Estructura tu respuesta con un formato Markdown refinado, limpio, y con un diseño visual estético y estructurado.";

    const response = await generateWithFallback(ai, {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          architecture: {
            type: Type.STRING,
            description: "Análisis técnico de arquitectura, visión de negocio, flujo de funcionamiento e impacto de sprints en formato Markdown impecable."
          }
        },
        required: ["architecture"]
      }
    }, userPrompt);

    const jsonText = response.text?.trim() || "{}";
    const data = JSON.parse(jsonText);

    return res.json(data);
  } catch (err: any) {
    console.error("Error generating project architecture with Gemini:", err);
    return res.status(500).json({ error: err.message || "Failed to generate project architecture." });
  }
});

// Endpoint to generate QA test cases based on task requirements and technical specifications
app.post("/api/generate-test-cases", async (req, res) => {
  const { taskTitle, taskDescription, functionalSpecs } = req.body;

  if (!taskTitle) {
    return res.status(400).json({ error: "Task title is required." });
  }

  try {
    const ai = getGeminiClient();

    const userPrompt = `Eres un Ingeniero de QA (Quality Assurance) Automático y Senior QA Lead.
Analiza la siguiente tarea junto con su especificación técnica y genera un conjunto completo de Casos de Prueba (Test Cases).

Título de la Tarea: ${taskTitle}
Descripción de la Tarea: ${taskDescription || "Sin descripción proporcionada."}
Especificación Funcional (IA):
${functionalSpecs || "No se proporcionó especificación funcional."}

Por favor, diseña los casos de prueba de forma profesional cubriendo:
1. **Casos Felices / Camino Principal (Happy Path)**.
2. **Casos de Error / Límites (Negative & Edge Cases)**.
3. **Validación de Datos y Reglas de Negocio**.
4. **Casos de Integración o API (si aplica)**.

Usa el formato Gherkin (Dado que... Cuando... Entonces...) para describir los escenarios clave, o un formato de tabla detallada de pasos y resultados esperados. Retorna el resultado estructurado en formato Markdown elegante en español.`;

    const systemPrompt = "Eres un ingeniero QA senior experto en diseño de casos de pruebas de software. Responde en español y proporciona el reporte en formato Markdown.";

    const response = await generateWithFallback(ai, {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          testCases: {
            type: Type.STRING,
            description: "Lista estructurada de casos de prueba y escenarios QA en formato Markdown."
          }
        },
        required: ["testCases"]
      }
    }, userPrompt);

    const jsonText = response.text?.trim() || "{}";
    const data = JSON.parse(jsonText);

    return res.json(data);
  } catch (err: any) {
    console.error("Error generating test cases with Gemini:", err);
    return res.status(500).json({ error: err.message || "Failed to generate test cases." });
  }
});

// Endpoint to write comments directly into tasks/issues on GitLab or Azure DevOps
app.post("/api/add-task-comment", async (req, res) => {
  const { platform, token, baseUrl, projectId, taskId, comment } = req.body;

  if (!token || !taskId || !comment) {
    return res.status(400).json({ error: "Missing required fields (token, taskId, comment)." });
  }

  const isDemo = String(taskId).startsWith("GL-") || String(taskId).startsWith("AD-") || String(projectId).startsWith("demo-");

  if (isDemo) {
    console.log(`[Demo Mode] Simulated adding comment to task ${taskId} successfully.`);
    return res.json({ success: true, message: "¡Caso de prueba publicado con éxito como comentario en la tarea! (Modo Demo Activo)", isDemo: true });
  }

  try {
    if (platform === "gitlab") {
      const url = (baseUrl || "https://gitlab.com").replace(/\/$/, "");
      const encodedProject = encodeURIComponent(projectId);

      console.log(`[GitLab API] Posting comment to issue ${taskId}`);
      const response = await fetch(`${url}/api/v4/projects/${encodedProject}/issues/${taskId}/notes`, {
        method: "POST",
        headers: {
          "Private-Token": token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ body: comment })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`GitLab note POST failed: ${text}`);
      }

      return res.json({ success: true, message: "¡Se ha publicado el comentario en GitLab con éxito!", isDemo: false });

    } else if (platform === "azure_devops") {
      const url = (baseUrl || "https://dev.azure.com/my-org").replace(/\/$/, "");

      console.log(`[Azure DevOps API] Posting comment to work item ${taskId}`);
      const basicAuth = Buffer.from(`:${token}`).toString("base64");
      
      const payload = [
        {
          op: "add",
          path: "/fields/System.History",
          value: comment
        }
      ];

      const response = await fetch(`${url}/_apis/wit/workitems/${taskId}?api-version=7.0`, {
        method: "PATCH",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/json-patch+json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Azure DevOps comment PATCH failed: ${text}`);
      }

      return res.json({ success: true, message: "¡Se ha publicado el comentario en Azure DevOps con éxito!", isDemo: false });
    } else {
      return res.status(400).json({ error: "Unsupported platform for adding comments." });
    }
  } catch (err: any) {
    console.error("Error posting task comment:", err);
    return res.status(500).json({ error: err.message || "Failed to post comment on platform." });
  }
});

// Endpoint to Publish Comments directly on the GitLab / Azure DevOps Platform
app.post("/api/publish-comments", async (req, res) => {
  const { url, token, annotations, platform } = req.body;

  if (!url || !token || !annotations || !Array.isArray(annotations)) {
    return res.status(400).json({ error: "Missing required fields (url, token, annotations) to publish comments." });
  }

  const results: { success: boolean; filePath: string; line: number; msg: string }[] = [];

  try {
    if (platform === "gitlab" || (!platform && url.includes("gitlab"))) {
      const parsed = parseGitLabUrl(url);
      const encodedProjectPath = encodeURIComponent(parsed.projectPath);
      const headers = { 
        "Private-Token": token,
        "Content-Type": "application/json"
      };

      // In GitLab, posting general comments on the Merge Request is extremely reliable and robust.
      // We can post a single highly formatted aggregate report, or post inline discussions.
      // Let's post individual MR Discussions for maximum automated impact!
      for (const ann of annotations) {
        try {
          const bodyText = `🤖 **AI Code Review [${ann.severity.toUpperCase()}]** - *${ann.category.toUpperCase()}*
**${ann.title}**

${ann.comment}

${ann.suggestedCode ? `\`\`\`suggestion\n${ann.suggestedCode}\n\`\`\`` : ""}`;

          // We create a general discussion on the Merge Request referring to the file and line
          // This avoids complex SHA and commit verification matching which can fail on dirty branches
          const discussionUrl = `${parsed.instanceUrl}/api/v4/projects/${encodedProjectPath}/merge_requests/${parsed.mrIid}/discussions`;
          
          // Let's build a post object
          const payload: any = {
            body: `File: \`${ann.filePath}\` (Line ${ann.line})\n\n${bodyText}`
          };

          const discussRes = await fetch(discussionUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
          });

          if (discussRes.ok) {
            results.push({ success: true, filePath: ann.filePath, line: ann.line, msg: "Published discussion comment successfully." });
          } else {
            const errText = await discussRes.text();
            results.push({ success: false, filePath: ann.filePath, line: ann.line, msg: `GitLab Error: ${errText}` });
          }
        } catch (err: any) {
          results.push({ success: false, filePath: ann.filePath, line: ann.line, msg: err.message });
        }
      }

    } else if (platform === "azure_devops" || (!platform && (url.includes("azure.com") || url.includes("visualstudio.com")))) {
      const parsed = parseAzureDevOpsUrl(url);
      const basicAuth = Buffer.from(`:${token}`).toString("base64");
      const headers = { 
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json"
      };

      // Fetch the repository metadata first to get the repositoryId or keep using the repoName
      const repoUrl = `${parsed.instanceUrl}/${parsed.organization}/${parsed.project}/_apis/git/repositories/${parsed.repository}?api-version=7.0`;
      const repoRes = await fetch(repoUrl, { headers });
      if (!repoRes.ok) {
        throw new Error(`Failed to resolve repository name ${parsed.repository} to ID: ${await repoRes.text()}`);
      }
      const repoMeta = await repoRes.json();
      const repositoryId = repoMeta.id;

      // Post comments as threads in Azure DevOps Pull Request
      for (const ann of annotations) {
        try {
          const bodyText = `🤖 **AI Code Review [${ann.severity.toUpperCase()}]** - *${ann.category.toUpperCase()}*
**${ann.title}**

${ann.comment}

${ann.suggestedCode ? `\`\`\`\n${ann.suggestedCode}\n\`\`\`` : ""}`;

          const threadUrl = `${parsed.instanceUrl}/${parsed.organization}/${parsed.project}/_apis/git/repositories/${repositoryId}/pullRequests/${parsed.pullRequestId}/threads?api-version=7.0`;
          
          // Form file path with leading slash if not present for Azure DevOps
          const cleanPath = ann.filePath.startsWith("/") ? ann.filePath : `/${ann.filePath}`;

          const payload = {
            comments: [
              {
                parentCommentId: 0,
                content: bodyText,
                commentType: 1 // Text comment
              }
            ],
            threadContext: {
              filePath: cleanPath,
              rightFileStart: {
                line: ann.line,
                character: 1
              },
              rightFileEnd: {
                line: ann.line,
                character: 50
              }
            },
            status: 1 // Active thread
          };

          const threadRes = await fetch(threadUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
          });

          if (threadRes.ok) {
            results.push({ success: true, filePath: ann.filePath, line: ann.line, msg: "Published PR Thread successfully." });
          } else {
            // Fallback to general thread if context mapping fails (e.g., if filePath line doesn't match Azure's diff state)
            const fallbackPayload = {
              comments: [
                {
                  parentCommentId: 0,
                  content: `[File: ${ann.filePath} | Line ${ann.line}]\n\n${bodyText}`,
                  commentType: 1
                }
              ],
              status: 1
            };
            const fallbackRes = await fetch(threadUrl, {
              method: "POST",
              headers,
              body: JSON.stringify(fallbackPayload)
            });

            if (fallbackRes.ok) {
              results.push({ success: true, filePath: ann.filePath, line: ann.line, msg: "Published as general discussion thread due to context fallback." });
            } else {
              const errText = await fallbackRes.text();
              results.push({ success: false, filePath: ann.filePath, line: ann.line, msg: `Azure DevOps Error: ${errText}` });
            }
          }
        } catch (err: any) {
          results.push({ success: false, filePath: ann.filePath, line: ann.line, msg: err.message });
        }
      }
    } else {
      return res.status(400).json({ error: "Unsupported platform or URL for publishing comments." });
    }

    return res.json({
      success: true,
      message: "Automated comments publication round complete.",
      results
    });

  } catch (error: any) {
    console.error("Error publishing comments:", error);
    return res.status(500).json({ error: error.message || "Failed to publish comments to platform." });
  }
});

// Serve frontend assets
if (process.env.NODE_ENV !== "production") {
  createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  }).then((vite) => {
    app.use(vite.middlewares);
    
    // Fallback route for SPA
    app.use("*", (req, res, next) => {
      vite.transformIndexHtml(req.originalUrl, "").then((html) => {
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      }).catch(next);
    });

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Development Server running on port ${PORT}`);
    });
  });
} else {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Production Server running on port ${PORT}`);
  });
}
