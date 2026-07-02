import {Worker} from 'bullmq'
import {ingestionQueue} from '../queues/ingestion.queue.js'
import {processRepo} from '../processors/ingestion.processor.js'
import { redis } from '../config/redis.js';

export const ingestionWorker = new Worker(
    ingestionQueue.name,
    async (job) => {
        if (job.name === 'repo-preProcess') {
            await processRepo(job);
        }
    },
    {
        connection :redis,
        concurrency: 1,
    }
)
ingestionWorker.on("completed",(job)=>{
    console.log(`Job: ${job.id} completed`);
})
ingestionWorker.on("failed",(job,err)=>{
    console.log(`Job: ${job?.id} failed`,err);
})