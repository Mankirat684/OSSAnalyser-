import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";

const execAsync = promisify(exec);

export async function getRepoInfo(repoUrl: string) {
    const url = new URL(repoUrl);

    if (url.hostname !== "github.com") {
        throw new Error("Invalid GitHub URL");
    }

    const [owner, repoTemp] = url.pathname
        .split("/")
        .filter(Boolean);

    const repo = repoTemp?.replace(".git", "");

    const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}`
    );

    if (!response.ok) {
        throw new Error("Repository not found");
    }

    return await response.json();
}

export async function cloneRepo(
    repoUrl: string,
    jobId: string
) {
    const repoInfo = await getRepoInfo(repoUrl);
    console.log('repo info = ', repoInfo)
    if (repoInfo.size > 307200) {
        throw new Error(
            "Repository exceeds 300MB limit"
        );
    }

    const sandboxPath = path.join(
        process.cwd(),
        'tmp',
        jobId,
    );

    await fs.mkdir(sandboxPath, { recursive: true });
    await execAsync(
        `git clone --depth 1 ${repoUrl} ${sandboxPath}`
    );

    return sandboxPath;
}
//cloneRepo('https://github.com/Mankirat684/artisan','123')