import { Router } from "express";
import authMiddleware from "../middleware/auth.middleware";
import { workflowRunLimiter } from "../middleware/rateLimit.middleware";
import { validate } from "../middleware/validate.middleware";
import { workflowSchemas } from "../schema/request.schema";
import { ConnectedRepo } from "../schema/ConnectedRepository.schema";
import { getOctokit } from "../services/octokit.service";
import { ensureRepoWebhook } from "../services/githubWebhook.service";
import {
  executeWorkflow,
  workflowHasPREventTriggers,
} from "../services/workflowExecutor.service";
import {
  normalizeNodeType,
  nodeTypeToFunction,
} from "../utils/workflowNodeMapping";

const router = Router();

function deriveWorkflowDefinition(nodes: any[]) {
  return {
    name: "AI PR Automation Workflow",
    status: "active" as const,
    steps: nodes.map((node) => ({
      id: node.id,
      name: node.data?.label || "Step",
      type: normalizeNodeType(node.data?.nodeType),
      function:
        node.data?.workflow?.function ||
        nodeTypeToFunction(normalizeNodeType(node.data?.nodeType)),
      status: node.data?.workflow?.status || "ready",
    })),
  };
}

function remapNodeTypes(nodes: any[]) {
  return nodes.map((node: any) => ({
    ...node,
    type:
      node.data?.nodeType === "pr_opened" ||
      node.data?.nodeType === "pr_updated" ||
      node.data?.nodeType === "manual_trigger" ||
      node.data?.nodeType === "scheduled"
        ? "githubWebhook"
        : node.data?.nodeType === "code_review"
          ? "aiReview"
          : node.data?.nodeType === "security_scan"
            ? "securityScan"
            : "action",
  }));
}

router.get(
  "/workflow",
  authMiddleware,
  validate(workflowSchemas.get),
  async (req: any, res) => {
  try {
    const { repoId } = req.query;

    const connectedRepo = await ConnectedRepo.findOne({
      userId: req.user._id,
      repoId,
    })
      .select("workflow webhookActive")
      .lean();

    if (!connectedRepo) {
      return res.status(404).json({ message: "Workflow repo not found" });
    }

    const workflow = connectedRepo.workflow ?? {
      nodes: [],
      edges: [],
    };

    const updatedNodes = remapNodeTypes(workflow.nodes || []);

    res.status(200).json({
      workflow: {
        nodes: updatedNodes,
        edges: workflow.edges || [],
        definition: "definition" in workflow ? workflow.definition : undefined,
      },
      webhookActive: connectedRepo.webhookActive,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to load workflow" });
  }
},
);

router.post(
  "/workflow",
  authMiddleware,
  validate(workflowSchemas.save),
  async (req: any, res) => {
  try {
    const { repoId: parsedRepoId, nodes, edges, workflow: clientDefinition } = req.body;

    const definition =
      clientDefinition || deriveWorkflowDefinition(nodes);

    const connectedRepo = await ConnectedRepo.findOneAndUpdate(
      { userId: req.user._id, repoId: parsedRepoId },
      {
        workflow: {
          nodes,
          edges,
          definition,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after", runValidators: true },
    )
      .select("repoId name fullName owner workflow webhookActive webhookId")
      .lean();

    if (!connectedRepo) {
      return res.status(404).json({
        message: "Connected repository not found for this user",
      });
    }

    let webhookStatus = { webhookActive: connectedRepo.webhookActive };

    if (
      workflowHasPREventTriggers(nodes) &&
      req.user?.githubAccessToken
    ) {
      try {
        const octokit = getOctokit(req.user.githubAccessToken);
        webhookStatus = await ensureRepoWebhook({
          octokit,
          owner: connectedRepo.owner,
          repo: connectedRepo.name,
          repoDocId: String(connectedRepo._id),
        });
      } catch (webhookError) {
        console.error("Webhook registration failed:", webhookError);
      }
    }

    res.status(200).json({
      workflow: connectedRepo.workflow,
      webhookActive: webhookStatus.webhookActive,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to save workflow" });
  }
},
);

router.post(
  "/workflow/execute",
  authMiddleware,
  // Review nodes call the model, so runs are throttled like /pr/ai-review
  workflowRunLimiter,
  validate(workflowSchemas.execute),
  async (req: any, res) => {
  try {
    const {
      repoId: parsedRepoId,
      prNumber: parsedPrNumber,
      trigger,
      nodes: clientNodes,
      edges: clientEdges,
    } = req.body;

    const connectedRepo = await ConnectedRepo.findOne({
      userId: req.user._id,
      repoId: parsedRepoId,
    }).lean();

    if (!connectedRepo) {
      return res.status(404).json({
        message: "Connected repository not found for this user",
      });
    }

    const repoForExecution = {
      ...connectedRepo,
      workflow: {
        ...(connectedRepo.workflow || {}),
        nodes:
          Array.isArray(clientNodes) && clientNodes.length > 0
            ? clientNodes
            : connectedRepo.workflow?.nodes || [],
        edges: Array.isArray(clientEdges)
          ? clientEdges
          : connectedRepo.workflow?.edges || [],
      },
    };

    const result = await executeWorkflow({
      connectedRepo: repoForExecution as Parameters<typeof executeWorkflow>[0]["connectedRepo"],
      trigger,
      prNumber: parsedPrNumber,
    });

    return res.status(200).json({
      message: "Workflow executed",
      result,
    });
  } catch (error) {
    console.error("Workflow execution error:", error);
    return res.status(500).json({
      message:
        error instanceof Error ? error.message : "Workflow execution failed",
    });
  }
},
);

router.post(
  "/workflow/webhook/enable",
  authMiddleware,
  validate(workflowSchemas.enableWebhook),
  async (req: any, res) => {
  try {
    const { repoId: parsedRepoId } = req.body;

    const connectedRepo = await ConnectedRepo.findOne({
      userId: req.user._id,
      repoId: parsedRepoId,
    }).lean();

    if (!connectedRepo) {
      return res.status(404).json({ message: "Repository not found" });
    }

    if (!req.user?.githubAccessToken) {
      return res.status(401).json({ message: "GitHub not connected" });
    }

    const octokit = getOctokit(req.user.githubAccessToken);
    const webhookStatus = await ensureRepoWebhook({
      octokit,
      owner: connectedRepo.owner,
      repo: connectedRepo.name,
      repoDocId: String(connectedRepo._id),
    });

    return res.status(200).json({
      // Only claim it is on when it actually is
      message: webhookStatus.webhookActive
        ? "Webhook enabled — reviews will run automatically on new pull requests"
        : webhookStatus.reason || "Webhook could not be enabled",
      action: webhookStatus.webhookActive ? "success" : "not configured",
      ...webhookStatus,
    });
  } catch (error) {
    console.error("Enable webhook error:", error);
    return res.status(500).json({
      message:
        error instanceof Error ? error.message : "Failed to enable webhook",
    });
  }
},
);

export default router;
