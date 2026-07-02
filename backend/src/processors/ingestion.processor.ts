import { cloneRepo } from "../services/github.service.js";
import type { Job } from "bullmq";

interface RepoIngestionJobData {
  repoUrl: string;
  userId: string;
  geminiApiKey: string;
}

export async function processRepo(job: Job<RepoIngestionJobData>) {
  const { repoUrl } = job.data;
  if (!job.id) {
    throw new Error("Job ID is missing");
  }
  await cloneRepo(repoUrl, job.id);
}
