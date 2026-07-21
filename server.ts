import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json({ limit: "50mb" })); // Increase limit for large diffs or files

const PORT = 3000;

// Initialize OpenAI verification helper
const getGeminiClient = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured in the server environment variables.");
  }
  return { apiKey };
};

// Helper function to call OpenAI with retry and fallback model
async function generateWithFallback(ai: any, config: { systemInstruction: string; responseMimeType: string; responseSchema: any }, userPrompt: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured in the server environment variables.");
  }

  const systemPrompt = config.systemInstruction || "You are an expert code reviewer.";
  const modelsToTry = ["gpt-4o", "gpt-4o-mini"];
  let lastError: any = null;

  for (const model of modelsToTry) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[OpenAI] Attempting code review using model: ${model}, attempt: ${attempt}`);
        
        // Add a prompt instruction to enforce JSON format
        const enhancedSystemPrompt = `${systemPrompt}\n\nIMPORTANT: You must return a valid JSON object matching the requested schema. Ensure the response is parsable and do not include markdown blocks like \`\`\`json outside the actual JSON string.`;

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: enhancedSystemPrompt },
              { role: "user", content: userPrompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0.2
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Status ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
          throw new Error("Received empty content from OpenAI API.");
        }

        console.log(`[OpenAI] Success using model: ${model} on attempt ${attempt}`);
        return { text: content };
      } catch (err: any) {
        lastError = err;
        const errMsg = err.message || String(err);
        console.error(`[OpenAI Error] Model ${model} failed on attempt ${attempt}:`, errMsg);
        
        if (attempt < 3) {
          const waitTime = attempt * 2000;
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
