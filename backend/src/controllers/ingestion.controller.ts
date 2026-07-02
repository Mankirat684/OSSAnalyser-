import { ingestionQueue } from "../queues/ingestion.queue.js";
import type { Request, Response } from "express";

export const analyseRepo = async (req: Request, res: Response) => {
  const { repoUrl, userId, geminiApiKey } = req.body;

  if (!repoUrl || !userId || !geminiApiKey) {
    return res.status(400).json({
      message: "Missing required fields",
    });
  }

  const job = await ingestionQueue.add("repo-preProcess", {
    userId: req.body.userId,
    repoUrl,
    geminiApiKey: req.body.geminiApiKey,
  });
  res.json({
    jobId: job.id,
    status:'queued',
  });
};
