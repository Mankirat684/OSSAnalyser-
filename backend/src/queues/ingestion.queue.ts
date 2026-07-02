import {Queue} from 'bullmq'
import {redis} from '../config/redis.js';

export const ingestionQueue = new Queue('repo-ingestion',{
    connection : redis,
    defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100, // keep last 100 completed jobs
    removeOnFail: 50
  }
})